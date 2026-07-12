const { optionalEnv } = require("../config");
const { supabaseRequest, filterValue } = require("../lib/supabase");
const { formatMoney, moneyNumber } = require("../lib/format");
const { recordConsent } = require("./compliance");

async function findOrCreateUser(whatsappPhone, displayName) {
  const encodedPhone = filterValue(whatsappPhone);
  const existing = await supabaseRequest(`users?whatsapp_phone=eq.${encodedPhone}`);
  if (existing.length > 0) return existing[existing.length - 1];

  const created = await supabaseRequest("users", {
    method: "POST",
    body: JSON.stringify({
      whatsapp_phone: whatsappPhone,
      display_name: displayName || null,
    }),
  });

  const user = created[0];
  recordConsent({
    userId: user.id,
    whatsappPhone,
    purpose: "whatsapp_onboarding_and_service_messages",
    lawfulBasis: "consent_and_contract_preparation",
    source: "whatsapp_first_contact",
    consentText: "User initiated or continued a WhatsApp conversation with Akara.",
    metadata: {
      displayName: displayName || null,
      notice: "Akara privacy notice and WhatsApp messaging terms must be available before production launch.",
    },
  }).catch((error) => {
    console.error(`[compliance] consent capture failed for ${whatsappPhone}: ${error.message}`);
  });

  return user;
}

async function updateUser(userId, values) {
  const rows = await supabaseRequest(`users?id=eq.${filterValue(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(values),
  });
  return rows[0];
}

async function getUserById(userId) {
  const rows = await supabaseRequest(`users?id=eq.${filterValue(userId)}&limit=1`);
  return rows[0] || null;
}

async function latestVerificationRequest(userId) {
  const rows = await supabaseRequest(
    `verification_requests?user_id=eq.${filterValue(userId)}&order=created_at.desc&limit=1`
  );
  return rows[0] || null;
}

function isVerified(user) {
  return ["verified_auto", "verified_manual"].includes(user.verification_status);
}

function isTierOneUser(user) {
  return user.verification_status === "verified_auto" && Number(user.verification_score || 0) < 80;
}

function tierOneLimitForCurrency(currency) {
  const defaults = {
    NGN: 100000,
    RWF: 100000,
    XAF: 50000,
    KES: 10000,
    GHS: 500,
  };
  const value = Number(optionalEnv(`AKARA_TIER1_LIMIT_${currency}`, defaults[currency] || 100000));
  return Number.isFinite(value) && value > 0 ? value : defaults[currency] || 100000;
}

function tierLimitMessage(currency) {
  return [
    "Tier 1 limit reached.",
    "",
    `Your current limit for ${currency} is ${formatMoney(tierOneLimitForCurrency(currency), currency)}.`,
    "Higher amounts unlock after full document and face review.",
  ].join("\n");
}

function tierLimitBlockForAmount(user, amount, currency) {
  if (!isTierOneUser(user)) return "";
  return moneyNumber(amount) > tierOneLimitForCurrency(currency) ? tierLimitMessage(currency) : "";
}

function tierLimitBlockForListing(user, context) {
  return tierLimitBlockForAmount(user, context.have_amount, context.have_currency)
    || tierLimitBlockForAmount(user, context.want_amount, context.want_currency);
}

function isOnHold(user) {
  return user.hold_until && new Date(user.hold_until).getTime() > Date.now();
}

function firstName(user) {
  return (user.display_name || user.legal_name || "").trim().split(/\s+/)[0] || "";
}

module.exports = {
  findOrCreateUser,
  updateUser,
  getUserById,
  latestVerificationRequest,
  isVerified,
  isTierOneUser,
  tierLimitBlockForAmount,
  tierLimitBlockForListing,
  isOnHold,
  firstName,
};
