const crypto = require("node:crypto");
const { config } = require("../config");
const { supabaseRequest, filterValue } = require("../lib/supabase");
const { opaqueSubject } = require("../lib/integrity-crypto");
const {
  calculateReputation,
  getLatestUserReputation,
  recordIntegrityEvent,
} = require("./integrity");

const CREDENTIAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function credentialCode() {
  return `AKR-TRUST-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function credentialSubject(userId) {
  if (Buffer.byteLength(config.integrityHmacSecret || "", "utf8") >= 32) {
    return opaqueSubject(config.integrityHmacSecret, "user", userId);
  }
  return crypto.createHash("sha256").update(`akara-user:${userId}`).digest("hex");
}

function trustClaims(reputation) {
  return {
    completed_trades: Number(reputation.completed_trades || 0),
    completion_rate: Number(reputation.completion_rate || 0),
    unresolved_disputes: Number(reputation.open_disputes || 0),
    reputation_band: reputation.reputation_band || "new",
    integrity_status: reputation.integrity_status || "updating",
  };
}

async function issueReputationCredential(userId, options = {}) {
  const active = await supabaseRequest(
    [
      "reputation_credentials?",
      `user_id=eq.${filterValue(userId)}`,
      "&status=eq.active",
      `&expires_at=gt.${filterValue(new Date().toISOString())}`,
      "&order=created_at.desc",
      "&limit=1",
    ].join("")
  ).catch(() => []);
  if (active[0] && !options.refresh) return active[0];

  const snapshot = await getLatestUserReputation(userId);
  const reputation = snapshot || await calculateReputation(userId);
  const claims = trustClaims(reputation);
  const expiresAt = new Date(Date.now() + CREDENTIAL_TTL_MS).toISOString();
  let rows;
  try {
    rows = await supabaseRequest("reputation_credentials", {
      method: "POST",
      body: JSON.stringify({
        credential_code: credentialCode(),
        user_id: userId,
        reputation_snapshot_id: snapshot?.id || null,
        subject_ref: credentialSubject(userId),
        reputation_band: claims.reputation_band,
        claims,
        status: "active",
        expires_at: expiresAt,
      }),
    });
  } catch (error) {
    if (/(reputation_credentials|does not exist|relation|42P01)/i.test(error.message)) {
      return null;
    }
    throw error;
  }
  const credential = rows[0] || null;
  if (!credential) return null;

  const record = await recordIntegrityEvent({
    eventKey: `credential:${credential.id}:issued:v1`,
    recordType: "reputation_credential",
    entityType: "credential",
    entityId: credential.id,
    payload: {
      schema: "akara.reputation-credential.v1",
      subject: credential.subject_ref,
      credential_code_digest: crypto
        .createHash("sha256")
        .update(credential.credential_code)
        .digest("hex"),
      claims,
      issued_at: credential.created_at,
      expires_at: expiresAt,
    },
  });
  if (record) {
    await supabaseRequest(`reputation_credentials?id=eq.${filterValue(credential.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        commitment_hash: record.commitment_hash,
        integrity_record_id: record.id,
      }),
    });
    credential.commitment_hash = record.commitment_hash;
    credential.integrity_record_id = record.id;
  }
  return credential;
}

async function getReputationCredential(code) {
  const rows = await supabaseRequest(
    `reputation_credentials?credential_code=eq.${filterValue(String(code).toUpperCase())}&limit=1`
  );
  return rows[0] || null;
}

function credentialShareUrl(code) {
  const phone = String(config.akaraWhatsappNumber || "").replace(/[^\d]/g, "");
  if (!phone) return "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(`check trust ${code}`)}`;
}

module.exports = {
  issueReputationCredential,
  getReputationCredential,
  credentialShareUrl,
  trustClaims,
};
