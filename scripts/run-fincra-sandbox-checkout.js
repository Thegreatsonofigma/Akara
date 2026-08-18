#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { FincraClient, FincraError } = require("../server/lib/fincra");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SESSION_DIR = path.join(PROJECT_ROOT, ".sandbox");
const SESSION_PATH = path.join(SESSION_DIR, "fincra-checkout.json");
const REQUIRED_ACK = "I_UNDERSTAND_THIS_CREATES_A_SANDBOX_CHECKOUT";
const SUCCESS_STATUSES = new Set(["success", "successful"]);

function loadLocalEnv() {
  const file = path.join(PROJECT_ROOT, ".env");
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

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value || value.startsWith("replace_with_")) {
    throw new Error(`Missing required sandbox setting: ${name}`);
  }
  return value;
}

function enabled(name) {
  return String(process.env[name] || "").toLowerCase() === "true";
}

function requireSandbox() {
  const environment = String(
    process.env.AKARA_FINCRA_ENVIRONMENT || "sandbox"
  ).toLowerCase();
  if (environment !== "sandbox") {
    throw new Error("This harness refuses to run outside the Fincra sandbox");
  }
  return environment;
}

function extractCheckoutUrl(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  for (const key of [
    "checkoutUrl",
    "checkoutURL",
    "checkoutLink",
    "paymentLink",
    "authorizationUrl",
    "authorizationURL",
    "link",
    "url",
  ]) {
    const value = String(data[key] || "").trim();
    if (/^https:\/\//i.test(value)) return value;
  }
  return null;
}

function checkoutVerificationSummary(payload, expected = {}) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
  const status = String(data.status || "").trim().toLowerCase();
  const reference = String(
    data.merchantReference || data.MerchantReference || data.reference || ""
  ).trim();
  const currency = String(data.currency || "").trim().toUpperCase();
  const amount = Number(data.amount);
  const expectedAmount = Number(expected.amount);
  const termsMatch = (
    reference === String(expected.reference || "")
    && currency === String(expected.currency || "").toUpperCase()
    && Number.isFinite(amount)
    && Number.isFinite(expectedAmount)
    && Math.abs(amount - expectedAmount) < 0.00000001
  );
  return {
    reference,
    currency,
    amount: Number.isFinite(amount) ? amount : null,
    status,
    termsMatch,
    independentlyVerified: termsMatch && SUCCESS_STATUSES.has(status),
  };
}

function createClient({ collections = false } = {}) {
  return new FincraClient({
    environment: requireSandbox(),
    apiKey: requiredEnv("AKARA_FINCRA_API_KEY"),
    publicKey: collections ? requiredEnv("AKARA_FINCRA_PUBLIC_KEY") : "",
    businessId: requiredEnv("AKARA_FINCRA_BUSINESS_ID"),
    allowMutations: collections,
    allowCollections: collections,
    allowPayouts: false,
    timeoutMs: Number(process.env.AKARA_FINCRA_TIMEOUT_MS || 10000),
  });
}

function loadSession(reference) {
  if (!fs.existsSync(SESSION_PATH)) {
    throw new Error("No local sandbox checkout exists. Run the initiate command first.");
  }
  const session = JSON.parse(fs.readFileSync(SESSION_PATH, "utf8"));
  if (reference && session.reference !== reference) {
    throw new Error("The supplied reference does not match the saved sandbox checkout");
  }
  return session;
}

