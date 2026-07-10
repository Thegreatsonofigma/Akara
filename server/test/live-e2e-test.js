#!/usr/bin/env node

// Full-stack conversation test: the real OpenAI interpreter (key from .env)
// drives the real router and flows, with only Supabase and WhatsApp replaced
// by the in-memory fake. This is the closest thing to a real WhatsApp session
// that can run from a terminal.
//
// Run: node server/test/live-e2e-test.js   (VERBOSE=1 to see every reply)

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AKARA_SEND_MODE = "log";
process.env.COIN_PROFILE_API_URL = "replace_with_disabled";
process.env.COIN_PROFILE_API_KEY = "replace_with_disabled";
process.env.COIN_PROFILE_USERNAME = "replace_with_disabled";
process.env.AKARA_SECURITY_ENABLED = "false";
// OPENAI_API_KEY intentionally not set here: config loads the real one from .env

const path = require("node:path");
const crypto = require("node:crypto");

const fakeSupabase = require("./fake-supabase");

function stubModule(relativePath, exports) {
  const filename = path.join(__dirname, "..", relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}

stubModule("lib/supabase.js", fakeSupabase);

const { buildReply } = require("../router");
const { findOrCreateUser } = require("../db/users");
const { getSession } = require("../db/sessions");
const { isOpenAiEnabled } = require("../lib/openai");

const { __table } = fakeSupabase;

const verbose = process.env.VERBOSE === "1";
const realLog = console.log.bind(console);
console.log = (...args) => {
  if (verbose) realLog(...args);
};

let passed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    realLog(`PASS ${label}`);
  } else {
    failures.push(label);
    realLog(`FAIL ${label}\n  reply: ${String(detail).slice(0, 500).replace(/\n/g, " | ")}`);
  }
}

async function send(phone, text) {
  const user = await findOrCreateUser(phone, "Live Tester");
  const session = await getSession(phone);
  const startedAt = Date.now();
  const reply = await buildReply(text, user, session, { from: phone, text });
  realLog(`  (${Date.now() - startedAt}ms) "${text}"`);
  return reply;
}

async function sessionFlow(phone) {
  const session = await getSession(phone);
  return session?.current_flow || null;
}

function seedVerifiedUser(phone, name) {
  const user = {
    id: crypto.randomUUID(),
    whatsapp_phone: phone,
    display_name: name,
    legal_name: name,
    verification_status: "verified_manual",
    verification_score: 90,
    completed_deals_count: 0,
    created_at: new Date().toISOString(),
  };
  __table("users").push(user);
  return user;
}

function seedPayout(user, currency) {
  const bank = currency === "NGN";
  __table("payment_profiles").push({
    id: crypto.randomUUID(),
    user_id: user.id,
    currency,
    method: bank ? "bank" : "momo",
    account_name: user.legal_name || "Live Tester",
    bank_name: bank ? "GTBank" : null,
    account_number_encrypted: bank ? "0123456789" : null,
    momo_network: bank ? null : "MTN",
    momo_number_encrypted: bank ? null : "0788000001",
    is_default: true,
    created_at: new Date().toISOString(),
  });
}

async function run() {
  if (!isOpenAiEnabled()) {
    realLog("OPENAI_API_KEY missing in .env — cannot run live e2e test");
    process.exit(1);
  }

  const ALICE = "250700000101";
  const BOB = "250700000102";

  let reply = await send(ALICE, "hey akara");
  check("greeting → verification intro", reply.includes("Welcome to Akara"), reply);

  reply = await send(ALICE, "verify me");
  check("verify starts", reply.toLowerCase().includes("legal name"), reply);

  reply = await send(ALICE, "Alice Livetester");
  check("name accepted", reply.toLowerCase().includes("nationality"), reply);

  reply = await send(ALICE, "show me rwf offers");
  check("mid-verification request walled", reply.includes("Verification comes first"), reply);
  check("verification survives interrupt", (await sessionFlow(ALICE)) === "verification");

  // ID uploads need real WhatsApp media, so approve directly and move on.
  const aliceRow = __table("users").find((row) => row.whatsapp_phone === ALICE);
  Object.assign(aliceRow, { verification_status: "verified_manual", verification_score: 90 });
  await send(ALICE, "cancel");
  seedPayout(aliceRow, "NGN");
  seedPayout(aliceRow, "RWF");

  reply = await send(ALICE, "I have 50k naira and want 55k rwf");
  check("one-shot listing previews", reply.includes("*Review listing*"), reply);
  check("direction correct", reply.includes("*You send:* 50,000 NGN"), reply);

  reply = await send(ALICE, "actually make it 60k naira");
  check("revision applies", reply.includes("60,000 NGN"), reply);
  // The model may keep 55,000 RWF or proportionally rescale the rate —
  // both are reasonable readings of "make it 60k".
  check("revision keeps rwf side", /\d[\d,]*\s*RWF/.test(reply), reply);

  reply = await send(ALICE, "make it flexible");
  check("terms revision applies", reply.includes("Flexible rate"), reply);

  reply = await send(ALICE, "oya publish it");
  check("publish goes live", reply.includes("live ✅"), reply);

  const bobRow = seedVerifiedUser(BOB, "Bob Livetester");
  seedPayout(bobRow, "NGN");
  seedPayout(bobRow, "RWF");
  __table("listings").push({
    id: crypto.randomUUID(),
    owner_user_id: bobRow.id,
    listing_code: "AKR-LIST-090",
    have_currency: "NGN",
    want_currency: "RWF",
    have_amount: 100000,
    want_amount: 110000,
    listing_type: "fixed",
    status: "active",
    created_at: new Date().toISOString(),
  });

  reply = await send(ALICE, "abeg show me ngn offers");
  check("browse finds bob's listing", reply.includes("AKR-LIST-090"), reply);

  reply = await send(ALICE, "open 1");
  check("selection opens trade", reply.includes("Akara Trade opened ✅"), reply);

  reply = await send(ALICE, "i don send am");
  check("paid asks for receipt", reply.includes("Receipt needed"), reply);

  reply = await send(ALICE, "show me my bank information");
  check("bank info interrupt mid-deal", reply.includes("Bank & payout details"), reply);
  check("bank info scoped (no listings)", !reply.includes("*Listings*"), reply);

  reply = await send(ALICE, "wetin dey happen with my trade");
  check("trade recall works", reply.includes("AKR-TXN-"), reply);

  reply = await send(ALICE, "is akara free to use?");
  check("fee question answered live", /free/i.test(reply), reply);

  reply = await send(ALICE, "see my profile");
  check("profile scoped view", reply.includes("*Your profile*"), reply);
  check("profile hides account numbers", !reply.includes("0123456789"), reply);

  reply = await send(ALICE, "cancel all my listings");
  check("bulk cancel confirms first", reply.includes("Cancel all listings?"), reply);

  reply = await send(ALICE, "yes go ahead");
  check("bulk cancel completes", reply.includes("Listings cancelled"), reply);

  const total = passed + failures.length;
  realLog(`\n${passed}/${total} live e2e checks passed`);
  process.exit(failures.length ? 1 : 0);
}

run().catch((error) => {
  realLog(error.stack || error);
  process.exit(1);
});
