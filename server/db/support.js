const crypto = require("node:crypto");
const { supabaseRequest, filterValue } = require("../lib/supabase");

const SUPPORT_EMAIL = "support@tryakara.com";
const SUPPORT_PAGE = "https://www.tryakara.com/support";

function supportReference() {
  return `AKR-SUP-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function cleanSupportMessage(value) {
  return String(value || "")
    .replace(/[—–]/g, ",")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1200);
}

async function createSupportRequest(user, message, metadata = {}) {
  const description = cleanSupportMessage(message);
  if (!description) return null;

  const reference = supportReference();
  const rows = await supabaseRequest("audit_events", {
    method: "POST",
    body: JSON.stringify({
      actor_user_id: user?.id || null,
      actor_type: user?.id ? "user" : "system",
      entity_type: "support_request",
      event_name: "support_request_opened",
      event_payload: {
        reference,
        status: "open",
        category: metadata.category || "general",
        description,
        whatsapp_phone: user?.whatsapp_phone || null,
        source: metadata.source || "whatsapp",
        deal_code: metadata.dealCode || null,
      },
    }),
  });

  return rows[0] ? { ...rows[0], reference } : null;
}

async function listSupportRequests(limit = 100) {
  const rows = await supabaseRequest(
    [
      "audit_events?select=id,actor_user_id,event_name,event_payload,created_at",
      "entity_type=eq.support_request",
      "order=created_at.desc",
      `limit=${Math.max(1, Math.min(200, Number(limit) || 100))}`,
    ].join("&")
  );

  const userIds = [...new Set(rows.map((row) => row.actor_user_id).filter(Boolean))];
  const users = userIds.length
    ? await supabaseRequest(
        `users?select=id,whatsapp_phone,display_name,legal_name&id=in.(${userIds.map(filterValue).join(",")})`
      )
    : [];
  const usersById = Object.fromEntries(users.map((user) => [user.id, user]));

  return rows.map((row) => ({
    id: row.id,
    user_id: row.actor_user_id,
    created_at: row.created_at,
    ...(row.event_payload || {}),
    user: usersById[row.actor_user_id] || null,
  }));
}

async function updateSupportRequest(requestId, patch = {}) {
  const rows = await supabaseRequest(
    `audit_events?id=eq.${filterValue(requestId)}&entity_type=eq.support_request&limit=1`
  );
  const existing = rows[0];
  if (!existing) return null;

  const current = existing.event_payload || {};
  const status = ["open", "in_review", "resolved"].includes(patch.status)
    ? patch.status
    : current.status || "open";
  const eventPayload = {
    ...current,
    status,
    admin_note: cleanSupportMessage(patch.admin_note || current.admin_note || ""),
    updated_at: new Date().toISOString(),
    ...(status === "resolved" ? { resolved_at: new Date().toISOString() } : {}),
  };

  const updated = await supabaseRequest(
    `audit_events?id=eq.${filterValue(requestId)}&entity_type=eq.support_request`,
    {
      method: "PATCH",
      body: JSON.stringify({
        event_name: status === "resolved" ? "support_request_resolved" : "support_request_updated",
        event_payload: eventPayload,
      }),
    }
  );

  return updated[0] ? {
    id: updated[0].id,
    user_id: updated[0].actor_user_id,
    created_at: updated[0].created_at,
    ...eventPayload,
  } : null;
}

module.exports = {
  SUPPORT_EMAIL,
  SUPPORT_PAGE,
  createSupportRequest,
  listSupportRequests,
  updateSupportRequest,
};