async function initiate() {
  if (!enabled("AKARA_FINCRA_ALLOW_MUTATIONS") || !enabled("AKARA_FINCRA_ALLOW_COLLECTIONS")) {
    throw new Error(
      "Set AKARA_FINCRA_ALLOW_MUTATIONS=true and AKARA_FINCRA_ALLOW_COLLECTIONS=true for this sandbox test"
    );
  }
  if (enabled("AKARA_FINCRA_ALLOW_PAYOUTS")) {
    throw new Error("Keep AKARA_FINCRA_ALLOW_PAYOUTS=false during the collection test");
  }
  if (process.env.AKARA_FINCRA_SANDBOX_CHECKOUT_ACK !== REQUIRED_ACK) {
    throw new Error(
      `Set AKARA_FINCRA_SANDBOX_CHECKOUT_ACK=${REQUIRED_ACK} to acknowledge this sandbox checkout`
    );
  }

  const currency = String(process.env.AKARA_FINCRA_TEST_CURRENCY || "KES").toUpperCase();
  const amount = Number(process.env.AKARA_FINCRA_TEST_AMOUNT || 1000);
  const reference = [
    "AKR-SBX",
    Date.now(),
    crypto.randomBytes(4).toString("hex"),
  ].join("-");
  const paymentMethods = String(
    process.env.AKARA_FINCRA_TEST_PAYMENT_METHODS || "mobile_money"
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const defaultPaymentMethod = String(
    process.env.AKARA_FINCRA_TEST_DEFAULT_PAYMENT_METHOD || ""
  ).trim().toLowerCase();

  const client = createClient({ collections: true });
  const payload = await client.initiateCheckout({
    currency,
    amount,
    reference,
    customer: {
      name: process.env.AKARA_FINCRA_TEST_CUSTOMER_NAME || "Akara Sandbox Tester",
      email: process.env.AKARA_FINCRA_TEST_CUSTOMER_EMAIL || "sandbox@tryakara.com",
      phoneNumber: process.env.AKARA_FINCRA_TEST_CUSTOMER_PHONE || undefined,
    },
    paymentMethods,
    defaultPaymentMethod: defaultPaymentMethod || undefined,
    redirectUrl: process.env.AKARA_FINCRA_TEST_REDIRECT_URL || "https://tryakara.com",
  });
  const checkoutUrl = extractCheckoutUrl(payload);

  fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(SESSION_PATH, JSON.stringify({
    reference,
    currency,
    amount,
    createdAt: new Date().toISOString(),
  }, null, 2), { mode: 0o600 });

  console.log(`[fincra] sandbox checkout created: ${reference}`);
  console.log(`[fincra] amount: ${currency} ${amount}`);
  if (checkoutUrl) {
    console.log(`[fincra] checkout URL: ${checkoutUrl}`);
  } else {
    console.log("[fincra] checkout accepted, but Fincra did not return a recognized hosted URL field.");
  }
  console.log("[fincra] payout remains disabled. Complete the sandbox payment, then run the verify command.");
}

async function verify(reference) {
  const session = loadSession(reference);
  const client = createClient();
  const payload = await client.verifyCheckout(session.reference);
  const result = checkoutVerificationSummary(payload, session);

  console.log(`[fincra] merchant reference: ${result.reference || "missing"}`);
  console.log(`[fincra] provider status: ${result.status || "missing"}`);
  console.log(`[fincra] returned terms: ${result.currency || "?"} ${result.amount ?? "?"}`);
  console.log(`[fincra] terms match: ${result.termsMatch ? "yes" : "no"}`);
  console.log(`[fincra] independently verified: ${result.independentlyVerified ? "yes" : "no"}`);
  if (!result.termsMatch) process.exitCode = 2;
}

function usage() {
  console.log("Usage:");
  console.log("  npm run fincra:sandbox:checkout -- initiate");
  console.log("  npm run fincra:sandbox:checkout -- verify [merchant-reference]");
}

async function run() {
  loadLocalEnv();
  const command = String(process.argv[2] || "").toLowerCase();
  if (command === "initiate") return initiate();
  if (command === "verify") return verify(process.argv[3]);
  usage();
  process.exitCode = 1;
}

if (require.main === module) {
  run().catch((error) => {
    const suffix = error instanceof FincraError && error.statusCode
      ? ` (HTTP ${error.statusCode})`
      : "";
    console.error(`[fincra] sandbox checkout failed: ${error.message}${suffix}`);
    process.exitCode = 1;
  });
}

module.exports = {
  extractCheckoutUrl,
  checkoutVerificationSummary,
};
