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
  "view_trust_record",
  "settings_action",
  "bulk_cancel_listings",
  "bulk_delete_payouts",
  "add_payout",
  "get_support",
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
  "view_trust_record",
  "settings_action",
  "bulk_cancel_listings",
  "bulk_delete_payouts",
  "add_payout",
  "get_support",
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
    secondary_actions: {
      type: "array",
      items: { type: "string", enum: ACTIONS },
      maxItems: 3,
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    needs_clarification: { type: "boolean" },
    clarifying_question: { type: ["string", "null"] },
    conversation_mode: {
      type: "string",
      enum: ["social", "informational", "transactional", "mixed"],
    },
    should_show_menu: { type: "boolean" },
    language_style: {
      type: "string",
      enum: ["standard", "casual", "pidgin"],
    },
    have_currency: { type: ["string", "null"] },
    have_amount: { type: ["number", "null"] },
    want_currency: { type: ["string", "null"] },
    want_amount: { type: ["number", "null"] },
    payment_currency: { type: ["string", "null"] },
    settings_target: { type: ["string", "null"], enum: ["listing", "payout", null] },
    settings_operation: {
      type: ["string", "null"],
      enum: ["edit", "close", "share", "pause", "reopen", "delete", null],
    },
    settings_item_number: { type: ["number", "null"] },
    answer: { type: ["string", "null"] },
  },
  required: [
    "action",
    "secondary_actions",
    "confidence",
    "needs_clarification",
    "clarifying_question",
    "conversation_mode",
    "should_show_menu",
    "language_style",
    "have_currency",
    "have_amount",
    "want_currency",
    "want_amount",
    "payment_currency",
    "settings_target",
    "settings_operation",
    "settings_item_number",
    "answer",
  ],
};

const SYSTEM_PROMPT = [
  "You interpret WhatsApp messages sent to Akara, a peer-to-peer currency exchange assistant.",
  "Akara lets verified users post exchange offers (listings), find matching offers, open trades, save payout details, and view transaction history.",
  "Akara does not hold funds; money moves directly between users through bank or mobile money.",
    "Akara is permanently free to use. There are no subscriptions, usage limits, fee balances, invoices, or monthly bills. Do not promise referral rewards.",
  "Supported currencies: NGN (naira), RWF (Rwandan franc), XAF (Central African franc), KES (Kenyan shilling), GHS (Ghanaian cedi).",
  "",
  "You receive the recent conversation transcript and the user's newest message. Use the transcript to resolve references like \"it\", \"that one\", \"the second offer\", \"same as before\", and to fill in currency or amount details the user already gave earlier.",
  "",
  "Choose one primary action for routing. If the message also contains other clear requests, place up to three of them in secondary_actions in the order they appear.",
  "Meaning and conversation context matter more than keywords. A message can be social and transactional at the same time.",
  "Never ask again for an amount, currency, choice, or correction that is already clear in the newest message, transcript, or active flow.",
  "The newest correction always overrides stale transcript values. Acknowledge the corrected value naturally in answer.",
  "When a request is clear, route it now. Never say you will search and then ask the user to repeat what they already said.",
  "Set needs_clarification only when a safe route is genuinely impossible. Ask one concise question in clarifying_question.",
  "Set conversation_mode to social, informational, transactional, or mixed based on the whole newest message.",
  "Set should_show_menu only when the user asks what Akara can do, is ending an ordinary conversation, or greets Akara with no active task. Do not show it during an active transaction or data-entry flow.",
  "Set language_style to pidgin, casual, or standard so Akara can answer in the user's natural register.",
  "You interpret intent and write conversational acknowledgement only. You never execute a transaction, approve verification, mutate a listing, or change money-sensitive state.",
  "",
  "Primary actions:",
  "- create_listing: they state money they have and want to exchange (posting/making an offer, listing, ad, or post).",
  "- find_offer: they are looking for someone to exchange with for a currency, amount, or pair, or asking who needs/wants a currency they hold (\"I also need naira\", \"who needs naira? 50k for 54k rwf\", \"anyone want NGN?\"). A greeting before the request does not make it a greeting. When they say they need or want a currency, put it in want_currency even if no amount or have_currency is given. A demand question is find_offer even when it quotes full amounts or a rate; the money they hold is the have side, so still extract the slots.",
  "- browse_offers: they want to see available offers, deals, or rates without giving a full pair.",
  "- reserve_listing: they want to reserve, take, accept, pick, or open a specific posted offer, usually referenced by a code like AKR-LIST-104, \"Akara Offer 12\", or a number from a list Akara just showed.",
  "- trade_action: they report a payment sent or received, share proof or a receipt, ask to remind the other party, raise a dispute, check the status of a trade, or cancel an open trade.",
  "- my_listings: they want to see the offers/listings/ads/posts they posted themselves (\"my listing\", \"my offers\", \"what I posted\").",
  "- my_deals: they want their own trade or transaction history (\"my deals\", \"my transactions\", \"history\", \"records\", \"statement\").",
  "- view_profile: they want to see their own profile or account details (\"my profile\", \"my account\", \"account info\", \"who am I\").",
  "- view_payouts: they want to see their saved bank or payment information (\"bank details\", \"bank information\", \"my bank\", \"payment details\", \"payout details\", \"momo details\").",
  "- view_trust_record: they want to see their Akara trust record, reputation, completion rate, reliability, or trust credential.",
  "- settings_action: they want to edit, modify, change, pause, reopen, close, delete, share, copy, or remove a specific listing or payout detail. Set settings_target, settings_operation, and settings_item_number when known.",
  "- bulk_cancel_listings: they want to cancel, close, or delete ALL of their listings or offers at once.",
  "- bulk_delete_payouts: they want to delete ALL of their saved payout or payment details at once.",
  "- add_payout: they want to add, save, or register NEW payout details (bank account or mobile money). Set payment_currency when they name the currency it is for. Editing existing details is settings_action, not add_payout.",
  "- get_support: they want to contact Akara support, report an account-level problem, or email the support team.",
  "- menu: they want the menu, ask what they can do on Akara, ask what services or options are available, are unsure where to begin, ask to be shown around, or otherwise want guidance choosing an Akara action. Meaning matters more than exact wording.",
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
  "No-match suggestion rule: when Akara found no offer and asked whether to prepare the user's request as a listing, treat any contextual approval (yes, create it, list mine, put it live, oya run am) as flow_reply; treat another-search language as flow_reply; and treat contextual rejection (no thanks, leave it, I will pass, not now) as flow_reply. Exact button wording is never required.",
  "Implied listing action rule: use the active flow and transcript to understand references such as this one, that offer, it, or the listing I chose. The user does not need an exact command. Wanting to adjust an amount, currency, or terms means settings_operation edit. Wanting it gone, unavailable, or no longer shown means close. Wanting its link, to send it around, or to show someone means share. Wanting it hidden temporarily means pause. Wanting it live again means reopen. Closing or deleting is only an inferred request; the application will still ask for confirmation.",
  "Treat synonyms interchangeably: offer/listing/ad/post/deal, bank details/bank information/payment details/payout details/account details, history/transactions/records/statement/deals/trades, profile/account/settings.",
  "",
  "Extract currencies as ISO codes (NGN, RWF, XAF, KES, GHS) and amounts as plain numbers.",
  "Interpret shorthand like 50k as 50000 and 1.2m as 1200000.",
  "Users may write in Nigerian Pidgin or casual slang.",
  "When the newest message omits a currency or amount that the transcript clearly establishes (\"make it 20k instead\"), fill the missing slots from the transcript.",
  "",
  "Always write answer.",
  "For greeting, thanks, and wellbeing: respond like a warm, present human in one short sentence. Use the user's name only when it is available in the transcript. Do not dump a menu.",
  "For question: answer the question directly and naturally in under 80 words. You may answer simple, timeless general-knowledge questions, casual conversation, and questions about Akara. If information is current, uncertain, medical, legal, investment-related, or otherwise high-stakes, say so briefly instead of guessing.",
  "For unknown: acknowledge what the user meant if possible. If it is outside Akara's capabilities, give a brief helpful response and state the limitation without sounding defensive.",
  "For greeting, thanks, wellbeing, question, and unknown, do not add a menu, commands, or an Akara sales pitch. The application adds one context-aware next step after your answer.",
  "For every other action: one short, friendly sentence (under 15 words) that acknowledges what the user asked for, for example \"Here's your transaction history.\" for my_deals. The app builds the functional reply itself and shows your sentence as its heading or caption, so acknowledge the request only — never promise specific results, quote data, list options, or give instructions, and never contradict what the app might report (it may find nothing).",
  "Write in the user's register when appropriate, including natural Nigerian or Cameroonian Pidgin, but remain clear and restrained.",
  "Never use an em dash.",
  "Never invent exchange rates, fees, or features. If asked for a live rate, say rates on Akara are peer-set and suggest checking current offers.",
].join("\n");

function cleanAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function normalizeInterpretation(result = {}) {
  if (!ACTIONS.includes(result.action)) return null;

  const secondaryActions = Array.isArray(result.secondary_actions)
    ? result.secondary_actions
        .filter((action) => ACTIONS.includes(action) && action !== result.action)
        .filter((action, index, values) => values.indexOf(action) === index)
        .slice(0, 3)
    : [];
  const confidence = Number(result.confidence);
  const conversationMode = ["social", "informational", "transactional", "mixed"].includes(result.conversation_mode)
    ? result.conversation_mode
    : (["greeting", "thanks", "wellbeing"].includes(result.action) ? "social" : "transactional");
  const languageStyle = ["standard", "casual", "pidgin"].includes(result.language_style)
    ? result.language_style
    : "standard";
  const clarifyingQuestion = typeof result.clarifying_question === "string"
    ? result.clarifying_question.trim()
    : "";

  return {
    action: result.action,
    secondary_actions: secondaryActions,
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.7,
    needs_clarification: Boolean(result.needs_clarification && clarifyingQuestion),
    clarifying_question: clarifyingQuestion,
    conversation_mode: conversationMode,
    should_show_menu: Boolean(result.should_show_menu),
    language_style: languageStyle,
    details: {
      have_currency: normalizeCurrency(result.have_currency || ""),
      want_currency: normalizeCurrency(result.want_currency || ""),
      have_amount: cleanAmount(result.have_amount),
      want_amount: cleanAmount(result.want_amount),
      payment_currency: normalizeCurrency(result.payment_currency || ""),
      settings_target: ["listing", "payout"].includes(result.settings_target)
        ? result.settings_target
        : null,
      settings_operation: ["edit", "close", "share", "pause", "reopen", "delete"].includes(result.settings_operation)
        ? result.settings_operation
        : null,
      settings_item_number: cleanAmount(result.settings_item_number),
    },
    answer: typeof result.answer === "string" ? result.answer.trim() : "",
  };
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

    return normalizeInterpretation(result);
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
  normalizeInterpretation,
  ACTIONS,
};
