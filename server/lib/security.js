const crypto = require("node:crypto");
const { config, getPublicUrl } = require("../config");
const { supabaseRequest, filterValue } = require("./supabase");
const { sendWhatsAppText } = require("./whatsapp");
const { title, caption, action, labeled } = require("./format");
const { getUserById } = require("../db/users");
const { upsertSession } = require("../db/sessions");
const { paymentEditMenuPrompt } = require("../flows/payment-profile");

const TOKEN_BYTES = 24;
const PASSCODE_MIN = 4;
const PASSCODE_MAX = 6;
const MAX_ATTEMPTS = 5;
const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function securityEnabled() {
  return process.env.AKARA_SECURITY_ENABLED !== "false";
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

function hashPasscode(passcode) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(passcode), salt, 32).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPasscode(passcode, storedHash = "") {
  const [scheme, salt, expected] = String(storedHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;

  const actual = crypto.scryptSync(String(passcode), salt, 32);
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actual, expectedBuffer);
}

function validPasscode(passcode) {
  const value = String(passcode || "").trim();
  const pattern = new RegExp(`^\\d{${PASSCODE_MIN},${PASSCODE_MAX}}$`);
  return pattern.test(value);
}

function challengeUrl(type, token) {
  const base = getPublicUrl() || `http://127.0.0.1:${process.env.PORT || 3000}`;
  return `${base.replace(/\/$/, "")}/secure/${type}/${encodeURIComponent(token)}`;
}

async function createChallenge(user, options = {}) {
  const token = createToken();
  const expiresAt = new Date(Date.now() + (options.ttlMs || CHALLENGE_TTL_MS)).toISOString();
  const rows = await supabaseRequest("security_challenges", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.id,
      challenge_token_hash: hashToken(token),
      purpose: options.purpose,
      action_label: options.actionLabel,
      return_flow: options.returnFlow || null,
      return_step: options.returnStep || null,
      return_context: options.returnContext || {},
      status: "pending",
      attempt_count: 0,
      expires_at: expiresAt,
    }),
  });

  return { token, challenge: rows[0] };
}

function setupPrompt(url, actionLabel) {
  return [
    title("Security setup"),
    caption("Create your Akara code on a secure page. The code will not appear in WhatsApp."),
    "",
    labeled("Action", actionLabel),
    "",
    url,
    "",
    caption("This link expires in 10 minutes."),
  ].join("\n");
}

function authorizationPrompt(url, actionLabel) {
  return [
    title("Security check"),
    caption("Approve this action with your Akara code."),
    "",
    labeled("Action", actionLabel),
    "",
    url,
    "",
    caption("This link expires in 10 minutes."),
  ].join("\n");
}

function securityFlowPrompt(type, token, actionLabel) {
  if (!config.akaraSecurityFlowId) return null;

  const setup = type === "setup";
  return {
    type: "whatsapp_flow",
    fallbackText: setup
      ? setupPrompt(challengeUrl(type, token), actionLabel)
      : authorizationPrompt(challengeUrl(type, token), actionLabel),
    flow: {
      flowId: config.akaraSecurityFlowId,
      flowToken: token,
      screen: setup ? "SETUP_PIN" : "AUTHORIZE_PIN",
      headerText: setup ? "Setup Akara code" : "Authorize action",
      body: setup
        ? "Set your Akara code securely inside WhatsApp. It protects payout changes and other sensitive actions."
        : `Approve this action with your Akara code: ${actionLabel}`,
      button: setup ? "Set code" : "Authorize",
      footerText: "This expires in 10 minutes.",
      data: {
        mode: setup ? "setup" : "authorize",
        challenge_token: token,
        action_label: actionLabel,
      },
    },
  };
}

async function requestSecurityAuthorization(user, options = {}) {
  if (!securityEnabled()) return null;

  const hasPasscode = Boolean(user.security_passcode_hash);
  const purpose = hasPasscode ? options.purpose : "setup_passcode";
  const type = hasPasscode ? "authorize" : "setup";
  const { token } = await createChallenge(user, {
    purpose,
    actionLabel: options.actionLabel || "Sensitive account action",
    returnFlow: options.returnFlow,
    returnStep: options.returnStep,
    returnContext: options.returnContext,
  });

  const actionLabel = options.actionLabel || "Sensitive account action";
  const flowPrompt = securityFlowPrompt(type, token, actionLabel);
  if (flowPrompt) return flowPrompt;

  const url = challengeUrl(type, token);
  return hasPasscode
    ? authorizationPrompt(url, actionLabel)
    : setupPrompt(url, actionLabel);
}

