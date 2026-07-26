#!/usr/bin/env node

// Offline end-to-end tests for the Akara WhatsApp bot. Supabase and OpenAI
// are replaced in the require cache before the server code loads: the DB is
// the in-memory fake, and interpretations are scripted per message, so every
// router path (flows, interrupts, scoped views, referral copy) runs exactly
// as it would in production minus the network.
//
// Run: node server/test/run-tests.js       (VERBOSE=1 for full replies)

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AKARA_SEND_MODE = "log";
process.env.OPENAI_API_KEY = "fake-openai-key";
process.env.OPENAI_MODEL = "gpt-5-nano";
process.env.COIN_PROFILE_API_URL = "replace_with_disabled";
process.env.COIN_PROFILE_API_KEY = "replace_with_disabled";
process.env.COIN_PROFILE_USERNAME = "replace_with_disabled";
process.env.AKARA_TYPING_INDICATOR = "false";
process.env.AKARA_SECURITY_ENABLED = "false";
process.env.AKARA_SECURITY_FLOW_ID = "replace_with_disabled";
process.env.AKARA_VERIFICATION_FLOW_ID = "replace_with_disabled";
process.env.AKARA_RECEIPT_OCR = "off";
process.env.AKARA_ID_OCR = "off";
process.env.AKARA_MATCHING_BATCH_WINDOW_MS = "0";
process.env.AKARA_MATCHING_SWEEP_ENABLED = "false";
process.env.AKARA_PUBLIC_URL = "https://akara-share.example";
process.env.AKARA_SHARE_URL = "https://akara-share.example";

const path = require("node:path");
const crypto = require("node:crypto");

const fakeSupabase = require("./fake-supabase");

const openaiStub = {
  enabled: false,
  queue: [],
  isOpenAiEnabled: () => openaiStub.enabled,
  openAiGenerate: async () => {
    throw new Error("openAiGenerate not scripted in tests");
  },
  openAiGenerateJson: async () => {
    if (!openaiStub.queue.length) throw new Error("no scripted interpretation queued");
    return openaiStub.queue.shift();
  },
};

function stubModule(relativePath, exports) {
  const filename = path.join(__dirname, "..", relativePath);
  require.cache[filename] = { id: filename, filename, loaded: true, exports, children: [], paths: [] };
}

stubModule("lib/supabase.js", fakeSupabase);
stubModule("lib/openai.js", openaiStub);

// Menu lists are sent directly (the reply is null); capture the payloads so
// scenarios can assert on the list body instead of the returned text.
const whatsapp = require("../lib/whatsapp");
const { containsPreviewableUrl } = whatsapp;
const listSends = [];
const buttonSends = [];
const mediaSends = [];
const textSends = [];
whatsapp.sendWhatsAppText = async (to, text) => {
  textSends.push({ to, text });
  return { logged: true };
};
whatsapp.sendWhatsAppList = async (to, payload) => {
  listSends.push({ to, payload });
  return { logged: true };
};
whatsapp.sendWhatsAppButtons = async (to, payload) => {
  buttonSends.push({ to, payload });
  return { logged: true };
};
whatsapp.sendWhatsAppMedia = async (to, mediaType, mediaId, caption = "", filename = "") => {
  mediaSends.push({ to, mediaType, mediaId, caption, filename });
  return { logged: true };
};
whatsapp.getWhatsAppMedia = async () => ({
  buffer: Buffer.from("fake receipt"),
  contentType: "image/png",
  sha256: "fake-sha",
});
whatsapp.uploadWhatsAppMedia = async () => "fake-whatsapp-media-id";
function lastListBody() {
  return listSends.length ? String(listSends[listSends.length - 1].payload?.body || "") : "";
}

function lastButtonBody() {
  return buttonSends.length ? String(buttonSends[buttonSends.length - 1].payload?.body || "") : "";
}

function lastListPayload() {
  return listSends.length ? listSends[listSends.length - 1].payload : null;
}

function lastButtonPayload() {
  return buttonSends.length ? buttonSends[buttonSends.length - 1].payload : null;
}

function lastMediaPayload() {
  return mediaSends.length ? mediaSends[mediaSends.length - 1] : null;
}

const { buildReply } = require("../router");
const { sendIdleMenus } = require("../app");
const { runSmartMatchingSweep } = require("../flows/listing");
const { findOrCreateUser } = require("../db/users");
const { getSession, rememberFailedMessage } = require("../db/sessions");
const intents = require("../nlp/intents");
const { clearHistory } = require("../nlp/history");
const { config } = require("../config");
const { findNigerianBanks } = require("../lib/coinprofile");
const { analyzeReceiptEvidence } = require("../lib/receipt-ocr");
const { normalizeMobileMoneyNumber } = require("../lib/mobile-number");
const { formatMessageLayout } = require("../lib/format");
const { parseBulkListingDetails } = require("../nlp/exchange");
const {
  buildClearingPlan,
  buildNegotiationPlan,
  compareClearingPlans,
} = require("../lib/matching-engine");
const {
  handlePaymentProfile,
  mobileMoneyNumberPrompt,
  verifiedBankNameMatch,
} = require("../flows/payment-profile");

const { __table, __reset } = fakeSupabase;

// ---------------------------------------------------------------- helpers

const verbose = process.env.VERBOSE === "1";
const realLog = console.log.bind(console);
console.log = (...args) => {
  if (verbose) realLog(...args);
};

let passed = 0;
const failures = [];
let currentScenario = "";

function scenario(name) {
  currentScenario = name;
}

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push({ scenario: currentScenario, label, detail: String(detail).slice(0, 400) });
}

function fullInterpretation(partial) {
  return {
    action: "unknown",
    have_currency: null,
    have_amount: null,
    want_currency: null,
    want_amount: null,
    payment_currency: null,
    settings_target: null,
    settings_operation: null,
    settings_item_number: null,
    answer: null,
    ...partial,
  };
}

// Mimics the webhook: find user, load session, build reply. `interpret`
// scripts what the model would return for this message; omitting it simulates
// OpenAI being off, exercising the deterministic fallbacks.
async function send(phone, text, { interpret, media, quotedText } = {}) {
  if (interpret) {
    openaiStub.enabled = true;
    openaiStub.queue = [fullInterpretation(interpret)];
  } else {
    openaiStub.enabled = false;
    openaiStub.queue = [];
  }

  const user = await findOrCreateUser(phone, "Test User");
  const session = await getSession(phone);
  const incoming = { from: phone, text, media: media || null, quotedText: quotedText || "" };
  const beforeLists = listSends.length;
  const beforeButtons = buttonSends.length;
  const reply = await buildReply(text, user, session, incoming);
  if (reply === null && listSends.length > beforeLists) return lastListBody();
  if (reply === null && buttonSends.length > beforeButtons) return lastButtonBody();
  if (reply && typeof reply === "object") {
    if (typeof reply.reply === "string") return reply.reply;
    if (reply.type === "whatsapp_list") {
      listSends.push({ to: phone, payload: reply.list });
      return reply.list?.body || reply.fallbackText || "";
    }
    if (reply.type === "whatsapp_buttons") {
      buttonSends.push({ to: phone, payload: reply });
      return reply.body || reply.fallbackText || "";
    }
    if (typeof reply.body === "string") return reply.body;
    if (reply.type === "whatsapp_flow") return reply.fallbackText || reply.flow?.body || "";
    if (reply.type === "media") return reply.caption || reply.fallbackText || "";
  }
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
  const digits = String(user.whatsapp_phone || user.id || "").replace(/\D/g, "");
  const suffix = digits.slice(-6).padStart(6, "0");
  __table("payment_profiles").push({
    id: crypto.randomUUID(),
    user_id: user.id,
    currency,
    method: bank ? "bank" : "momo",
    account_name: user.legal_name || "Test User",
    bank_name: bank ? "GTBank" : null,
    account_number_encrypted: bank ? `0123${suffix}`.slice(0, 10) : null,
    momo_network: bank ? null : "MTN",
    momo_number_encrypted: bank ? null : `0788${suffix}`.slice(0, 10),
    is_default: true,
    created_at: new Date().toISOString(),
  });
}

function seedListing(owner, values) {
  const listing = {
    id: crypto.randomUUID(),
    owner_user_id: owner.id,
    listing_code: values.code,
    have_currency: values.have_currency,
    want_currency: values.want_currency,
    have_amount: values.have_amount,
    want_amount: values.want_amount,
    listing_type: values.listing_type || "fixed",
    status: values.status || "active",
    created_at: values.created_at || new Date().toISOString(),
  };
  __table("listings").push(listing);
  return listing;
}

function seedCompletedDeal(maker, taker, values = {}) {
  const now = new Date().toISOString();
  const listing = seedListing(maker, {
    code: values.listing_code || `AKR-LIST-${crypto.randomUUID().slice(0, 4)}`,
    have_currency: values.have_currency || "NGN",
    have_amount: values.have_amount || 1000,
    want_currency: values.want_currency || "RWF",
    want_amount: values.want_amount || 1200,
  });
  listing.status = "reserved";
  const deal = {
    id: crypto.randomUUID(),
    deal_code: values.deal_code || `AKR-TXN-${crypto.randomUUID().slice(0, 4)}`,
    listing_id: listing.id,
    maker_user_id: maker.id,
    taker_user_id: taker.id,
    have_currency: listing.have_currency,
    want_currency: listing.want_currency,
    have_amount: listing.have_amount,
    want_amount: listing.want_amount,
    status: "closed",
    maker_sent_at: now,
    taker_sent_at: now,
    maker_received_at: now,
    taker_received_at: now,
    completed_at: now,
    reservation_expires_at: now,
    created_at: now,
  };
  __table("deals").push(deal);
  return deal;
}

function removeSeededDeals(deals) {
  const dealIds = new Set(deals.map((deal) => deal.id));
  const listingIds = new Set(deals.map((deal) => deal.listing_id));
  for (const deal of [...__table("deals")]) {
    if (dealIds.has(deal.id)) __table("deals").splice(__table("deals").indexOf(deal), 1);
  }
  for (const listing of [...__table("listings")]) {
    if (listingIds.has(listing.id)) __table("listings").splice(__table("listings").indexOf(listing), 1);
  }
}

// ---------------------------------------------------------------- tests

