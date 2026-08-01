const { supabaseRequest, filterValue } = require("../lib/supabase");

const MAX_TEXT_LENGTH = 1000;
const MAX_TURNS = 34;

function cleanPhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function cleanText(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
}

async function appendConversationTurn(phone, role, text, metadata = {}) {
  const whatsappPhone = cleanPhone(phone);
  const content = cleanText(text);
  if (!whatsappPhone || !content || !["user", "assistant"].includes(role)) return null;

  const rows = await supabaseRequest("conversation_turns", {
    method: "POST",
    body: JSON.stringify({
      whatsapp_phone: whatsappPhone,
      role,
      content,
      intent: typeof metadata.intent === "string" ? metadata.intent.slice(0, 64) : null,
      metadata: metadata && typeof metadata === "object" ? metadata : {},
    }),
  });
  return rows?.[0] || null;
}

async function listConversationTurns(phone, limit = MAX_TURNS) {
  const whatsappPhone = cleanPhone(phone);
  if (!whatsappPhone) return [];
  const safeLimit = Math.max(1, Math.min(MAX_TURNS, Number(limit) || MAX_TURNS));
  const now = new Date().toISOString();
  const rows = await supabaseRequest(
    `conversation_turns?whatsapp_phone=eq.${filterValue(whatsappPhone)}&expires_at=gt.${filterValue(now)}&order=created_at.desc&limit=${safeLimit}`
  );
  return (rows || []).reverse().map((row) => ({
    role: row.role,
    text: cleanText(row.content),
    at: Date.parse(row.created_at) || Date.now(),
  }));
}

async function deleteConversationTurns(phone) {
  const whatsappPhone = cleanPhone(phone);
  if (!whatsappPhone) return [];
  return supabaseRequest(
    `conversation_turns?whatsapp_phone=eq.${filterValue(whatsappPhone)}`,
    { method: "DELETE" }
  );
}

module.exports = {
  appendConversationTurn,
  listConversationTurns,
  deleteConversationTurns,
};