async function getPendingChallenge(token) {
  const rows = await supabaseRequest(
    `security_challenges?challenge_token_hash=eq.${filterValue(hashToken(token))}&limit=1`
  );
  const challenge = rows[0] || null;
  if (!challenge) return { challenge: null, user: null, state: "missing" };

  if (challenge.status !== "pending") {
    return { challenge, user: null, state: challenge.status };
  }

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await updateChallenge(challenge.id, { status: "expired" });
    return { challenge: { ...challenge, status: "expired" }, user: null, state: "expired" };
  }

  const user = await getUserById(challenge.user_id);
  if (!user) return { challenge, user: null, state: "missing_user" };
  return { challenge, user, state: "pending" };
}

async function updateChallenge(challengeId, patch) {
  const rows = await supabaseRequest(`security_challenges?id=eq.${filterValue(challengeId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return rows[0] || null;
}

async function updateUserPasscode(userId, passcode) {
  const rows = await supabaseRequest(`users?id=eq.${filterValue(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      security_passcode_hash: hashPasscode(passcode),
      security_passcode_set_at: new Date().toISOString(),
    }),
  });
  return rows[0] || null;
}

function deletePayoutConfirmation() {
  return [
    title("Delete payout detail?"),
    "",
    "Reply yes to delete it, or no to keep it.",
  ].join("\n");
}

function deleteAllPayoutsConfirmation(context = {}) {
  const count = Number(context.bulk_count || 0);
  return [
    title("Delete all payout details?"),
    "",
    `This will remove ${count} saved payout detail${count === 1 ? "" : "s"}.`,
    "You will need to add payout details again before opening trades for those currencies.",
    "",
    `${action("confirm")} to delete them`,
    `${action("keep")} to leave them saved`,
  ].join("\n");
}

async function resumeChallengeAction(user, challenge) {
  const context = challenge.return_context || {};

  if (challenge.return_flow === "payment_profile" && challenge.return_step === "payment_edit_menu") {
    await upsertSession(user, user.whatsapp_phone, "payment_profile", "payment_edit_menu", context);
    await sendWhatsAppText(user.whatsapp_phone, [
      title("Security approved"),
      "",
      paymentEditMenuPrompt(context),
    ].join("\n\n"));
    return;
  }

  if (challenge.return_flow === "settings" && challenge.return_step === "confirm_delete_payout") {
    await upsertSession(user, user.whatsapp_phone, "settings", "confirm_delete_payout", context);
    await sendWhatsAppText(user.whatsapp_phone, [
      title("Security approved"),
      "",
      deletePayoutConfirmation(),
    ].join("\n\n"));
    return;
  }

  if (challenge.return_flow === "settings" && challenge.return_step === "confirm_bulk_action") {
    await upsertSession(user, user.whatsapp_phone, "settings", "confirm_bulk_action", context);
    await sendWhatsAppText(user.whatsapp_phone, [
      title("Security approved"),
      "",
      deleteAllPayoutsConfirmation(context),
    ].join("\n\n"));
    return;
  }

  await sendWhatsAppText(user.whatsapp_phone, [
    title("Security approved"),
    "",
    "You can return to WhatsApp and continue.",
  ].join("\n"));
}

function passcodeFromFlowResponse(response = {}) {
  return String(
    response.passcode ||
    response.pin ||
    response.code ||
    response.transaction_pin ||
    response.akara_code ||
    ""
  ).trim();
}

function confirmFromFlowResponse(response = {}) {
  return String(
    response.confirm ||
    response.confirm_passcode ||
    response.confirm_pin ||
    response.confirm_code ||
    response.confirm_transaction_pin ||
    ""
  ).trim();
}

function tokenFromFlowIncoming(incoming = {}) {
  const response = incoming.flowResponse || {};
  return String(
    response.flow_token ||
    response.challenge_token ||
    response.security_token ||
    response.token ||
    incoming.flowToken ||
    ""
  ).trim();
}

function isSecurityFlowResponse(incoming = {}) {
  const response = incoming.flowResponse || {};
  return response.mode === "setup" ||
    response.mode === "authorize" ||
    Boolean(response.challenge_token) ||
    Boolean(response.security_token) ||
    Boolean(response.action_label && (response.passcode || response.confirm));
}

