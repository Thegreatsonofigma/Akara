const { title, caption, action, labeled } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { currencyMentions, currencyHelpLine } = require("../nlp/currency");
const {
  isRateQuestion,
  isGreeting,
  isThanksMessage,
  isWellbeingQuestion,
} = require("../nlp/intents");
const { isVerified, firstName } = require("../db/users");
const { getMarketRate } = require("../db/market");
const {
  issueReputationCredential,
  getReputationCredential,
  credentialShareUrl,
} = require("../db/credentials");
const { calculateReputation } = require("../db/integrity");
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

function cleanConversationalAnswer(answer) {
  return String(answer || "")
    .replace(/[—–]/g, ",")
    .replace(/\s+\n/g, "\n")
    .trim()
    .slice(0, 900);
}

function personalizeGreeting(answer, name, mode) {
  if (!name || mode !== "greeting" || answer.toLowerCase().includes(name.toLowerCase())) {
    return answer;
  }

  if (/^(hi|hello|hey)\s+there\b/i.test(answer)) {
    return answer.replace(/^(hi|hello|hey)\s+there\b/i, `$1 ${name}`);
  }
  if (/^(hi|hello|hey)\b/i.test(answer)) {
    return answer.replace(/^(hi|hello|hey)\b/i, `$1 ${name}`);
  }
  if (/^good (morning|afternoon|evening)\b/i.test(answer)) {
    return answer.replace(/^good (morning|afternoon|evening)\b/i, (greeting) => `${greeting}, ${name}`);
  }
  return `Hi ${name}. ${answer}`;
}

function conversationNudge(user, activeFlow = "") {
  if (!isVerified(user)) {
    if (user?.verification_status === "pending_review") {
      return caption("Your verification is in review. I will let you know as soon as it is ready.");
    }
    if (user?.verification_status === "suspended") {
      return caption("Your account needs a review before you can exchange. Contact support if you need help.");
    }
    if (user?.verification_status === "rejected") {
      return [
        caption("Your verification needs another look before you can exchange."),
        action("verify"),
      ].join("\n");
    }
    return [
      caption("To exchange with Akara, complete verification first."),
      action("verify"),
    ].join("\n");
  }

  const active = {
    create_listing: "Your listing draft is still open. Reply with the next detail when you are ready.",
    find_offer: "Your offer search is still open. Reply with the next detail when you are ready.",
    search_results: "Your offer results are still open. Choose an offer or ask to see more.",
    negotiation: "Your negotiation is still open. Reply with your offer or decision when you are ready.",
    payment_profile: "Your payout setup is still open. Reply with the requested detail to continue.",
    deal_room: "Your Akara Trade is still open. Ask for its status whenever you need it.",
    verification: "Your verification is still open. Reply with the requested detail to continue.",
  }[activeFlow];
  if (active) return caption(active);

  return caption("What would you like to do next?");
}

