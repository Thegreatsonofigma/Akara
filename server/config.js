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

loadEnv(path.join(rootDir, ".env"));

const config = {
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 3001),
  adminToken: optionalEnv("AKARA_ADMIN_TOKEN", "local-admin"),
  supabaseUrl: requiredEnv("SUPABASE_URL"),
  supabaseServiceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  sendMode: process.env.AKARA_SEND_MODE || "whatsapp",
  whatsappVerifyToken: optionalEnv("WHATSAPP_VERIFY_TOKEN", "dev_verify_token"),
  whatsappAccessToken: optionalEnv("WHATSAPP_ACCESS_TOKEN"),
  whatsappGraphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v20.0",
  whatsappPhoneNumberId: optionalEnv("WHATSAPP_PHONE_NUMBER_ID"),
  akaraWhatsappNumber: optionalEnv("AKARA_WHATSAPP_NUMBER", "15556733907"),
  akaraSecurityFlowId: optionalEnv("AKARA_SECURITY_FLOW_ID"),
  akaraVerificationFlowId: optionalEnv("AKARA_VERIFICATION_FLOW_ID"),
  publicUrl: optionalEnv("AKARA_PUBLIC_URL"),
  openaiApiKey: optionalEnv("OPENAI_API_KEY"),
  openaiModel: optionalEnv("OPENAI_MODEL", "gpt-5-nano"),
  // "low" measured 29/29 on the live interpreter suite at ~3.5s avg; "medium"
  // scored the same at ~8s avg. Raise via OPENAI_REASONING_EFFORT if needed.
  openaiReasoningEffort: optionalEnv("OPENAI_REASONING_EFFORT", "low"),
  coinProfileApiUrl: optionalEnv("COIN_PROFILE_API_URL"),
  coinProfileApiKey: optionalEnv("COIN_PROFILE_API_KEY"),
  coinProfileUsername: optionalEnv("COIN_PROFILE_USERNAME"),
};

let runtimePublicUrl = "";

function setRuntimePublicUrl(value) {
  if (value) runtimePublicUrl = value;
}

function getPublicUrl() {
  return config.publicUrl || runtimePublicUrl;
}

module.exports = {
  rootDir,
  config,
  requiredEnv,
  optionalEnv,
  setRuntimePublicUrl,
  getPublicUrl,
};
