#!/usr/bin/env node

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {
  FINCRA_BASE_URLS,
  FincraClient,
  FincraError,
  verifyFincraWebhookSignature,
} = require("../lib/fincra");
const {
  corridorKey,
  supportsFincraCorridor,
  getFincraPartnerQuote,
} = require("../lib/fincra-liquidity");

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function mockFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

async function run() {
  assert.equal(FINCRA_BASE_URLS.sandbox, "https://sandboxapi.fincra.com");
  assert.throws(
    () => new FincraClient({ environment: "live", apiKey: "secret" }),
    /explicit acknowledgement/
  );

  assert.equal(corridorKey("kes", "ngn"), "KES-NGN");
  assert.equal(supportsFincraCorridor({
    fincraEnabled: true,
    fincraCorridors: ["KES-NGN"],
  }, "KES", "NGN"), true);
  assert.equal(supportsFincraCorridor({
    fincraEnabled: true,
    fincraCorridors: ["KES-NGN"],
  }, "NGN", "KES"), false);

  const profileFetch = mockFetch([response({
    success: true,
    data: { _id: "business-123", name: "Akara Network Labs LTD" },
  })]);
  const profileClient = new FincraClient({
    environment: "sandbox",
    apiKey: "sandbox-secret",
    businessId: "business-123",
    fetchImpl: profileFetch,
  });
  const profile = await profileClient.getBusinessInformation();
  assert.equal(profile.data.name, "Akara Network Labs LTD");
  assert.equal(profileFetch.calls[0].url, "https://sandboxapi.fincra.com/profile/business/me");
  assert.equal(profileFetch.calls[0].options.headers["api-key"], "sandbox-secret");

  const ratesFetch = mockFetch([response({
    success: true,
    data: { rates: [{ baseCurrency: "KES", quoteCurrency: "NGN", side: "buy", price: 11.46 }] },
  })]);
  const ratesClient = new FincraClient({ apiKey: "sandbox-secret", fetchImpl: ratesFetch });
  const rates = await ratesClient.getRates({ currencyPair: "KES-NGN", side: "buy", ignored: "value" });
  assert.equal(rates.data.rates[0].price, 11.46);
  assert.equal(
    ratesFetch.calls[0].url,
    "https://sandboxapi.fincra.com/quotes/treasury-orders/rates?currencyPair=KES-NGN&side=buy"
  );
  assert.throws(() => ratesClient.getRates({ side: "middle" }), /buy or sell/);

  const quoteExpiresAt = "2026-08-18T12:00:30.000Z";
  const quoteFetch = mockFetch([response({
    success: true,
    message: "Quote generated successfully",
    data: {
      sourceCurrency: "KES",
      destinationCurrency: "NGN",
      sourceAmount: 10000,
      destinationAmount: 114600,
      amountToCharge: 10000,
      amountToReceive: 114600,
      rate: 11.46,
      fee: 0,
      reference: "quote-123",
      expireAt: quoteExpiresAt,
      action: "send",
      transactionType: "conversion",
    },
  })]);
  const quoteClient = new FincraClient({
    apiKey: "sandbox-secret",
    businessId: "business-123",
    fetchImpl: quoteFetch,
    now: () => Date.parse("2026-08-18T12:00:00.000Z"),
  });
  const quote = await quoteClient.generateQuote({
    sourceCurrency: "kes",
    destinationCurrency: "ngn",
    amount: 10000,
  });
  assert.equal(quote.reference, "quote-123");
  assert.equal(quote.destinationAmount, 114600);
  assert.equal(quote.expiresAt, quoteExpiresAt);
  assert.deepEqual(JSON.parse(quoteFetch.calls[0].options.body), {
    sourceCurrency: "KES",
    destinationCurrency: "NGN",
    amount: "10000",
    action: "send",
    transactionType: "conversion",
    business: "business-123",
    feeBearer: "business",
    paymentDestination: "fliqpay_wallet",
  });

  const partnerFetch = mockFetch([response({
    success: true,
    data: {
      sourceCurrency: "KES",
      destinationCurrency: "NGN",
      amountToCharge: 10000,
      amountToReceive: 114600,
      rate: 11.46,
      fee: 0,
      reference: "partner-quote-123",
      expireAt: quoteExpiresAt,
      transactionType: "conversion",
    },
  })]);
  const partnerOption = await getFincraPartnerQuote({
    fincraEnabled: true,
    fincraEnvironment: "sandbox",
    fincraApiKey: "sandbox-secret",
    fincraBusinessId: "business-123",
    fincraAllowMutations: false,
    fincraLiveAcknowledged: false,
    fincraTimeoutMs: 5000,
    fincraCorridors: ["KES-NGN"],
  }, {
    sourceCurrency: "KES",
    destinationCurrency: "NGN",
    amount: "10000",
  }, {
    fetchImpl: partnerFetch,
    now: () => Date.parse("2026-08-18T12:00:00.000Z"),
  });
  assert.equal(partnerOption.kind, "partner_quote");
  assert.equal(partnerOption.isPeerOffer, false);
  assert.equal(partnerOption.executionReady, false);
  assert.equal(partnerOption.destinationAmount, 114600);
  assert.equal(await getFincraPartnerQuote({
    fincraEnabled: true,
    fincraCorridors: ["KES-NGN"],
  }, {
    sourceCurrency: "RWF",
    destinationCurrency: "NGN",
    amount: "10000",
  }), null);

  await assert.rejects(
    () => quoteClient.initiateConversion({
      quoteReference: "quote-123",
      customerReference: "AKR-CONV-123",
    }),
    (error) => error instanceof FincraError && error.errorType === "MUTATIONS_DISABLED"
  );

  const conversionFetch = mockFetch([
    response({ success: true, data: { reference: "conversion-123" } }),
    response({ success: true, data: { reference: "conversion-123", status: "successful" } }),
  ]);
  const conversionClient = new FincraClient({
    apiKey: "sandbox-secret",
    businessId: "business-123",
    fetchImpl: conversionFetch,
    allowMutations: true,
  });
  await conversionClient.initiateConversion({
    quoteReference: "quote-123",
    customerReference: "AKR-CONV-123",
  });
  await conversionClient.verifyConversion("conversion-123");
  assert.equal(conversionFetch.calls[0].options.method, "POST");
  assert.equal(
    conversionFetch.calls[1].url,
    "https://sandboxapi.fincra.com/conversions/reference/conversion-123"
  );

  const errorFetch = mockFetch([response({
    success: false,
    message: "Invalid authentication credentials",
    errorType: "AUTHENTICATION_ERROR",
  }, 401)]);
  const errorClient = new FincraClient({ apiKey: "must-never-leak", fetchImpl: errorFetch });
  await assert.rejects(
    () => errorClient.getBusinessInformation(),
    (error) => (
      error instanceof FincraError
      && error.statusCode === 401
      && error.errorType === "AUTHENTICATION_ERROR"
      && !error.message.includes("must-never-leak")
    )
  );

  const rawBody = Buffer.from(JSON.stringify({
    event: "conversion.successful",
    data: { reference: "conversion-123", status: "successful" },
  }));
  const webhookSecret = "webhook-secret";
  const signature = crypto.createHmac("sha512", webhookSecret).update(rawBody).digest("hex");
  const invalidSignature = `${signature.slice(0, -1)}${signature.endsWith("0") ? "1" : "0"}`;
  assert.equal(verifyFincraWebhookSignature(rawBody, signature, webhookSecret), true);
  assert.equal(verifyFincraWebhookSignature(rawBody, invalidSignature, webhookSecret), false);
  assert.equal(verifyFincraWebhookSignature(rawBody, "not-a-signature", webhookSecret), false);

  console.log("Fincra client tests passed: sandbox URLs, auth, rates, quotes, safety gates, conversions, and webhooks.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
