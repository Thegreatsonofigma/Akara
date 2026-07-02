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

module.exports = {
  getSession,
  upsertSession,
  clearSession,
};