async function handleSecurityFlowResponse(incoming, currentUser) {
  if (!incoming?.flowResponse) return undefined;
  if (!isSecurityFlowResponse(incoming)) return undefined;

  const token = tokenFromFlowIncoming(incoming);
  if (!token) {
    return [
      title("Security check"),
      caption("Akara could not read that authorization session."),
      "",
      "Please try the protected action again.",
    ].join("\n");
  }

  const { challenge, user, state } = await getPendingChallenge(token);
  if (state !== "pending") {
    return [
      title("Security check expired"),
      caption(state === "expired"
        ? "That authorization window has expired."
        : "That authorization has already been used."),
      "",
      "Please try the protected action again.",
    ].join("\n");
  }

  if (currentUser?.id && user?.id && currentUser.id !== user.id) {
    return [
      title("Security check blocked"),
      caption("That authorization belongs to another Akara profile."),
      "",
      "Please start the action from your own chat.",
    ].join("\n");
  }

  const setup = challenge.purpose === "setup_passcode" || incoming.flowResponse.mode === "setup";
  const passcode = passcodeFromFlowResponse(incoming.flowResponse);
  const confirm = confirmFromFlowResponse(incoming.flowResponse);

  if (!validPasscode(passcode) || (setup && passcode !== confirm)) {
    return [
      title(setup ? "Code not saved" : "Security check"),
      caption(setup
        ? "Use matching 4 to 6 digit codes."
        : "Enter your 4 to 6 digit Akara code."),
      "",
      "Please try the action again.",
    ].join("\n");
  }

  if (setup) {
    await updateUserPasscode(user.id, passcode);
    const updated = await updateChallenge(challenge.id, {
      status: "approved",
      approved_at: new Date().toISOString(),
    });
    await resumeChallengeAction({ ...user, security_passcode_hash: true }, updated || challenge);
    return null;
  }

  if (!verifyPasscode(passcode, user.security_passcode_hash)) {
    const attempts = Number(challenge.attempt_count || 0) + 1;
    await updateChallenge(challenge.id, {
      attempt_count: attempts,
      ...(attempts >= MAX_ATTEMPTS ? { status: "failed" } : {}),
    });

    return [
      title(attempts >= MAX_ATTEMPTS ? "Security check locked" : "Wrong code"),
      caption(attempts >= MAX_ATTEMPTS
        ? "Too many failed attempts. Start the action again later."
        : "That code did not match your Akara code."),
      "",
      attempts >= MAX_ATTEMPTS ? "" : "Please try the action again.",
    ].filter(Boolean).join("\n");
  }

  const updated = await updateChallenge(challenge.id, {
    status: "approved",
    approved_at: new Date().toISOString(),
  });
  await resumeChallengeAction(user, updated || challenge);
  return null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlPage({ heading, eyebrow = "Akara security", body = "", form = "", error = "", success = "" }) {
  const statusBlock = error
    ? `<div class="notice error">${escapeHtml(error)}</div>`
    : success
      ? `<div class="notice success">${escapeHtml(success)}</div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(heading)} | Akara</title>
  <style>
    :root { color-scheme: dark; --green: #8bff10; --line: #22262b; --text: #ffffff; --muted: #a9afb7; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #050505; color: var(--text); font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { width: min(92vw, 440px); border: 1px solid var(--line); border-radius: 24px; background: #0c0e10; padding: 28px; box-shadow: 0 20px 80px rgba(0,0,0,.45); }
    .mark { width: 48px; height: 48px; border: 1px solid #2b2f34; border-radius: 999px; display: grid; place-items: center; margin-bottom: 24px; font-weight: 900; }
    .eyebrow { color: var(--muted); text-transform: uppercase; letter-spacing: .16em; font-size: 11px; margin: 0 0 8px; }
    h1 { font-size: 28px; line-height: 1.05; margin: 0 0 12px; letter-spacing: -.01em; }
    p { color: var(--muted); margin: 0 0 20px; }
    label { display: block; margin: 18px 0 8px; color: #d8dce2; font-weight: 700; }
    input { width: 100%; appearance: none; border: 1px solid #2a3037; border-radius: 14px; background: #090a0b; color: #fff; font-size: 24px; letter-spacing: .28em; padding: 15px 16px; text-align: center; }
    input:focus { outline: 2px solid rgba(139,255,16,.5); border-color: var(--green); }
    button { width: 100%; margin-top: 20px; border: 0; border-radius: 14px; background: var(--green); color: #050505; font-weight: 900; font-size: 16px; padding: 16px 18px; cursor: pointer; }
    .notice { border-radius: 14px; padding: 12px 14px; margin: 18px 0 0; }
    .error { background: rgba(255,77,77,.12); color: #ffb6b6; border: 1px solid rgba(255,77,77,.25); }
    .success { background: rgba(139,255,16,.12); color: #dfffc6; border: 1px solid rgba(139,255,16,.25); }
    .hint { font-size: 13px; color: #7f8790; margin-top: 14px; }
  </style>
</head>
<body>
  <main>
    <div class="mark">A</div>
    <p class="eyebrow">${escapeHtml(eyebrow)}</p>
    <h1>${escapeHtml(heading)}</h1>
    ${body ? `<p>${escapeHtml(body)}</p>` : ""}
    ${statusBlock}
    ${form}
  </main>
</body>
</html>`;
}

function formHtml({ mode }) {
  const setup = mode === "setup";
  return `<form method="post">
  <label for="passcode">${setup ? "Create code" : "Akara code"}</label>
  <input id="passcode" name="passcode" inputmode="numeric" autocomplete="one-time-code" minlength="${PASSCODE_MIN}" maxlength="${PASSCODE_MAX}" required>
  ${setup ? `<label for="confirm">Confirm code</label>
  <input id="confirm" name="confirm" inputmode="numeric" autocomplete="one-time-code" minlength="${PASSCODE_MIN}" maxlength="${PASSCODE_MAX}" required>` : ""}
  <button type="submit">${setup ? "Save code" : "Approve action"}</button>
  <p class="hint">Use ${PASSCODE_MIN} to ${PASSCODE_MAX} digits. Do not share this code with anyone.</p>
</form>`;
}

async function readFormBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
}

