// Rolling per-user conversation memory. The interpreter reads this so the
// model sees what "it", "that offer", or "same but 20k" refer to. Kept in
// process memory: losing it on restart only costs conversational context,
// never money or state, and the session table still holds the flow state.

const MAX_TURNS = 34;
const MAX_USERS = 2000;
const MAX_TEXT_LENGTH = 1000;

const conversations = new Map(); // phone -> [{ role: "user"|"assistant", text, at }]

function recordMessage(phone, role, text) {
  const key = String(phone || "").trim();
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!key || !value) return;

  // Re-inserting keeps the Map ordered by recency so eviction drops the
  // longest-idle conversation, not an active one.
  const turns = conversations.get(key) || [];
  conversations.delete(key);
  turns.push({ role, text: value.slice(0, MAX_TEXT_LENGTH), at: Date.now() });
  if (turns.length > MAX_TURNS) turns.splice(0, turns.length - MAX_TURNS);
  conversations.set(key, turns);

  if (conversations.size > MAX_USERS) {
    const oldest = conversations.keys().next().value;
    conversations.delete(oldest);
  }
}

function recentHistory(phone, limit = 20) {
  const turns = conversations.get(String(phone || "").trim()) || [];
  return turns.slice(-limit);
}

// Compact transcript for the interpreter prompt. Long Akara replies (menus,
// offer lists) are trimmed harder than user messages: the model mostly needs
// to know what was asked and offered, not every formatted line.
function historyTranscript(phone, limit = 20) {
  return recentHistory(phone, limit)
    .map((turn) => {
      const maxLength = turn.role === "user" ? 300 : 400;
      const text = turn.text.length > maxLength ? `${turn.text.slice(0, maxLength)}…` : turn.text;
      return `${turn.role === "user" ? "User" : "Akara"}: ${text}`;
    })
    .join("\n");
}

function clearHistory(phone) {
  conversations.delete(String(phone || "").trim());
}

module.exports = {
  recordMessage,
  recentHistory,
  historyTranscript,
  clearHistory,
};
