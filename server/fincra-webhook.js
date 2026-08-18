const { config } = require("./config");
const { readRawBody, parseJsonBody, jsonResponse } = require("./lib/http");
const { verifyFincraWebhookSignature } = require("./lib/fincra");
const { processFincraWebhookEvent } = require("./lib/fincra-fulfillment-service");

async function handleFincraWebhook(req, res) {
  if (!config.fincraEnabled || !config.fincraWebhookSecret) {
    return jsonResponse(res, 404, { ok: false, error: "Not found" });
  }

  const rawBody = await readRawBody(req, 256 * 1024);
  if (!verifyFincraWebhookSignature(
    rawBody,
    req.headers?.signature,
    config.fincraWebhookSecret
  )) {
    return jsonResponse(res, 401, { ok: false, error: "Invalid webhook signature" });
  }

  const event = parseJsonBody(rawBody);
  const result = await processFincraWebhookEvent(event);
  return jsonResponse(res, 200, { ok: true, ...result });
}

module.exports = {
  handleFincraWebhook,
};
