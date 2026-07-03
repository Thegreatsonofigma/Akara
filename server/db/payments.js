const { supabaseRequest, filterValue } = require("../lib/supabase");
const { formatMoney } = require("../lib/format");

async function getDefaultPaymentProfile(userId, currency) {
  const rows = await supabaseRequest(
    [
      "payment_profiles?select=id,currency,method,account_name,bank_name,account_number_encrypted,momo_network,momo_number_encrypted,is_default",
      `user_id=eq.${filterValue(userId)}`,
      `currency=eq.${filterValue(currency)}`,
      "order=is_default.desc,created_at.desc",
      "limit=1",
    ].join("&")
  );
  return rows[0] || null;
}

async function getPaymentProfiles(userId) {
  return supabaseRequest(
    [
      "payment_profiles?select=id,currency,method,account_name,bank_name,account_number_encrypted,momo_network,momo_number_encrypted,is_default,created_at",
      `user_id=eq.${filterValue(userId)}`,
      "order=currency.asc,is_default.desc,created_at.desc",
      "limit=20",
    ].join("&")
  );
}

function formatPaymentProfile(profile) {
  if (!profile) return "No payment details saved yet.";
  if (profile.method === "bank") {
    return [
      `*${profile.currency} bank account*${profile.is_default ? " ✅" : ""}`,
      "",
      `*Bank:* ${profile.bank_name}`,
      `*Name:* ${profile.account_name}`,
      `*Account:* ${profile.account_number_encrypted}`,
    ].join("\n");
  }

  return [
    `*${profile.currency} mobile money*${profile.is_default ? " ✅" : ""}`,
    "",
    `*Network:* ${profile.momo_network}`,
    `*Name:* ${profile.account_name}`,
    `*Number:* ${profile.momo_number_encrypted}`,
  ].join("\n");
}

function paymentDestinationTitle(profile) {
  if (!profile) return "Send to";
  if (profile.method === "bank") return `Send to ${profile.currency} bank`;
  return `Send to ${profile.currency} mobile money`;
}

function paymentExpectationLine(amount, currency, profile) {
  if (!profile) return `Expect ${formatMoney(amount, currency)} in your saved payout detail.`;
  if (profile.method === "bank") {
    return `Expect ${formatMoney(amount, currency)} in your ${profile.currency} bank account: ${profile.bank_name}, ${profile.account_name}.`;
  }

  return `Expect ${formatMoney(amount, currency)} on ${profile.momo_network} ${profile.currency} mobile money: ${profile.momo_number_encrypted}, ${profile.account_name}.`;
}

function formatPaymentProfileCompact(profile, index = null) {
  const prefix = index ? `${index}. ` : "";
  if (profile.method === "bank") {
    return [
      `*${prefix}${profile.currency} bank account*${profile.is_default ? " ✅" : ""}`,
      `*Bank:* ${profile.bank_name}`,
      `*Name:* ${profile.account_name}`,
      `*Account:* ${profile.account_number_encrypted}`,
    ].join("\n");
  }

  return [
    `*${prefix}${profile.currency} mobile money*${profile.is_default ? " ✅" : ""}`,
    `*Network:* ${profile.momo_network}`,
    `*Name:* ${profile.account_name}`,
    `*Number:* ${profile.momo_number_encrypted}`,
  ].join("\n");
}

module.exports = {
  getDefaultPaymentProfile,
  getPaymentProfiles,
  formatPaymentProfile,
  paymentDestinationTitle,
  paymentExpectationLine,
  formatPaymentProfileCompact,
};
