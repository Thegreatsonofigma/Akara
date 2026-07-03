const { title, caption, action, formatMoney } = require("../lib/format");
const { currencyHelpLine } = require("../nlp/currency");
const { firstName } = require("../db/users");

function menuOptionLines() {
  return [
    "1. `make offer`",
    "2. `find offers`",
    "3. `my listings`",
    "4. `history`",
    "5. `profile`",
  ];
}

function mainMenu() {
  return [
    title("Akara menu"),
    caption("Choose a number or type the action."),
    "",
    ...menuOptionLines(),
    "",
    "_You can also type naturally:_",
    "`I have 50k naira and want 55k rwf`",
    "`I have 2k naira and want rwf, show me available deals`",
    "",
    "_At any time:_ `menu`, `history`, `profile`, or `start over`",
  ].join("\n");
}

function verificationIntro(user) {
  if (user.verification_status === "pending_input") {
    return [
      "Your verification is halfway done.",
      "",
      "Reply with the next detail I asked for, or type cancel to restart later.",
    ].join("\n");
  }

  if (user.verification_status === "pending_review") {
    return [
      "Your verification is in review 🕒",
      "",
      "Once approved, you can make offers, start exchanges, share offer links, and track your history.",
      "",
      "I'll message you when admin makes a decision.",
    ].join("\n");
  }

  if (user.verification_status === "rejected") {
    return [
      "Your last verification was not approved.",
      "",
      "You can try again with clearer details and documents.",
      "",
      "Type verify to resubmit.",
    ].join("\n");
  }

  if (user.verification_status === "suspended") {
    return [
      "This Akara profile is suspended.",
      "",
      "You cannot make offers or start exchanges from this number right now.",
    ].join("\n");
  }

  return [
    "Welcome to Akara 👋",
    "",
    "First, let's verify you. It helps keep exchanges safer and makes your offers trusted.",
    "",
    "After approval, you can:",
    ...menuOptionLines(),
    "",
    "_Make an offer gives you a shareable offer link._",
    "",
    "Type verify to start.",
  ].join("\n");
}

function welcomePrompt(user) {
  const name = firstName(user);
  return [
    `Hi${name ? ` ${name}` : ""} 👋`,
    "",
    "What would you like Akara to help you move today?",
    "",
    "You can say things naturally, like:",
    "I have 100,000 RWF and need 210,000 NGN",
    "I have 2k naira and want rwf, show me available deals",
    "Find RWF offers",
    "Make an offer",
    "",
    "I'll guide the next step from there.",
  ].join("\n");
}

function thanksReply(user) {
  const name = firstName(user);
  return [
    `You're welcome${name ? `, ${name}` : ""} 🙌`,
    "",
    "Anytime you're ready, just tell me what you want to move.",
    "",
    `${action("find offers")} · ${action("make offer")} · ${action("history")}`,
  ].join("\n");
}

function wellbeingReply(user) {
  const name = firstName(user);
  return [
    `I dey alright${name ? `, ${name}` : ""} 😄 Thanks for asking.`,
    "",
    "What can I help you exchange today?",
    "",
    "You can type naturally, like:",
    "I have 2k naira and want rwf, show me available deals",
  ].join("\n");
}

function referralPitch() {
  return "🎁 Invite a friend or refer a friend to swap with you and get 10 more free trades.";
}

function feeIncludedText() {
  return "Free";
}

function feeIncludedNote() {
  return "Service fee: Free";
}

function listingShareCopy() {
  return "Share this with anyone interested. They can review it and open the Akara Trade from their own chat.";
}

function explainMissingListing(fields, context = {}) {
  if (fields.includes("have_amount") || fields.includes("have_currency")) {
    return [
      "Tell me what you have.",
      "",
      currencyHelpLine(),
      "",
      "Example: I have 50k naira and want 55k RWF",
    ].join("\n");
  }

  if (fields.includes("want_amount") || fields.includes("want_currency")) {
    const have = context.have_amount && context.have_currency
      ? ` for ${formatMoney(context.have_amount, context.have_currency)}`
      : "";
    const options = context.have_currency ? `\n\n${currencyHelpLine(context.have_currency)}` : "";
    return `How much do you want${have}? Example: 55k RWF${options}`;
  }

  return [
    "Send the offer like: I have 50k naira and want 55k RWF",
    "",
    currencyHelpLine(),
  ].join("\n");
}

module.exports = {
  menuOptionLines,
  mainMenu,
  verificationIntro,
  welcomePrompt,
  thanksReply,
  wellbeingReply,
  referralPitch,
  feeIncludedText,
  feeIncludedNote,
  listingShareCopy,
  explainMissingListing,
};
