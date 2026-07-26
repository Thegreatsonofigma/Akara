const { supabaseRequest, filterValue } = require("../lib/supabase");

async function getSession(whatsappPhone) {
  const rows = await supabaseRequest(`message_sessions?whatsapp_phone=eq.${filterValue(whatsappPhone)}&limit=1`);
  return rows[0] || null;
}

async function upsertSession(user, whatsappPhone, currentFlow, currentStep, context = {}) {
  const rows = await supabaseRequest("message_sessions?on_conflict=whatsapp_phone", {
    method: "POST",
    headers: {
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({
      user_id: user.id,
      whatsapp_phone: whatsappPhone,
      current_flow: currentFlow,
      current_step: currentStep,
      context_json: context,
      last_message_at: new Date().toISOString(),
    }),
  });

  return rows[0];
}

async function clearSession(user, whatsappPhone) {
  return upsertSession(user, whatsappPhone, null, null, {});
}

function retryableIncoming(incoming = {}) {
  return {
    text: String(incoming.text || ""),
    type: incoming.type || "text",
    media: incoming.media || null,
    quotedText: incoming.quotedText || "",
  };
}

function isRetryCommand(text) {
  return /^(retry|try again|retry_last_message)$/i.test(String(text || "").trim());
}

async function rememberFailedMessage(user, whatsappPhone, incoming = {}) {
  const session = await getSession(whatsappPhone);
  if (isRetryCommand(incoming.text)) {
    return session;
  }
  const context = session?.context_json || {};
  return upsertSession(
    user,
    whatsappPhone,
    session?.current_flow || null,
    session?.current_step || null,
    {
      ...context,
      pending_retry: {
        incoming: retryableIncoming(incoming),
        failed_at: new Date().toISOString(),
      },
    }
  );
}

async function clearFailedMessage(user, whatsappPhone) {
  const session = await getSession(whatsappPhone);
  if (!session?.context_json?.pending_retry) return session;
  const context = { ...session.context_json };
  delete context.pending_retry;
  return upsertSession(
    user,
    whatsappPhone,
    session.current_flow || null,
    session.current_step || null,
    context
  );
}

module.exports = {
  getSession,
  upsertSession,
  clearSession,
  rememberFailedMessage,
  clearFailedMessage,
};
