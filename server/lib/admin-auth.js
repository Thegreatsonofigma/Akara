const crypto = require("node:crypto");
const { config } = require("../config");
const { supabaseRequest, filterValue } = require("./supabase");

const ALL_PERMISSIONS = [
  "dashboard.view",
  "reports.view",
  "users.view",
  "users.manage",
  "verifications.view",
  "verifications.review",
  "listings.view",
  "listings.manage",
  "trades.view",
  "trades.manage",
  "disputes.view",
  "disputes.resolve",
  "support.view",
  "support.manage",
  "compliance.view",
  "compliance.manage",
  "integrity.view",
  "admins.view",
  "admins.manage",
];

const ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS,
  operations: [
    "dashboard.view", "reports.view", "users.view", "users.manage",
    "verifications.view", "listings.view", "listings.manage",
    "trades.view", "trades.manage", "disputes.view", "disputes.resolve",
    "support.view", "support.manage", "integrity.view",
  ],
  compliance: [
    "dashboard.view", "reports.view", "users.view", "verifications.view",
    "verifications.review", "disputes.view", "disputes.resolve",
    "compliance.view", "compliance.manage", "integrity.view",
  ],
  support: [
    "dashboard.view", "users.view", "listings.view", "trades.view",
    "disputes.view", "support.view", "support.manage",
  ],
  analyst: [
    "dashboard.view", "reports.view", "users.view", "listings.view",
    "trades.view", "disputes.view", "integrity.view",
  ],
  custom: [],
};

function tokenHash(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function secureEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isMissingAdminSchema(error) {
  return /admin_(users|sessions|access_requests|audit_events)/i.test(String(error?.message || error))
    && /(does not exist|relation|schema cache|42P01|PGRST205)/i.test(String(error?.message || error));
}

function permissionsFor(admin) {
  if (!admin) return [];
  if (admin.role === "super_admin") return [...ALL_PERMISSIONS];
  return [...new Set([...(ROLE_PERMISSIONS[admin.role] || []), ...(admin.permissions || [])])];
}

function publicAdmin(admin, session = {}) {
  return {
    id: admin.id || null,
    code: admin.admin_code || "AKR-ADM-001",
    name: admin.name || "Akara Super Admin",
    email: admin.email || null,
    role: admin.role || "super_admin",
    status: admin.status || "active",
    permissions: permissionsFor(admin),
    loginAt: session.login_at || admin.last_login_at || new Date().toISOString(),
    sessionExpiresAt: session.expires_at || null,
    lastSeenAt: session.last_seen_at || admin.last_seen_at || null,
    bootstrap: Boolean(admin.bootstrap),
  };
}

function bootstrapAdmin() {
  return {
    id: null,
    admin_code: process.env.AKARA_SUPER_ADMIN_ID || "AKR-ADM-001",
    name: process.env.AKARA_SUPER_ADMIN_NAME || "Steven",
    email: process.env.AKARA_SUPER_ADMIN_EMAIL || null,
    role: "super_admin",
    status: "active",
    permissions: ALL_PERMISSIONS,
    bootstrap: true,
  };
}

async function adminById(id) {
  const rows = await supabaseRequest(
    `admin_users?id=eq.${filterValue(id)}&select=*&limit=1`
  );
  return rows[0] || null;
}

async function authenticateAdminRequest(req) {
  const token = String(req.headers["x-akara-admin-token"] || "").trim();
  if (!token) return null;

  if (secureEqual(token, config.adminToken)) {
    const admin = bootstrapAdmin();
    return { admin, public: publicAdmin(admin), tokenType: "bootstrap" };
  }

  try {
    const now = new Date().toISOString();
    const sessions = await supabaseRequest(
      `admin_sessions?token_hash=eq.${filterValue(tokenHash(token))}&revoked_at=is.null&expires_at=gt.${filterValue(now)}&select=*&limit=1`
    );
    const session = sessions[0];
    if (!session) return null;
    const admin = await adminById(session.admin_user_id);
    if (!admin || admin.status !== "active") return null;

    const seenAt = new Date().toISOString();
    await Promise.allSettled([
      supabaseRequest(`admin_sessions?id=eq.${filterValue(session.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ last_seen_at: seenAt }),
      }),
      supabaseRequest(`admin_users?id=eq.${filterValue(admin.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ last_seen_at: seenAt }),
      }),
    ]);
    return {
      admin,
      session,
      public: publicAdmin(admin, { ...session, last_seen_at: seenAt }),
      tokenType: "session",
    };
  } catch (error) {
    if (isMissingAdminSchema(error)) return null;
    throw error;
  }
}

