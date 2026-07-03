const { supabaseRequest, filterValue } = require("../lib/supabase");
const { caption, fieldBlock, formatMoney, title } = require("../lib/format");
const { displayReference } = require("./listings");
const { getUserById } = require("./users");
const { getDefaultPaymentProfile } = require("./payments");
const { sendWhatsAppText } = require("../lib/whatsapp");

const DEAL_SELECT = "deals?select=id,deal_code,maker_user_id,taker_user_id,have_currency,want_currency,have_amount,want_amount,status,maker_sent_at,taker_sent_at,maker_received_at,taker_received_at,reservation_expires_at,created_at";

async function getDealById(dealId) {
  const rows = await supabaseRequest(`deals?id=eq.${filterValue(dealId)}&limit=1`);
  return rows[0] || null;
}

async function getDealByCodeForUser(user, dealCode) {
  if (!dealCode) return null;
  const rows = await supabaseRequest(
    [
      DEAL_SELECT,
      `deal_code=eq.${filterValue(dealCode)}`,
      `or=(maker_user_id.eq.${filterValue(user.id)},taker_user_id.eq.${filterValue(user.id)})`,
      "limit=1",
    ].join("&")
  );
  return rows[0] || null;
}

async function getLatestOpenDealForUser(userId) {
  const rows = await supabaseRequest(
    [
      DEAL_SELECT,
      `or=(maker_user_id.eq.${filterValue(userId)},taker_user_id.eq.${filterValue(userId)})`,
      "status=not.in.(closed,cancelled,expired,disputed)",
      "order=created_at.desc",
      "limit=5",
    ].join("&")
  );

  for (const deal of rows) {
    if (await expireDealIfElapsed(deal)) continue;
    return deal;
  }

  return null;
}

function userRoleInDeal(user, deal) {
  if (deal.maker_user_id === user.id) return "maker";
  if (deal.taker_user_id === user.id) return "taker";
  return null;
}

function isCompletedDeal(deal) {
  return Boolean(
    deal?.completed_at ||
    deal?.status === "completed_pending_fee" ||
    (deal?.status === "closed" && deal?.maker_received_at && deal?.taker_received_at)
  );
}

function hasDealPaymentActivity(deal) {
  return Boolean(
    deal?.maker_sent_at ||
    deal?.taker_sent_at ||
    deal?.maker_received_at ||
    deal?.taker_received_at
  );
}

function isDealWindowElapsed(deal) {
  if (!deal?.reservation_expires_at) return false;
  if (["closed", "cancelled", "expired", "disputed"].includes(deal.status)) return false;
  if (hasDealPaymentActivity(deal)) return false;
  return new Date(deal.reservation_expires_at).getTime() <= Date.now();
}

