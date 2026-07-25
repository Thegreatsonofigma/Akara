const { supabaseRequest, filterValue } = require("../lib/supabase");
const { title, caption, fieldBlock, formatMoney } = require("../lib/format");
const { displayReference } = require("./listings");
const { dealPartySummary } = require("./deals");

const SUCCESS_FEE_BY_CURRENCY = {
  NGN: 100,
  RWF: 100,
  XAF: 100,
  KES: 100,
  GHS: 1,
};

const FEE_BILLING_THRESHOLD = 5;

function feeAmountForCurrency(currency) {
  return SUCCESS_FEE_BY_CURRENCY[currency] ?? 100;
}

function feeReference(deal, userId) {
  const dealCode = displayReference(deal?.deal_code, "deal")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase();
  const userToken = String(userId || "").replace(/-/g, "").slice(0, 6).toUpperCase() || "USER";
  return `AKF-${dealCode.slice(-6)}-${userToken}`;
}

async function getExistingDealFee(dealId, userId) {
  const rows = await supabaseRequest(
    `fees?deal_id=eq.${filterValue(dealId)}&user_id=eq.${filterValue(userId)}&select=id,amount,currency,status,payment_reference&limit=1`
  );
  return rows[0] || null;
}

async function recordDealFeeForUser(deal, userId, role) {
  if (!deal?.id || !userId) return null;
  const existing = await getExistingDealFee(deal.id, userId);
  if (existing) return existing;

  const { youReceive } = dealPartySummary(role, deal);
  const currency = youReceive.currency;
  const amount = feeAmountForCurrency(currency);
  const rows = await supabaseRequest("fees", {
    method: "POST",
    body: JSON.stringify({
      deal_id: deal.id,
      user_id: userId,
      currency,
      amount,
      fee_type: "success_fee",
      billing_threshold: FEE_BILLING_THRESHOLD,
      status: "pending",
      payment_reference: feeReference(deal, userId),
    }),
  });
  return rows[0] || null;
}

async function recordDealFees(deal) {
  if (!deal?.maker_user_id || !deal?.taker_user_id) return [];
  return Promise.all([
    recordDealFeeForUser(deal, deal.maker_user_id, "maker"),
    recordDealFeeForUser(deal, deal.taker_user_id, "taker"),
  ]);
}

function feeLedgerNote(currency) {
  const amount = feeAmountForCurrency(currency);
  return [
    title("Service fee"),
    fieldBlock("This trade", formatMoney(amount, currency)),
    caption(`Added to your Akara Fee Account. Pay accumulated fees only with your Akara fee reference after ${FEE_BILLING_THRESHOLD} completed trades. Never send exchange money to Akara's fee account.`),
  ].join("\n\n");
}

module.exports = {
  FEE_BILLING_THRESHOLD,
  feeAmountForCurrency,
  feeLedgerNote,
  feeReference,
  recordDealFees,
  recordDealFeeForUser,
};
