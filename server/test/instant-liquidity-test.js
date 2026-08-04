#!/usr/bin/env node

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AKARA_SEND_MODE = "log";
process.env.AKARA_INSTANT_LIQUIDITY_ENABLED = "true";
process.env.AKARA_INSTANT_LIQUIDITY_MINIMUM_VALIDITY_MS = "30000";
process.env.TEST_PARTNER_TOKEN = "test-token";

const path = require("node:path");
const crypto = require("node:crypto");
const fakeSupabase = require("./fake-supabase");

const supabasePath = path.join(__dirname, "..", "lib", "supabase.js");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: fakeSupabase,
  children: [],
  paths: [],
};

const {
  quoteRequestBody,
  requestInstantQuotes,
  normalizePartnerQuote,
} = require("../lib/instant-liquidity");
const {
  saveInstantQuotes,
  chooseInstantQuote,
  releaseInstantQuote,
  releaseExpiredInstantReservations,
} = require("../db/instant-fulfillment");

const { __table, __reset } = fakeSupabase;
let passed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) passed += 1;
  else failures.push({ label, detail: String(detail).slice(0, 500) });
}

async function run() {
  __reset();
  const userId = crypto.randomUUID();
  const listing = {
    id: crypto.randomUUID(),
    listing_code: "AKR-LIST-INSTANT",
    owner_user_id: userId,
    have_currency: "NGN",
    have_amount: 290000,
    want_currency: "RWF",
    want_amount: 300000,
    status: "active",
  };
  __table("users").push({ id: userId });
  __table("listings").push(listing);

  const request = quoteRequestBody(listing, userId);
  check("RFQ fixes Akara fee at zero", request.akara_fee.amount === 0, JSON.stringify(request));
  check(
    "RFQ sends a privacy-safe customer reference",
    request.customer_reference !== userId && /^[a-f0-9]{64}$/.test(request.customer_reference),
    request.customer_reference
  );

  let capturedRequest = null;
  const quotes = await requestInstantQuotes(listing, userId, {
    force: true,
    partners: [{
      code: "licensed-rwf",
      name: "Licensed RWF Partner",
      quoteUrl: "https://partner.example/quotes",
      apiKeyEnv: "TEST_PARTNER_TOKEN",
      corridors: ["NGN:RWF"],
    }],
    fetchImpl: async (url, options) => {
      capturedRequest = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          quote_id: "partner-quote-1",
          send_currency: "NGN",
          send_amount: 290000,
          receive_currency: "RWF",
          receive_amount: 302000,
          partner_fee: { amount: 1200, currency: "NGN" },
          settlement_eta_seconds: 90,
          checkout_url: "https://partner.example/checkout/partner-quote-1",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        }),
      };
    },
  });

  check("eligible partner returns one actionable firm quote", quotes.length === 1, JSON.stringify(quotes));
  check(
    "partner request is authenticated without embedding credentials in payload",
    capturedRequest.options.headers.authorization === "Bearer test-token"
      && !JSON.stringify(capturedRequest.body).includes("test-token")
  );
  check("normalized quote permanently records zero Akara fee", quotes[0]?.akara_fee_amount === 0);

  const rejected = normalizePartnerQuote(
    { code: "bad-rate", name: "Bad Rate", priority: 1 },
    {
      quote_id: "bad-1",
      send_currency: "NGN",
      send_amount: 300000,
      receive_currency: "RWF",
      receive_amount: 299999,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    },
    listing
  );
  check("quote that worsens the user's posted limits is rejected", rejected === null);

  const saved = await saveInstantQuotes(userId, listing.id, quotes);
  check("firm quote is persisted for the listing owner", saved.length === 1 && saved[0].status === "available");
  const selected = await chooseInstantQuote(saved[0].id, userId);
  check(
    "choosing instant fulfilment reserves the peer listing",
    selected.quote?.status === "selected" && __table("listings")[0].status === "reserved",
    JSON.stringify(selected)
  );
  await releaseInstantQuote(saved[0].id, userId);
  check("cancelling instant fulfilment safely reopens the listing", __table("listings")[0].status === "active");

  saved[0].status = "selected";
  saved[0].expires_at = new Date(Date.now() - 1000).toISOString();
  __table("listings")[0].status = "reserved";
  const released = await releaseExpiredInstantReservations();
  check(
    "expired partner reservation automatically reopens the listing",
    released === 1 && saved[0].status === "expired" && __table("listings")[0].status === "active"
  );

  if (failures.length) {
    console.error(`\n${failures.length} instant-liquidity test(s) failed:`);
    for (const failure of failures) console.error(`- ${failure.label}: ${failure.detail}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Instant liquidity tests passed: ${passed}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