async function expireDealIfElapsed(deal) {
  if (!isDealWindowElapsed(deal)) return false;
  await supabaseRequest(`deals?id=eq.${filterValue(deal.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "expired",
      cancellation_reason: "Reservation window elapsed before payment activity.",
    }),
  });
  return true;
}

function dealPartySummary(role, deal) {
  const youSend = role === "maker"
    ? { amount: deal.have_amount, currency: deal.have_currency }
    : { amount: deal.want_amount, currency: deal.want_currency };
  const youReceive = role === "maker"
    ? { amount: deal.want_amount, currency: deal.want_currency }
    : { amount: deal.have_amount, currency: deal.have_currency };

  return { youSend, youReceive };
}

function dealSentField(role) {
  return role === "maker" ? "maker_sent_at" : "taker_sent_at";
}

function dealReceivedField(role) {
  return role === "maker" ? "maker_received_at" : "taker_received_at";
}

function otherDealRole(role) {
  return role === "maker" ? "taker" : "maker";
}

function dealPartyUserId(role, deal) {
  return role === "maker" ? deal.maker_user_id : deal.taker_user_id;
}

async function getDealPaymentProfileForRecipient(role, deal) {
  const recipientRole = otherDealRole(role);
  const recipientUserId = dealPartyUserId(recipientRole, deal);
  const { youSend } = dealPartySummary(role, deal);
  return getDefaultPaymentProfile(recipientUserId, youSend.currency);
}

function readableDealStatus(deal, role) {
  const otherRole = otherDealRole(role);
  const youSent = Boolean(deal[dealSentField(role)]);
  const youReceived = Boolean(deal[dealReceivedField(role)]);
  const otherSent = Boolean(deal[dealSentField(otherRole)]);
  const otherReceived = Boolean(deal[dealReceivedField(otherRole)]);

  if (isCompletedDeal(deal)) return "Exchange completed";
  if (deal.status === "cancelled") return "Cancelled";
  if (deal.status === "expired") return "Expired";
  if (deal.status === "disputed") return "Dispute open";
  if (deal.status === "closed") return "Closed";
  if (youReceived && otherReceived) return "Both sides confirmed";
  if (youSent && youReceived) return "Your side is complete";
  if (youSent && otherSent) return "Both payments marked sent";
  if (youSent && !otherSent) return "Your payment is marked sent";
  if (!youSent && otherSent) return "Their payment is marked sent";
  return "Trade opened";
}

function dealNextStepCopy(deal, role) {
  const otherRole = otherDealRole(role);
  const { youSend, youReceive } = dealPartySummary(role, deal);
  const youSent = Boolean(deal[dealSentField(role)]);
  const youReceived = Boolean(deal[dealReceivedField(role)]);
  const otherSent = Boolean(deal[dealSentField(otherRole)]);

  if (deal.status === "disputed") return "Admin review is needed before this continues.";
  if (isCompletedDeal(deal)) return "This exchange is completed.";
  if (deal.status === "closed") return "This trade is closed.";
  if (!youSent) return `Send ${formatMoney(youSend.amount, youSend.currency)}, then reply paid or upload your receipt.`;
  if (!youReceived && otherSent) return `Check for ${formatMoney(youReceive.amount, youReceive.currency)}, then reply received once it lands.`;
  if (!youReceived) return `Wait for ${formatMoney(youReceive.amount, youReceive.currency)}. Reply remind if it drags, or dispute if something is wrong.`;
  return "You have confirmed your side. I will keep the trail updated here.";
}

function dealMiniSummary(deal, role) {
  const { youSend, youReceive } = dealPartySummary(role, deal);
  return [
    fieldBlock("Transaction ref", displayReference(deal.deal_code, "deal")),
    "",
    fieldBlock("You send", formatMoney(youSend.amount, youSend.currency)),
    "",
    fieldBlock("You receive", formatMoney(youReceive.amount, youReceive.currency)),
    "",
    fieldBlock("Status", readableDealStatus(deal, role)),
    "",
    caption(dealNextStepCopy(deal, role)),
  ].join("\n");
}

function exchangeCompleteMessage(deal, role) {
  const { youSend, youReceive } = dealPartySummary(role, deal);
  return [
    title("Exchange completed ✅"),
    caption("Both sides have confirmed receiving their money."),
    "",
    fieldBlock("Transaction ref", displayReference(deal.deal_code, "deal")),
    "",
    fieldBlock("You exchanged", formatMoney(youSend.amount, youSend.currency)),
    "",
    fieldBlock("You received", formatMoney(youReceive.amount, youReceive.currency)),
    "",
    "Clean exchange, clear trail. Thank you for using Akara.",
  ].join("\n");
}

async function notifyDealUser(userId, message) {
  const target = await getUserById(userId);
  if (!target?.whatsapp_phone) return;
  await sendWhatsAppText(target.whatsapp_phone, message);
}

module.exports = {
  getDealById,
  getDealByCodeForUser,
  getLatestOpenDealForUser,
  userRoleInDeal,
  isCompletedDeal,
  expireDealIfElapsed,
  dealPartySummary,
  dealSentField,
  dealReceivedField,
  otherDealRole,
  dealPartyUserId,
  getDealPaymentProfileForRecipient,
  readableDealStatus,
  dealMiniSummary,
  exchangeCompleteMessage,
  notifyDealUser,
};