async function ensureBootstrapAdmin() {
  const bootstrap = bootstrapAdmin();
  try {
    const existing = await supabaseRequest(
      `admin_users?admin_code=eq.${filterValue(bootstrap.admin_code)}&select=*&limit=1`
    );
    if (existing[0]) return existing[0];
    const rows = await supabaseRequest("admin_users", {
      method: "POST",
      body: JSON.stringify({
        admin_code: bootstrap.admin_code,
        name: bootstrap.name,
        email: bootstrap.email,
        role: "super_admin",
        status: "active",
        permissions: ALL_PERMISSIONS,
        activated_at: new Date().toISOString(),
      }),
    });
    return rows[0] || bootstrap;
  } catch (error) {
    if (isMissingAdminSchema(error)) return bootstrap;
    throw error;
  }
}

async function issueSession(admin, req) {
  if (!admin.id) {
    return {
      token: config.adminToken,
      admin: publicAdmin(admin),
      migrationRequired: true,
    };
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (12 * 60 * 60 * 1000)).toISOString();
  const rows = await supabaseRequest("admin_sessions", {
    method: "POST",
    body: JSON.stringify({
      admin_user_id: admin.id,
      token_hash: tokenHash(token),
      login_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      expires_at: expiresAt,
      metadata: {
        user_agent: String(req.headers["user-agent"] || "").slice(0, 240),
      },
    }),
  });
  await supabaseRequest(`admin_users?id=eq.${filterValue(admin.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "active",
      activated_at: admin.activated_at || now.toISOString(),
      last_login_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    }),
  });
  return {
    token,
    admin: publicAdmin(admin, rows[0]),
    migrationRequired: false,
  };
}

async function loginAdmin(accessToken, req) {
  const token = String(accessToken || "").trim();
  if (!token) return null;

  if (secureEqual(token, config.adminToken)) {
    return issueSession(await ensureBootstrapAdmin(), req);
  }

  try {
    const rows = await supabaseRequest(
      `admin_users?access_token_hash=eq.${filterValue(tokenHash(token))}&status=in.(invited,active)&select=*&limit=1`
    );
    if (!rows[0]) return null;
    return issueSession(rows[0], req);
  } catch (error) {
    if (isMissingAdminSchema(error)) return null;
    throw error;
  }
}

async function logoutAdmin(actor) {
  if (!actor?.session?.id) return;
  await supabaseRequest(`admin_sessions?id=eq.${filterValue(actor.session.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
}

function hasPermission(actor, permission) {
  return Boolean(actor && permissionsFor(actor.admin).includes(permission));
}

async function recordAdminAudit(actor, eventName, entityType, entityId, payload = {}) {
  if (!actor?.admin?.id) return;
  await supabaseRequest("admin_audit_events", {
    method: "POST",
    body: JSON.stringify({
      admin_user_id: actor.admin.id,
      event_name: eventName,
      entity_type: entityType,
      entity_id: entityId ? String(entityId) : null,
      event_payload: payload,
    }),
  });
}

module.exports = {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  authenticateAdminRequest,
  hasPermission,
  isMissingAdminSchema,
  loginAdmin,
  logoutAdmin,
  permissionsFor,
  publicAdmin,
  recordAdminAudit,
  tokenHash,
};
