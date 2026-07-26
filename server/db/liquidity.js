const crypto = require("node:crypto");
const { supabaseRequest, filterValue } = require("../lib/supabase");
const { moneyNumber } = require("../lib/format");
const { recordIntegrityEvent } = require("./integrity");

const MAX_ROUTE_LEGS = 4;
const ROUTE_TTL_MS = 10 * 60 * 1000;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function routeCode() {
  return `AKR-ROUTE-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function planLiquidityRoute(candidates, request) {
  const requestedSend = moneyNumber(request.have_amount || 0);
  const requestedReceive = moneyNumber(request.want_amount || 0);
  if (!requestedSend || !requestedReceive) return null;

  let remainingSend = requestedSend;
  let remainingReceive = requestedReceive;
  const eligible = candidates
    .filter((listing) => (
      listing.have_currency === request.want_currency
      && listing.want_currency === request.have_currency
      && listing.owner_user_id !== request.user_id
    ))
    .map((listing) => ({
      ...listing,
      route_rate: moneyNumber(listing.have_amount) / moneyNumber(listing.want_amount),
    }))
    .filter((listing) => Number.isFinite(listing.route_rate) && listing.route_rate > 0)
    .sort((a, b) => {
      const aTerms = a.listing_type === "negotiable" ? 0 : 1;
      const bTerms = b.listing_type === "negotiable" ? 0 : 1;
      if (aTerms !== bTerms) return aTerms - bTerms;
      return b.route_rate - a.route_rate;
    });

  const legs = [];
  for (const listing of eligible) {
    if (legs.length >= MAX_ROUTE_LEGS || remainingSend <= 0.009 || remainingReceive <= 0.009) break;
    const availableReceive = moneyNumber(listing.have_amount);
    const fullSend = moneyNumber(listing.want_amount);
    let receiveAmount;
    let sendAmount;

    if (listing.listing_type === "fixed") {
      if (availableReceive > remainingReceive || fullSend > remainingSend) continue;
      receiveAmount = availableReceive;
      sendAmount = fullSend;
    } else {
      receiveAmount = Math.min(
        availableReceive,
        remainingReceive,
        remainingSend * listing.route_rate
      );
      sendAmount = receiveAmount / listing.route_rate;
    }

    receiveAmount = roundMoney(receiveAmount);
    sendAmount = roundMoney(sendAmount);
    if (!receiveAmount || !sendAmount) continue;
    legs.push({
      listing_id: listing.id,
      listing_code: listing.listing_code,
      listing_type: listing.listing_type,
      send_amount: sendAmount,
      receive_amount: receiveAmount,
      rate: listing.route_rate,
    });
    remainingSend = roundMoney(remainingSend - sendAmount);
    remainingReceive = roundMoney(remainingReceive - receiveAmount);
  }

  if (legs.length < 2) return null;
  const plannedSend = roundMoney(legs.reduce((sum, leg) => sum + leg.send_amount, 0));
  const plannedReceive = roundMoney(legs.reduce((sum, leg) => sum + leg.receive_amount, 0));
  const coveragePercent = Math.min(100, roundMoney((plannedReceive / requestedReceive) * 100));
  if (coveragePercent < 50) return null;
  return {
    send_currency: request.have_currency,
    receive_currency: request.want_currency,
    requested_send_amount: requestedSend,
    requested_receive_amount: requestedReceive,
    planned_send_amount: plannedSend,
    planned_receive_amount: plannedReceive,
    coverage_percent: coveragePercent,
    legs,
  };
}

async function createLiquidityRoutePlan(userId, planned) {
  const expiresAt = new Date(Date.now() + ROUTE_TTL_MS).toISOString();
  try {
    const planRows = await supabaseRequest("liquidity_route_plans", {
      method: "POST",
      body: JSON.stringify({
        route_code: routeCode(),
        requester_user_id: userId,
        send_currency: planned.send_currency,
        receive_currency: planned.receive_currency,
        requested_send_amount: planned.requested_send_amount,
        requested_receive_amount: planned.requested_receive_amount,
        planned_send_amount: planned.planned_send_amount,
        planned_receive_amount: planned.planned_receive_amount,
        coverage_percent: planned.coverage_percent,
        leg_count: planned.legs.length,
        status: "proposed",
        expires_at: expiresAt,
      }),
    });
    const plan = planRows[0];
    const legs = await supabaseRequest("liquidity_route_legs", {
      method: "POST",
      body: JSON.stringify(planned.legs.map((leg, index) => ({
        route_plan_id: plan.id,
        leg_index: index + 1,
        listing_id: leg.listing_id,
        send_amount: leg.send_amount,
        receive_amount: leg.receive_amount,
        rate: leg.rate,
        status: "available",
      }))),
    });
    const record = await recordIntegrityEvent({
      eventKey: `route:${plan.id}:proposed:v1`,
      recordType: "liquidity_route",
      entityType: "route",
      entityId: plan.id,
      payload: {
        schema: "akara.liquidity-route.v1",
        subject: crypto.createHash("sha256").update(plan.route_code).digest("hex"),
        send_currency: plan.send_currency,
        receive_currency: plan.receive_currency,
        requested_send_amount: Number(plan.requested_send_amount).toFixed(2),
        requested_receive_amount: Number(plan.requested_receive_amount).toFixed(2),
        planned_send_amount: Number(plan.planned_send_amount).toFixed(2),
        planned_receive_amount: Number(plan.planned_receive_amount).toFixed(2),
        coverage_percent: Number(plan.coverage_percent),
        legs: planned.legs.map((leg) => ({
          listing_subject: crypto.createHash("sha256").update(leg.listing_id).digest("hex"),
          send_amount: Number(leg.send_amount).toFixed(2),
          receive_amount: Number(leg.receive_amount).toFixed(2),
          rate: Number(leg.rate).toFixed(10),
        })),
        expires_at: expiresAt,
      },
    });
    if (record) {
      await supabaseRequest(`liquidity_route_plans?id=eq.${filterValue(plan.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          commitment_hash: record.commitment_hash,
          integrity_record_id: record.id,
        }),
      });
    }
    return { ...plan, legs, integrity_record_id: record?.id || null };
  } catch (error) {
    if (/(liquidity_route|does not exist|relation|42P01)/i.test(error.message)) {
      return { ...planned, id: null, route_code: routeCode(), expires_at: expiresAt };
    }
    throw error;
  }
}

async function markLiquidityRouteDealCompleted(deal) {
  if (!deal?.route_plan_id || !deal?.route_leg_index) return null;
  await supabaseRequest(
    [
      "liquidity_route_legs?",
      `route_plan_id=eq.${filterValue(deal.route_plan_id)}`,
      `&leg_index=eq.${filterValue(deal.route_leg_index)}`,
    ].join(""),
    {
      method: "PATCH",
      body: JSON.stringify({ status: "completed", deal_id: deal.id }),
    }
  );
  const legs = await supabaseRequest(
    `liquidity_route_legs?route_plan_id=eq.${filterValue(deal.route_plan_id)}&order=leg_index.asc`
  );
  const allCompleted = legs.length > 0 && legs.every((leg) => leg.status === "completed");
  await supabaseRequest(`liquidity_route_plans?id=eq.${filterValue(deal.route_plan_id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: allCompleted ? "completed" : "partially_opened" }),
  });
  return { allCompleted, legs };
}

module.exports = {
  planLiquidityRoute,
  createLiquidityRoutePlan,
  markLiquidityRouteDealCompleted,
};