function genericAkaraAssistantReply(user, options = {}) {
  const name = firstName(user);
  const mode = options.interpretedAction || "unknown";
  const fallback = {
    greeting: `Hi${name ? ` ${name}` : ""}. Good to hear from you.`,
    wellbeing: "I dey good, and I am ready when you are.",
    thanks: `You are welcome${name ? `, ${name}` : ""}.`,
    question: "I can help with that where it relates to Akara and currency exchange.",
    unknown: "I hear you. That is outside what I can do directly inside Akara.",
  }[mode] || `I hear you${name ? `, ${name}` : ""}.`;
  const cleanedAnswer = cleanConversationalAnswer(options.modelAnswer) || fallback;
  const answer = personalizeGreeting(cleanedAnswer, name, mode);

  if (options.suppressNudge) return answer;
  if (mode === "greeting" && !options.activeFlow) {
    return [
      answer,
      "",
      "If you need money in another currency, tell me what you have and what you want.",
      "",
      "I will check live offers first. If nothing fits, I can prepare your own listing and keep every exchange step organized here in WhatsApp.",
    ].join("\n");
  }
  return [answer, "", conversationNudge(user, options.activeFlow)].join("\n");
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

  const snapshot = await getMarketRate(fromCurrency, toCurrency);
  if (snapshot) {
    return [
      title(`${fromCurrency} to ${toCurrency}`),
      caption("Akara Market Rate uses live peer listings and recent completed exchanges."),
      "",
      labeled("Market rate", `1 ${fromCurrency} gets about ${Number(snapshot.weighted_rate).toFixed(4)} ${toCurrency}`),
      labeled("Current range", `${Number(snapshot.low_rate).toFixed(4)} to ${Number(snapshot.high_rate).toFixed(4)} ${toCurrency}`),
      labeled("Best visible", `1 ${fromCurrency} gets ${Number(snapshot.best_rate).toFixed(4)} ${toCurrency}`),
      labeled(
        "Market depth",
        `${snapshot.active_listing_count} live · ${snapshot.completed_trade_count} recent completed`
      ),
      "",
      caption("Peer-set market information, not a guaranteed exchange rate. Your accepted terms are locked before payment."),
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

function trustCredentialMessage(credential, heading = "Akara Trust Record") {
  const claims = credential.claims || {};
  const link = credentialShareUrl(credential.credential_code);
  return [
    title(heading),
    caption("Your activity and reliability on Akara."),
    "",
    `*Reference:* ${credential.credential_code}`,
    "",
    `*🏅 Trust level:* ${String(credential.reputation_band || "new").replace(/^./, (value) => value.toUpperCase())}`,
    "",
    `*✅ Completed trades:* ${claims.completed_trades || 0}`,
    "",
    `*📈 Completion rate:* ${Number(claims.completion_rate || 0).toFixed(0)}%`,
    "",
    `*⚠️ Open disputes:* ${claims.unresolved_disputes || 0}`,
    "",
    `*🔐 Record integrity:* ${claims.integrity_status === "verified" ? "Stellar verified" : "Updating"}`,
    "",
    `*Valid until:* ${new Date(credential.expires_at).toLocaleDateString("en-GB")}`,
    "",
    link ? `*🔗 Share record:* ${link}` : "",
  ].filter(Boolean).join("\n");
}

async function reputationAssistantReply(text, user) {
  const code = String(text || "").match(/\bAKR-TRUST-[A-F0-9]{8}\b/i)?.[0];
  if (code) {
    const credential = await getReputationCredential(code);
    if (!credential || credential.status !== "active" || Date.parse(credential.expires_at) <= Date.now()) {
      return [
        title("Trust record unavailable"),
        "That Akara credential is invalid, expired, or revoked.",
      ].join("\n");
    }
    return trustCredentialMessage(credential, "Verified Akara Trust Record");
  }

  if (!isVerified(user)) {
    return "Complete verification before Akara can issue your Trust Record.";
  }
  const credential = await issueReputationCredential(user.id);
  if (!credential) {
    const reputation = await calculateReputation(user.id);
    return [
      title("Your trust record"),
      caption("Your activity and reliability on Akara."),
      "",
      `*🏅 Trust level:* ${String(reputation.reputation_band || "new").replace(/^./, (value) => value.toUpperCase())}`,
      "",
      `*✅ Completed trades:* ${reputation.completed_trades || 0}`,
      "",
      `*📈 Completion rate:* ${Number(reputation.completion_rate || 0).toFixed(0)}%`,
      "",
      `*⚠️ Open disputes:* ${reputation.open_disputes || 0}`,
    ].join("\n");
  }
  return trustCredentialMessage(credential);
}

function accountMigrationReply() {
  return [
    title("Moving to another phone"),
    "",
    "If you keep the same WhatsApp number, your Akara account, verification, listings, and history move with it. You do not need to verify again.",
    "",
    title("Changing your WhatsApp number"),
    "",
    "Akara must securely transfer the account. We confirm the old number where possible, check that no trade or dispute is open, verify the account owner, then revoke access from the old number.",
    "",
    caption("Ask Akara to move your account when the new number is ready. Support will open a protected migration review."),
  ].join("\n");
}

async function scopedAssistantReply(text, user, options = {}) {
  const value = compactText(text);

  if (/\bAKR-TRUST-[A-F0-9]{8}\b/i.test(text)
      || /\b(trust record|reputation passport|reputation record|my reputation|my trust|trust credential)\b/.test(value)) {
    return reputationAssistantReply(text, user);
  }
  if (isRateQuestion(text)) return rateAssistantReply(text);
  if (/\b(new|another|change|changing|move|moving|migrate|migration|transfer)\b.*\b(phone|device|whatsapp number|number|account)\b/.test(value)
      || /\b(phone|device|whatsapp number|number|account)\b.*\b(change|move|migrate|transfer)\b/.test(value)) {
    return accountMigrationReply();
  }
  if (/\b(what is akara|who are you|what do you do|how does akara work|explain akara)\b/.test(value)) return explainAkaraReply();
  if (/\b(refer|referral|referrals|invite|inviting|free trades?)\b/.test(value)) return referralAssistantReply();
  if (/\b(fee|fees|charge|charges|cost|costs|pricing|service fee|akara credits)\b/.test(value)) return feeAssistantReply();
  if (/\b(safe|safety|trust|scam|protect|hold funds|custody|escrow|wallet)\b/.test(value)) return safetyAssistantReply();
  if (/\b(verify|verification|kyc|tier|limit|limits)\b/.test(value)) return verificationAssistantReply(user);
  if (/\b(payout|payment detail|bank detail|momo|mobile money|account detail|wallet)\b/.test(value)) return payoutAssistantReply();
  if (/\b(receipt|proof|screenshot|payment evidence)\b/.test(value)) return receiptAssistantReply();
  if (/\b(dispute|problem|issue|wrong|fake|not received|no alert)\b/.test(value)) return disputeAssistantReply();
  if (/\b(what can you do|help|options|commands|menu)\b/.test(value)) return mainMenu();

  let interpretedAction = options.interpretedAction || "unknown";
  if (isWellbeingQuestion(text)) interpretedAction = "wellbeing";
  else if (isThanksMessage(text)) interpretedAction = "thanks";
  else if (isGreeting(text)) interpretedAction = "greeting";

  return genericAkaraAssistantReply(user, {
    ...options,
    interpretedAction,
  });
}

module.exports = {
  scopedAssistantReply,
  reputationAssistantReply,
};
