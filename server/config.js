const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) process.env[key] = value;
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || value.startsWith("replace_with_")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = "") {
  const value = process.env[name];
  if (!value || value.startsWith("replace_with_")) return fallback;
  return value;
}

function booleanEnv(name, fallback = false) {
  const value = process.env[name];
  if (value == null || value === "") return fallback;
  return String(value).toLowerCase() === "true";
}

function positiveIntegerEnv(name, fallback) {
  const value = Number(process.env[name] || fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeIntegerEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function positiveNumberEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function jsonArrayEnv(name) {
  const value = optionalEnv(name);
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error("must be a JSON array");
    return parsed;
  } catch (error) {
    throw new Error(`Invalid ${name}: ${error.message}`);
  }
}

loadEnv(path.join(rootDir, ".env"));

const isRailwayRuntime = Boolean(
  process.env.RAILWAY_PROJECT_ID
  || process.env.RAILWAY_SERVICE_ID
  || process.env.RAILWAY_ENVIRONMENT_ID
);

const config = {
  // Railway healthchecks run outside the container, so a copied local
  // HOST=127.0.0.1 value must never make the service unreachable.
  host: isRailwayRuntime
    ? "0.0.0.0"
    : process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1"),
  port: Number(process.env.PORT || 3000),
  adminToken: optionalEnv("AKARA_ADMIN_TOKEN", "local-admin"),
  supabaseUrl: requiredEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  sendMode: process.env.AKARA_SEND_MODE || "whatsapp",
  whatsappVerifyToken: optionalEnv("WHATSAPP_VERIFY_TOKEN", "dev_verify_token"),
  whatsappAccessToken: optionalEnv("WHATSAPP_ACCESS_TOKEN"),
  whatsappGraphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v26.0",
  whatsappPhoneNumberId: optionalEnv("WHATSAPP_PHONE_NUMBER_ID"),
  whatsappFlowMode: optionalEnv("WHATSAPP_FLOW_MODE"),
  metaAppSecret: optionalEnv("META_APP_SECRET"),
  requireWebhookSignature: booleanEnv(
    "AKARA_REQUIRE_WEBHOOK_SIGNATURE",
    process.env.NODE_ENV === "production"
  ),
  typingIndicatorEnabled: booleanEnv("AKARA_TYPING_INDICATOR", true),
  akaraWhatsappNumber: optionalEnv("AKARA_WHATSAPP_NUMBER", "250734269158"),
  adminHost: optionalEnv("AKARA_ADMIN_HOST", "admin.tryakara.com"),
  akaraSecurityMode: optionalEnv("AKARA_SECURITY_MODE", "web").toLowerCase(),
  akaraSecurityFlowId: optionalEnv("AKARA_SECURITY_FLOW_ID"),
  akaraVerificationMode: optionalEnv("AKARA_VERIFICATION_MODE", "manual").toLowerCase(),
  akaraVerificationFlowId: optionalEnv("AKARA_VERIFICATION_FLOW_ID"),
  publicUrl: optionalEnv("AKARA_PUBLIC_URL"),
  shareUrl: optionalEnv("AKARA_SHARE_URL", "https://tryakara.com"),
  openaiApiKey: optionalEnv("OPENAI_API_KEY"),
  openaiModel: optionalEnv("OPENAI_MODEL", "gpt-5-nano"),
  // "low" measured 29/29 on the live interpreter suite at ~3.5s avg; "medium"
  // scored the same at ~8s avg. Raise via OPENAI_REASONING_EFFORT if needed.
  openaiReasoningEffort: optionalEnv("OPENAI_REASONING_EFFORT", "low"),
  matchingBatchWindowMs: Math.min(
    3000,
    nonNegativeIntegerEnv("AKARA_MATCHING_BATCH_WINDOW_MS", 1200)
  ),
  matchingSweepEnabled: booleanEnv("AKARA_MATCHING_SWEEP_ENABLED", true),
  matchingSweepIntervalMs: Math.max(
    5000,
    positiveIntegerEnv("AKARA_MATCHING_SWEEP_INTERVAL_MS", 30000)
  ),
  matchingSweepBatchSize: Math.min(
    500,
    positiveIntegerEnv("AKARA_MATCHING_SWEEP_BATCH_SIZE", 100)
  ),
  matchingResponseReminderMs: Math.max(
    60000,
    positiveIntegerEnv("AKARA_MATCHING_RESPONSE_REMINDER_MS", 5 * 60 * 1000)
  ),
  tradePaymentWindowMs: Math.max(
    5 * 60 * 1000,
    positiveIntegerEnv("AKARA_TRADE_PAYMENT_WINDOW_MS", 30 * 60 * 1000)
  ),
  matchingPairCooldownMs: Math.max(
    60000,
    positiveIntegerEnv("AKARA_MATCHING_PAIR_COOLDOWN_MS", 30 * 60 * 1000)
  ),
  negotiationWindowMs: Math.max(
    60000,
    positiveIntegerEnv("AKARA_NEGOTIATION_WINDOW_MS", 10 * 60 * 1000)
  ),
  negotiationMaxGapPercent: Math.min(
    100,
    positiveNumberEnv("AKARA_NEGOTIATION_MAX_GAP_PERCENT", 40)
  ),
  instantLiquidityEnabled: booleanEnv("AKARA_INSTANT_LIQUIDITY_ENABLED", false),
  instantLiquidityQuoteTimeoutMs: Math.min(
    10000,
    Math.max(500, positiveIntegerEnv("AKARA_INSTANT_LIQUIDITY_QUOTE_TIMEOUT_MS", 2500))
  ),
  instantLiquidityMinimumValidityMs: Math.max(
    30000,
    positiveIntegerEnv("AKARA_INSTANT_LIQUIDITY_MINIMUM_VALIDITY_MS", 60000)
  ),
  liquidityPartners: jsonArrayEnv("AKARA_LIQUIDITY_PARTNERS_JSON"),
  coinProfileApiUrl: optionalEnv("COIN_PROFILE_API_URL"),
  coinProfileApiKey: optionalEnv("COIN_PROFILE_API_KEY"),
  coinProfileUsername: optionalEnv("COIN_PROFILE_USERNAME"),
  stellarIntegrityEnabled: booleanEnv("AKARA_STELLAR_INTEGRITY_ENABLED", false),
  stellarNetwork: optionalEnv("AKARA_STELLAR_NETWORK", "testnet").toLowerCase(),
  stellarMainnetAcknowledged: booleanEnv("AKARA_STELLAR_MAINNET_ACK", false),
  stellarHorizonUrl: optionalEnv("AKARA_STELLAR_HORIZON_URL"),
  stellarSecretKey: optionalEnv("AKARA_STELLAR_SECRET_KEY"),
  stellarPublicKey: optionalEnv("AKARA_STELLAR_PUBLIC_KEY"),
  stellarMaxFeeStroops: positiveIntegerEnv("AKARA_STELLAR_MAX_FEE_STROOPS", 10000),
  stellarBatchSize: Math.min(256, positiveIntegerEnv("AKARA_STELLAR_BATCH_SIZE", 64)),
  stellarAnchorIntervalMs: Math.max(
    30000,
    positiveIntegerEnv("AKARA_STELLAR_ANCHOR_INTERVAL_MS", 60000)
  ),
  integrityHmacSecret: optionalEnv("AKARA_INTEGRITY_HMAC_SECRET"),
};

if (config.requireWebhookSignature && !config.metaAppSecret) {
  throw new Error("Missing required environment variable: META_APP_SECRET");
}

if (process.env.NODE_ENV === "production") {
  const invalidVariables = [];
  if (config.sendMode !== "whatsapp") invalidVariables.push("AKARA_SEND_MODE=whatsapp");
  if (!config.adminToken || config.adminToken === "local-admin" || config.adminToken.length < 32) {
    invalidVariables.push("AKARA_ADMIN_TOKEN (at least 32 characters)");
  }
  if (
    !config.whatsappVerifyToken
    || config.whatsappVerifyToken === "dev_verify_token"
    || config.whatsappVerifyToken.length < 16
  ) {
    invalidVariables.push("WHATSAPP_VERIFY_TOKEN (at least 16 characters)");
  }
  if (!config.whatsappAccessToken) invalidVariables.push("WHATSAPP_ACCESS_TOKEN");
  if (!config.whatsappPhoneNumberId) invalidVariables.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!/^https:\/\//i.test(config.publicUrl)) invalidVariables.push("AKARA_PUBLIC_URL (HTTPS)");
  if (!/^https:\/\//i.test(config.shareUrl)) invalidVariables.push("AKARA_SHARE_URL (HTTPS)");
  if (!["web", "flow"].includes(config.akaraSecurityMode)) {
    invalidVariables.push("AKARA_SECURITY_MODE (web or flow)");
  }
  if (!["manual", "flow"].includes(config.akaraVerificationMode)) {
    invalidVariables.push("AKARA_VERIFICATION_MODE (manual or flow)");
  }
  if (config.akaraSecurityMode === "flow" && !config.akaraSecurityFlowId) {
    invalidVariables.push("AKARA_SECURITY_FLOW_ID (required when AKARA_SECURITY_MODE=flow)");
  }
  if (config.akaraVerificationMode === "flow" && !config.akaraVerificationFlowId) {
    invalidVariables.push("AKARA_VERIFICATION_FLOW_ID (required when AKARA_VERIFICATION_MODE=flow)");
  }

  if (invalidVariables.length) {
    throw new Error(`Invalid production configuration: ${invalidVariables.join(", ")}`);
  }
}

let runtimePublicUrl = "";

function setRuntimePublicUrl(value) {
  if (value) runtimePublicUrl = value;
}

function getPublicUrl() {
  return config.publicUrl || runtimePublicUrl;
}

function getShareUrl() {
  return config.shareUrl || getPublicUrl();
}

module.exports = {
  rootDir,
  config,
  requiredEnv,
  optionalEnv,
  setRuntimePublicUrl,
  getPublicUrl,
  getShareUrl,
};
