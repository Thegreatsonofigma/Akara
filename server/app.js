const http = require("node:http");
const { URL } = require("node:url");
const { config, setRuntimePublicUrl } = require("./config");
const { jsonResponse, textResponse, readJsonBody, serveFile } = require("./lib/http");
const { extractMessages, sendWhatsAppText, sendWhatsAppTyping, getOutboundTextByMessageId } = require("./lib/whatsapp");
const { handleReceiptRedirect } = require("./lib/receipts");
const { handleListingCardRoute } = require("./lib/listing-card");
const { findOrCreateUser } = require("./db/users");
const { getSession } = require("./db/sessions");
const { buildReply } = require("./router");
const { handleAdminApi, adminFilePath } = require("./admin");

async function handleWebhookPost(req, res) {
  const payload = await readJsonBody(req);
  const messages = extractMessages(payload);
  const changeCount = (payload.entry || []).reduce(
    (total, entry) => total + (entry.changes || []).length,
    0
  );

  console.log(
    `[webhook] POST received: ${messages.length} message(s), ${changeCount} change(s)`
  );

  let failedMessages = 0;
  for (const incoming of messages) {
    try {
      console.log(`[webhook] incoming ${incoming.type} message from ${incoming.from}`);

      if (process.env.AKARA_TYPING_INDICATOR === "true") {
        sendWhatsAppTyping(incoming.messageId).catch((error) => {
          console.error(`[webhook] typing indicator failed for ${incoming.from}: ${error.message}`);
        });
      }

      const user = await findOrCreateUser(incoming.from, incoming.displayName);
      if (incoming.quotedMessageId) {
        incoming.quotedText = await getOutboundTextByMessageId(incoming.quotedMessageId).catch((error) => {
          console.error(`[webhook] quoted message lookup failed for ${incoming.from}: ${error.message}`);
          return "";
        });
      }
      const session = await getSession(incoming.from);
      const reply = await buildReply(incoming.text, user, session, incoming);
      await sendWhatsAppText(incoming.from, reply);
      console.log(`[webhook] reply sent to ${incoming.from}`);
    } catch (error) {
      failedMessages += 1;
      console.error(`[webhook] failed message from ${incoming.from}: ${error.message}`);
      console.error(error.stack || error);

      try {
        await sendWhatsAppText(
          incoming.from,
          "Akara hit a temporary issue while handling that message. Please try again in a moment."
        );
      } catch (sendError) {
        console.error(`[webhook] fallback reply failed for ${incoming.from}: ${sendError.message}`);
      }
    }
  }

  jsonResponse(res, 200, { ok: true, received: messages.length, failed: failedMessages });
}

function handleWebhookGet(req, res, url) {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === config.whatsappVerifyToken && challenge) {
    return textResponse(res, 200, challenge);
  }

  return textResponse(res, 403, "Forbidden");
}

function rememberPublicUrl(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  if (!host) return;
  const proto = req.headers["x-forwarded-proto"] || (String(host).includes("ngrok") ? "https" : "http");
  setRuntimePublicUrl(`${proto}://${host}`);
}

const server = http.createServer(async (req, res) => {
  try {
    rememberPublicUrl(req);
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      return jsonResponse(res, 200, { ok: true, service: "akara-whatsapp-webhook" });
    }

    if (req.method === "GET" && url.pathname === "/webhook") {
      return handleWebhookGet(req, res, url);
    }

    if (req.method === "POST" && url.pathname === "/webhook") {
      return await handleWebhookPost(req, res);
    }

    const receiptMatch = url.pathname.match(/^\/r\/([0-9a-f]{8}|[0-9a-f-]{36})$/i);
    if (req.method === "GET" && receiptMatch) {
      return await handleReceiptRedirect(res, receiptMatch[1]);
    }

    if (req.method === "GET" && await handleListingCardRoute(req, res, url)) {
      return;
    }

    if (req.method === "POST" && url.pathname === "/dev/message") {
      if (config.sendMode !== "log") {
        return jsonResponse(res, 404, { ok: false, error: "Not found" });
      }

      const body = await readJsonBody(req);
      const from = body.from || "250700000000";
      const text = body.text || "";
      const user = await findOrCreateUser(from, body.displayName || "Local Tester");
      const session = await getSession(from);
      const reply = await buildReply(text, user, session);
      return jsonResponse(res, 200, { ok: true, from, reply });
    }

    if (url.pathname === "/admin") {
      return serveFile(res, adminFilePath("index.html"), "text/html; charset=utf-8");
    }

    if (url.pathname === "/admin/styles.css") {
      return serveFile(res, adminFilePath("styles.css"), "text/css; charset=utf-8");
    }

    if (url.pathname === "/admin/app.js") {
      return serveFile(res, adminFilePath("app.js"), "text/javascript; charset=utf-8");
    }

    if (url.pathname.startsWith("/admin/api/")) {
      return await handleAdminApi(req, res, url);
    }

    return jsonResponse(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error(error);
    return jsonResponse(res, 500, { ok: false, error: error.message });
  }
});

function startServer() {
  server.listen(config.port, config.host, () => {
    console.log(`Akara webhook server listening on http://${config.host}:${config.port}`);
    console.log(`Akara send mode: ${config.sendMode}`);
  });
}

module.exports = {
  server,
  startServer,
};
