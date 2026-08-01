const SENSITIVE_MEMORY_FLOWS = new Set([
  "verification",
  "payment_profile",
  "deal_room",
  "settings",
  "kyc_upgrade",
]);

// Keep identity, payout, support, and trade records out of conversational memory.
// The underlying product records remain available through their protected tables.
const SENSITIVE_MEMORY_ACTIONS = new Set([
  "verify",
  "add_payout",
  "view_payouts",
  "view_profile",
  "my_deals",
  "get_support",
  "reserve_listing",
  "trade_action",
]);

const SAFE_CONTEXTUAL_ACTIONS = new Set([
  "browse_offers",
  "my_listings",
  "my_deals",
  "view_profile",
  "view_payouts",
  "view_trust_record",
  "get_support",
  "menu",
]);

const CLARIFICATION_ACTIONS = new Set(["unknown", "question", "flow_reply"]);

function shouldPersistConversation(session, incoming = {}) {
  if (incoming?.media?.id) return false;
  if (SENSITIVE_MEMORY_ACTIONS.has(incoming?.interpretation?.action || "")) return false;
  return !SENSITIVE_MEMORY_FLOWS.has(session?.current_flow || "");
}

function shouldAskClarifyingQuestion(interpreted, session, incoming = {}) {
  const confidence = Number(interpreted?.confidence);
  return !incoming?.media?.id
    && Boolean(interpreted?.needs_clarification)
    && Boolean(String(interpreted?.clarifying_question || "").trim())
    && Number.isFinite(confidence)
    && confidence < 0.55
    && CLARIFICATION_ACTIONS.has(interpreted?.action)
    && !SENSITIVE_MEMORY_FLOWS.has(session?.current_flow || "");
}

function shouldApplyContextualAnswer(interpreted, verified, session, reply) {
  const answer = String(interpreted?.answer || "").trim();
  const supportedReply = typeof reply === "string"
    || ["whatsapp_list", "whatsapp_buttons"].includes(reply?.type);
  return Boolean(verified)
    && SAFE_CONTEXTUAL_ACTIONS.has(interpreted?.action)
    && !SENSITIVE_MEMORY_FLOWS.has(session?.current_flow || "")
    && supportedReply
    && answer.length > 0
    && answer.length <= 90;
}

module.exports = {
  shouldPersistConversation,
  shouldAskClarifyingQuestion,
  shouldApplyContextualAnswer,
};
