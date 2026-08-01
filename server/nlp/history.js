const {
  appendConversationTurn,
  listConversationTurns,
  deleteConversationTurns,
} = require("../db/conversation");

// A bounded in-process cache keeps message routing fast. Safe conversation
// turns are also persisted briefly so a deployment or restart does not make
// Akara forget what "it", "that offer", or "same but 20k" means.

const MAX_TURNS = 34;
const MAX_USERS = 2000;
const MAX_TEXT_LENGTH = 1000;

const conversations = new Map(); // phone -> [{ role: "user"|"assistant", text, at }]
const hydrated = new Set();
const hydrating = new Map();

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
  const key = String(phone || "").trim();
  conversations.delete(key);
  hydrated.delete(key);
  hydrating.delete(key);
}

async function hydrateHistory(phone) {
  const key = String(phone || "").trim();
  if (!key || hydrated.has(key)) return recentHistory(key, MAX_TURNS);
  if (hydrating.has(key)) return hydrating.get(key);

  const task = (async () => {
    try {
      const stored = await listConversationTurns(key, MAX_TURNS);
      const local = recentHistory(key, MAX_TURNS);
      const newestStoredAt = stored.at(-1)?.at || 0;
      const newerLocal = local.filter((turn) => turn.at > newestStoredAt);
      const combined = [...stored, ...newerLocal].slice(-MAX_TURNS);
      if (combined.length) conversations.set(key, combined);
    } catch (error) {
      console.warn("Conversation memory hydration unavailable.");
    } finally {
      hydrated.add(key);
      hydrating.delete(key);
    }
    return recentHistory(key, MAX_TURNS);
  })();

  hydrating.set(key, task);
  return task;
}

async function recordAndPersistMessage(phone, role, text, metadata = {}) {
  recordMessage(phone, role, text);
  try {
    await appendConversationTurn(phone, role, text, metadata);
  } catch (error) {
    console.warn("Conversation memory persistence unavailable.");
  }
}

async function clearConversationMemory(phone) {
  clearHistory(phone);
  try {
    await deleteConversationTurns(phone);
  } catch (error) {
    console.warn("Conversation memory deletion unavailable.");
  }
}

module.exports = {
  recordMessage,
  recentHistory,
  historyTranscript,
  clearHistory,
  hydrateHistory,
  recordAndPersistMessage,
  clearConversationMemory,
};
