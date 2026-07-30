const fs = require("node:fs");
const path = require("node:path");

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

loadLocalEnv();

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const productionRequired = [
  "AKARA_ADMIN_TOKEN",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "META_APP_SECRET",
  "AKARA_PUBLIC_URL",
];

const missing = required.filter((name) => !String(process.env[name] || "").trim());
if (process.env.NODE_ENV === "production") {
  missing.push(...productionRequired.filter((name) => !String(process.env[name] || "").trim()));
}

if (missing.length) {
  console.error("");
  console.error("[startup] Akara cannot start because these Railway Variables are missing:");
  missing.forEach((name) => console.error(`  - ${name}`));
  console.error("");
  console.error("Open Railway > Akara service > Variables, add the values, then redeploy.");
  console.error("Do not place secrets in GitHub or railway.json.");
  process.exit(1);
}

if (
  process.env.NODE_ENV === "production"
  && String(process.env.AKARA_ADMIN_TOKEN || "").trim().length < 32
) {
  console.error("[startup] AKARA_ADMIN_TOKEN must contain at least 32 characters in production.");
  process.exit(1);
}

console.log(`[startup] Environment preflight passed for ${process.env.NODE_ENV || "development"}.`);
