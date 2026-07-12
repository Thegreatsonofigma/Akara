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

function greetingMenuBody(user) {
  const name = firstName(user);
  return [
    `Hi${name ? ` ${name}` : ""} 👋`,
    "",
    "Choose what you want to do next on Akara.",
  ].join("\n");
}

function sessionEndedMenuBody(user) {
  const name = firstName(user);
  return [
    `Done${name ? `, ${name}` : ""}.`,
    "",
    "Choose what you want to do next on Akara.",
  ].join("\n");
}

function mainMenu(user) {
  const name = firstName(user);
  return [
    title(name ? `Hi ${name}, choose your next move` : "Choose your next move"),
    caption("Make an offer, find one, or manage your Akara account."),
    "",
    ...menuOptionLines(),
    "",
    "You can also type naturally:",
    "`I have 50k naira and want 55k rwf`",
    "`I have 2k naira and want rwf, show me available deals`",
    "",
    "At any time: `menu`, `history`, `profile`, or `start over`",
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
      "Use the button below to resubmit.",
    ].join("\n");
  }

  if (user.verification_status === "suspended") {
    return [
      "This Akara profile is suspended.",
      "",
      "You cannot make offers or start exchanges from this number right now.",
    ].join("\n");
  }

  const name = firstName(user);
  return [
    `Welcome${name ? ` ${name}` : ""} 👋`,
    "",
    "First, let's verify you. It helps keep exchanges safer and unlocks offers, trades, payout details, and history.",
    "",
    "Use the button below to start verification.",
  ].join("\n");
}

function welcomePrompt(user) {
  const name = firstName(user);
  return [
    `Hi${name ? ` ${name}` : ""} 👋`,
    "",
    "What currency would you like Akara to help you move today?",
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
    "Anytime you're ready, just tell me what currency you want to move.",
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
    ...menuOptionLines(),
    "",
    "You can type naturally, like:",
    "I have 2k naira and want rwf, show me available deals",
  ].join("\n");
}

function mainMenuListPayload(body = "Choose what you want to do next on Akara.") {
  return {
    body,
    button: "Click to Select",
    sections: [
      {
        title: "Akara actions",
        rows: [
          { id: "make_offer", title: "make offer", description: "Create a rate listing people can take." },
          { id: "find_offers", title: "find offers", description: "Browse available currency offers." },
          { id: "my_listings", title: "my listings", description: "Manage your live listings." },
          { id: "history", title: "history", description: "See your past and active trades." },
          { id: "profile", title: "profile", description: "Payouts, verification, and account details." },
        ],
      },
    ],
  };
}

function verificationStartListPayload(body = "Start verification to continue on Akara.") {
  return {
    body,
    button: "Start verification",
    sections: [
      {
        title: "Verification",
        rows: [
          {
            id: "verify",
            title: "Start verification",
            description: "ID, selfie, and payout checks.",
          },
        ],
      },
    ],
  };
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
      "Tell me what currency you have.",
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
  greetingMenuBody,
  sessionEndedMenuBody,
  welcomePrompt,
  thanksReply,
  wellbeingReply,
  referralPitch,
  feeIncludedText,
  feeIncludedNote,
  listingShareCopy,
  explainMissingListing,
  mainMenuListPayload,
  verificationStartListPayload
};
