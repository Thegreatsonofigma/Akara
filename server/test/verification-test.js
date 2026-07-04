#!/usr/bin/env node

// Offline tests for the verification flow. Every reply in verification is
// predetermined copy — the model may classify messages (wall detection), but
// its written answers must never be sent, woven, or saved as data. Supabase,
// OpenAI, WhatsApp media, and the success card are all faked so the whole
// flow runs exactly as production minus the network.
//
// Run: node server/test/verification-test.js   (VERBOSE=1 for full replies)

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AKARA_SEND_MODE = "log";
process.env.OPENAI_API_KEY = "fake-openai-key";
process.env.OPENAI_MODEL = "gpt-5-nano";
process.env.COIN_PROFILE_API_URL = "replace_with_disabled";
process.env.COIN_PROFILE_API_KEY = "replace_with_disabled";
process.env.COIN_PROFILE_USERNAME = "replace_with_disabled";
process.env.AKARA_TYPING_INDICATOR = "false";

const path = require("node:path");

const fakeSupabase = require("./fake-supabase");

const openaiStub = {
  enabled: false,
  queue: [],
  isOpenAiEnabled: () => openaiStub.enabled,
  openAiGenerate: async () => {
    throw new Error("openAiGenerate must never run during verification tests");
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

// WhatsApp media download is faked per-test; everything else stays real
// (send mode "log" already no-ops outbound sends).
let mediaHandler = async () => ({ buffer: Buffer.from("fake-bytes"), contentType: "image/jpeg", sha256: null });
const whatsapp = require("../lib/whatsapp");
whatsapp.getWhatsAppMedia = async (mediaId) => mediaHandler(mediaId);

// Success card: count invocations instead of rendering a PNG.
const cardSends = [];
const listingCard = require("../lib/listing-card");
listingCard.sendVerificationSuccessCard = async (to) => {
  cardSends.push(to);
  return null;
};

const { buildReply } = require("../router");
const { findOrCreateUser } = require("../db/users");
const { getSession } = require("../db/sessions");

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

async function send(phone, text, { interpret, media } = {}) {
  if (interpret) {
    openaiStub.enabled = true;
    openaiStub.queue = [fullInterpretation(interpret)];
  } else {
    openaiStub.enabled = false;
    openaiStub.queue = [];
  }

  const user = await findOrCreateUser(phone, "Test User");
  const session = await getSession(phone);
  const incoming = { from: phone, text, media: media || null, quotedText: "" };
  return buildReply(text, user, session, incoming);
}

function userRow(phone) {
  return __table("users").find((row) => row.whatsapp_phone === phone);
}

function requestsFor(phone) {
  const user = userRow(phone);
  return __table("verification_requests").filter((row) => row.user_id === user?.id);
}

async function sessionState(phone) {
  const session = await getSession(phone);
  return {
    flow: session?.current_flow || null,
    step: session?.current_step || null,
    context: session?.context_json || {},
  };
}

// Walks a user through the identity steps up to the payout choice prompt.
async function completeIdentitySteps(phone, { name, nationality, residence, city, idType, idCountry, docId, selfieId }) {
  await send(phone, "verify");
  await send(phone, name);
  await send(phone, nationality);
  await send(phone, residence);
  await send(phone, city);
  await send(phone, idType);
  await send(phone, idCountry);
  await send(phone, "", { media: { id: docId } });
  return send(phone, "", { media: { id: selfieId } });
}

// ---------------------------------------------------------------- tests

async function run() {
  __reset();

  const U1 = "250711000001"; // happy path, matched payout name → tier 1
  const U2 = "250711000002"; // mismatched payout name → manual review
  const U3 = "250711000003"; // decline paths at the payout review
  const U4 = "250711000004"; // cancel mid-flow, then resume

  // ---------- start + restart safety
  scenario("start");
  let reply = await send(U1, "verify");
  check("verify starts with legal name prompt", reply.toLowerCase().includes("legal name"), reply);
  check("one verification request created", requestsFor(U1).length === 1);
  check("user marked pending_input", userRow(U1).verification_status === "pending_input");
  const u1RequestId = requestsFor(U1)[0].id;

  reply = await send(U1, "verify", { interpret: { action: "verify" } });
  check("verify mid-flow re-prompts, not saved as name", reply.toLowerCase().includes("legal name"), reply);
  check("verify mid-flow creates no duplicate request", requestsFor(U1).length === 1);
  check("verify mid-flow does not become the legal name", userRow(U1).legal_name !== "Verify", userRow(U1).legal_name);

  // ---------- legal name validation (deterministic, OpenAI off)
  scenario("legal name validation");
  reply = await send(U1, "menu");
  check("menu mid-flow re-prompts the step", reply.toLowerCase().includes("legal name"), reply);
  check("menu is not saved as legal name", !userRow(U1).legal_name, userRow(U1).legal_name);

  reply = await send(U1, "hello");
  check("hello is not saved as legal name", !userRow(U1).legal_name, userRow(U1).legal_name);

  reply = await send(U1, "J");
  check("too-short name re-asks", reply.toLowerCase().includes("legal name") || reply.includes("first and last name"), reply);

  reply = await send(U1, "John");
  check("single word name re-asks for full name", reply.includes("first and last name"), reply);

  reply = await send(U1, "John 123");
  check("digits in name re-ask", reply.includes("first and last name"), reply);
  check("invalid names never saved", !userRow(U1).legal_name, userRow(U1).legal_name);

  reply = await send(U1, "John Doe", { interpret: { action: "flow_reply", answer: "NOTE_FROM_AI" } });
  check("valid name advances to nationality", reply.toLowerCase().includes("nationality"), reply);
  check("AI answer never woven into flow reply", !reply.includes("NOTE_FROM_AI"), reply);
  check("legal name saved", userRow(U1).legal_name === "John Doe", userRow(U1).legal_name);

  // ---------- no AI answers inside verification
  scenario("no AI answers");
  reply = await send(U1, "what is akara?", { interpret: { action: "question", answer: "AI_ANSWER_TEXT" } });
  check("question mid-flow never returns the AI answer", !reply.includes("AI_ANSWER_TEXT"), reply);
  check("question wall re-shows the current prompt", reply.toLowerCase().includes("nationality"), reply);
  check("question keeps the flow", (await sessionState(U1)).flow === "verification");

  reply = await send(U1, "find offers", { interpret: { action: "find_offer", answer: "Fetching offers now!" } });
  check("fresh request is walled", reply.includes("Verification comes first"), reply);
  check("wall never includes the AI answer", !reply.includes("Fetching offers now!"), reply);
  check("wall re-shows the current prompt", reply.toLowerCase().includes("nationality"), reply);
  check("wall keeps the flow", (await sessionState(U1)).flow === "verification");

  // ---------- identity details validation
  scenario("identity details");
  reply = await send(U1, "12");
  check("numeric nationality re-asks", reply.toLowerCase().includes("nationality"), reply);
  check("numeric nationality not saved", userRow(U1).nationality !== "12", userRow(U1).nationality);

  reply = await send(U1, "Nigeria");
  check("nationality advances to residence country", reply.toLowerCase().includes("live in"), reply);
  check("nationality saved", userRow(U1).nationality === "Nigeria");

  reply = await send(U1, "Rwanda");
  check("residence advances to city", reply.toLowerCase().includes("city"), reply);

  reply = await send(U1, "Kigali");
  check("city advances to ID type", reply.includes("passport"), reply);

  reply = await send(U1, "driving licence");
  check("unknown ID type re-asks", reply.includes("passport") && reply.includes("student id"), reply);

  reply = await send(U1, "2");
  check("numbered ID pick works", reply.toLowerCase().includes("issued"), reply);
  check("numbered pick maps to national_id", requestsFor(U1)[0].id_type === "national_id", requestsFor(U1)[0].id_type);
  check("no stray punctuation in prompts", !reply.includes("?."), reply);

  reply = await send(U1, "Nigeria");
  check("ID country advances to document upload", reply.includes("front/main page"), reply);

  // ---------- document + selfie uploads
  scenario("documents");
  reply = await send(U1, "here you go");
  check("text at document step re-prompts for media", reply.toLowerCase().includes("photo or pdf"), reply);

  mediaHandler = async () => {
    throw new Error("boom");
  };
  reply = await send(U1, "", { media: { id: "bad-media" } });
  check("media download failure re-prompts, no crash", reply.toLowerCase().includes("send it again") || reply.toLowerCase().includes("could not read"), reply);
  check("failure keeps document step", (await sessionState(U1)).step === "document_front");

  mediaHandler = async () => ({ buffer: Buffer.from("fake-bytes"), contentType: "image/jpeg", sha256: null });
  reply = await send(U1, "", { media: { id: "doc-1" } });
  check("document accepted", reply.includes("ID received"), reply);
  const u1Request = requestsFor(U1)[0];
  check(
    "document stored under user/request path",
    String(u1Request.document_front_path || "").startsWith(`${userRow(U1).id}/${u1RequestId}/document-front`),
    u1Request.document_front_path
  );

  reply = await send(U1, "", { media: { id: "selfie-1" } });
  check("selfie accepted", reply.includes("Selfie received"), reply);
  check("selfie stored", String(u1Request.selfie_path || "").includes("selfie"), u1Request.selfie_path);
  check("selfie moves to payout choice", reply.includes("Payout details"), reply);
  check("payment step begins", (await sessionState(U1)).step === "payment_currency");

  // ---------- payout collection, matched name → tier 1
  scenario("payout matched name");
  reply = await send(U1, "ngn");
  check("NGN opens bank collection", reply.includes("bank"), reply);

  reply = await send(U1, "GTBank");
  check("bank name advances to account name", reply.toLowerCase().includes("name"), reply);
  check("quick option offers the KYC name", reply.includes("John Doe"), reply);

  reply = await send(U1, "1");
  check("quick option uses the KYC name", reply.toLowerCase().includes("account number"), reply);

  reply = await send(U1, "12345");
  check("short account number rejected", reply.toLowerCase().includes("too short"), reply);

  reply = await send(U1, "0123456789");
  check("account number advances to review", reply.includes("Review payout detail"), reply);
  check("review shows the matched name", reply.includes("John Doe"), reply);

  reply = await send(U1, "edit");
  check("unsaved payout can open edit menu", reply.includes("Edit NGN payout"), reply);

  reply = await send(U1, "name");
  check("edit name offers the verified quick option", reply.includes("Quick option") && reply.includes("John Doe"), reply);

  reply = await send(U1, "1");
  check("edited verified name returns to payout review", reply.includes("Review payout detail") && reply.includes("John Doe"), reply);

  reply = await send(U1, "save payout");
  check("payout saved", reply.includes("Payout detail saved"), reply);
  check("saved payout asks another or submit", reply.includes("another") && reply.includes("submit"), reply);
  check("matched name auto-verifies tier 1", userRow(U1).verification_status === "verified_auto", userRow(U1).verification_status);
  check("matched name sets score 65+", Number(userRow(U1).verification_score) >= 65, userRow(U1).verification_score);

  reply = await send(U1, "edit payout");
  check("saved payout locked until verification completes", reply.includes("Payout already saved") && reply.includes("profile is approved"), reply);

  reply = await send(U1, "what now");
  check("gibberish at payment_more re-prompts", reply.includes("another") && reply.includes("submit"), reply);

  reply = await send(U1, "no more");
  check("'no more' submits instead of adding another", reply.includes("Akara menu"), reply);
  check("tier 1 submission opens menu", reply.includes("make offer") && reply.includes("find offers"), reply);
  check("request finalized as tier 1", requestsFor(U1)[0].automated_decision === "tier_1_approved", requestsFor(U1)[0].automated_decision);
  check("session cleared after submission", (await sessionState(U1)).flow === null);
  check("success card sent once", cardSends.length === 1, JSON.stringify(cardSends));

  reply = await send(U1, "menu");
  check("tier 1 user reaches the menu", reply.includes("Akara menu"), reply);

  // ---------- mismatched payout name → manual review
  scenario("payout mismatched name");
  reply = await completeIdentitySteps(U2, {
    name: "Jane Ade",
    nationality: "Ghana",
    residence: "Ghana",
    city: "Accra",
    idType: "passport",
    idCountry: "Ghana",
    docId: "doc-2",
    selfieId: "selfie-2",
  });
  check("second user reaches payout choice", reply.includes("Payout details"), reply);

  reply = await send(U2, "rwf");
  check("RWF opens mobile money", reply.includes("MTN"), reply);

  reply = await send(U2, "mtn");
  reply = await send(U2, "Blessing Okafor");
  check("different holder name accepted", reply.toLowerCase().includes("number"), reply);

  reply = await send(U2, "0788123456");
  check("momo number advances to review", reply.includes("Review payout detail"), reply);

  reply = await send(U2, "save payout");
  check("mismatched payout still saves", reply.includes("Payout detail saved"), reply);
  check("mismatch does not auto-verify", userRow(U2).verification_status !== "verified_auto", userRow(U2).verification_status);

  reply = await send(U2, "submit");
  check("submit sends for review", reply.includes("Verification submitted"), reply);
  check("manual review copy shown", reply.toLowerCase().includes("admin review"), reply);
  check("user parked at pending_review", userRow(U2).verification_status === "pending_review", userRow(U2).verification_status);
  check("request marked manual_review", requestsFor(U2)[0].automated_decision === "manual_review", requestsFor(U2)[0].automated_decision);
  check("no success card for manual review", cardSends.length === 1, JSON.stringify(cardSends));

  reply = await send(U2, "hi");
  check("pending_review gate shows in-review copy", reply.includes("in review"), reply);

  // ---------- decline paths at the payout review
  scenario("payout decline paths");
  reply = await completeIdentitySteps(U3, {
    name: "Sam Okoro",
    nationality: "Nigeria",
    residence: "Nigeria",
    city: "Lagos",
    idType: "passport",
    idCountry: "Nigeria",
    docId: "doc-3",
    selfieId: "selfie-3",
  });
  check("third user reaches payout choice", reply.includes("Payout details"), reply);

  await send(U3, "ngn");
  await send(U3, "GTBank");
  await send(U3, "1");
  reply = await send(U3, "0123456789");
  check("third user reaches review", reply.includes("Review payout detail"), reply);

  reply = await send(U3, "no thanks");
  check("decline with zero payouts explains the requirement", reply.toLowerCase().includes("at least one payout"), reply);
  check("decline with zero payouts re-offers the choice", reply.includes("Payout details"), reply);
  check("decline returns to currency step", (await sessionState(U3)).step === "payment_currency");

  await send(U3, "ngn");
  await send(U3, "GTBank");
  await send(U3, "1");
  await send(U3, "0123456789");
  reply = await send(U3, "save payout");
  check("payout saved after redo", reply.includes("Payout detail saved"), reply);

  reply = await send(U3, "another");
  check("'another' re-opens payout choice", reply.includes("Payout details"), reply);
  check("'another' keeps the payout count", Number((await sessionState(U3)).context.payment_count) === 1, JSON.stringify((await sessionState(U3)).context));

  reply = await send(U3, "rwf");
  await send(U3, "mtn");
  await send(U3, "1");
  reply = await send(U3, "0788000111");
  check("second payout reaches review", reply.includes("Review payout detail"), reply);

  reply = await send(U3, "no thanks");
  check("decline with saved payouts offers submit", reply.includes("Payout not saved") && reply.includes("submit"), reply);
  check("decline with saved payouts is not a dead end", (await sessionState(U3)).step === "payment_more");

  reply = await send(U3, "submit");
  check("submit after decline completes verification", reply.includes("Akara menu"), reply);

  // ---------- documents AND payout are both required to complete
  scenario("incomplete verification cannot complete");
  const U5 = "250711000005";
  await send(U5, "verify");
  await send(U5, "Ada Obi");
  await send(U5, "Nigeria");
  await send(U5, "Nigeria");
  await send(U5, "Enugu");
  await send(U5, "passport");
  reply = await send(U5, "Nigeria");
  check("fifth user at document step", reply.includes("front/main page"), reply);

  // Simulate a session that skips the document steps and lands on payouts.
  const { upsertSession } = require("../db/sessions");
  await upsertSession(userRow(U5), U5, "verification", "payment_currency", {
    request_id: requestsFor(U5)[0].id,
    payment_count: 0,
  });

  await send(U5, "ngn");
  await send(U5, "GTBank");
  await send(U5, "1");
  await send(U5, "0123456789");
  const cardsBeforeU5 = cardSends.length;
  reply = await send(U5, "save payout");
  check("payout saves even before documents", reply.includes("Payout detail saved"), reply);
  check("no auto-verify without documents", userRow(U5).verification_status !== "verified_auto", userRow(U5).verification_status);
  check("no success card without documents", cardSends.length === cardsBeforeU5, JSON.stringify(cardSends));

  reply = await send(U5, "submit");
  check("submission blocked without documents", !reply.includes("Verification submitted"), reply);
  check("submission redirects to the document step", reply.includes("front/main page"), reply);
  check("session back at document step", (await sessionState(U5)).step === "document_front");

  await send(U5, "", { media: { id: "doc-5" } });
  reply = await send(U5, "", { media: { id: "selfie-5" } });
  check("selfie after redirect returns to payout menu", reply.includes("Payout details"), reply);

  reply = await send(U5, "submit");
  check("complete verification now submits", reply.includes("Akara menu"), reply);
  check("late documents still earn tier 1", userRow(U5).verification_status === "verified_auto", userRow(U5).verification_status);
  check("user verified only after documents and payout", userRow(U5).verification_status === "verified_auto", userRow(U5).verification_status);

  // ---------- cancel then resume without duplicates
  scenario("cancel and resume");
  await send(U4, "verify");
  reply = await send(U4, "Musa Bello");
  check("fourth user mid-flow", reply.toLowerCase().includes("nationality"), reply);
  check("one request before cancel", requestsFor(U4).length === 1);

  reply = await send(U4, "cancel");
  check("cancel pauses verification", reply.includes("Verification paused"), reply);
  check("cancel clears the session", (await sessionState(U4)).flow === null);

  reply = await send(U4, "Nigeria");
  check("detail without session hits the gate", reply.includes("halfway done"), reply);

  reply = await send(U4, "verify");
  check("verify after cancel resumes the flow", reply.toLowerCase().includes("legal name"), reply);
  check("resume reuses the open request", requestsFor(U4).length === 1, JSON.stringify(requestsFor(U4).map((row) => row.status)));
  check("resume restores the flow", (await sessionState(U4)).flow === "verification");
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
    realLog("All verification tests passed ✅");
    process.exit(0);
  })
  .catch((error) => {
    console.log = realLog;
    realLog(`\nTest run crashed in scenario "${currentScenario}":`);
    realLog(error.stack || error);
    process.exit(1);
  });
