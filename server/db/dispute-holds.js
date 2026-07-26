const { supabaseRequest, filterValue } = require("../lib/supabase");

const OPEN_DISPUTE_STATUSES = "open,waiting_for_user,under_review";

async function openDisputesForUser(userId) {
  const deals = await supabaseRequest([
    "deals?select=id",
    `or=(maker_user_id.eq.${filterValue(userId)},taker_user_id.eq.${filterValue(userId)})`,
    "limit=1000",
  ].join("&"));
  const dealIds = deals.map((deal) => deal.id).filter(Boolean);
  if (!dealIds.length) return [];

  return supabaseRequest([
    "disputes?select=id,deal_id,status",
    `deal_id=in.(${dealIds.map(filterValue).join(",")})`,
    `status=in.(${OPEN_DISPUTE_STATUSES})`,
    "limit=1000",
  ].join("&"));
}

async function applyDisputeHolds(deal) {
  if (!deal?.maker_user_id || !deal?.taker_user_id) return;
  const userIds = [...new Set([deal.maker_user_id, deal.taker_user_id])];

  await Promise.all(userIds.flatMap((userId) => [
    supabaseRequest(`users?id=eq.${filterValue(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ dispute_hold: true }),
    }),
    supabaseRequest(
      `listings?owner_user_id=eq.${filterValue(userId)}&status=eq.active`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "paused",
          dispute_paused: true,
          updated_at: new Date().toISOString(),
        }),
      }
    ),
  ]));
}

async function releaseUserDisputeHold(userId) {
  const openDisputes = await openDisputesForUser(userId);
  if (openDisputes.length) return false;

  await Promise.all([
    supabaseRequest(`users?id=eq.${filterValue(userId)}`, {
      method: "PATCH",
      body: JSON.stringify({ dispute_hold: false }),
    }),
    supabaseRequest(
      [
        "listings?select=id",
        `owner_user_id=eq.${filterValue(userId)}`,
        "status=eq.paused",
        "dispute_paused=eq.true",
      ].join("&"),
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "active",
          dispute_paused: false,
          updated_at: new Date().toISOString(),
        }),
      }
    ),
  ]);
  return true;
}

async function releaseDisputeHolds(deal) {
  if (!deal?.maker_user_id || !deal?.taker_user_id) return;
  const userIds = [...new Set([deal.maker_user_id, deal.taker_user_id])];
  await Promise.all(userIds.map(releaseUserDisputeHold));
}

module.exports = {
  applyDisputeHolds,
  releaseDisputeHolds,
  openDisputesForUser,
};