async function run() {
  __reset();

  const ALICE = "250700000001";
  const BOB = "250700000002";
  const CHARLIE = "250700000003";

  // ---------- smart matching math
  scenario("smart matching math");
  const fairSource = {
    have_currency: "RWF",
    want_currency: "KES",
    have_amount: 10000,
    want_amount: 13000,
    listing_type: "negotiable",
  };
  const fairCandidate = {
    id: "fair-candidate",
    owner_user_id: "fair-owner",
    have_currency: "KES",
    want_currency: "RWF",
    have_amount: 500000,
    want_amount: 320000,
    listing_type: "negotiable",
  };
  const fairPlan = buildClearingPlan(fairCandidate, fairSource);
  check(
    "geometric clearing improves both peers",
    Number(fairPlan?.reciprocal_units) === 14252.19
      && Number(fairPlan?.source_minimum) === 13000
      && Number(fairPlan?.candidate_maximum) === 15625
      && fairPlan.source_improvement > 0
      && fairPlan.candidate_savings > 0,
    JSON.stringify(fairPlan)
  );
  const fullCandidatePlan = buildClearingPlan({
    ...fairCandidate,
    id: "full-candidate",
    have_amount: 13000,
    want_amount: 10000,
  }, fairSource);
  check(
    "a full mutual fill ranks before a small partial fill",
    compareClearingPlans(fullCandidatePlan, fairPlan, {}) < 0,
    JSON.stringify({ fullCandidatePlan, fairPlan })
  );
  check(
    "near rates receive a midpoint negotiation",
    Boolean(buildNegotiationPlan({
      ...fairCandidate,
      have_amount: 90000,
      want_amount: 100000,
    }, {
      ...fairSource,
      have_amount: 100000,
      want_amount: 100000,
      want_currency: "KES",
    }, 20))
  );
  check(
    "irrelevant rate gaps do not create noisy negotiations",
    !buildNegotiationPlan({
      ...fairCandidate,
      have_amount: 50000,
      want_amount: 100000,
    }, {
      ...fairSource,
      have_amount: 100000,
      want_amount: 100000,
      want_currency: "KES",
    }, 20)
  );

  // ---------- intent regex units
  scenario("intent regex units");
  check("bank information → payouts", intents.isPayoutsCommand("bank information"));
  check("show my bank info → payouts", intents.isPayoutsCommand("show my bank info"));
  check("payment details → payouts", intents.isPayoutsCommand("payment details"));
  check("my momo → payouts", intents.isPayoutsCommand("my momo"));
  check("view my payout details → payouts", intents.isPayoutsCommand("view my payout details"));
  check("my trust record → trust record", intents.isTrustRecordCommand("my trust record"));
  check("my profile → profile", intents.isProfileCommand("my profile"));
  check("my account → profile", intents.isProfileCommand("my account"));
  check("account info → profile", intents.isProfileCommand("account info"));
  check("profile → profile", intents.isProfileCommand("profile"));
  check("bank details not profile", !intents.isProfileCommand("bank details"));
  check("my listing → listings", intents.isMyListingsCommand("my listing"));
  check("show my offers → listings", intents.isMyListingsCommand("show my offers"));
  check("offers i posted → listings", intents.isMyListingsCommand("offers i posted"));
  check("my ads → listings", intents.isMyListingsCommand("my ads"));
  check("my transactions → history", intents.isHistoryCommand("my transactions"));
  check("trade history → history", intents.isHistoryCommand("trade history"));
  check("show my records → history", intents.isHistoryCommand("show my records"));
  check("find offers not listings", !intents.isMyListingsCommand("find offers"));
  check("delete all payouts not payouts view", !intents.isPayoutsCommand("delete all my payouts"));
  check("https listing links enable WhatsApp previews", containsPreviewableUrl("Open https://www.tryakara.com/l/AKR-LIST-001"));
  check("ordinary chat does not request a link preview", !containsPreviewableUrl("Show me my listings"));

  // ---------- shared WhatsApp message formatting
  scenario("message formatting");
  const formattedMessage = formatMessageLayout([
    "*Offer summary*",
    "*You send:* 50,000 NGN",
    "*You receive:* 55,000 RWF",
    "",
    "",
    "`publish` to continue",
  ].join("\n"));
  check(
    "consecutive information fields have breathing room",
    formattedMessage.includes("*You send:* 50,000 NGN\n\n*You receive:* 55,000 RWF"),
    formattedMessage
  );
  check("excess blank lines are collapsed", !formattedMessage.includes("\n\n\n"), formattedMessage);
  check("actions are separated from information", formattedMessage.includes("55,000 RWF\n\n`publish`"), formattedMessage);

  // ---------- mobile money number formatting
  scenario("mobile money number formatting");
  check(
    "Rwanda international number becomes local format",
    normalizeMobileMoneyNumber("RWF", "+250 788 123 456").number === "0788123456"
  );
  check(
    "Rwanda 00 country code becomes local format",
    normalizeMobileMoneyNumber("RWF", "00250 788 123 456").number === "0788123456"
  );
  check(
    "Kenya international number becomes local format",
    normalizeMobileMoneyNumber("KES", "+254 712 345 678").number === "0712345678"
  );
  check(
    "Ghana country code without plus becomes local format",
    normalizeMobileMoneyNumber("GHS", "233 24 123 4567").number === "0241234567"
  );
  check(
    "Cameroon international number becomes nine local digits",
    normalizeMobileMoneyNumber("XAF", "+237 670 123 456").number === "670123456"
  );
  check(
    "Nigeria international number becomes eleven local digits",
    normalizeMobileMoneyNumber("NGN", "+234 803 123 4567").number === "08031234567"
  );
  check(
    "short Rwanda number is rejected",
    normalizeMobileMoneyNumber("RWF", "07881234").reason === "short"
  );
  check(
    "wrong international country code is rejected",
    normalizeMobileMoneyNumber("RWF", "+254 712 345 678").reason === "wrong_country"
  );
  check(
    "mobile number prompt keeps backend normalization invisible",
    !mobileMoneyNumberPrompt("KES").toLowerCase().includes("country code"),
    mobileMoneyNumberPrompt("KES")
  );
  const longKenyanNumber = normalizeMobileMoneyNumber("KES", "071234567890");
  check(
    "mobile number error explains the country format without technical processing copy",
    mobileMoneyNumberPrompt("KES", longKenyanNumber).includes("longer than a Kenya mobile money number")
      && !mobileMoneyNumberPrompt("KES", longKenyanNumber).includes("after formatting"),
    mobileMoneyNumberPrompt("KES", longKenyanNumber)
  );

  // ---------- unverified journey
  scenario("unverified journey");
  let reply = await send(ALICE, "hi");
  check("unverified greeting is conversational", reply.includes("Hi Test") && reply.includes("Complete verification"), reply);
  check("unverified greeting keeps verification CTA", lastButtonBody().includes("Complete verification"), lastButtonBody());

  reply = await send(ALICE, "my profile");
  check("unverified profile is scoped", reply.includes("*Your profile*"), reply);
  check("unverified profile shows status", reply.includes("Not verified"), reply);

  reply = await send(ALICE, "verify");
  check("verify starts flow", reply.includes("legal name"), reply);

  reply = await send(ALICE, "Alice Tester");
  check("legal name accepted", reply.toLowerCase().includes("nationality"), reply);

  reply = await send(ALICE, "find offers", { interpret: { action: "find_offer" } });
  check("mid-verification wall keeps data", reply.includes("Verification comes first"), reply);
  check("verification flow retained", (await sessionFlow(ALICE)) === "verification");

  reply = await send(ALICE, "Nigeria");
  check("verification continues after interrupt", reply.toLowerCase().includes("country"), reply);

  // Verification requires ID photo uploads (needs WhatsApp media APIs), so
  // the remaining steps are approved directly in the fake DB.
  const aliceRow = __table("users").find((row) => row.whatsapp_phone === ALICE);
  Object.assign(aliceRow, { verification_status: "verified_manual", verification_score: 90, completed_deals_count: 3 });
  const profileCounterparty = seedVerifiedUser("250700000099", "Counter Party");
  const completedProfileDeals = [
    seedCompletedDeal(aliceRow, profileCounterparty, { deal_code: "AKR-TXN-P01" }),
    seedCompletedDeal(profileCounterparty, aliceRow, { deal_code: "AKR-TXN-P02" }),
    seedCompletedDeal(aliceRow, profileCounterparty, { deal_code: "AKR-TXN-P03" }),
  ];
  await send(ALICE, "cancel");
  seedPayout(aliceRow, "NGN");
  seedPayout(aliceRow, "RWF");

  // ---------- scoped views
  scenario("scoped views");
  reply = await send(ALICE, "menu");
  check("menu shows core options", reply.includes("`make offer`") && reply.includes("`find offers`"), JSON.stringify({ reply, body: lastListBody() }));

  reply = await send(ALICE, "profile");
  check("profile view title", reply.includes("*Your profile*"), reply);
  check("profile shows completed trades", reply.includes("Completed trades"), reply);
  check("profile counts completed deals from records", reply.includes("*Completed trades:* 3"), reply);
  check("profile has no bank numbers", !reply.includes("0123456789"), reply);
  check("profile has no payout list", !reply.includes("*Payouts*"), reply);
  const profileRows = (lastListPayload()?.sections || []).flatMap((section) => section.rows || []);
  const profileActionIds = profileRows.map((row) => row.id);
  check("profile uses one native management tray", lastListPayload()?.button === "Manage profile", JSON.stringify(lastListPayload()));
  check(
    "profile tray contains the core payout and listing actions",
    [
      "profile_add_payout",
      "profile_delete_payout",
      "profile_delete_all_payouts",
      "profile_pause_all_listings",
      "profile_reopen_all_listings",
      "profile_close_all_listings",
    ].every((id) => profileActionIds.includes(id)),
    JSON.stringify(profileActionIds)
  );
  check(
    "profile tray has one canonical close-all action",
    profileActionIds.filter((id) => id === "profile_close_all_listings").length === 1
      && !profileRows.some((row) => /cancel all listings/i.test(row.title || "")),
    JSON.stringify(profileRows)
  );
  check(
    "profile action descriptions speak in the user's voice",
    profileRows.find((row) => row.id === "profile_add_payout")?.description.startsWith("I want to")
      && profileRows.find((row) => row.id === "profile_listings")?.description.startsWith("I want to"),
    JSON.stringify(profileRows)
  );
  check(
    "profile body does not repeat tray actions as text",
    !reply.includes("cancel all listings")
      && !reply.includes("delete all payouts")
      && !reply.includes("*See more*"),
    reply
  );

  reply = await send(ALICE, "my trust record");
  check("trust record opens its own view", reply.includes("*Akara Trust Record*") || reply.includes("*Your trust record*"), reply);
  check("trust record does not resend profile", !reply.includes("*Your profile*"), reply);
  check("trust record shows concise activity", reply.includes("Completed trades") && reply.includes("Completion rate"), reply);
  check("trust record uses restrained visual cues", reply.includes("✅") && reply.includes("📈") && reply.includes("⚠️"), reply);
  check(
    "trust record keeps each label and value on one row",
    /\*🏅 Trust level:\*\s+\w+/.test(reply)
      && /\*✅ Completed trades:\*\s+\d+/.test(reply)
      && /\*📈 Completion rate:\*\s+\d+%/.test(reply)
      && /\*⚠️ Open disputes:\*\s+\d+/.test(reply),
    reply
  );
  check(
    "trust record omits unnecessary hidden-data disclaimer",
    !reply.includes("phone number") && !reply.includes("payout detail") && !reply.includes("transaction amount"),
    reply
  );

  reply = await send(ALICE, "my trust record", {
    interpret: { action: "view_profile", answer: "Here is your profile." },
  });
  check("trust record wording overrides a generic profile classification", !reply.includes("*Your profile*"), reply);

  reply = await send(ALICE, "How do I move my Akara account to a new phone?");
  check(
    "device migration keeps the same-number account intact",
    reply.includes("same WhatsApp number") && reply.includes("do not need to verify again"),
    reply
  );

  reply = await send(ALICE, "Please move my Akara account to my new WhatsApp number");
  check("new-number migration opens a protected support review", reply.includes("*Support request received*"), reply);
  check(
    "new-number migration reaches the admin queue with its own category",
    __table("audit_events").some((row) =>
      row.entity_type === "support_request"
      && row.event_payload?.category === "account_migration"
    ),
    JSON.stringify(__table("audit_events").filter((row) => row.entity_type === "support_request"))
  );

  await rememberFailedMessage(aliceRow, ALICE, { text: "my trust record", type: "text" });
  await rememberFailedMessage(aliceRow, ALICE, { text: "retry_last_message", type: "text" });
  check(
    "a failed retry cannot replace the original saved request",
    (await getSession(ALICE))?.context_json?.pending_retry?.incoming?.text === "my trust record",
    JSON.stringify(await getSession(ALICE))
  );
  reply = await send(ALICE, "retry_last_message");
  check("retry resumes the saved action from its original context", reply.includes("Trust Record") || reply.includes("trust record"), reply);
  check("successful retry clears the saved failure", !(await getSession(ALICE))?.context_json?.pending_retry, JSON.stringify(await getSession(ALICE)));

  const staleRetrySession = await getSession(ALICE);
  staleRetrySession.context_json = {
    ...(staleRetrySession.context_json || {}),
    pending_retry: {
      incoming: { text: "retry_last_message", type: "text", media: null, quotedText: "" },
      failed_at: new Date().toISOString(),
    },
  };
  reply = await send(ALICE, "retry_last_message");
  check("a stale self-referencing retry terminates safely", reply.includes("*Nothing waiting to retry*") && reply.includes("stale"), reply);
  check("stale retry state is cleared", !(await getSession(ALICE))?.context_json?.pending_retry, JSON.stringify(await getSession(ALICE)));

  reply = await send(ALICE, "okay thanks");
  check("session closure is conversational", reply.includes("You are welcome, Test"), reply);
  check("session closure gives one concise nudge", reply.includes("What would you like to do next?"), reply);
  check(
    "session closure embeds the native menu without static menu copy",
    lastListPayload()?.sections?.[0]?.rows?.length === 6
      && !reply.includes("1. `make offer`")
      && !reply.includes("Choose what you want to do next on Akara"),
    JSON.stringify({ reply, list: lastListPayload() })
  );
  removeSeededDeals(completedProfileDeals);

  reply = await send(ALICE, "hello", {
    interpret: { action: "greeting", answer: "Hi there." },
  });
  check(
    "verified greeting explains Akara's value before the menu",
    reply.includes("check live offers first")
      && reply.includes("organized here in WhatsApp"),
    reply
  );
  check(
    "verified greeting keeps one embedded native menu",
    lastListPayload()?.sections?.[0]?.rows?.length === 6,
    JSON.stringify(lastListPayload())
  );

  reply = await send(ALICE, "What can I do on Akara?", {
    interpret: { action: "question", answer: "You can use Akara for currency exchange." },
  });
  check("capabilities question gets a concise product answer", reply.includes("*What you can do on Akara*") && reply.includes("inside WhatsApp"), reply);
  check(
    "capabilities question embeds the native menu tray",
    lastListPayload()?.sections?.[0]?.rows?.length === 6
      && lastListPayload()?.sections?.[0]?.rows?.some((row) => row.id === "find_offers"),
    JSON.stringify(lastListPayload())
  );
  check("capabilities answer does not repeat the static menu", !reply.includes("1. `make offer`"), reply);

  reply = await send(ALICE, "I am new here and honestly do not know where to begin", {
    interpret: {
      action: "unknown",
      answer: "No pressure. I can help you find an exchange or organize one of your own.",
    },
  });
  check("open-ended orientation language receives a useful answer", reply.includes("No pressure"), reply);
  check(
    "open-ended orientation language receives the native menu without phrase matching",
    lastListPayload()?.sections?.[0]?.rows?.length === 6,
    JSON.stringify(lastListPayload())
  );

  await send(ALICE, "payouts", { interpret: { action: "view_payouts" } });
  check("payout view establishes a settings context", (await sessionFlow(ALICE)) === "settings");
  reply = await send(ALICE, "Why do people use peer exchange?", {
    interpret: {
      action: "question",
      answer: "People often use peer exchange to find terms that fit how they already move money.",
    },
  });
  check("a general answer can leave non-resumable settings context", reply.includes("People often use peer exchange"), reply);
  check(
    "a general answer after settings carries the native menu",
    lastListPayload()?.sections?.[0]?.rows?.length === 6,
    JSON.stringify(lastListPayload())
  );
  check("non-resumable settings context is cleared after conversational steering", (await sessionFlow(ALICE)) === null);

  // ---------- inactivity menu nudge
  scenario("inactivity menu nudge");
  const IDLE = "250700000004";
  const idleUser = seedVerifiedUser(IDLE, "Idle User");
  const idleTime = new Date(Date.now() - 6 * 60 * 1000).toISOString();
  __table("message_sessions").push({
    id: crypto.randomUUID(),
    user_id: idleUser.id,
    whatsapp_phone: IDLE,
    current_flow: null,
    current_step: null,
    context_json: {},
    last_message_at: idleTime,
    created_at: idleTime,
  });
  const idleResult = await sendIdleMenus({ now: new Date(), idleMs: 5 * 60 * 1000, limit: 10 });
  const idleSession = __table("message_sessions").find((row) => row.whatsapp_phone === IDLE);
  check("idle scan sends one menu", idleResult.sent === 1, JSON.stringify(idleResult));
  check("idle scan marks the session", Boolean(idleSession?.context_json?.idle_menu_sent_at), JSON.stringify(idleSession));
  const idleRepeat = await sendIdleMenus({ now: new Date(), idleMs: 5 * 60 * 1000, limit: 10 });
  check("idle scan does not repeat before new activity", idleRepeat.sent === 0, JSON.stringify(idleRepeat));

  reply = await send(ALICE, "bank details");
  check("payouts view title", reply.includes("Bank & payout details"), reply);
  check("payouts view shows bank", reply.includes("GTBank"), reply);
  check("payouts view has no listings", !reply.includes("*Listings*"), reply);
  check(
    "payouts view uses native actions",
    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "manage_payout_add,manage_payout_edit,manage_payout_delete",
    JSON.stringify(lastButtonPayload())
  );

  reply = await send(ALICE, "manage_payout_edit");
  check("edit payout action opens account picker", reply.includes("Choose the payout detail you want to edit"), reply);
  check(
    "edit payout picker lists saved accounts",
    (lastListPayload()?.sections?.[0]?.rows || []).length === 2,
    JSON.stringify(lastListPayload())
  );
  await send(ALICE, "menu");

  reply = await send(ALICE, "my listings");
  check("listings view empty state", reply.includes("No listings yet"), reply);

  reply = await send(ALICE, "my transactions");
  check("history synonym works", reply.includes("No transaction history yet"), reply);
  check(
    "empty history offers one-tap marketplace browsing",
    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "find offers",
    JSON.stringify(lastButtonPayload())
  );

  reply = await send(ALICE, "find offers");
  check("empty history button opens all offers", reply.includes("*All live offers*") || reply.includes("*No live offers yet*"), reply);
  await send(ALICE, "cancel");

  // ---------- conversational account overviews
  scenario("conversational account overviews");
  const OVERVIEW_USER = "250700000024";
  const overviewUser = seedVerifiedUser(OVERVIEW_USER, "Overview User");
  seedPayout(overviewUser, "NGN");
  seedPayout(overviewUser, "RWF");
  const overviewStatuses = [
    "active", "active", "active", "active",
    "paused", "paused",
    "reserved",
    "cancelled", "cancelled", "completed", "expired",
  ];
  overviewStatuses.forEach((status, index) => {
    seedListing(overviewUser, {
      code: `AKR-LIST-8${String(index).padStart(2, "0")}`,
      have_currency: index % 2 ? "NGN" : "RWF",
      have_amount: 10000 + index,
      want_currency: index % 2 ? "RWF" : "NGN",
      want_amount: 12000 + index,
      status,
      created_at: new Date(Date.now() - index * 1000).toISOString(),
    });
  });
  const overviewCompletedDeal = seedCompletedDeal(overviewUser, aliceRow, {
    deal_code: "AKR-TXN-OVERVIEW",
  });
  const overviewCompletedListingIndex = __table("listings")
    .findIndex((listing) => listing.id === overviewCompletedDeal.listing_id);
  if (overviewCompletedListingIndex >= 0) __table("listings").splice(overviewCompletedListingIndex, 1);

  reply = await send(OVERVIEW_USER, "Can I see all my listings?", {
    interpret: { action: "question", answer: "Here are your listings. What would you like to do next?" },
  });
  check("natural all-listings request opens the real listing picker", lastListPayload()?.button === "Choose listing" && reply.includes("*Your listings*"), JSON.stringify(lastListPayload()));
  check("generic model copy cannot replace the real listing records", !reply.includes("What would you like to do next?"), reply);
  check(
    "listing overview reports real status counts",
    reply.includes("*Total listings:* 11")
      && reply.includes("*🟢 Live:* 4")
      && reply.includes("*⏸️ Paused:* 2")
      && reply.includes("*🔒 In trade:* 1")
      && reply.includes("*⚫ Closed:* 3")
      && reply.includes("*✅ Completed listings:* 1")
      && reply.includes("*✅ Completed exchanges:* 1"),
    reply
  );
  const overviewRows = (lastListPayload()?.sections || []).flatMap((section) => section.rows || []);
  check("long listing history provides a native see-more action", overviewRows.length === 10 && overviewRows.at(-1)?.id === "my_listings_page_1", JSON.stringify(lastListPayload()));

  reply = await send(OVERVIEW_USER, "my_listings_page_1");
  check("listing pagination returns the remaining records", reply.includes("Showing 10-11 of 11"), reply);

  reply = await send(OVERVIEW_USER, "How many listings do I have live?", {
    interpret: { action: "question", answer: "Let me check that for you." },
  });
  check("listing count question returns the account overview", reply.includes("*🟢 Live listings:* 4") && !reply.includes("Let me check"), reply);

  reply = await send(OVERVIEW_USER, "How many payout details do I have set up on Akara?", {
    interpret: { action: "question", answer: "You have some payout accounts." },
  });
  check("payout count question returns the real saved count", reply.includes("*🏦 Saved payout details:* 2"), reply);
  check("payout count question stays concise", !reply.includes("NGN bank account") && !reply.includes("RWF mobile money"), reply);

  reply = await send(
    OVERVIEW_USER,
    "How many listings do I have opened and how many payout details do I have saved?",
    { interpret: { action: "view_payouts", answer: "You have two payout details." } }
  );
  check(
    "compound account question answers every requested clause",
    reply.includes("*🟢 Live listings:* 4")
      && reply.includes("*🏦 Saved payout details:* 2"),
    reply
  );
  check(
    "compound account answer offers both detailed views",
    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "my_listings,view_payouts,main_menu",
    JSON.stringify(lastButtonPayload())
  );

  reply = await send(OVERVIEW_USER, "view_payouts");
  check("compound overview payout button opens the saved payout records", reply.includes("*Bank & payout details*") && reply.includes("*Total saved:* 2"), reply);

  reply = await send(OVERVIEW_USER, "How many closed listings do I have?", {
    interpret: { action: "question", answer: "Let me look at your listings." },
  });
  check("status-specific count answers only the requested listing state", reply.includes("*⚫ Closed listings:* 3"), reply);
  check("status-specific count avoids an unnecessary full listing dump", !reply.includes("*Total listings:*"), reply);

  for (const tableName of ["listings", "deals"]) {
    const rows = __table(tableName);
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];
      if (row.owner_user_id === overviewUser.id || row.maker_user_id === overviewUser.id || row.taker_user_id === overviewUser.id) {
        rows.splice(index, 1);
      }
    }
  }

  reply = await send(ALICE, "1");
  check("typed menu 1 opens make offer", reply.includes("Tell me what currency you have"), reply);
  await send(ALICE, "cancel");

  reply = await send(ALICE, "2");
  check("typed menu 2 browses offers", reply.includes("*All live offers*") || reply.includes("*No live offers yet*"), reply);
  await send(ALICE, "cancel");

	  reply = await send(ALICE, "5", { quotedText: "*Akara menu*\n1. make offer" });
	  check("quoted menu 5 → scoped profile", reply.includes("*Your profile*"), reply);

	  reply = await send(ALICE, "menu");
	  check("menu includes get support", reply.includes("6. `get support`"), reply);
	  const menuRows = lastListPayload()?.sections?.[0]?.rows || [];
	  check(
	    "menu descriptions use the user's voice",
	    menuRows.find((row) => row.id === "make_offer")?.description === "I want to create a listing people can take."
	      && menuRows.find((row) => row.id === "my_listings")?.description === "I want to manage the offers I posted.",
	    JSON.stringify(menuRows)
	  );

	  reply = await send(ALICE, "6");
	  check("typed menu 6 opens support channels", reply.includes("support@tryakara.com") && reply.includes("tryakara.com/support"), reply);
	  check(
	    "support menu uses clear native actions",
	    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "support_email,support_report,support_dispute",
	    JSON.stringify(lastButtonPayload())
	  );

	  reply = await send(ALICE, "get_support", {
	    interpret: { action: "question", answer: "Akara is free to use for swapping currencies." },
	  });
	  check("support menu action cannot be hijacked by fee copy", reply.includes("*Akara support*") && !reply.includes("free to use"), reply);

	  reply = await send(ALICE, "contact support");
	  check("natural support request opens email", reply.includes("support@tryakara.com"), reply);

	  reply = await send(ALICE, "I have an issue and need an admin to look into it");
	  check("frustrated help request creates support record", reply.includes("*Support request received*"), reply);
	  check(
	    "support request reaches admin queue",
	    __table("audit_events").some((row) =>
	      row.entity_type === "support_request"
	      && row.event_payload?.description.includes("need an admin")
	    ),
	    JSON.stringify(__table("audit_events").filter((row) => row.entity_type === "support_request"))
	  );

	  reply = await send(ALICE, "I need an admin to resolve this dispute: 10k NGN for 12k RWF and 20k GHS for 30k XAF");
	  check("explicit dispute context still routes to support", reply.includes("*Support request received*"), reply);

	  reply = await send(ALICE, "report issue");
	  check("report issue asks for one concise message", reply.includes("*Report an issue*"), reply);
	  reply = await send(ALICE, "My payout account update is stuck");
	  check("support flow saves the submitted issue", reply.includes("*Support request received*"), reply);

	  // ---------- service fee + referral copy
  scenario("service fee copy");
  reply = await send(ALICE, "how much do you charge?");
  check("fee answer stays simple", reply.includes("Akara is free to use") && !reply.includes("10 more free trades"), reply);
  check("fee answer not 'free for now'", !reply.toLowerCase().includes("free for now"), reply);

  reply = await send(ALICE, "how do i get free trades?");
  check("referral question answered", reply.includes("Invite a friend or refer a friend"), reply);

  scenario("receipt evidence parser");
  let receiptCheck = await analyzeReceiptEvidence(
    { amount: 80000, currency: "NGN" },
    { text: "Paid ₦80,000 to First Bank" }
  );
  check("receipt parser matches amount and currency", receiptCheck.ocr_status === "matched", JSON.stringify(receiptCheck));

  receiptCheck = await analyzeReceiptEvidence(
    { amount: 80000, currency: "NGN" },
    { text: "Paid 70,000 NGN" }
  );
  check("receipt parser rejects mismatched amount", receiptCheck.ocr_status === "mismatch", JSON.stringify(receiptCheck));

  receiptCheck = await analyzeReceiptEvidence(
    { amount: 80000, currency: "NGN" },
    { text: "Transfer successful\nAmount NGN 80,000\nAccount 0123456789\nReference 20260726001" }
  );
  check(
    "receipt parser finds the locked amount among account and reference numbers",
    receiptCheck.ocr_status === "matched" && Number(receiptCheck.ocr_amount) === 80000,
    JSON.stringify(receiptCheck)
  );

  receiptCheck = await analyzeReceiptEvidence(
    { amount: 80000, currency: "NGN" },
    { text: "Transfer failed\nAmount NGN 80,000" }
  );
  check("receipt parser rejects failed payment status", receiptCheck.ocr_status === "mismatch", JSON.stringify(receiptCheck));

  const mpesaReceiptText = [
    "Transaction Successful",
    "Jul 25, 2026",
    "2:17 PM",
    "Amount Paid",
    "KES 13,000.00",
    "Sent to 0704030385",
    "Phone Number 0704030385",
    "Amount KES 13,000.00",
    "Transaction ID QX3W7ZL0J7",
    "Completed",
    "You have successfully sent KES 13,000.00 to 0704030385.",
  ].join("\n");
  receiptCheck = await analyzeReceiptEvidence(
    { amount: 12000, currency: "KES" },
    { text: mpesaReceiptText }
  );
  check(
    "M-Pesa mismatch reports the currency-labelled amount rather than phone or date digits",
    receiptCheck.ocr_status === "mismatch"
      && receiptCheck.ocr_mismatch_reason.includes("13,000 KES")
      && !receiptCheck.ocr_mismatch_reason.includes("704,030,385"),
    JSON.stringify(receiptCheck)
  );

  receiptCheck = await analyzeReceiptEvidence(
    { amount: 80000, currency: "NGN" },
    { media: { id: "m1", filename: "receipt.png" } }
  );
  check("receipt parser keeps image-only receipt pending", receiptCheck.ocr_status === "pending", JSON.stringify(receiptCheck));

  receiptCheck = await analyzeReceiptEvidence(
    { amount: 80000, currency: "NGN" },
    {
      text: "Paid 80,000 NGN",
      media: { id: "m2", filename: "receipt-80000-ngn.png", mimeType: "image/png" },
    }
  );
  check("receipt caption cannot substitute for image OCR", receiptCheck.ocr_status === "pending", JSON.stringify(receiptCheck));

  // ---------- one-shot listing creation + publish + free service fee in review
  scenario("one-shot listing");
  reply = await send(ALICE, "hello, I have 50k naira and want 55k RWF");
  check("greeting with offer is not welcome", !reply.includes("What would you like Akara to help you move"), reply);
  check("greeting with offer previews listing", reply.includes("*Review listing*"), reply);
  check("review shows free service fee", reply.includes("*Service fee:* Free"), reply);

  reply = await send(ALICE, "publish");
  check("publish makes listing live", reply.includes("live ✅"), reply);
  check("live copy shows free service fee", reply.includes("*Service fee:* Free"), reply);
  check("session cleared after publish", (await sessionFlow(ALICE)) === null);

  reply = await send(ALICE, "my listings");
  check(
    "listing appears in scoped view",
    (lastListPayload()?.sections || []).some((section) =>
      (section.rows || []).some((row) => String(row.title || "").includes("AKR-LIST-001"))
    ),
    JSON.stringify(lastListPayload())
  );

  reply = await send(ALICE, "I have 50k naira and want 55k RWF");
  check("duplicate live listing is blocked", reply.includes("*Listing already live*"), reply);
  check("duplicate listing points to existing reference", reply.includes("AKR-LIST-001"), reply);
  check("duplicate listing does not open review", !reply.includes("*Review listing*"), reply);
  check(
    "duplicate listing offers concise native next steps",
    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "my_listings,find_offers",
    JSON.stringify(lastButtonPayload())
  );

  // ---------- bulk listing creation
  scenario("bulk listing creation");
  const parsedBulkListings = parseBulkListingDetails(
    "I have 61k NGN and want 72k RWF; I need 90k NGN and have 80k RWF"
  );
  check("bulk parser finds both listings", parsedBulkListings.length === 2, JSON.stringify(parsedBulkListings));
  check(
    "bulk parser preserves directional language",
    parsedBulkListings[1]?.have_currency === "RWF"
      && parsedBulkListings[1]?.have_amount === 80000
      && parsedBulkListings[1]?.want_currency === "NGN"
      && parsedBulkListings[1]?.want_amount === 90000,
    JSON.stringify(parsedBulkListings)
  );
  check(
    "bulk terms default to negotiable",
    parsedBulkListings.every((listing) => listing.listing_type === "negotiable"),
    JSON.stringify(parsedBulkListings)
  );
  const inheritedBulkListings = parseBulkListingDetails(
    "Create 50k NGN for 55k RWF; 60k for 66k; 70k for 77k"
  );
  check(
    "bulk parser inherits the first currency pair across shorthand items",
    inheritedBulkListings.length === 3
      && inheritedBulkListings[1]?.have_currency === "NGN"
      && inheritedBulkListings[1]?.have_amount === 60000
      && inheritedBulkListings[1]?.want_currency === "RWF"
      && inheritedBulkListings[1]?.want_amount === 66000
      && inheritedBulkListings[2]?.have_amount === 70000
      && inheritedBulkListings[2]?.want_amount === 77000,
    JSON.stringify(inheritedBulkListings)
  );
  const numberedBulkListings = parseBulkListingDetails(
    "Create 3 offers NGN to RWF:\n1. 50k for 55k\n2. 60k for 66k\n3. 70k for 77k"
  );
  check(
    "bulk parser ignores batch counts and numbered-list labels",
    numberedBulkListings.length === 3
      && numberedBulkListings.map((listing) => listing.have_amount).join(",") === "50000,60000,70000"
      && numberedBulkListings.map((listing) => listing.want_amount).join(",") === "55000,66000,77000",
    JSON.stringify(numberedBulkListings)
  );
  const naturalTenOfferMessage = "Hi Akara, got a few exchanges I'm trying to sort out. I have **RWF 6,500,000** and I'm looking for **₦780,000**. I also have **GHS 15,000** and I need **KES 175,000**. Looking to swap **XAF 2,200,000** for **RWF 5,100,000**. I have **KES 95,000** and I'd like **₦1,050,000**. Another one, I have **₦850,000** and I'm looking for **GHS 11,500**. I've also got **RWF 3,800,000** and I want **XAF 1,650,000**. I have **KES 140,000** available if anyone can do **RWF 1,750,000**. I also have **GHS 8,500** and I'm after **XAF 1,900,000**. Looking to exchange **XAF 4,500,000** for **KES 165,000**, and finally I have **₦2,000,000** that I'd like to swap for **RWF 1,250,000**. Everything is ready from my side, so if any of these work for you, let's trade.";
  const naturalTenListings = parseBulkListingDetails(naturalTenOfferMessage);
  check("natural paragraph parser finds all ten offers", naturalTenListings.length === 10, JSON.stringify(naturalTenListings));
  check(
    "naira symbols remain attached to their four offers",
    naturalTenListings[0]?.want_currency === "NGN"
      && naturalTenListings[0]?.want_amount === 780000
      && naturalTenListings[3]?.want_currency === "NGN"
      && naturalTenListings[3]?.want_amount === 1050000
      && naturalTenListings[4]?.have_currency === "NGN"
      && naturalTenListings[4]?.have_amount === 850000
      && naturalTenListings[9]?.have_currency === "NGN"
      && naturalTenListings[9]?.have_amount === 2000000,
    JSON.stringify(naturalTenListings)
  );

  const BULK_ROUTING = "250700000015";
  const bulkRoutingUser = seedVerifiedUser(BULK_ROUTING, "Bulk Routing User");
  seedPayout(bulkRoutingUser, "NGN");
  seedPayout(bulkRoutingUser, "RWF");
  reply = await send(BULK_ROUTING, "I want to create a bulk offer", {
    interpret: { action: "get_support" },
  });
  check("bulk start request opens concise batch guidance", reply.includes("*Create listings in bulk*"), reply);
  check("bulk guidance explains mixed currency pairs", reply.includes("30k KES for 4.2m RWF") && reply.includes("20k GHS for 300k XAF"), reply);
  check("bulk start request cannot be misrouted to support", !reply.includes("*Akara support*"), reply);
  const tenListingMessage = [
    "Can someone help me create these NGN to RWF listings:",
    ...Array.from({ length: 10 }, (_, index) =>
      `${11 + index}k for ${21 + index}k`
    ),
  ].join("; ");
  const supportEventsBeforeBulkRouting = __table("audit_events").filter((row) => row.entity_type === "support_request").length;
  reply = await send(BULK_ROUTING, tenListingMessage, {
    interpret: { action: "get_support" },
  });
  check("ten-listing message opens one bulk review", reply.includes("*Review 10 listings*"), reply);
  check("generic help wording cannot hijack bulk creation", !reply.includes("*Support request received*") && !reply.includes("*Akara support*"), reply);
  check(
    "misclassified bulk message does not create a support record",
    __table("audit_events").filter((row) => row.entity_type === "support_request").length === supportEventsBeforeBulkRouting,
    JSON.stringify(__table("audit_events").filter((row) => row.entity_type === "support_request"))
  );
  reply = await send(BULK_ROUTING, "cancel");
  check("ten-listing review can be cancelled", (await sessionFlow(BULK_ROUTING)) === null);

  const NATURAL_BULK = "250700000022";
  const naturalBulkUser = seedVerifiedUser(NATURAL_BULK, "Natural Bulk User");
  for (const currency of ["NGN", "RWF", "GHS", "KES", "XAF"]) {
    seedPayout(naturalBulkUser, currency);
  }
  reply = await send(NATURAL_BULK, naturalTenOfferMessage, {
    interpret: { action: "find_offer" },
  });
  check("complete natural paragraph overrides a mistaken search classification", reply.includes("*Review 10 listings*"), reply);
  const naturalBulkSession = await getSession(NATURAL_BULK);
  check("all ten natural offers reach the combined review state", naturalBulkSession?.context_json?.listings?.length === 10, JSON.stringify(naturalBulkSession));
  reply = await send(NATURAL_BULK, "cancel");
  check("natural ten-offer review can be cancelled", (await sessionFlow(NATURAL_BULK)) === null);

  const EXPLICIT_BULK_SEARCH = "250700000023";
  const explicitBulkSearchUser = seedVerifiedUser(EXPLICIT_BULK_SEARCH, "Explicit Search User");
  seedPayout(explicitBulkSearchUser, "NGN");
  seedPayout(explicitBulkSearchUser, "RWF");
  seedPayout(explicitBulkSearchUser, "GHS");
  seedPayout(explicitBulkSearchUser, "XAF");
  reply = await send(
    EXPLICIT_BULK_SEARCH,
    "Find offers for 50k NGN for 55k RWF and 20k GHS for 300k XAF",
    { interpret: { action: "find_offer" } }
  );
  check("an explicit multi-pair marketplace search is not published as a batch", !reply.includes("*Review 2 listings*") && (await sessionFlow(EXPLICIT_BULK_SEARCH)) !== "bulk_listing", reply);

  const BULK_SHORTHAND = "250700000021";
  const bulkShorthandUser = seedVerifiedUser(BULK_SHORTHAND, "Bulk Shorthand User");
  seedPayout(bulkShorthandUser, "GHS");
  seedPayout(bulkShorthandUser, "XAF");
  const shorthandListingCount = __table("listings").length;
  reply = await send(
    BULK_SHORTHAND,
    "Create 101k GHS for 121k XAF; 102k for 122k; 103k for 123k"
  );
  check("shorthand bulk request reviews all provided offers", reply.includes("*Review 3 listings*"), reply);
  reply = await send(BULK_SHORTHAND, "publish");
  const shorthandCreated = __table("listings").slice(shorthandListingCount);
  check("shorthand bulk publication creates every offer", shorthandCreated.length === 3, JSON.stringify(shorthandCreated));
  check(
    "shorthand bulk publication preserves every amount pair",
    shorthandCreated.map((listing) => `${listing.have_amount}:${listing.want_amount}`).join(",")
      === "101000:121000,102000:122000,103000:123000",
    JSON.stringify(shorthandCreated)
  );
  shorthandCreated.forEach((listing) => {
    listing.status = "closed";
  });

  const listingCountBeforeBulk = __table("listings").length;
  reply = await send(ALICE, "Create 61k NGN for 72k RWF; I have 80k RWF and want 90k NGN");
  check("bulk request opens one combined review", reply.includes("*Review 2 listings*"), reply);
  check("bulk request enters its own confirmation flow", (await sessionFlow(ALICE)) === "bulk_listing");
  check(
    "bulk review uses publish and cancel buttons",
    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "publish_bulk,cancel",
    JSON.stringify(lastButtonPayload())
  );

  reply = await send(ALICE, "publish_bulk");
  const bulkPublishReply = Array.isArray(reply) ? reply.join("\n") : String(reply || "");
  const bulkCreated = __table("listings").slice(listingCountBeforeBulk);
  check("one confirmation publishes every bulk item", bulkCreated.length === 2, JSON.stringify(bulkCreated));
  check("bulk listings receive different references", new Set(bulkCreated.map((listing) => listing.listing_code)).size === 2, JSON.stringify(bulkCreated));
  check("bulk listings stay negotiable by default", bulkCreated.every((listing) => listing.listing_type === "negotiable"), JSON.stringify(bulkCreated));
  check("bulk publish confirms both live listings", bulkPublishReply.includes("Listing 1 of 2") && bulkPublishReply.includes("Listing 2 of 2"), bulkPublishReply);
  check("bulk session clears after publish", (await sessionFlow(ALICE)) === null);

  const listingCountBeforeMixedBatch = __table("listings").length;
  reply = await send(ALICE, "List 61k NGN for 72k RWF; 95k NGN for 105k RWF");
  check("mixed bulk request keeps the distinct item", reply.includes("*Review 1 listing*"), reply);
  check("mixed bulk request identifies the live duplicate", reply.includes("*1 duplicate skipped*"), reply);
  check("mixed bulk request shows the existing reference", reply.includes(bulkCreated[0].listing_code), reply);
  reply = await send(ALICE, "publish all");
  check("mixed bulk request publishes only the distinct item", __table("listings").length === listingCountBeforeMixedBatch + 1, JSON.stringify(__table("listings").slice(listingCountBeforeMixedBatch)));

  const listingCountBeforeRepeatedBatch = __table("listings").length;
  reply = await send(ALICE, "Post 33k NGN for 44k RWF; 33k NGN for 44k RWF");
  check("within-message duplicate is shown before publication", reply.includes("Same as item 1"), reply);
  reply = await send(ALICE, "put them live");
  check("natural bulk publication language is understood", String(Array.isArray(reply) ? reply.join("\n") : reply).includes("is live"), JSON.stringify(reply));
  check("within-message duplicate is published once", __table("listings").length === listingCountBeforeRepeatedBatch + 1, JSON.stringify(__table("listings").slice(listingCountBeforeRepeatedBatch)));

  const listingCountBeforeDuplicateBatch = __table("listings").length;
  reply = await send(ALICE, "Post 61k NGN for 72k RWF; 80k RWF for 90k NGN");
  check("all-duplicate bulk request is blocked", reply.includes("*Nothing new to publish*"), reply);
  check("all-duplicate bulk request creates nothing", __table("listings").length === listingCountBeforeDuplicateBatch, JSON.stringify(__table("listings").slice(listingCountBeforeDuplicateBatch)));

  const DORA = "250700000004";
  const doraRow = seedVerifiedUser(DORA, "Promise Uchenna Steven");
  seedPayout(doraRow, "NGN");
  reply = await send(DORA, "I have 10k NGN and want 12k RWF");
  check("missing receive payout starts payout setup", reply.includes("*Add payout detail*") && reply.includes("RWF"), reply);
  reply = await send(DORA, "mtn");
  check("momo network asks for registered name", reply.includes("Quick option") && reply.includes("Promise Uchenna Steven"), reply);
  reply = await send(DORA, "option 1");
  check("verified name shortcut advances to momo number", reply.includes("*Mobile money number*"), reply);
  reply = await send(DORA, "+250 788 123 456");
  check("momo number advances to payout review", reply.includes("Review payout detail"), reply);
  check("momo review shows normalized local number", reply.includes("0788123456") && !reply.includes("+250"), reply);
  reply = await send(DORA, "save payout");
  check("saving payout resumes listing review", reply.includes("Payout detail saved") && reply.includes("*Review listing*"), reply);
  const doraRwfPayout = __table("payment_profiles").find((row) => row.user_id === doraRow.id && row.currency === "RWF");
  check("saved momo number uses local digits only", doraRwfPayout?.momo_number_encrypted === "0788123456", JSON.stringify(doraRwfPayout));

  const BULK_PAYOUT = "250700000014";
  const bulkPayoutUser = seedVerifiedUser(BULK_PAYOUT, "Bulk Payout User");
  seedPayout(bulkPayoutUser, "NGN");
  reply = await send(BULK_PAYOUT, "Create 14k NGN for 16k RWF; 18k NGN for 2k KES");
  check("bulk setup asks for the first missing receive payout", reply.includes("*Add payout detail*") && reply.includes("RWF"), reply);
  reply = await send(BULK_PAYOUT, "mtn");
  reply = await send(BULK_PAYOUT, "option 1");
  reply = await send(BULK_PAYOUT, "+250 788 555 444");
  reply = await send(BULK_PAYOUT, "save payout");
  check("bulk setup continues to the next missing payout", reply.includes("*Add payout detail*") && reply.includes("KES"), reply);
  reply = await send(BULK_PAYOUT, "m-pesa");
  reply = await send(BULK_PAYOUT, "option 1");
  reply = await send(BULK_PAYOUT, "+254 712 345 678");
  reply = await send(BULK_PAYOUT, "save payout");
  check("bulk setup returns to the original combined review", reply.includes("*Review 2 listings*"), reply);
  reply = await send(BULK_PAYOUT, "cancel");
  check("bulk payout draft can be cancelled cleanly", (await sessionFlow(BULK_PAYOUT)) === null);

  const PAYOUT_MENU = "250700000019";
  const payoutMenuUser = seedVerifiedUser(PAYOUT_MENU, "Payout Menu User");
  reply = await handlePaymentProfile("save payout", payoutMenuUser, {
    current_flow: "payment_profile",
    current_step: "payment_confirm",
    context_json: {
      payment_currency: "KES",
      payment_network: "M-Pesa",
      payment_number: "0712345678",
      payment_account_name: "Payout Menu User",
    },
  });
  check(
    "standalone payout save ends with a useful next-step menu",
    reply?.type === "whatsapp_list"
      && reply.list?.body?.includes("*Payout ready ✅*")
      && reply.list?.sections?.[0]?.rows?.some((row) => row.id === "make_offer"),
    JSON.stringify(reply)
  );

  const recoveredPaymentReply = await handlePaymentProfile("continue", doraRow, {
    current_flow: "payment_profile",
    current_step: "legacy_payment_step",
    context_json: {},
  });
  check("stale payout session recovers with the payout picker", recoveredPaymentReply?.type === "whatsapp_list", JSON.stringify(recoveredPaymentReply));
  check("stale payout recovery does not expose reset copy", !String(recoveredPaymentReply?.fallbackText || "").includes("reset payment setup"), JSON.stringify(recoveredPaymentReply));

  const TIER = "250700000005";
  const tierRow = seedVerifiedUser(TIER, "Tier One User");
  tierRow.verification_status = "verified_auto";
  tierRow.verification_score = 65;
  seedPayout(tierRow, "NGN");
  seedPayout(tierRow, "RWF");
  reply = await send(TIER, "I have 150k NGN and want 170k RWF");
  check("tier one high value can reach review", reply.includes("*Review listing*"), reply);
  reply = await send(TIER, "publish");
  check("tier one publish is blocked by limit", reply.includes("Tier 1 limit reached"), reply);
  const tierSession = await getSession(TIER);
  check("tier limit stores pending publish", tierSession?.current_flow === "kyc_upgrade" && tierSession?.context_json?.return_flow === "publish_listing", JSON.stringify(tierSession));

  const { listingShareUrl } = require("../db/listings");
  const { listingCardVersion, listingSharePage } = require("../lib/listing-card");
  check("listing card version changes with dynamic values", listingCardVersion({
    listing_code: "AKR-LIST-001",
    have_currency: "KES",
    have_amount: 15000,
    want_currency: "RWF",
    want_amount: 200000,
    listing_type: "fixed",
    status: "active",
  }) !== listingCardVersion({
    listing_code: "AKR-LIST-001",
    have_currency: "KES",
    have_amount: 35000,
    want_currency: "RWF",
    want_amount: 200000,
    listing_type: "fixed",
    status: "active",
  }), "Card version did not change after amount edit");

  const shareListing = {
    listing_code: "AKR-LIST-321",
    have_currency: "NGN",
    have_amount: 50000,
    want_currency: "RWF",
    want_amount: 55000,
    listing_type: "negotiable",
    status: "active",
    updated_at: "2026-07-26T12:00:00.000Z",
  };
  const previewUrl = listingShareUrl(shareListing);
  const previewPage = listingSharePage(shareListing);
  check(
    "listing share URL uses the previewable Akara listing page",
    previewUrl.startsWith("https://akara-share.example/l/AKR-LIST-321?v="),
    previewUrl
  );
  check(
    "listing share page includes the dynamic card preview and WhatsApp deep link",
    previewPage.includes('property="og:image" content="https://akara-share.example/l/AKR-LIST-321/card')
      && previewPage.includes('property="og:image:type" content="image/png"')
      && previewPage.includes("https://wa.me/")
      && previewPage.includes("open%20AKR-LIST-321"),
    previewPage.slice(0, 600)
  );

  reply = await send(ALICE, "hi, I want to convert 16,728 naira for 18,500 RWF. Is there any available offer that is within around this rate?", {
    interpret: { action: "find_offer", have_currency: "NGN", have_amount: 16728, want_currency: "RWF", want_amount: 18500 },
  });
  check("rate-shaped request offers to list when no offer fits", reply.includes("*No matching offer yet*"), reply);
  check("no-match offer keeps extracted send amount", reply.includes("16,728 NGN"), reply);
  check("no-match offer keeps extracted receive amount", reply.includes("18,500 RWF"), reply);
  check("no-match copy addresses people inclusively", reply.includes("people looking for this exchange"), reply);
  check("no-match copy does not call users traders", !reply.toLowerCase().includes("trader"), reply);
  check(
    "no-match decision uses native reply buttons",
    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "yes,search again,no thanks",
    JSON.stringify(lastButtonPayload())
  );
  check("no-match offer waits for confirmation", (await sessionFlow(ALICE)) === "find_offer");

  reply = await send(ALICE, "please make this one live", {
    interpret: {
      action: "create_listing",
      have_currency: "NGN",
      have_amount: 16728,
      want_currency: "RWF",
      want_amount: 18500,
    },
  });
  check("contextual approval after no-match opens prefilled review", reply.includes("*Review listing*"), reply);
  check("prefilled review keeps send amount", reply.includes("16,728 NGN"), reply);
  check("prefilled review keeps receive amount", reply.includes("18,500 RWF"), reply);

  reply = await send(ALICE, "edit", { interpret: { action: "settings_action" } });
  check("review edit asks what to edit", reply.includes("*What do you want to edit?*"), reply);
  check("review edit offers amount choices", reply.includes("`send amount`") && reply.includes("`receive amount`"), reply);
  const reviewEditButtonIds = (lastButtonPayload()?.buttons || []).map((button) => button.id);
  check("review edit uses publish and cancel buttons", reviewEditButtonIds.join(",") === "publish,cancel", JSON.stringify(lastButtonPayload()));

  reply = await send(ALICE, "1");
  check("review edit number selects send amount", reply.includes("*Edit send amount*"), reply);

  reply = await send(ALICE, "20,000");
  check("review edit applies send amount", reply.includes("*Review listing*") && reply.includes("20,000 NGN"), reply);
  await send(ALICE, "cancel");

  // ---------- browse + orphaned search_results flow fix
  scenario("search results selection");
  const bobRow = seedVerifiedUser(BOB, "Bob Trader");
  seedPayout(bobRow, "NGN");
  seedPayout(bobRow, "RWF");
  seedListing(bobRow, { code: "AKR-LIST-090", have_currency: "NGN", have_amount: 100000, want_currency: "RWF", want_amount: 110000 });
  const needOnlyOwner = seedVerifiedUser("250700000009", "Flexible NGN Trader");
  seedPayout(needOnlyOwner, "NGN");
  seedPayout(needOnlyOwner, "RWF");
  seedListing(needOnlyOwner, {
    code: "AKR-LIST-089",
    have_currency: "NGN",
    have_amount: 50000,
    want_currency: "RWF",
    want_amount: 57500,
    listing_type: "negotiable",
  });
  const haveOnlyListing = seedListing(needOnlyOwner, {
    code: "AKR-LIST-088",
    have_currency: "RWF",
    have_amount: 36000,
    want_currency: "NGN",
    want_amount: 30000,
    listing_type: "negotiable",
  });
  const linkedRow = seedVerifiedUser("250700000066", "Bob Trader");
  seedPayout(linkedRow, "NGN");
  const bobNgnPayout = __table("payment_profiles").find((row) => row.user_id === bobRow.id && row.currency === "NGN");
  const linkedNgnPayout = __table("payment_profiles").find((row) => row.user_id === linkedRow.id && row.currency === "NGN");
  linkedNgnPayout.account_number_encrypted = bobNgnPayout.account_number_encrypted;

  reply = await send("250700000066", "open AKR-LIST-090");
  check("linked profile cannot open owner listing", reply.includes("Trade paused for safety"), reply);
  check("linked profile is risk flagged", linkedRow.risk_status === "watch", linkedRow.risk_status);

  reply = await send(ALICE, "Good morning, please, I also need Naira.", {
    interpret: { action: "greeting", answer: "Good morning!" },
  });
  check(
    "implied receive currency overrides a greeting classification",
    reply.includes("*Offers paying NGN*") && reply.includes("AKR-LIST-089") && reply.includes("AKR-LIST-090"),
    reply
  );
  check("receive-only browse excludes listings asking for NGN", !reply.includes("AKR-LIST-088"), reply);
  check(
    "receive-only browse does not repeat the receive-currency question",
    !reply.includes("Tell me what currency you want to receive") && !reply.includes("What currency do you need"),
    reply
  );

  reply = await send(ALICE, "please I also need Kenyan shillings", {
    interpret: { action: "greeting", answer: "Sure." },
  });
  check("empty receive-currency search explains the result", reply.includes("*No live offers paying KES*"), reply);
  check("empty receive-currency search asks only what the user will give", reply.includes("What currency will you give in exchange for KES?"), reply);
  check(
    "empty receive-currency search preserves KES and opens the have-currency tray",
    (await getSession(ALICE))?.context_json?.want_currency === "KES"
      && lastListPayload()?.sections?.[0]?.rows?.every((row) => row.id !== "currency:KES"),
    JSON.stringify({ reply, session: await getSession(ALICE), list: lastListPayload() })
  );
  await send(ALICE, "cancel");

  reply = await send(ALICE, "Hello Akara, Please I need naira 30k");
  check("need-only search shows eligible NGN offers", reply.includes("AKR-LIST-089") && reply.includes("AKR-LIST-090"), reply);
  check("need-only search ranks flexible first", reply.indexOf("AKR-LIST-089") !== -1 && reply.indexOf("AKR-LIST-089") < reply.indexOf("AKR-LIST-090"), reply);
  check("need-only search does not repeat needed currency", !reply.includes("Tell me what currency you need") && !reply.includes("What currency do you need"), reply);

  reply = await send(ALICE, "who fit give me 30k naira");
  check("pidgin need-only search shows offers", reply.includes("AKR-LIST-089"), reply);
  check("pidgin need-only does not ask need again", !reply.includes("Tell me what currency you need") && !reply.includes("What currency do you need"), reply);

  reply = await send(ALICE, "can I get 30k in naira?");
  check("natural need-only search supports in-currency phrasing", reply.includes("AKR-LIST-089"), reply);

  reply = await send(ALICE, "send me 30k naira");
  check("need-only search understands send-me phrasing", reply.includes("AKR-LIST-089"), reply);

  reply = await send(ALICE, "I need naira, 30k");
  check("need-only search understands separated amount phrasing", reply.includes("AKR-LIST-089"), reply);

  reply = await send(ALICE, "I fit give 30k naira");
  check("pidgin have-only search shows offers wanting NGN", reply.includes("AKR-LIST-088"), reply);
  check("pidgin have-only does not ask have again", !reply.includes("What currency do you have?"), reply);

  reply = await send(ALICE, "I can send 30k NGN");
  check("have-only search understands can-send phrasing", reply.includes("AKR-LIST-088"), reply);

  reply = await send(ALICE, "I need KES 9999999");
  check("need-only no match asks what user has", reply.includes("Tell me what currency you have"), reply);
  check("need-only no match keeps requested currency", reply.includes("9,999,999 KES"), reply);
  check("need-only no match does not ask needed currency again", !reply.includes("Tell me what currency you need") && !reply.includes("What currency do you need"), reply);
  reply = await send(ALICE, "I have 100k RWF");
  check("follow-up keeps the previously requested amount", reply.includes("9,999,999 KES"), reply);
  check("follow-up does not ask for the requested amount again", !reply.includes("How much KES do you want"), reply);
  await send(ALICE, "no thanks");

  reply = await send(ALICE, "I can give 9999999 XAF");
  check("have-only no match asks what user needs", reply.includes("Tell me what currency you want in return"), reply);
  check("have-only no match keeps offered currency", reply.includes("9,999,999 XAF"), reply);
  haveOnlyListing.status = "closed";

  reply = await send(ALICE, "show me ngn offers");
  check("browse shows bob listing", reply.includes("AKR-LIST-090"), reply);
  check("browse enters search_results", (await sessionFlow(ALICE)) === "search_results");
  reply = await send(ALICE, "show me all NGN offers", {
    interpret: { action: "my_listings" },
  });
  check("explicit marketplace browse overrides mistaken my-listings interpretation", !reply.includes("*Your listings*"), reply);
  check("marketplace browse still excludes the requesting user's listings", !reply.includes("AKR-LIST-001"), reply);
  const fixedOfferNumber = reply.match(/(?:^|\n)\*?\s*(\d+)\.\s+\*?AKR-LIST-090\b/i)?.[1];

  reply = await send(ALICE, "9");
  check("invalid number is guided", reply.includes("valid offer number"), reply);

  reply = await send(ALICE, fixedOfferNumber || "1");
  check("displayed fixed-offer number opens the trade", reply.includes("Akara Trade opened ✅"), reply);
  check("selection enters deal room", (await sessionFlow(ALICE)) === "deal_room");
  check(
    "trade opening keeps payment facts compact and inline",
    reply.includes("*You send:*")
      && reply.includes("*You receive:*")
      && reply.includes("*Payment window:* 15 minutes")
      && reply.includes("*Service fee:* Free")
      && !reply.includes("_You send_"),
    reply
  );
  check(
    "trade opening uses native payment actions",
    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "paid,received,dispute",
    JSON.stringify(lastButtonPayload())
  );
  check(
    "trade opening removes the duplicate typed action block",
    !reply.includes("*Actions*") && !reply.includes("`paid` after you send"),
    reply
  );
  const openedDealCode = (await getSession(ALICE))?.context_json?.deal_code || __table("deals").at(-1)?.deal_code;

  // ---------- deal room actions
  scenario("deal room");
  reply = await send(ALICE, "status");
  check("status shows summary", reply.includes("*Transaction ref:*") && reply.includes(openedDealCode), reply);

  reply = await send(ALICE, "i don pay");
  check("paid asks for receipt", reply.includes("Receipt needed"), reply);

  const dealBeforeInvalidReceipt = __table("deals").find((row) => row.deal_code === openedDealCode);
  const textSendsBeforeInvalidReceipt = textSends.length;
  const interruptedReceiptSession = __table("message_sessions").find((row) => row.whatsapp_phone === ALICE);
  Object.assign(interruptedReceiptSession, {
    current_flow: null,
    current_step: null,
    context_json: {},
  });
  reply = await send(ALICE, "Hi Doreen", {
    media: { id: "unrelated-receipt", mimeType: "image/png", filename: "unrelated.png" },
    interpret: { action: "greeting", answer: "Hi Doreen, good to hear from you." },
  });
  check(
    "receipt media stays in the active trade instead of becoming a greeting",
    reply.includes("Receipt could not be verified") && !reply.includes("good to hear from you"),
    reply
  );
  check(
    "unverified receipt leaves payment status unchanged",
    !dealBeforeInvalidReceipt?.taker_sent_at,
    JSON.stringify(dealBeforeInvalidReceipt)
  );
  check(
    "unverified receipt is not forwarded to the other party",
    !textSends.slice(textSendsBeforeInvalidReceipt).some((message) => message.to === BOB),
    JSON.stringify(textSends.slice(textSendsBeforeInvalidReceipt))
  );
  check(
    "receipt rejection offers retry and dispute buttons",
    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "retry_receipt,dispute",
    JSON.stringify(lastButtonPayload())
  );
  check(
    "receipt rejection keeps the upload step active",
    (await getSession(ALICE))?.current_step === "awaiting_receipt",
    JSON.stringify(await getSession(ALICE))
  );
  check(
    "receipt media reconstructs a lost trade-room session",
    (await getSession(ALICE))?.context_json?.deal_code === openedDealCode,
    JSON.stringify(await getSession(ALICE))
  );

  reply = await send(ALICE, "retry_receipt");
  check("receipt retry button restores the upload prompt", reply.includes("*Upload receipt*"), reply);

  reply = await send(BOB, "received");
  check("bob confirms receipt", reply.includes("Receipt confirmed ✅"), reply);

  reply = await send(ALICE, "menu");
  check("menu escapes deal room", reply.includes("choose your next move"), JSON.stringify({ reply, body: lastListBody() }));
  check("deal room released", (await sessionFlow(ALICE)) === null);

  reply = await send(ALICE, "what's next for my trade?", { interpret: { action: "trade_action" } });
  check("trade recall reopens deal", reply.includes(openedDealCode), reply);
  const recalledDeal = __table("deals").find((row) => row.deal_code === openedDealCode);
  check("recalled deal exists", Boolean(recalledDeal), JSON.stringify({ openedDealCode, deals: __table("deals").map((row) => row.deal_code) }));
  if (recalledDeal) recalledDeal.taker_sent_at = new Date().toISOString();
  const aliceDisputeHoldListing = seedListing(aliceRow, {
    code: "AKR-LIST-HOLD-A",
    have_currency: "KES",
    have_amount: 1000,
    want_currency: "GHS",
    want_amount: 80,
  });
  const bobDisputeHoldListing = seedListing(bobRow, {
    code: "AKR-LIST-HOLD-B",
    have_currency: "GHS",
    have_amount: 90,
    want_currency: "KES",
    want_amount: 1100,
  });
  reply = await send(ALICE, "cancel");
  check("active trade cancel stays deal-specific", reply.includes("Cannot close from chat"), reply);
  check("active trade cancel points to dispute", reply.includes(`dispute ${openedDealCode}`), reply);
  check("active trade cancel does not show profile actions", !reply.includes("Manage payout details"), reply);

  reply = await send(ALICE, `dispute ${openedDealCode} because amount did not arrive`);
  check("dispute asks for proof", reply.includes(`*Proof needed ${openedDealCode}*`) && reply.includes("amount did not arrive"), reply);
  check("dispute waits for proof", (await getSession(ALICE))?.current_step === "awaiting_dispute_proof", JSON.stringify(await getSession(ALICE)));

  reply = await send(ALICE, "", {
    media: { id: "proof-media-001", mimeType: "image/png", filename: "receipt.png" },
  });
  check("dispute opens after proof", reply.includes("*Dispute opened ✅*") && reply.includes("amount did not arrive"), reply);
  check("open dispute pauses both participant accounts", aliceRow.dispute_hold === true && bobRow.dispute_hold === true, JSON.stringify({ aliceRow, bobRow }));
  check(
    "open dispute hides both participants' live listings",
    aliceDisputeHoldListing.status === "paused"
      && aliceDisputeHoldListing.dispute_paused === true
      && bobDisputeHoldListing.status === "paused"
      && bobDisputeHoldListing.dispute_paused === true,
    JSON.stringify({ aliceDisputeHoldListing, bobDisputeHoldListing })
  );
  reply = await send(BOB, "make offer");
  check("dispute hold blocks either participant from opening a new exchange", reply.includes("*Account temporarily paused*"), reply);

  reply = await send(BOB, "close dispute");
  check("non opener cannot close dispute", reply.includes("Only the person who opened this dispute"), reply);

  reply = await send(ALICE, "close dispute");
  check("opener can withdraw dispute", reply.includes("Dispute withdrawn"), reply);
  check("withdrawing the last dispute releases both accounts", !aliceRow.dispute_hold && !bobRow.dispute_hold, JSON.stringify({ aliceRow, bobRow }));
  check(
    "dispute-paused listings return to search after resolution",
    aliceDisputeHoldListing.status === "active"
      && aliceDisputeHoldListing.dispute_paused === false
      && bobDisputeHoldListing.status === "active"
      && bobDisputeHoldListing.dispute_paused === false,
    JSON.stringify({ aliceDisputeHoldListing, bobDisputeHoldListing })
  );
  for (const listing of [aliceDisputeHoldListing, bobDisputeHoldListing]) {
    const index = __table("listings").indexOf(listing);
    if (index >= 0) __table("listings").splice(index, 1);
  }

  // ---------- negotiable listing negotiation
  scenario("negotiable listing negotiation");
  const charlieRow = seedVerifiedUser(CHARLIE, "Charlie Owner");
  seedPayout(charlieRow, "NGN");
  seedPayout(charlieRow, "RWF");
  seedListing(charlieRow, {
    code: "AKR-LIST-091",
    have_currency: "NGN",
    have_amount: 100000,
    want_currency: "RWF",
    want_amount: 115000,
    listing_type: "negotiable",
  });

  reply = await send(ALICE, "open AKR-LIST-091");
  check("negotiable listing starts negotiation", reply.includes("*Negotiable listing*"), reply);
  check("negotiable listing does not instantly reserve", (await sessionFlow(ALICE)) === "negotiation", reply);

  reply = await send(ALICE, "offer 105000 rwf");
  check("proposal is sent", reply.includes("*Proposal sent*") && reply.includes("105,000 RWF"), reply);
  check("owner receives negotiation session", (await sessionFlow(CHARLIE)) === "negotiation");

  reply = await send(CHARLIE, "accept");
  check("owner acceptance opens trade", reply.includes("Akara Trade opened ✅"), reply);
  const negotiatedDeal = __table("deals").find((row) => row.listing_id === __table("listings").find((listing) => listing.listing_code === "AKR-LIST-091")?.id);
  check("negotiated amount becomes deal amount", Number(negotiatedDeal?.want_amount) === 105000, JSON.stringify(negotiatedDeal));

  // ---------- two-way negotiation: counters can move either side
  scenario("two-way negotiation");
  seedListing(charlieRow, {
    code: "AKR-LIST-092",
    have_currency: "NGN",
    have_amount: 100000,
    want_currency: "RWF",
    want_amount: 115000,
    listing_type: "negotiable",
  });

  reply = await send(BOB, "open AKR-LIST-092");
  check("flexible prompt offers both sides", reply.includes("to propose what you send") && reply.includes("to propose what you receive"), reply);

  reply = await send(BOB, "offer 110000 rwf for 102000 ngn");
  check("proposal can set both sides at once", reply.includes("110,000 RWF") && reply.includes("102,000 NGN"), reply);

  reply = await send(CHARLIE, "counter 55000 ghs");
  check("foreign currency counter is rejected", reply.includes("RWF") && reply.includes("NGN") && reply.includes("counter with an amount"), reply);

  reply = await send(CHARLIE, "counter 98000 ngn");
  check("owner can counter the side they send", reply.includes("98,000 NGN"), reply);
  check("owner counter keeps the taker send side", reply.includes("110,000 RWF"), reply);

  reply = await send(BOB, "counter 105000 rwf");
  check("taker re-counter moves only their send side", reply.includes("105,000 RWF") && reply.includes("98,000 NGN"), reply);

  reply = await send(CHARLIE, "accept");
  check("owner accepts two-way negotiation", reply.includes("Akara Trade opened ✅"), reply);
  const twoWayDeal = __table("deals").find((row) => row.listing_id === __table("listings").find((listing) => listing.listing_code === "AKR-LIST-092")?.id);
  check("deal keeps negotiated send side", Number(twoWayDeal?.want_amount) === 105000, JSON.stringify(twoWayDeal));
  check("deal keeps negotiated receive side", Number(twoWayDeal?.have_amount) === 98000, JSON.stringify(twoWayDeal));

  // ---------- natural owner counter with a leading rejection
  scenario("natural-language counter");
  const naturalCounterListing = seedListing(charlieRow, {
    code: "AKR-LIST-7093",
    have_currency: "RWF",
    have_amount: 4200000,
    want_currency: "KES",
    want_amount: 30000,
    listing_type: "negotiable",
  });

  reply = await send(BOB, "open AKR-LIST-7093");
  check("natural counter fixture opens negotiation", reply.includes("*Negotiable listing*"), reply);
  reply = await send(BOB, "I can send 30,000 Kenyan shillings for 4,200,000 Rwandan francs");
  check("original natural proposal reaches the owner", reply.includes("30,000 KES") && reply.includes("4,200,000 RWF"), reply);

  const textSendsBeforeNaturalCounter = textSends.length;
  reply = await send(CHARLIE, "No. I want 46,500 Kenyan shillings");
  const naturalCounterNotice = textSends
    .slice(textSendsBeforeNaturalCounter)
    .find((message) => message.to === BOB)?.text || "";
  check("leading no plus a new value creates a counter", reply.includes("*Counter sent*") && reply.includes("46,500 KES"), reply);
  check("new counter replaces the earlier value for the other user", naturalCounterNotice.includes("46,500 KES") && !naturalCounterNotice.includes("30,000 KES"), naturalCounterNotice);
  check("one-sided natural counter retains the other side", naturalCounterNotice.includes("4,200,000 RWF"), naturalCounterNotice);
  reply = await send(BOB, "decline AKR-LIST-7093");
  check("plain decline still closes a counter", reply.includes("Counter declined"), reply);
  const naturalCounterListingIndex = __table("listings").indexOf(naturalCounterListing);
  if (naturalCounterListingIndex >= 0) __table("listings").splice(naturalCounterListingIndex, 1);

  // ---------- partial fill matching
  scenario("partial fill matching");
  seedListing(charlieRow, {
    code: "AKR-LIST-993",
    have_currency: "RWF",
    have_amount: 65000,
    want_currency: "NGN",
    want_amount: 60000,
    listing_type: "negotiable",
  });

  reply = await send(ALICE, "open AKR-LIST-993");
  check("partial fill starts negotiation", reply.includes("*Negotiable listing*"), reply);

  reply = await send(ALICE, "offer 50000 ngn for 55000 rwf");
  check("partial proposal is sent", reply.includes("50,000 NGN") && reply.includes("55,000 RWF"), reply);

  reply = await send(CHARLIE, "accept");
  check("partial acceptance opens trade", reply.includes("Akara Trade opened ✅"), reply);
  check("partial acceptance tells owner remaining value", reply.includes("*Still listed:* 10,000 RWF for 9,230.77 NGN"), reply);
  const partialSource = __table("listings").find((listing) => listing.listing_code === "AKR-LIST-993");
  const partialResidual = __table("listings").find((listing) => (
    listing.owner_user_id === charlieRow.id
    && listing.id !== partialSource?.id
    && listing.status === "active"
    && listing.have_currency === "RWF"
    && listing.want_currency === "NGN"
    && Number(listing.have_amount) === 10000
    && Number(listing.want_amount) === 9230.77
  ));
  check("partial source listing is reserved", partialSource?.status === "reserved", JSON.stringify(partialSource));
  check("partial residual listing remains live", Boolean(partialResidual), JSON.stringify(__table("listings").filter((listing) => listing.owner_user_id === charlieRow.id)));
  if (partialResidual) partialResidual.status = "closed";

  // ---------- flow interrupts (model-driven, never asks twice)
  scenario("flow interrupts");
  reply = await send(ALICE, "make offer");
  check("make offer opens flow", reply.includes("Tell me what currency you have"), reply);
  check("create flow active", (await sessionFlow(ALICE)) === "create_listing");

  reply = await send(ALICE, "show my bank details", { interpret: { action: "view_payouts" } });
  check("interrupt serves payouts immediately", reply.includes("Bank & payout details"), reply);
  check("create flow cancelled", (await sessionFlow(ALICE)) !== "create_listing");

  reply = await send(ALICE, "make offer");
  reply = await send(ALICE, "is akara free?", {
    interpret: { action: "question", answer: "Akara is free — invite a friend to swap and get 10 more free trades." },
  });
  check("question answered mid-flow", reply.includes("Akara is free"), reply);
  check("flow survives a question", (await sessionFlow(ALICE)) === "create_listing");

  reply = await send(ALICE, "i wan move 51k naira make i get 55k rwf", {
    interpret: { action: "create_listing", have_currency: "NGN", have_amount: 51000, want_currency: "RWF", want_amount: 55000 },
  });
  check("model slots complete the listing", reply.includes("*Review listing*"), reply);
  check("model direction beats regex misread", reply.includes("*You send:* 51,000 NGN"), reply);
  check("model want side kept", reply.includes("*You receive:* 55,000 RWF"), reply);

  reply = await send(ALICE, "make it 60k instead", {
    interpret: { action: "flow_reply", have_currency: "NGN", have_amount: 60000 },
  });
  check("draft revision re-previews", reply.includes("*Review listing*"), reply);
  check("draft revision applies new amount", reply.includes("60,000 NGN"), reply);
  check("draft revision keeps other side", reply.includes("55,000 RWF"), reply);

  reply = await send(ALICE, "make it flexible");
  check("terms revision applies", reply.includes("Negotiable rate"), reply);
  check("terms revision keeps amounts", reply.includes("60,000 NGN"), reply);
  await send(ALICE, "cancel");

  // interrupt out of payment profile setup
  reply = await send(ALICE, "add payout");
  check("payout setup starts", reply.includes("*Payout details*"), reply);
  check("payment flow active", (await sessionFlow(ALICE)) === "payment_profile");

  reply = await send(ALICE, "show me my transactions", { interpret: { action: "my_deals" } });
  check("interrupt escapes payment setup", reply.includes("Transaction history") || reply.includes("No transaction history yet"), reply);
  check("payment flow cancelled", (await sessionFlow(ALICE)) !== "payment_profile");

  // staying in payment flow when the reply is an answer
  reply = await send(ALICE, "add payout");
  reply = await send(ALICE, "2", { interpret: { action: "flow_reply" } });
  check("flow reply picks RWF momo", reply.includes("RWF"), reply);
  check("payment flow continues", (await sessionFlow(ALICE)) === "payment_profile");
  await send(ALICE, "cancel");

  // ---------- guided find flow with deterministic escape
  scenario("guided find flow");
  reply = await send(ALICE, "find offers");
  check("find opens marketplace", reply.includes("*All live offers*") || reply.includes("*No live offers yet*"), reply);
  check("find does not ask follow-up questions", !reply.includes("Tell me what currency you need") && !reply.includes("What currency do you have?"), reply);

  reply = await send(ALICE, "menu");
  check("menu escapes find flow", reply.includes("choose your next move"), JSON.stringify({ reply, body: lastListBody() }));
  check("find flow released", (await sessionFlow(ALICE)) === null);

  // ---------- settings: edit instead of new payout + bulk confirm
  scenario("settings actions");
  reply = await send(ALICE, "update my bank details");
  check("update edits existing payout", reply.includes("Edit NGN payout") || reply.includes("*Edit"), reply);
  check("update does not start add flow", !reply.includes("Choose where incoming payments should land"), reply);
  await send(ALICE, "cancel");

  const managedListing = seedListing(aliceRow, {
    code: "AKR-LIST-778",
    have_currency: "NGN",
    have_amount: 5000,
    want_currency: "RWF",
    want_amount: 5600,
    created_at: "2099-01-01T00:00:00.000Z",
  });

  reply = await send(ALICE, "my listings");
  check("my listings opens a listing picker", lastListPayload()?.button === "Choose listing", JSON.stringify(lastListPayload()));
  check("listing picker maps the first listing", lastListPayload()?.sections?.[0]?.rows?.[0]?.id === "manage_listing_1", JSON.stringify(lastListPayload()));
  check(
    "listing picker starts with a compact status overview",
    lastListPayload()?.body?.includes("*Total listings:*")
      && lastListPayload()?.body?.includes("*🟢 Live:*")
      && lastListPayload()?.body?.includes("*⏸️ Paused:*")
      && lastListPayload()?.body?.includes("*🔒 In trade:*")
      && lastListPayload()?.body?.includes("*⚫ Closed:*"),
    lastListPayload()?.body
  );

  reply = await send(ALICE, "manage_listing_1");
  let listingButtonIds = (lastButtonPayload()?.buttons || []).map((button) => button.id);
  check("selected live listing has only management action buttons", listingButtonIds.join(",") === "edit_listing_1,close_listing_1", JSON.stringify(lastButtonPayload()));
  check(
    "selected live listing sends its current swap card with the listing link",
    lastMediaPayload()?.mediaType === "image"
      && lastMediaPayload()?.caption?.includes("AKR-LIST-778")
      && lastMediaPayload()?.caption?.includes("https://akara-share.example/l/AKR-LIST-778"),
    JSON.stringify(lastMediaPayload())
  );

  reply = await send(ALICE, "help me pass this one around", {
    interpret: {
      action: "settings_action",
      settings_target: "listing",
      settings_operation: "share",
      settings_item_number: 1,
    },
  });
  check("implied share request returns the previewable WhatsApp listing link", reply.includes("/l/AKR-LIST-778") && reply.includes("opens the listing in Akara on WhatsApp"), reply);

  reply = await send(ALICE, "I need to change what I am asking for on this one", {
    interpret: {
      action: "settings_action",
      settings_target: "listing",
      settings_operation: "edit",
      settings_item_number: 1,
    },
  });
  check("implied edit request opens focused choices", reply.includes("*What do you want to edit?*") && reply.includes("send amount"), reply);
  check("implied edit request immediately hides the live listing", managedListing.status === "paused", JSON.stringify(managedListing));
  await send(ALICE, "cancel");
  check("cancelling edit restores the listing", managedListing.status === "active", JSON.stringify(managedListing));

  reply = await send(ALICE, "abeg I no want make people see this offer again", {
    interpret: {
      action: "settings_action",
      settings_target: "listing",
      settings_operation: "close",
      settings_item_number: 1,
    },
  });
  check("implied close request asks to confirm", reply.includes("Close AKR-LIST-778?"), reply);
  check("single listing cancel prompt is scoped", !reply.includes("Manage payout details") && !reply.includes("*Payouts*"), reply);
  listingButtonIds = (lastButtonPayload()?.buttons || []).map((button) => button.id);
  check("single listing confirmation uses reply buttons", listingButtonIds.join(",") === "confirm,keep", JSON.stringify(lastButtonPayload()));
  check("single listing close uses a concise confirm label", lastButtonPayload()?.buttons?.[0]?.title === "Confirm", JSON.stringify(lastButtonPayload()));

  reply = await send(ALICE, "confirm");
  check("single listing cancel completes", reply.includes("*Listing closed") && reply.includes("off search"), reply);
  check("single listing cancel does not dump profile", !reply.includes("Manage payout details") && !reply.includes("*Payouts*") && !reply.includes("*Profile*"), reply);
  check(
    "single listing close ends with the native main menu",
    lastListPayload()?.sections?.[0]?.rows?.some((row) => row.id === "find_offers")
      && reply.includes("What would you like to do next?"),
    JSON.stringify({ reply, list: lastListPayload() })
  );

  reply = await send(ALICE, "my listings");
  const closedSection = (lastListPayload()?.sections || []).find((section) => section.title === "Closed history");
  const closedListingRow = (closedSection?.rows || []).find((row) => String(row.title || "").includes("AKR-LIST-778"));
  check("closed listing moves into a distinct history section", Boolean(closedListingRow), JSON.stringify(lastListPayload()));
  check(
    "closed listing is visibly marked as closed",
    closedListingRow?.title?.startsWith("⚫") && closedListingRow?.description?.startsWith("CLOSED"),
    JSON.stringify(lastListPayload())
  );

  reply = await send(ALICE, closedListingRow?.id || "manage_listing_1");
  check("closed listing opens a scoped activity record", reply.includes("*⚫ Closed listing*") && reply.includes("*Activity*"), reply);
  check("closed listing with no activity says so", reply.includes("No negotiations or exchanges were opened"), reply);
  check("closed listing never dumps profile information", !reply.includes("Manage payout details") && !reply.includes("*Payouts*") && !reply.includes("*Profile*"), reply);
  listingButtonIds = (lastButtonPayload()?.buttons || []).map((button) => button.id);
  check("closed listing offers native republish action", listingButtonIds[0] === "republish_listing_1", JSON.stringify(lastButtonPayload()));

  __table("negotiable_offers").push({
    id: crypto.randomUUID(),
    listing_id: managedListing.id,
    offering_user_id: bobRow.id,
    offered_amount: 5400,
    offered_currency: "RWF",
    status: "declined",
    created_at: new Date().toISOString(),
  });
  await send(ALICE, "my listings");
  reply = await send(ALICE, "manage_listing_1");
  check("closed listing reports recorded activity", reply.includes("*Negotiations received:* 1"), reply);

  reply = await send(ALICE, "republish_listing_1");
  check("republish opens a fresh listing review", reply.includes("*Republish listing*") && reply.includes("*Review listing*"), reply);
  check("republish preserves the old terms", reply.includes("5,000 NGN") && reply.includes("5,600 RWF"), reply);
  check("republish generates a fresh reference", !reply.includes("AKR-LIST-778"), reply);
  const listingsBeforeRepublish = new Set(__table("listings").map((listing) => listing.id));
  const dealsBeforeRepublish = new Set(__table("deals").map((deal) => deal.id));
  const quotesBeforeRepublish = new Set(__table("market_quotes").map((quote) => quote.id));
  reply = await send(ALICE, "publish");
  const republishReply = Array.isArray(reply) ? reply.join("\n") : String(reply || "");
  check("republished listing confirms that it reopened", republishReply.includes("Listing reopened ✅") && republishReply.includes("swap card is attached"), republishReply);
  const republishedListing = __table("listings").find((listing) => !listingsBeforeRepublish.has(listing.id));
  check(
    "republished listing carries the original values into a fresh live record",
    ["active", "reserved"].includes(republishedListing?.status)
      && Number(republishedListing?.have_amount) === 5000
      && Number(republishedListing?.want_amount) === 5600,
    JSON.stringify(republishedListing)
  );
  for (const [tableName, previousIds] of [
    ["listings", listingsBeforeRepublish],
    ["deals", dealsBeforeRepublish],
    ["market_quotes", quotesBeforeRepublish],
  ]) {
    const rows = __table(tableName);
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (!previousIds.has(rows[index].id)) rows.splice(index, 1);
    }
  }

  seedListing(aliceRow, {
    code: "AKR-LIST-779",
    have_currency: "GHS",
    have_amount: 200,
    want_currency: "NGN",
    want_amount: 10000,
    status: "reserved",
    created_at: "2099-01-02T00:00:00.000Z",
  });
  reply = await send(ALICE, "cancel listing 1");
  check("reserved listing cancel is refused", reply.includes("*Cannot close this listing*") && reply.includes("dispute"), reply);
  check("reserved listing refusal is scoped", !reply.includes("Manage payout details") && !reply.includes("*Payouts*") && !reply.includes("*Profile*"), reply);

  const listingRows = __table("listings");
  for (let index = listingRows.length - 1; index >= 0; index -= 1) {
    if (["AKR-LIST-778", "AKR-LIST-779"].includes(listingRows[index].listing_code)) {
      listingRows.splice(index, 1);
    }
  }

  seedListing(aliceRow, { code: "AKR-LIST-777", have_currency: "NGN", have_amount: 10000, want_currency: "GHS", want_amount: 200 });
  reply = await send(ALICE, "profile_pause_all_listings");
  check("profile tray pauses all live listings", reply.includes("*Listings paused*"), reply);
  check(
    "bulk pause only changes live listings",
    __table("listings").filter((row) => row.owner_user_id === aliceRow.id && row.status === "active").length === 0
      && __table("listings").some((row) => row.owner_user_id === aliceRow.id && row.status === "paused"),
    JSON.stringify(__table("listings").filter((row) => row.owner_user_id === aliceRow.id))
  );

  reply = await send(ALICE, "reopen every listing I paused");
  check("natural language reopens all paused listings", reply.includes("*Listings reopened*"), reply);
  check(
    "bulk reopen returns paused listings to search",
    __table("listings").some((row) => row.listing_code === "AKR-LIST-777" && row.status === "active"),
    JSON.stringify(__table("listings").filter((row) => row.owner_user_id === aliceRow.id))
  );

  reply = await send(ALICE, "cancel all my listings");
  check("bulk close alias asks to confirm with canonical wording", reply.includes("Close all listings?"), reply);

  reply = await send(ALICE, "confirm");
  check("bulk cancel completes", reply.includes("Listings closed"), reply);
  check(
    "bulk close ends with the native main menu",
    lastListPayload()?.sections?.[0]?.rows?.some((row) => row.id === "my_listings")
      && reply.includes("off search"),
    JSON.stringify({ reply, list: lastListPayload() })
  );

  reply = await send(ALICE, "my listings");
  const bulkClosedRows = (lastListPayload()?.sections || [])
    .find((section) => section.title === "Closed history")?.rows || [];
  check(
    "bulk-closed listings move into closed history",
    bulkClosedRows.some((row) => String(row.title || "").includes("AKR-LIST-777")),
    JSON.stringify(lastListPayload())
  );

  reply = await send(ALICE, "delete all my payouts");
  check("bulk payout delete asks", reply.includes("Delete all payout details?"), reply);

  reply = await send(ALICE, "keep");
  check("keep leaves payouts", reply.includes("Kept unchanged"), reply);

  // interrupting a bulk confirmation with a fresh request
  reply = await send(ALICE, "delete all my payouts");
  reply = await send(ALICE, "actually show me my profile", { interpret: { action: "view_profile" } });
  check("fresh request overrides confirmation", reply.includes("*Your profile*"), reply);

  // ---------- auto-match on publish
  scenario("auto match");
  const incompatibleReciprocal = seedListing(bobRow, {
    code: "AKR-LIST-199",
    have_currency: "NGN",
    have_amount: 200000,
    want_currency: "RWF",
    want_amount: 300000,
    created_at: "2025-01-01T00:00:00.000Z",
  });
  const compatibleReciprocal = seedListing(bobRow, {
    code: "AKR-LIST-200",
    have_currency: "NGN",
    have_amount: 200000,
    want_currency: "RWF",
    want_amount: 220000,
    created_at: "2025-01-02T00:00:00.000Z",
  });
  reply = await send(ALICE, "i have 220k rwf and want 200k naira");
  check("reciprocal request previews listing", reply.includes("*Review listing*"), reply);

  reply = await send(ALICE, "publish");
  check("publish auto-matches reciprocal listing", reply.includes("Akara Trade opened ✅"), reply);
  const autoMatchedDeal = __table("deals").at(-1);
  check(
    "auto-match skips a reciprocal listing whose rate does not cross",
    autoMatchedDeal?.listing_id === compatibleReciprocal.id && incompatibleReciprocal.status === "active",
    JSON.stringify({ autoMatchedDeal, incompatibleReciprocal, compatibleReciprocal })
  );
  check(
    "auto-match explains its compatibility basis",
    reply.includes("The currencies, available value and rates are compatible."),
    reply
  );
  reply = await send(ALICE, "cancel trade");
  check(
    "pre-payment cancellation requeues the locked auto-match portions",
    reply.includes("locked portions were restored")
      && __table("audit_events").some((event) => (
        event.entity_id === autoMatchedDeal.id
        && event.event_name === "smart_match_requeued"
      )),
    JSON.stringify({
      reply,
      events: __table("audit_events").filter((event) => event.entity_id === autoMatchedDeal.id),
    })
  );
  check(
    "cancelled peers receive a temporary pairing exclusion",
    __table("audit_events").filter((event) => event.event_name === "match_pair_excluded").length >= 2,
    JSON.stringify(__table("audit_events").filter((event) => event.event_name === "match_pair_excluded"))
  );
  await send(ALICE, "cancel");

  scenario("auto match passes favorable rate to user");
  for (const phone of [ALICE, BOB]) {
    const savedSession = __table("message_sessions").find((row) => row.whatsapp_phone === phone);
    if (savedSession) Object.assign(savedSession, { current_flow: null, current_step: null, context_json: {} });
  }
  for (const testListing of __table("listings")) {
    const isTestPair = ["NGN", "RWF"].includes(testListing.have_currency)
      && ["NGN", "RWF"].includes(testListing.want_currency);
    if (isTestPair && testListing.status === "active") testListing.status = "closed";
  }
  const favorableReciprocal = seedListing(bobRow, {
    code: "AKR-LIST-201",
    have_currency: "NGN",
    have_amount: 500000,
    want_currency: "RWF",
    want_amount: 320000,
    listing_type: "negotiable",
    created_at: "2025-01-02T00:00:00.000Z",
  });
  reply = await send(ALICE, "I have 10000 RWF and want at least 13000 NGN");
  check("favorable reciprocal request previews listing", reply.includes("*Review listing*"), reply);
  reply = await send(ALICE, "publish");
  const favorableDeal = __table("deals").at(-1);
  check(
    "better reciprocal rate is passed through to the user",
    favorableDeal?.listing_id === favorableReciprocal.id
      && Number(favorableDeal?.want_amount) === 10000
      && Number(favorableDeal?.have_amount) === 14252.19
      && reply.includes("14,252.19 NGN"),
    JSON.stringify({ favorableDeal, favorableReciprocal, reply })
  );
  check(
    "price improvement is explained without asking for negotiation",
    reply.includes("receive more than your minimum")
      && !reply.includes("negotiation opened"),
    reply
  );
  const favorableResidual = __table("listings").find((row) => (
    row.owner_user_id === bobRow.id
      && row.status === "active"
      && row.have_currency === "NGN"
      && row.want_currency === "RWF"
      && Number(row.have_amount) === 484375
      && Number(row.want_amount) === 310000
  ));
  check(
    "favorable partial fill preserves the reciprocal listing rate",
    Boolean(favorableResidual) && favorableReciprocal.status === "reserved",
    JSON.stringify({ favorableReciprocal, favorableResidual })
  );
  favorableDeal.status = "cancelled";

  scenario("favorable partial fill preserves requester minimum");
  for (const phone of [ALICE, BOB]) {
    const savedSession = __table("message_sessions").find((row) => row.whatsapp_phone === phone);
    if (savedSession) Object.assign(savedSession, { current_flow: null, current_step: null, context_json: {} });
  }
  for (const testListing of __table("listings")) {
    const isTestPair = ["NGN", "RWF"].includes(testListing.have_currency)
      && ["NGN", "RWF"].includes(testListing.want_currency);
    if (isTestPair && testListing.status === "active") testListing.status = "closed";
  }
  seedListing(bobRow, {
    code: "AKR-LIST-202",
    have_currency: "NGN",
    have_amount: 15625,
    want_currency: "RWF",
    want_amount: 10000,
    listing_type: "negotiable",
  });
  reply = await send(ALICE, "I have 20000 RWF and want at least 26000 NGN");
  reply = await send(ALICE, "publish");
  const requesterPartialDeal = __table("deals").at(-1);
  const requesterResidual = __table("listings").find((row) => (
    row.owner_user_id === aliceRow.id
      && row.status === "active"
      && row.have_currency === "RWF"
      && row.want_currency === "NGN"
      && Number(row.have_amount) === 10000
      && Number(row.want_amount) === 13000
  ));
  check(
    "requester residual keeps the original minimum rate after price improvement",
    Number(requesterPartialDeal?.want_amount) === 10000
      && Number(requesterPartialDeal?.have_amount) === 14252.19
      && Boolean(requesterResidual),
    JSON.stringify({ requesterPartialDeal, requesterResidual })
  );
  requesterPartialDeal.status = "cancelled";

  scenario("non-crossing negotiable reciprocal");
  for (const phone of [ALICE, BOB]) {
    const savedSession = __table("message_sessions").find((row) => row.whatsapp_phone === phone);
    if (savedSession) Object.assign(savedSession, { current_flow: null, current_step: null, context_json: {} });
  }
  for (const listing of __table("listings")) {
    const isTestPair = ["NGN", "RWF"].includes(listing.have_currency)
      && ["NGN", "RWF"].includes(listing.want_currency);
    if (isTestPair && listing.status === "active") listing.status = "closed";
  }
  const negotiationCandidate = seedListing(bobRow, {
    code: "AKR-LIST-203",
    have_currency: "NGN",
    have_amount: 90000,
    want_currency: "RWF",
    want_amount: 100000,
    listing_type: "negotiable",
  });
  const buttonsBeforeReciprocalNegotiation = buttonSends.length;
  reply = await send(ALICE, "I have 100000 RWF and want 100000 NGN");
  check("non-crossing reciprocal request previews listing", reply.includes("*Review listing*"), reply);
  reply = await send(ALICE, "publish");
  check(
    "non-crossing negotiable pair opens negotiation instead of a trade",
    reply.includes("*Listing live · negotiation opened*") && !reply.includes("Akara Trade opened"),
    reply
  );
  const reciprocalOffer = __table("negotiable_offers").at(-1);
  const reciprocalSourceId = String(reciprocalOffer?.message || "").match(/^reciprocal_source:([0-9a-f-]{36})$/i)?.[1];
  const reciprocalSource = __table("listings").find((row) => row.id === reciprocalSourceId);
  check(
    "reciprocal negotiation keeps both listings live until acceptance",
    negotiationCandidate.status === "active" && reciprocalSource?.status === "active",
    JSON.stringify({ negotiationCandidate, reciprocalSource })
  );
  check(
    "reciprocal negotiation proposes values both listings can cover",
    Number(reciprocalOffer?.offered_amount) === 94868.33
      && Number(reciprocalOffer?.receive_amount) === 90000,
    JSON.stringify(reciprocalOffer)
  );
  const ownerNegotiationButtons = buttonSends
    .slice(buttonsBeforeReciprocalNegotiation)
    .find((entry) => entry.to === BOB)?.payload?.buttons || [];
  check(
    "reciprocal listing owner receives accept counter and decline buttons",
    ownerNegotiationButtons.map((button) => button.id).join(",") === "accept,counter,decline",
    JSON.stringify(ownerNegotiationButtons)
  );
  check(
    "publisher can change remind or withdraw the proposal with buttons",
    lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "change_proposal,remind,cancel",
    JSON.stringify(lastButtonPayload())
  );
  check("both users enter the same negotiation", (await sessionFlow(ALICE)) === "negotiation" && (await sessionFlow(BOB)) === "negotiation");
  reply = await send(ALICE, "change_proposal");
  check("change proposal button explains how to send new values", reply.includes("*Change proposal*") && reply.includes("Example:"), reply);
  reply = await send(BOB, "accept");
  check("accepting a reciprocal proposal opens the trade room", reply.includes("Akara Trade opened ✅"), reply);
  check(
    "accepted reciprocal negotiation removes both source listings from search",
    reciprocalSource?.status === "reserved" && negotiationCandidate.status === "reserved",
    JSON.stringify({ reciprocalSource, negotiationCandidate })
  );
  const reciprocalDeal = __table("deals").at(-1);
  reciprocalDeal.status = "cancelled";
  for (const phone of [ALICE, BOB]) {
    const savedSession = __table("message_sessions").find((row) => row.whatsapp_phone === phone);
    if (savedSession) Object.assign(savedSession, { current_flow: null, current_step: null, context_json: {} });
  }

  // ---------- thanks and wellbeing
  scenario("small talk");
  reply = await send(ALICE, "make offer");
  reply = await send(ALICE, "thanks");
  check("thanks mid-flow is warm", reply.includes("You are welcome"), reply);
  check("thanks keeps the flow", (await sessionFlow(ALICE)) === "create_listing");
  reply = await send(ALICE, "hi");
  check("greeting mid-flow sounds natural", reply.includes("Hi Test") && reply.includes("listing draft is still open"), reply);
  check("greeting preserves the active flow", (await sessionFlow(ALICE)) === "create_listing");

  reply = await send(ALICE, "how far");
  check("wellbeing reply uses natural Pidgin", reply.includes("I dey good"), reply);
  check("wellbeing keeps the active flow", (await sessionFlow(ALICE)) === "create_listing");

  reply = await send(ALICE, "what's good?", {
    interpret: { action: "greeting", answer: "Hi there! I am here and ready." },
  });
  check("model small talk is personalized locally", reply.includes("Hi Test!"), reply);
  check("model small talk gets a contextual nudge", reply.includes("listing draft is still open"), reply);

  reply = await send(ALICE, "why is the sky blue?", {
    interpret: {
      action: "question",
      answer: "Sunlight scatters in the atmosphere, and blue light scatters more strongly than most visible colours.",
    },
  });
  check("simple general question is answered directly", reply.includes("blue light scatters"), reply);
  check("general answer preserves the listing flow", (await sessionFlow(ALICE)) === "create_listing");

  reply = await send(ALICE, "what is the NGN to RWF rate?", {
    interpret: { action: "question", answer: "The live rate is 1 NGN to 999 RWF." },
  });
  check("model cannot invent a live exchange rate", !reply.includes("999 RWF"), reply);
  check("rate question uses Akara market data", reply.includes("Akara") && (reply.includes("peer-set") || reply.includes("Market Rate")), reply);
  await send(ALICE, "cancel");

  reply = await send(ALICE, "write me a full university thesis", {
    interpret: {
      action: "unknown",
      answer: "I cannot write a full thesis here, but I can help you shape a focused outline.",
    },
  });
  check("out-of-scope request gets a useful answer", reply.includes("focused outline"), reply);
  check("out-of-scope answer returns gently to Akara", reply.includes("What would you like to do next?"), reply);
  check(
    "out-of-scope answer carries the native Akara menu",
    lastListPayload()?.sections?.[0]?.rows?.some((row) => row.id === "find_offers"),
    JSON.stringify(lastListPayload())
  );

  // ---------- reserve without context
  scenario("reserve guidance");
  reply = await send(ALICE, "open the offer", { interpret: { action: "reserve_listing" } });
  check("reserve without code is guided", reply.includes("Which offer?"), reply);

  // ---------- demand-seeking question → search first, list only on yes
  scenario("demand-seeking search");
  reply = await send(ALICE, "who needs naira? 50k for 54k rwf?", {
    interpret: { action: "find_offer", have_currency: "NGN", have_amount: 50000, want_currency: "RWF", want_amount: 54000 },
  });
  check("demand question searches instead of listing", !reply.includes("*Review listing*"), reply);
  check("no-match search offers to list", reply.includes("*No matching offer yet*"), reply);
  check("offer prompt carries both sides", reply.includes("50,000 NGN") && reply.includes("54,000 RWF"), reply);
  check("offer prompt awaits confirmation", (await sessionFlow(ALICE)) === "find_offer");

  reply = await send(ALICE, "yes", { interpret: { action: "flow_reply" } });
  check("yes opens prefilled listing review", reply.includes("*Review listing*"), reply);
  check("prefill keeps send side", reply.includes("50,000 NGN"), reply);
  check("prefill keeps receive side", reply.includes("54,000 RWF"), reply);
  check("confirmation enters create flow", (await sessionFlow(ALICE)) === "create_listing");
  await send(ALICE, "cancel");

  // even when the model mislabels the demand question as create_listing,
  // the router searches first instead of opening the create flow
  reply = await send(ALICE, "who needs naira? 50k for 54k rwf?", {
    interpret: { action: "create_listing", have_currency: "NGN", have_amount: 50000, want_currency: "RWF", want_amount: 54000 },
  });
  check("create_listing misfire still searches first", reply.includes("*No matching offer yet*") && !reply.includes("*Review listing*"), reply);

  reply = await send(ALICE, "no thanks", { interpret: { action: "flow_reply" } });
  check("decline closes the search", reply.includes("No problem"), reply);
  check("decline never opens listing flow", (await sessionFlow(ALICE)) === null);

  // with a live counterparty listing, the same question shows matches
  seedListing(bobRow, { code: "AKR-LIST-300", have_currency: "RWF", have_amount: 60000, want_currency: "NGN", want_amount: 56000 });
  reply = await send(ALICE, "who needs naira? 50k for 54k rwf?", {
    interpret: { action: "find_offer", have_currency: "NGN", have_amount: 50000, want_currency: "RWF", want_amount: 54000 },
  });
  check("demand question shows live matches", reply.includes("AKR-LIST-300"), reply);
  check("matches enter search results", (await sessionFlow(ALICE)) === "search_results");
  await send(ALICE, "cancel");

  // ---------- fresh-session edit request goes straight to the edit handler
  scenario("fresh edit request");
  const editListing = seedListing(aliceRow, { code: "AKR-LIST-888", have_currency: "NGN", have_amount: 20000, want_currency: "RWF", want_amount: 22000 });
  reply = await send(ALICE, "i want to edit my listing", { interpret: { action: "settings_action" } });
  check("fresh edit skips review screen", !reply.includes("*Review listing*"), reply);
  check("fresh edit opens focused edit choices", reply.includes("*What do you want to edit?*") && reply.includes("send amount"), reply);
  check("fresh edit pauses the listing", __table("listings").find((row) => row.id === editListing.id)?.status === "paused", reply);
  check("fresh edit enters create flow", (await sessionFlow(ALICE)) === "create_listing");

  reply = await send(ALICE, "1");
  reply = await send(ALICE, "25000");
  check("send amount edit keeps the other listing details", reply.includes("*Review listing*") && reply.includes("25,000 NGN") && reply.includes("22,000 RWF"), reply);

  reply = await send(ALICE, "edit");
  reply = await send(ALICE, "2");
  reply = await send(ALICE, "70000");
  check("receive amount edit keeps the updated send amount", reply.includes("*Review listing*") && reply.includes("25,000 NGN") && reply.includes("70,000 RWF"), reply);

  reply = await send(ALICE, "edit");
  reply = await send(ALICE, "3");
  reply = await send(ALICE, "fixed");
  check("edited draft re-previews", reply.includes("*Review listing*") && reply.includes("25,000 NGN"), reply);

  reply = await send(ALICE, "publish");
  check("publish updates the existing listing", reply.includes("Listing updated ✅"), reply);
  check("edited listing keeps its identity", __table("listings").find((row) => row.id === editListing.id)?.status === "active", reply);
  check("edited listing carries new amount", Number(__table("listings").find((row) => row.id === editListing.id)?.have_amount) === 25000, reply);

  // ---------- NGN payout edit with CoinProfile resolution (faked over fetch)
  scenario("payout resolution");
  const CHIDI = "250700000003";
  const chidiRow = seedVerifiedUser(CHIDI, "Chidi Payout Okoro");
  seedPayout(chidiRow, "NGN");
  const originalChidiPayout = __table("payment_profiles")
    .find((row) => row.user_id === chidiRow.id && row.currency === "NGN");
  const originalChidiAccountNumber = originalChidiPayout.account_number_encrypted;

  check(
    "bank ownership accepts a verified two-name subset",
    verifiedBankNameMatch("Steven Promise Uchenna", "Promise Steven")
  );
  check(
    "bank ownership accepts provider text around two verified names",
    verifiedBankNameMatch("Stephen Promise Uchenna", "GIYD-Uchenna Stephen")
  );
  check(
    "bank ownership still rejects an unrelated account holder",
    !verifiedBankNameMatch("Stephen Promise Uchenna", "Musa Ibrahim")
  );
  check(
    "bank ownership rejects a single matching name",
    !verifiedBankNameMatch("Stephen Promise Uchenna", "Uchenna")
  );

  const resolveCalls = [];
  const realFetch = global.fetch;
  Object.assign(config, {
    coinProfileApiUrl: "https://coinprofile.test/v1",
    coinProfileApiKey: "test-key",
    coinProfileUsername: "test-user",
  });
  // CoinProfile fake: the resolve payload mirrors production, where the
  // nested data.data object is the BANK record (its `name` is the bank) and
  // the account holder's name arrives as the outer accountName.
  global.fetch = async (url, options = {}) => {
    const pathname = new URL(url).pathname;
    const respond = (payload) => ({ ok: true, status: 200, text: async () => JSON.stringify(payload) });
    if (pathname.endsWith("/bank/supported")) {
      return respond({
        success: true,
        data: [
          { Name: "Guaranty Trust Bank", Code: "058" },
          { Name: "Paycom", Code: "305" },
          { Name: "Opay", Code: "999" },
          { Name: "Access Bank", Code: "044" },
          { Name: "Zenith Bank", Code: "057" },
          { Name: "United Bank for Africa", Code: "033" },
          { Name: "Kuda Microfinance Bank", Code: "50211" },
          { Name: "First Bank of Nigeria", Code: "011" },
          { Name: "First City Monument Bank", Code: "214" },
          { Name: "Stanbic IBTC Bank", Code: "221" },
          { Name: "Wema Bank", Code: "035" },
        ],
      });
    }
    if (pathname.endsWith("/bank/resolve")) {
      const requestBody = JSON.parse(options.body);
      resolveCalls.push(requestBody);
      return respond({
        success: true,
        data: {
          accountName: requestBody.accountNumber === "0000000999"
            ? "MUSA IBRAHIM"
            : "OKORO CHIDI PAYOUT",
          data: { name: requestBody.bankCode === "305" ? "Paycom" : "Guaranty Trust Bank", code: requestBody.bankCode },
        },
      });
    }
    throw new Error(`unexpected CoinProfile fetch: ${url}`);
  };

  try {
    const opayMatches = await findNigerianBanks("Opay Bank");
    check("opay bank matches CoinProfile's Paycom entry", opayMatches.length === 1 && opayMatches[0].code === "305", JSON.stringify(opayMatches));
    check("opay match displays as Opay", opayMatches[0]?.name === "Opay", JSON.stringify(opayMatches));

    reply = await send(CHIDI, "add NGN payout");
    const bankRows = lastListPayload()?.sections?.[0]?.rows || [];
    check("NGN payout setup opens the native bank tray", lastListPayload()?.button === "Choose bank", JSON.stringify(lastListPayload()));
    check(
      "popular Nigerian banks rank before the remaining directory",
      bankRows.slice(0, 3).map((row) => row.title).join(",") === "Kuda Microfinance Bank,Opay,Guaranty Trust Bank",
      JSON.stringify(bankRows)
    );
    check(
      "bank tray provides supported banks and a search action",
      bankRows.some((row) => row.id === "payout_bank:058")
        && bankRows.some((row) => row.title === "Opay")
        && bankRows.some((row) => row.id === "payout_bank_search")
        && bankRows.some((row) => row.id === "payout_bank_page:1"),
      JSON.stringify(bankRows)
    );

    reply = await send(CHIDI, "payout_bank_page:1");
    check(
      "bank tray paginates through the full supported list",
      lastListPayload()?.body?.includes("Page 2 of 2")
        && lastListPayload()?.sections?.[0]?.rows?.some((row) => row.id === "payout_bank_page:0"),
      JSON.stringify(lastListPayload())
    );

    reply = await send(CHIDI, "payout_bank_search");
    check("bank search action asks for a typed bank name", reply.includes("*Search Nigerian banks*"), reply);
    reply = await send(CHIDI, "opay");
    check("typed bank search selects the bank", reply.includes("*Bank:* Opay") && reply.includes("account number"), reply);
    check(
      "account-number step provides a native change-bank action",
      lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "edit_account_bank",
      JSON.stringify(lastButtonPayload())
    );
    await send(CHIDI, "cancel");

    reply = await send(CHIDI, "bank details");
    reply = await send(CHIDI, "edit payout 1");
    check("payout edit menu opens", reply.includes("Edit NGN payout"), reply);

    reply = await send(CHIDI, "bank");
    reply = await send(CHIDI, "opay");
    check("opay resolves against paycom's bank code", resolveCalls.length === 1 && resolveCalls[0]?.bankCode === "305", JSON.stringify(resolveCalls));
    check("resolved bank account gets a dedicated ownership check", reply.includes("*Bank account found*"), reply);
    check("ownership check shows Opay, never Paycom", reply.includes("*Bank:* Opay") && !reply.includes("Paycom"), reply);
    check("ownership check shows the bank-returned name", reply.includes("*Account name:* OKORO CHIDI PAYOUT"), reply);
    check(
      "ownership check uses native confirmation buttons",
      lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "confirm_account_owner,wrong_account",
      JSON.stringify(lastButtonPayload())
    );

    reply = await send(CHIDI, "wrong_account");
    check("wrong-account action immediately asks for a corrected number", reply.includes("*Change account number*"), reply);

    reply = await send(CHIDI, "0000000999");
    check("mismatched bank name is blocked before payout review", reply.includes("*Account name does not match*"), reply);
    check("mismatch message compares returned and verified names", reply.includes("MUSA IBRAHIM") && reply.includes("Chidi Payout Okoro"), reply);
    check("mismatch cannot expose the save action", !reply.includes("Save payout"), reply);
    check(
      "mismatch provides correction buttons",
      lastButtonPayload()?.buttons?.map((button) => button.id).join(",") === "edit_account_number,edit_account_bank,cancel",
      JSON.stringify(lastButtonPayload())
    );
    check("mismatch does not change the saved payout", originalChidiPayout.account_number_encrypted === originalChidiAccountNumber, JSON.stringify(originalChidiPayout));

    reply = await send(CHIDI, "save payout");
    check("save cannot bypass a bank-name mismatch", reply.includes("*Account name does not match*"), reply);

    reply = await send(CHIDI, "edit_account_number");
    check("mismatch correction returns to account-number entry", reply.includes("*Change account number*"), reply);
    reply = await send(CHIDI, originalChidiAccountNumber);
    check("corrected account is revalidated", reply.includes("*Bank account found*") && reply.includes("OKORO CHIDI PAYOUT"), reply);

    reply = await send(CHIDI, "confirm_account_owner");
    check("ownership confirmation opens the final payout review", reply.includes("*Review payout detail*"), reply);
    check("final review confirms the bank check", reply.includes("Account name confirmed by the bank"), reply);

    reply = await send(CHIDI, "save payout");
    check("resolved payout saves", reply.includes("Payout detail saved ✅"), reply);
    const chidiPayout = __table("payment_profiles").find((row) => row.user_id === chidiRow.id && row.currency === "NGN");
    check("saved payout keeps Opay as the bank", chidiPayout?.bank_name === "Opay", JSON.stringify(chidiPayout));
    check("saved payout keeps the resolved holder name", chidiPayout?.account_name === "OKORO CHIDI PAYOUT", JSON.stringify(chidiPayout));
  } finally {
    global.fetch = realFetch;
    Object.assign(config, { coinProfileApiUrl: "", coinProfileApiKey: "", coinProfileUsername: "" });
  }

  scenario("recurring smart matching sweep");
  const sweepMaker = seedVerifiedUser("250700000091", "Sweep Maker");
  const sweepTaker = seedVerifiedUser("250700000092", "Sweep Taker");
  for (const currency of ["GHS", "KES"]) {
    seedPayout(sweepMaker, currency);
    seedPayout(sweepTaker, currency);
  }
  for (const listing of __table("listings")) {
    const isSweepPair = ["GHS", "KES"].includes(listing.have_currency)
      && ["GHS", "KES"].includes(listing.want_currency);
    if (isSweepPair && listing.status === "active") listing.status = "closed";
  }
  const sweepSource = seedListing(sweepMaker, {
    code: "AKR-LIST-SW1",
    have_currency: "KES",
    have_amount: 100000,
    want_currency: "GHS",
    want_amount: 2000,
    listing_type: "negotiable",
    created_at: "2025-02-01T00:00:00.000Z",
  });
  const sweepCandidate = seedListing(sweepTaker, {
    code: "AKR-LIST-SW2",
    have_currency: "GHS",
    have_amount: 2200,
    want_currency: "KES",
    want_amount: 100000,
    listing_type: "negotiable",
    created_at: "2025-02-01T00:00:01.000Z",
  });
  const dealsBeforeSweep = __table("deals").length;
  const sweepResult = await runSmartMatchingSweep({ batchSize: 500 });
  const sweepDeal = __table("deals").find((deal) => deal.listing_id === sweepCandidate.id);
  check(
    "recurring sweep matches reciprocal listings without a new chat message",
    sweepResult.matched >= 1
      && Boolean(sweepDeal)
      && sweepSource.status === "reserved"
      && sweepCandidate.status === "reserved",
    JSON.stringify({ sweepResult, sweepDeal, sweepSource, sweepCandidate })
  );
  await runSmartMatchingSweep({ batchSize: 500 });
  check(
    "repeated sweeps do not duplicate an already claimed match",
    __table("deals").length === dealsBeforeSweep + 1,
    JSON.stringify(__table("deals").slice(dealsBeforeSweep))
  );

  clearHistory(ALICE);
  clearHistory(BOB);
  clearHistory(CHIDI);
}

run()
  .then(() => {
    console.log = realLog;
    const total = passed + failures.length;
    realLog(`\n${passed}/${total} checks passed`);
    if (failures.length) {
      for (const failure of failures) {
        realLog(`\nFAIL [${failure.scenario}] ${failure.label}`);
        if (failure.detail) realLog(`  reply: ${failure.detail.replace(/\n/g, " | ")}`);
      }
      process.exit(1);
    }
    realLog("All offline tests passed ✅");
    // The deal room schedules real receipt-deadline timers; exit explicitly
    // so a pending 15-minute setTimeout cannot keep the test process alive.
    process.exit(0);
  })
  .catch((error) => {
    console.log = realLog;
    realLog(`\nTest run crashed in scenario "${currentScenario}":`);
    realLog(error.stack || error);
    process.exit(1);
  });
