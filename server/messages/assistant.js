const { supabaseRequest, filterValue } = require("../lib/supabase");
const { title, caption, action, labeled } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { currencyMentions, currencyHelpLine } = require("../nlp/currency");
const { isRateQuestion } = require("../nlp/intents");
const { isVerified, firstName } = require("../db/users");
const { mainMenu } = require("./copy");

function explainAkaraReply() {
  return [
    title("Akara"),
    "Akara helps verified people find and complete peer-to-peer currency exchanges inside WhatsApp.",
    "",
    "You can make listings, find offers, open trades, send receipts, remind the other party, and track your transaction history.",
    "",
    caption("Akara does not hold funds in this MVP. Money moves directly between both parties through bank or mobile money."),
    "",
    action("find offers"),
    action("make offer"),
    action("profile"),
  ].join("\n");
}

function feeAssistantReply() {
  return [
    title("Service fee"),
    "Akara is free to use. No one needs to send a separate fee inside a trade.",
  ].join("\n");
}

function referralAssistantReply() {
  return [
    title("Free trades 🎁"),
    "Invite a friend or refer a friend to swap with you and get 10 more free trades.",
    "",
    "Share one of your offer links, or tell a friend to message Akara on WhatsApp and trade with you.",
    "",
    action("make offer"),
    action("my listings"),
  ].join("\n");
}

function safetyAssistantReply() {
  return [
    title("Safety on Akara"),
    "Akara verifies users, records trade steps, forwards receipts, supports reminders, and lets either party raise a dispute.",
    "",
    "Before you send money, check the amount, name, bank or MoMo details, and transaction reference.",
    "",
    caption("Akara records the exchange trail, but does not hold or reverse external bank or mobile money transfers."),
  ].join("\n");
}

function verificationAssistantReply(user) {
  if (isVerified(user)) {
    return [
      title("Verification"),
      "You are verified ✅",
      "",
      "You can make offers, find offers, open trades, manage payout details, and view history.",
      "",
      mainMenu(),
    ].join("\n");
  }

  return [
    title("Verification"),
    "Verification helps keep Akara safer by tying each user to an ID and payout name.",
    "",
    "You will provide your legal name, ID details, document photo, selfie, and at least one payout detail.",
    "",
    action("verify"),
  ].join("\n");
}

function payoutAssistantReply() {
  return [
    title("Payout details"),
    "Payout details tell the other party where to send your money during a trade.",
    "",
    "NGN uses bank account details. RWF, XAF, KES, and GHS use mobile money details.",
    "",
    "Akara asks you to review and confirm payout details before saving them.",
    "",
    action("add payout"),
    action("profile"),
  ].join("\n");
}

function receiptAssistantReply() {
  return [
    title("Receipts"),
    "When you mark a trade as paid, Akara asks for a receipt or payment screenshot.",
    "",
    "The receipt is sent to the other party inside WhatsApp when possible, with a backup link if media delivery fails.",
    "",
    "If someone marks paid and does not upload a receipt in time, Akara opens a review trail for admin.",
  ].join("\n");
}

function disputeAssistantReply() {
  return [
    title("Disputes"),
    "Open a dispute inside a trade when the money has not arrived, the amount is wrong, the receipt looks suspicious, or anything feels unsafe.",
    "",
    "Akara will ask for a reason first, then keep that transaction under review with the receipt trail attached.",
    "",
    title("After opening one"),
    "Do not send any new payment for that trade until admin reviews it.",
    "Keep your receipt, payment alert, bank or MoMo history, and transaction reference ready.",
  ].join("\n");
}

function genericAkaraAssistantReply(user) {
  const name = firstName(user);
  return [
    `I hear you${name ? `, ${name}` : ""}.`,
    "",
    "I can answer questions about Akara, exchange rates, offers, payouts, receipts, reminders, disputes, verification, and transaction history.",
    "",
    "Tell me what you want to do next, or choose one:",
    "",
    action("find offers"),
    action("make offer"),
    action("history"),
    action("profile"),
  ].join("\n");
}

async function rateAssistantReply(text) {
  const mentions = currencyMentions(text).map((mention) => mention.currency);
  const unique = [...new Set(mentions)];
  const [fromCurrency, toCurrency] = unique.length >= 2 ? unique : [unique[0], null];

  if (!fromCurrency) {
    return [
      title("Exchange rates"),
      "Tell me the two currencies you want to compare.",
      "",
      action("NGN to RWF rate"),
      action("RWF to NGN rate"),
    ].join("\n");
  }

  if (!toCurrency) {
    return [
      title(`${fromCurrency} rates`),
      "Which currency should I compare it with?",
      "",
      caption(currencyHelpLine(fromCurrency)),
    ].join("\n");
  }

  const rows = await supabaseRequest(
    [
      "listings?select=have_currency,want_currency,have_amount,want_amount,created_at",
      "status=eq.active",
      `have_currency=eq.${filterValue(toCurrency)}`,
      `want_currency=eq.${filterValue(fromCurrency)}`,
      "order=created_at.desc",
      "limit=5",
    ].join("&")
  );

  if (rows.length) {
    const rates = rows
      .map((row) => Number(row.have_amount) / Number(row.want_amount))
      .filter((rate) => Number.isFinite(rate) && rate > 0);
    const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
    const best = Math.max(...rates);
    return [
      title(`${fromCurrency} to ${toCurrency}`),
      caption("Based on live Akara listings, not a central bank or forex feed."),
      "",
      labeled("Typical", `1 ${fromCurrency} gets about ${average.toFixed(4)} ${toCurrency}`),
      labeled("Best visible", `1 ${fromCurrency} gets ${best.toFixed(4)} ${toCurrency}`),
      labeled("Listings checked", String(rows.length)),
      "",
      action(`find ${toCurrency} offers`),
    ].join("\n");
  }

  return [
    title(`${fromCurrency} to ${toCurrency}`),
    "I do not have a live Akara listing for that pair right now.",
    "",
    "Rates on Akara are peer-set, so the real price depends on what verified users are currently offering.",
    "",
    "As a rough guide, compare bank, mobile money, and trusted market rates before accepting a trade.",
    "",
    action(`I have ${fromCurrency} and want ${toCurrency}`),
  ].join("\n");
}

async function scopedAssistantReply(text, user) {
  const value = compactText(text);

  if (isRateQuestion(text)) return rateAssistantReply(text);
  if (/\b(what is akara|who are you|what do you do|how does akara work|explain akara)\b/.test(value)) return explainAkaraReply();
  if (/\b(refer|referral|referrals|invite|inviting|free trades?)\b/.test(value)) return referralAssistantReply();
  if (/\b(fee|fees|charge|charges|cost|costs|pricing|service fee|akara credits)\b/.test(value)) return feeAssistantReply();
  if (/\b(safe|safety|trust|scam|protect|hold funds|custody|escrow|wallet)\b/.test(value)) return safetyAssistantReply();
  if (/\b(verify|verification|kyc|tier|limit|limits)\b/.test(value)) return verificationAssistantReply(user);
  if (/\b(payout|payment detail|bank detail|momo|mobile money|account detail|wallet)\b/.test(value)) return payoutAssistantReply();
  if (/\b(receipt|proof|screenshot|payment evidence)\b/.test(value)) return receiptAssistantReply();
  if (/\b(dispute|problem|issue|wrong|fake|not received|no alert)\b/.test(value)) return disputeAssistantReply();
  if (/\b(what can you do|help|options|commands|menu)\b/.test(value)) return mainMenu();

  return genericAkaraAssistantReply(user);
}

module.exports = {
  scopedAssistantReply,
};
