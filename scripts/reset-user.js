#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
loadEnv(path.join(rootDir, ".env"));

const supabaseUrl = requiredEnv("SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const rawPhone = process.argv[2] || process.env.AKARA_ADMIN_PHONE || "";
const phone = rawPhone.replace(/[^\d]/g, "");

if (!phone) {
  console.error("Usage: node akara/scripts/reset-user.js <whatsapp-number>");
  process.exit(1);
}

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

function filterValue(value) {
  return encodeURIComponent(value);
}

async function supabaseRequest(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return body || [];
}

async function removeRows(pathname) {
  return supabaseRequest(pathname, { method: "DELETE" });
}

async function run() {
  const phoneFilter = `or=(whatsapp_phone.eq.${filterValue(phone)},whatsapp_phone.eq.${filterValue(`+${phone}`)})`;
  const users = await supabaseRequest(`users?select=id,whatsapp_phone&${phoneFilter}`);

  await removeRows(`message_sessions?${phoneFilter}`);

  if (users.length === 0) {
    console.log(`No Akara user found for ${phone}. Session is clean.`);
    return;
  }

  for (const user of users) {
    const userId = user.id;

    await removeRows(`deal_proofs?user_id=eq.${filterValue(userId)}`);
    await removeRows(`fees?user_id=eq.${filterValue(userId)}`);
    await removeRows(`disputes?opened_by_user_id=eq.${filterValue(userId)}`);
    await removeRows(`deals?or=(maker_user_id.eq.${filterValue(userId)},taker_user_id.eq.${filterValue(userId)})`);
    await removeRows(`negotiable_offers?offering_user_id=eq.${filterValue(userId)}`);
    await removeRows(`listings?owner_user_id=eq.${filterValue(userId)}`);
    await removeRows(`payment_profiles?user_id=eq.${filterValue(userId)}`);
    await removeRows(`verification_requests?user_id=eq.${filterValue(userId)}`);
    await removeRows(`penalties?user_id=eq.${filterValue(userId)}`);
    await removeRows(`users?id=eq.${filterValue(userId)}`);

    console.log(`Reset Akara user ${user.whatsapp_phone}.`);
  }

  console.log("Done. The next WhatsApp message will create a fresh unverified user.");
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
