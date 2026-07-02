const { isOpenAiEnabled, openAiGenerateJson } = require("../lib/openai");
const { normalizeCurrency } = require("./currency");

const ACTIONS = [
  "create_listing",
  "find_offer",
  "browse_offers",
  "reserve_listing",
  "trade_action",
  "my_listings",
  "my_deals",
  "view_profile",
  "view_payouts",
  "settings_action",
  "bulk_cancel_listings",
  "bulk_delete_payouts",
  "add_payout",
  "menu",
  "verify",
  "greeting",
  "thanks",
  "wellbeing",
  "flow_reply",
  "question",
  "unknown",
];

// Actions that mean "the user asked for something new" — the router cancels
// whatever flow was active and serves the request instead of re-prompting.
const FRESH_ACTIONS = new Set([
  "create_listing",
  "find_offer",
  "browse_offers",
  "reserve_listing",
  "trade_action",
  "my_listings",
  "my_deals",
  "view_profile",
  "view_payouts",
  "settings_action",
  "bulk_cancel_listings",
  "bulk_delete_payouts",
  "add_payout",
  "menu",
  "verify",
]);

// Strict structured-output schema: every property listed as required, with
// null in the type union for the optional slots.
const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: ACTIONS },
    have_currency: { type: ["string", "null"] },
    have_amount: { type: ["number", "null"] },
    want_currency: { type: ["string", "null"] },
    want_amount: { type: ["number", "null"] },
    payment_currency: { type: ["string", "null"] },
    answer: { type: ["string", "null"] },
  },
  required: [
    "action",
    "have_currency",
    "have_amount",
    "want_currency",
    "want_amount",
    "payment_currency",
    "answer",
  ],
};

const SYSTEM_PROMPT = [
  "You interpret WhatsApp messages sent to Akara, a peer-to-peer currency exchange assistant.",
  "Akara lets verified users post exchange offers (listings), find matching offers, open trades, save payout details, and view transaction history.",
  "Akara does not hold funds; money moves directly between users through bank or mobile money.",
  "Akara is free to use right now. If someone asks about fees or cost, tell them it is free and that inviting or referring a friend to swap with them earns 10 more free trades.",
  "Supported currencies: NGN (naira), RWF (Rwandan franc), XAF (Central African franc), KES (Kenyan shilling), GHS (Ghanaian cedi).",
  "",
  "You receive the recent conversation transcript and the user's newest message. Use the transcript to resolve references like \"it\", \"that one\", \"the second offer\", \"same as before\", and to fill in currency or amount details the user already gave earlier.",
  "",
  "Classify the user's newest message into exactly one action:",
  "- create_listing: they state money they have and want to exchange (posting/making an offer, listing, ad, or post).",
  "- find_offer: they are looking for someone to exchange with for a specific currency pair.",
  "- browse_offers: they want to see available offers, deals, or rates without giving a full pair.",
  "- reserve_listing: they want to reserve, take, accept, pick, or open a specific posted offer, usually referenced by a code like AKR-LIST-104, \"Akara Offer 12\", or a number from a list Akara just showed.",
  "- trade_action: they report a payment sent or received, share proof or a receipt, ask to remind the other party, raise a dispute, check the status of a trade, or cancel an open trade.",
  "- my_listings: they want to see the offers/listings/ads/posts they posted themselves (\"my listing\", \"my offers\", \"what I posted\").",
  "- my_deals: they want their own trade or transaction history (\"my deals\", \"my transactions\", \"history\", \"records\", \"statement\").",
  "- view_profile: they want to see their own profile or account details (\"my profile\", \"my account\", \"account info\", \"who am I\").",
  "- view_payouts: they want to see their saved bank or payment information (\"bank details\", \"bank information\", \"my bank\", \"payment details\", \"payout details\", \"momo details\").",
  "- settings_action: they want to edit, change, pause, reopen, close, delete, or remove a specific listing or payout detail.",
  "- bulk_cancel_listings: they want to cancel, close, or delete ALL of their listings or offers at once.",
  "- bulk_delete_payouts: they want to delete ALL of their saved payout or payment details at once.",
  "- add_payout: they want to add, save, or register NEW payout details (bank account or mobile money). Set payment_currency when they name the currency it is for. Editing existing details is settings_action, not add_payout.",
  "- menu: they want the menu, help, or to know what Akara can do.",
  "- verify: they ask to get verified or continue verification.",
  "- greeting: a greeting or conversation opener with no other request.",
  "- thanks: a short thank-you or appreciation message.",
  "- wellbeing: they ask how Akara is doing (how are you, how far, you good).",
  "- flow_reply: only when an active flow is stated in the context AND the message reads as a direct answer to that flow's last prompt (an amount, a currency, a bank name, a person's name, a phone or account number, yes/no, or an option number) rather than a fresh request.",
  "- question: a question Akara should answer in text.",
  "- unknown: unrelated to Akara or impossible to interpret.",
  "",
  "Flow interruption rule: when a flow is active but the newest message is clearly a different request (for example they are mid listing-creation and ask to see their bank details), classify the NEW request. Never force a message into flow_reply just because a flow is active.",
  "Confirmation rule: when an active flow is waiting for confirmation and the message confirms, approves, or asks to publish or proceed (yes, go ahead, publish it, oya post am), classify it as flow_reply — do not re-classify it as create_listing just because the draft's details appear in the transcript.",
  "Treat synonyms interchangeably: offer/listing/ad/post/deal, bank details/bank information/payment details/payout details/account details, history/transactions/records/statement/deals/trades, profile/account/settings.",
  "",
  "Extract currencies as ISO codes (NGN, RWF, XAF, KES, GHS) and amounts as plain numbers.",
  "Interpret shorthand like 50k as 50000 and 1.2m as 1200000.",
  "Users may write in Nigerian Pidgin or casual slang.",
  "When the newest message omits a currency or amount that the transcript clearly establishes (\"make it 20k instead\"), fill the missing slots from the transcript.",
  "",
  "Only write answer for actions question and unknown: a short, friendly WhatsApp answer (under 100 words) about Akara only. Use the transcript so the answer fits the conversation.",
  "Never invent exchange rates, fees, or features. If asked for a live rate, say rates on Akara are peer-set and suggest checking current offers.",
  "For every other action answer must be null. The app sends its own reply for those actions, including flow_reply — do not greet the user or narrate the flow.",
].join("\n");

function cleanAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Sends one OpenAI call to classify a free-form message into an Akara action
// plus any exchange details. `context` carries the user's session state and
// the recent conversation transcript so mid-flow answers, interruptions, and
// references to earlier messages are all resolved in a single pass.
// Returns null when OpenAI is off or fails, so the caller can fall back to
// the regex-based routing.
async function interpretMessage(text, context = {}) {
  if (!isOpenAiEnabled()) return null;
  const value = String(text || "").trim();
  if (!value) return null;

  const contextLines = [
    context.flow
      ? `Active flow: ${context.flow}${context.step ? ` (step: ${context.step})` : ""}.`
      : "Active flow: none.",
    `User verified: ${context.verified === false ? "no" : "yes"}.`,
  ];

  if (context.transcript) {
    contextLines.push("", "Recent conversation:", context.transcript, "");
  }

  try {
    const result = await openAiGenerateJson(
      [...contextLines, `Newest message: ${JSON.stringify(value)}`].join("\n"),
      {
        system: SYSTEM_PROMPT,
        responseSchema: RESPONSE_SCHEMA,
      }
    );

    if (!ACTIONS.includes(result.action)) return null;

    return {
      action: result.action,
      details: {
        have_currency: normalizeCurrency(result.have_currency || ""),
        want_currency: normalizeCurrency(result.want_currency || ""),
        have_amount: cleanAmount(result.have_amount),
        want_amount: cleanAmount(result.want_amount),
        payment_currency: normalizeCurrency(result.payment_currency || ""),
      },
      answer: typeof result.answer === "string" ? result.answer.trim() : "",
    };
  } catch (error) {
    console.error("OpenAI interpretation failed:", error.message);
    return null;
  }
}

function isFreshRequestAction(action) {
  return FRESH_ACTIONS.has(action);
}

module.exports = {
  interpretMessage,
  isFreshRequestAction,
  FRESH_ACTIONS,
};
