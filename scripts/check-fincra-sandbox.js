#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { FincraClient } = require("../server/lib/fincra");

function loadLocalEnv() {
  const file = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[name]) process.env[name] = value;
  }
}

async function run() {
  loadLocalEnv();
  const environment = String(process.env.AKARA_FINCRA_ENVIRONMENT || "sandbox").toLowerCase();
  if (environment !== "sandbox") {
    throw new Error("This check is sandbox-only. Set AKARA_FINCRA_ENVIRONMENT=sandbox.");
  }

  const client = new FincraClient({
    environment,
    apiKey: process.env.AKARA_FINCRA_API_KEY,
    businessId: process.env.AKARA_FINCRA_BUSINESS_ID,
    allowMutations: false,
    timeoutMs: Number(process.env.AKARA_FINCRA_TIMEOUT_MS || 5000),
  });
  const pair = String(process.env.AKARA_FINCRA_TEST_PAIR || "KES-NGN").toUpperCase();

  const business = await client.getBusinessInformation();
  const businessData = business.data || {};
  if (client.businessId && businessData._id && client.businessId !== String(businessData._id)) {
    throw new Error("AKARA_FINCRA_BUSINESS_ID does not match the authenticated sandbox business.");
  }
  console.log(`[fincra] authenticated sandbox business: ${businessData.name || "unknown"}`);
  console.log(`[fincra] KYC approved: ${businessData.isKYCApproved === true ? "yes" : "no"}`);
  console.log(`[fincra] webhook enabled: ${businessData.settings?.enableWebhook === true ? "yes" : "no"}`);

  const rates = await client.getRates({ currencyPair: pair, perPage: 10 });
  const rateRows = Array.isArray(rates.data?.rates) ? rates.data.rates : [];
  console.log(`[fincra] ${pair} rates returned: ${rateRows.length}`);
  console.log("[fincra] read-only sandbox check passed; no quote was executed and no funds moved.");
}

run().catch((error) => {
  console.error(`[fincra] sandbox check failed: ${error.message}`);
  process.exitCode = 1;
});
