const assert = require("assert");
const { normalizeInterpretation } = require("../nlp/interpreter");
const {
  shouldPersistConversation,
  shouldAskClarifyingQuestion,
  shouldApplyContextualAnswer,
} = require("../nlp/conversation-policy");

function baseInterpretation(overrides = {}) {
  return {
    action: "greeting",
    secondary_actions: [],
    confidence: 0.9,
    needs_clarification: false,
    clarifying_question: null,
    conversation_mode: "social",
    should_show_menu: true,
    language_style: "casual",
    have_currency: null,
    have_amount: null,
    want_currency: null,
    want_amount: null,
    payment_currency: null,
    settings_target: null,
    settings_operation: null,
    settings_item_number: null,
    answer: "Good to see you.",
    ...overrides,
  };
}

const normalized = normalizeInterpretation(baseInterpretation({
  action: "find_offer",
  secondary_actions: ["find_offer", "view_payouts", "view_payouts", "menu"],
  confidence: 2,
  have_currency: "naira",
  have_amount: 50000,
  want_currency: "rwf",
  want_amount: 60000,
  language_style: "pidgin",
}));

assert.equal(normalized.action, "find_offer");
assert.deepEqual(normalized.secondary_actions, ["view_payouts", "menu"]);
assert.equal(normalized.confidence, 1);
assert.equal(normalized.details.have_currency, "NGN");
assert.equal(normalized.details.want_currency, "RWF");
assert.equal(normalized.details.have_amount, 50000);
assert.equal(normalized.details.want_amount, 60000);
assert.equal(normalized.language_style, "pidgin");
assert.equal(normalizeInterpretation(baseInterpretation({ action: "unsupported" })), null);

const unclear = normalizeInterpretation(baseInterpretation({
  action: "unknown",
  confidence: 0.3,
  needs_clarification: true,
  clarifying_question: "Which currency do you need?",
  conversation_mode: "informational",
}));

assert.equal(shouldAskClarifyingQuestion(unclear, null, {}), true);
assert.equal(shouldAskClarifyingQuestion({ ...unclear, confidence: 0.8 }, null, {}), false);
assert.equal(shouldAskClarifyingQuestion(unclear, { current_flow: "verification" }, {}), false);
assert.equal(shouldAskClarifyingQuestion(unclear, null, { media: { id: "receipt" } }), false);

assert.equal(shouldPersistConversation(null, {}), true);
assert.equal(shouldPersistConversation({ current_flow: "verification" }, {}), false);
assert.equal(shouldPersistConversation(null, { media: { id: "receipt" } }), false);
assert.equal(shouldPersistConversation(null, {
  interpretation: { action: "add_payout" },
}), false);
assert.equal(shouldPersistConversation(null, {
  interpretation: { action: "view_payouts" },
}), false);

const safe = normalizeInterpretation(baseInterpretation({
  action: "my_deals",
  answer: "Here is your transaction history.",
}));

assert.equal(shouldApplyContextualAnswer(safe, true, null, "History"), true);
assert.equal(shouldApplyContextualAnswer(safe, true, null, { type: "whatsapp_list" }), true);
assert.equal(shouldApplyContextualAnswer(safe, false, null, "History"), false);
assert.equal(shouldApplyContextualAnswer(safe, true, { current_flow: "deal_room" }, "History"), false);

const unsafe = normalizeInterpretation(baseInterpretation({
  action: "trade_action",
  answer: "Done.",
}));
assert.equal(shouldApplyContextualAnswer(unsafe, true, null, "History"), false);

console.log("Conversation intelligence tests passed.");
