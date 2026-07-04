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

const { buildReply } = require("../router");
const { sendIdleMenus } = require("../app");
const { findOrCreateUser } = require("../db/users");
const { getSession } = require("../db/sessions");
const intents = require("../nlp/intents");
const { clearHistory } = require("../nlp/history");
const { config } = require("../config");
const { findNigerianBanks } = require("../lib/coinprofile");

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
  return buildReply(text, user, session, incoming);
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
    account_name: user.legal_name || "Test User",
    bank_name: bank ? "GTBank" : null,
    account_number_encrypted: bank ? "0123456789" : null,
    momo_network: bank ? null : "MTN",
    momo_number_encrypted: bank ? null : "0788000001",
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
    status: "active",
    created_at: new Date().toISOString(),
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

  // ---------- intent regex units
  scenario("intent regex units");
  check("bank information → payouts", intents.isPayoutsCommand("bank information"));
  check("show my bank info → payouts", intents.isPayoutsCommand("show my bank info"));
  check("payment details → payouts", intents.isPayoutsCommand("payment details"));
  check("my momo → payouts", intents.isPayoutsCommand("my momo"));
  check("view my payout details → payouts", intents.isPayoutsCommand("view my payout details"));
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

  // ---------- unverified journey
  scenario("unverified journey");
  let reply = await send(ALICE, "hi");
  check("greeting → verification intro", reply.includes("Welcome to Akara"), reply);

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
  check("menu shows core options", reply.includes("`make offer`") && reply.includes("`find offers`"), reply);

  reply = await send(ALICE, "profile");
  check("profile view title", reply.includes("*Your profile*"), reply);
  check("profile shows completed trades", reply.includes("Completed trades"), reply);
  check("profile counts completed deals from records", reply.includes("*Completed trades:* 3"), reply);
  check("profile has no bank numbers", !reply.includes("0123456789"), reply);
  check("profile has no payout list", !reply.includes("*Payouts*"), reply);

  reply = await send(ALICE, "okay thanks");
  check("session closure returns the menu", reply.includes("*Akara menu*"), reply);
  check("session closure is calm", reply.includes("*Done*"), reply);
  removeSeededDeals(completedProfileDeals);

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

  reply = await send(ALICE, "my listings");
  check("listings view empty state", reply.includes("No listings yet"), reply);

  reply = await send(ALICE, "my transactions");
  check("history synonym works", reply.includes("No transaction history yet"), reply);

  reply = await send(ALICE, "5", { quotedText: "*Akara menu*\n1. make offer" });
  check("quoted menu 5 → scoped profile", reply.includes("*Your profile*"), reply);

  // ---------- service fee + referral copy
  scenario("service fee copy");
  reply = await send(ALICE, "how much do you charge?");
  check("fee answer stays simple", reply.includes("Akara is free to use") && !reply.includes("10 more free trades"), reply);
  check("fee answer not 'free for now'", !reply.toLowerCase().includes("free for now"), reply);

  reply = await send(ALICE, "how do i get free trades?");
  check("referral question answered", reply.includes("Invite a friend or refer a friend"), reply);

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
  check("listing appears in scoped view", reply.includes("AKR-LIST-001"), reply);

  reply = await send(ALICE, "I have 50k naira and want 55k RWF");
  check("duplicate live listing is blocked", reply.includes("*Listing already live*"), reply);
  check("duplicate listing points to existing reference", reply.includes("AKR-LIST-001"), reply);
  check("duplicate listing does not open review", !reply.includes("*Review listing*"), reply);

  const DORA = "250700000004";
  const doraRow = seedVerifiedUser(DORA, "Promise Uchenna Steven");
  seedPayout(doraRow, "NGN");
  reply = await send(DORA, "I have 10k NGN and want 12k RWF");
  check("missing receive payout starts payout setup", reply.includes("*Add payout detail*") && reply.includes("RWF"), reply);
  reply = await send(DORA, "mtn");
  check("momo network asks for registered name", reply.includes("Quick option") && reply.includes("Promise Uchenna Steven"), reply);
  reply = await send(DORA, "option 1");
  check("verified name shortcut advances to momo number", reply.toLowerCase().includes("mobile money phone number"), reply);
  reply = await send(DORA, "0788123456");
  check("momo number advances to payout review", reply.includes("Review payout detail"), reply);
  reply = await send(DORA, "save payout");
  check("saving payout resumes listing review", reply.includes("Payout detail saved") && reply.includes("*Review listing*"), reply);

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

  const { listingCardVersion } = require("../lib/listing-card");
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

  reply = await send(ALICE, "hi, I want to convert 16,728 naira for 18,500 RWF. Is there any available offer that is within around this rate?", {
    interpret: { action: "find_offer", have_currency: "NGN", have_amount: 16728, want_currency: "RWF", want_amount: 18500 },
  });
  check("rate-shaped request offers to list when no offer fits", reply.includes("*No current offer*"), reply);
  check("no-match offer keeps extracted send amount", reply.includes("16,728 NGN"), reply);
  check("no-match offer keeps extracted receive amount", reply.includes("18,500 RWF"), reply);
  check("no-match offer waits for confirmation", (await sessionFlow(ALICE)) === "find_offer");

  reply = await send(ALICE, "yes", { interpret: { action: "flow_reply" } });
  check("yes after no-match opens prefilled review", reply.includes("*Review listing*"), reply);
  check("prefilled review keeps send amount", reply.includes("16,728 NGN"), reply);
  check("prefilled review keeps receive amount", reply.includes("18,500 RWF"), reply);

  reply = await send(ALICE, "edit", { interpret: { action: "settings_action" } });
  check("review edit asks what to edit", reply.includes("*What do you want to edit?*"), reply);
  check("review edit offers amount choices", reply.includes("`send amount`") && reply.includes("`receive amount`"), reply);

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

  reply = await send(ALICE, "show me ngn offers");
  check("browse shows bob listing", reply.includes("AKR-LIST-090"), reply);
  check("browse enters search_results", (await sessionFlow(ALICE)) === "search_results");

  reply = await send(ALICE, "9");
  check("invalid number is guided", reply.includes("valid offer number"), reply);

  reply = await send(ALICE, "1");
  check("number 1 opens the trade", reply.includes("Akara Trade opened ✅"), reply);
  check("selection enters deal room", (await sessionFlow(ALICE)) === "deal_room");

  // ---------- deal room actions
  scenario("deal room");
  reply = await send(ALICE, "status");
  check("status shows summary", reply.includes("_Transaction ref_") && reply.includes("*AKR-TXN-001*"), reply);

  reply = await send(ALICE, "i don pay");
  check("paid asks for receipt", reply.includes("Receipt needed"), reply);

  reply = await send(BOB, "received");
  check("bob confirms receipt", reply.includes("Receipt confirmed ✅"), reply);

  reply = await send(ALICE, "menu");
  check("menu escapes deal room", reply.includes("*Akara menu*"), reply);
  check("deal room released", (await sessionFlow(ALICE)) === null);

  reply = await send(ALICE, "what's next for my trade?", { interpret: { action: "trade_action" } });
  check("trade recall reopens deal", reply.includes("AKR-TXN-001"), reply);
  const recalledDeal = __table("deals").find((row) => row.deal_code === "AKR-TXN-001");
  recalledDeal.taker_sent_at = new Date().toISOString();
  reply = await send(ALICE, "cancel");
  check("active trade cancel stays deal-specific", reply.includes("Cannot close from chat"), reply);
  check("active trade cancel points to dispute", reply.includes("dispute AKR-TXN-001"), reply);
  check("active trade cancel does not show profile actions", !reply.includes("Manage payout details"), reply);

  reply = await send(ALICE, "dispute AKR-TXN-001 because amount did not arrive");
  check("dispute opens with reason", reply.includes("*Dispute opened AKR-TXN-001*") && reply.includes("amount did not arrive"), reply);

  reply = await send(BOB, "close dispute");
  check("non opener cannot close dispute", reply.includes("Only the person who opened this dispute"), reply);

  reply = await send(ALICE, "close dispute");
  check("opener can withdraw dispute", reply.includes("Dispute withdrawn"), reply);

  // ---------- flexible listing negotiation
  scenario("flexible listing negotiation");
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
  check("flexible listing starts negotiation", reply.includes("*Flexible listing*"), reply);
  check("flexible listing does not instantly reserve", (await sessionFlow(ALICE)) === "negotiation", reply);

  reply = await send(ALICE, "offer 105000 rwf");
  check("proposal is sent", reply.includes("*Proposal sent*") && reply.includes("105,000 RWF"), reply);
  check("owner receives negotiation session", (await sessionFlow(CHARLIE)) === "negotiation");

  reply = await send(CHARLIE, "accept");
  check("owner acceptance opens trade", reply.includes("Akara Trade opened ✅"), reply);
  const negotiatedDeal = __table("deals").find((row) => row.listing_id === __table("listings").find((listing) => listing.listing_code === "AKR-LIST-091")?.id);
  check("negotiated amount becomes deal amount", Number(negotiatedDeal?.want_amount) === 105000, JSON.stringify(negotiatedDeal));

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
  check("terms revision applies", reply.includes("Flexible rate"), reply);
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
  check("menu escapes find flow", reply.includes("*Akara menu*"), reply);
  check("find flow released", (await sessionFlow(ALICE)) === null);

  // ---------- settings: edit instead of new payout + bulk confirm
  scenario("settings actions");
  reply = await send(ALICE, "update my bank details");
  check("update edits existing payout", reply.includes("Edit NGN payout") || reply.includes("*Edit"), reply);
  check("update does not start add flow", !reply.includes("Choose where incoming payments should land"), reply);
  await send(ALICE, "cancel");

  seedListing(aliceRow, { code: "AKR-LIST-777", have_currency: "NGN", have_amount: 10000, want_currency: "GHS", want_amount: 200 });
  reply = await send(ALICE, "cancel all my listings");
  check("bulk cancel asks to confirm", reply.includes("Cancel all listings?"), reply);

  reply = await send(ALICE, "confirm");
  check("bulk cancel completes", reply.includes("Listings cancelled"), reply);

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
  seedListing(bobRow, { code: "AKR-LIST-200", have_currency: "NGN", have_amount: 200000, want_currency: "RWF", want_amount: 220000 });
  reply = await send(ALICE, "i have 220k rwf and want 200k naira");
  check("reciprocal request previews listing", reply.includes("*Review listing*"), reply);

  reply = await send(ALICE, "publish");
  check("publish auto-matches reciprocal listing", reply.includes("Akara Trade opened ✅"), reply);
  await send(ALICE, "cancel trade");
  await send(ALICE, "cancel");

  // ---------- thanks and wellbeing
  scenario("small talk");
  reply = await send(ALICE, "make offer");
  reply = await send(ALICE, "thanks");
  check("thanks mid-flow is warm", reply.includes("You're welcome"), reply);
  check("thanks keeps the flow", (await sessionFlow(ALICE)) === "create_listing");
  reply = await send(ALICE, "hi");
  check("greeting mid-flow restarts", reply.includes("👋"), reply);
  check("greeting releases flow", (await sessionFlow(ALICE)) === null);

  reply = await send(ALICE, "how far");
  check("wellbeing reply", reply.includes("I dey alright"), reply);

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
  check("no-match search offers to list", reply.includes("*No current offer*"), reply);
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
  check("create_listing misfire still searches first", reply.includes("*No current offer*") && !reply.includes("*Review listing*"), reply);

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
  check("fresh edit opens the edit handler", reply.includes("*Edit listing*") && reply.includes("What currency do you have?"), reply);
  check("fresh edit pauses the listing", __table("listings").find((row) => row.id === editListing.id)?.status === "paused", reply);
  check("fresh edit enters create flow", (await sessionFlow(ALICE)) === "create_listing");

  reply = await send(ALICE, "ngn");
  reply = await send(ALICE, "rwf");
  reply = await send(ALICE, "25000");
  reply = await send(ALICE, "70000");
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
        ],
      });
    }
    if (pathname.endsWith("/bank/resolve")) {
      const requestBody = JSON.parse(options.body);
      resolveCalls.push(requestBody);
      return respond({
        success: true,
        data: {
          accountName: "OKORO CHIDI PAYOUT",
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

    reply = await send(CHIDI, "bank details");
    reply = await send(CHIDI, "edit payout 1");
    check("payout edit menu opens", reply.includes("Edit NGN payout"), reply);

    reply = await send(CHIDI, "bank");
    reply = await send(CHIDI, "opay");
    check("opay resolves against paycom's bank code", resolveCalls.length === 1 && resolveCalls[0]?.bankCode === "305", JSON.stringify(resolveCalls));
    check("review bank line shows Opay, never Paycom", reply.includes("*Bank:* Opay") && !reply.includes("Paycom"), reply);
    check("review name line shows the resolved holder", reply.includes("*Name:* OKORO CHIDI PAYOUT"), reply);
    check("review confirms the bank check", reply.includes("Account name confirmed by the bank"), reply);

    reply = await send(CHIDI, "save payout");
    check("resolved payout saves", reply.includes("Payout detail saved ✅"), reply);
    const chidiPayout = __table("payment_profiles").find((row) => row.user_id === chidiRow.id && row.currency === "NGN");
    check("saved payout keeps Opay as the bank", chidiPayout?.bank_name === "Opay", JSON.stringify(chidiPayout));
    check("saved payout keeps the resolved holder name", chidiPayout?.account_name === "OKORO CHIDI PAYOUT", JSON.stringify(chidiPayout));
  } finally {
    global.fetch = realFetch;
    Object.assign(config, { coinProfileApiUrl: "", coinProfileApiKey: "", coinProfileUsername: "" });
  }

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