function writeHtml(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

async function handleSecurityRoute(req, res, url) {
  const match = url.pathname.match(/^\/secure\/(setup|authorize)\/([A-Za-z0-9_-]+)$/);
  if (!match) return false;

  const [, mode, token] = match;
  const { challenge, user, state } = await getPendingChallenge(token);
  if (state !== "pending") {
    writeHtml(res, 410, htmlPage({
      heading: "Security link unavailable",
      body: state === "expired"
        ? "That link has expired. Return to WhatsApp and request the action again."
        : "That link has already been used or is no longer available.",
    }));
    return true;
  }

  const heading = mode === "setup" ? "Create your Akara code" : "Approve this action";
  const body = mode === "setup"
    ? "This code protects payout edits and other sensitive actions."
    : challenge.action_label;

  if (req.method === "GET") {
    writeHtml(res, 200, htmlPage({ heading, body, form: formHtml({ mode }) }));
    return true;
  }

  if (req.method !== "POST") {
    writeHtml(res, 405, htmlPage({ heading: "Method not allowed" }));
    return true;
  }

  const form = await readFormBody(req);
  const passcode = String(form.get("passcode") || "").trim();
  const confirm = String(form.get("confirm") || "").trim();

  if (!validPasscode(passcode) || (mode === "setup" && passcode !== confirm)) {
    writeHtml(res, 400, htmlPage({
      heading,
      body,
      error: mode === "setup"
        ? "Use matching 4 to 6 digit codes."
        : "Enter your 4 to 6 digit Akara code.",
      form: formHtml({ mode }),
    }));
    return true;
  }

  if (mode === "setup") {
    await updateUserPasscode(user.id, passcode);
    const updated = await updateChallenge(challenge.id, {
      status: "approved",
      approved_at: new Date().toISOString(),
    });
    await resumeChallengeAction({ ...user, security_passcode_hash: true }, updated || challenge);
    writeHtml(res, 200, htmlPage({
      heading: "Security code saved",
      success: "You can return to WhatsApp. Akara has resumed your action.",
    }));
    return true;
  }

  if (!verifyPasscode(passcode, user.security_passcode_hash)) {
    const attempts = Number(challenge.attempt_count || 0) + 1;
    await updateChallenge(challenge.id, {
      attempt_count: attempts,
      ...(attempts >= MAX_ATTEMPTS ? { status: "failed" } : {}),
    });

    writeHtml(res, attempts >= MAX_ATTEMPTS ? 423 : 401, htmlPage({
      heading,
      body,
      error: attempts >= MAX_ATTEMPTS
        ? "Too many failed attempts. Return to WhatsApp and request a new security check."
        : "That code is not correct. Try again.",
      form: attempts >= MAX_ATTEMPTS ? "" : formHtml({ mode }),
    }));
    return true;
  }

  const updated = await updateChallenge(challenge.id, {
    status: "approved",
    approved_at: new Date().toISOString(),
  });
  await resumeChallengeAction(user, updated || challenge);
  writeHtml(res, 200, htmlPage({
    heading: "Action approved",
    success: "You can return to WhatsApp. Akara has resumed your action.",
  }));
  return true;
}

module.exports = {
  requestSecurityAuthorization,
  handleSecurityRoute,
  handleSecurityFlowResponse,
  hashPasscode,
  verifyPasscode,
  securityEnabled,
};
