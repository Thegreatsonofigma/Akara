const { title, caption, action, labeled } = require("../lib/format");
const { upsertSession, clearSession } = require("../db/sessions");
const {
  SUPPORT_EMAIL,
  SUPPORT_PAGE,
  createSupportRequest,
} = require("../db/support");

function whatsappButtonsReply(body, buttons, fallbackText = body) {
  return {
    type: "whatsapp_buttons",
    body,
    buttons,
    fallbackText,
  };
}

function supportOptionsReply() {
  const body = [
    title("Akara support"),
    "",
    "Get help with verification, payouts, listings, receipts, or account issues.",
    "",
    labeled("Email", SUPPORT_EMAIL),
    labeled("Support page", SUPPORT_PAGE),
    "",
    caption("For an active trade problem, choose Dispute help so it stays tied to the right transaction."),
  ].join("\n");

  return whatsappButtonsReply(body, [
    { id: "support_email", title: "Email support" },
    { id: "support_report", title: "Report an issue" },
    { id: "support_dispute", title: "Dispute help" },
  ], [
    body,
    "",
    `${action("email support")} · ${action("report issue")} · ${action("dispute help")}`,
  ].join("\n"));
}

function supportEmailReply(reference = "") {
  return [
    title("Email Akara support"),
    "",
    `Send your message to ${SUPPORT_EMAIL}.`,
    reference ? labeled("Include reference", reference) : "",
    "",
    SUPPORT_PAGE,
    "",
    caption("Open the support page and tap Email support to launch your email app."),
  ].filter(Boolean).join("\n");
}

function disputeSupportReply() {
  return [
    title("Dispute help"),
    "",
    "Send your transaction reference and what went wrong.",
    "",
    `${action("dispute AKR-TXN-001 because payment did not arrive")}`,
    "",
    caption(`For human follow-up, email ${SUPPORT_EMAIL}.`),
  ].join("\n");
}

async function startSupportRequest(user) {
  await upsertSession(user, user.whatsapp_phone, "support", "awaiting_issue", {});
  const body = [
    title("Report an issue"),
    "",
    "Tell me what happened in one message.",
    "",
    caption("Include the transaction or listing reference if you have one."),
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "support_email", title: "Email instead" },
    { id: "cancel", title: "Cancel" },
  ], [
    body,
    "",
    `${action("cancel")} to stop`,
  ].join("\n"));
}

async function submitSupportRequest(user, message, metadata = {}) {
  const request = await createSupportRequest(user, message, metadata);
  await clearSession(user, user.whatsapp_phone);

  if (!request) {
    return [
      title("Support request not sent"),
      "",
      `Email ${SUPPORT_EMAIL} and tell us what happened.`,
      "",
      SUPPORT_PAGE,
    ].join("\n");
  }

  return [
    title("Support request received"),
    "",
    labeled("Reference", request.reference),
    "Akara admin can now review your message.",
    "",
    `For follow-up, email ${SUPPORT_EMAIL}.`,
    "Paste the same message and include your support reference.",
    "",
    SUPPORT_PAGE,
  ].join("\n");
}

async function handleSupport(text, user, session) {
  if (session?.current_step !== "awaiting_issue") {
    await clearSession(user, user.whatsapp_phone);
    return supportOptionsReply();
  }

  return submitSupportRequest(user, text, { source: "whatsapp_support_flow" });
}

module.exports = {
  supportOptionsReply,
  supportEmailReply,
  disputeSupportReply,
  startSupportRequest,
  submitSupportRequest,
  handleSupport,
};
