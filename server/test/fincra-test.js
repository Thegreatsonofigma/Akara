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
const {
  FULFILLMENT_STATUS,
  createCollectFirstFulfillment,
  markCollectionInitiated,
  noteCollectionWebhook,
  applyVerifiedCollection,
  approvePayout,
  assertPayoutInitiable,
  buildMobileMoneyPayoutRequest,
  markPayoutInitiated,
  notePayoutWebhook,
  applyVerifiedPayout,
} = require("../lib/fincra-fulfillment");

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

  const collectionBlockedClient = new FincraClient({
    apiKey: "sandbox-secret",
    publicKey: "sandbox-public",
    businessId: "business-123",
    allowMutations: true,
  });
  assert.throws(
    () => collectionBlockedClient.initiateCheckout({
      currency: "KES",
      amount: 10000,
      reference: "AKR-COLLECT-123",
      customer: { name: "Test User", email: "test@example.com" },
    }),
    (error) => error instanceof FincraError && error.errorType === "COLLECTIONS_DISABLED"
  );

  const checkoutFetch = mockFetch([
    response({
      success: true,
      data: { reference: "checkout-123", status: "initiated" },
    }),
    response({
      success: true,
      data: {
        MerchantReference: "AKR-COLLECT-123",
        transactionReference: "checkout-123",
        status: "successful",
        currency: "KES",
        amount: 10000,
      },
    }),
  ]);
  const checkoutClient = new FincraClient({
    apiKey: "sandbox-secret",
    publicKey: "sandbox-public",
    businessId: "business-123",
    allowMutations: true,
    allowCollections: true,
    fetchImpl: checkoutFetch,
  });
  await checkoutClient.initiateCheckout({
    currency: "KES",
    amount: "10000",
    reference: "AKR-COLLECT-123",
    customer: {
      name: "Test User",
      email: "test@example.com",
      phoneNumber: "+254700000000",
    },
    paymentMethods: ["mobile_money", "bank_transfer"],
    defaultPaymentMethod: "bank_transfer",
    redirectUrl: "https://tryakara.com/payment-return",
  });
  await checkoutClient.verifyCheckout("AKR-COLLECT-123");
  assert.equal(checkoutFetch.calls[0].options.headers["x-pub-key"], "sandbox-public");
  assert.equal(checkoutFetch.calls[0].options.headers["api-key"], undefined);
  assert.equal(checkoutFetch.calls[0].options.headers["x-business-id"], "business-123");
  assert.deepEqual(JSON.parse(checkoutFetch.calls[0].options.body), {
    currency: "KES",
    amount: 10000,
    customer: {
      name: "Test User",
      email: "test@example.com",
      phoneNumber: "+254700000000",
    },
    paymentMethods: ["mobile_money", "bank_transfer"],
    reference: "AKR-COLLECT-123",
    feeBearer: "business",
    settlementDestination: "wallet",
    redirectUrl: "https://tryakara.com/payment-return",
    defaultPaymentMethod: "bank_transfer",
  });
  assert.equal(checkoutFetch.calls[1].options.headers["api-key"], "sandbox-secret");
  assert.equal(checkoutFetch.calls[1].options.headers["x-business-id"], "business-123");

  const payoutBlockedClient = new FincraClient({
    apiKey: "sandbox-secret",
    businessId: "business-123",
    allowMutations: true,
  });
  assert.throws(
    () => payoutBlockedClient.initiateMobileMoneyPayout({
      sourceCurrency: "KES",
      destinationCurrency: "GHS",
      amount: "10000",
      quoteReference: "quote-payout-123",
      description: "Akara exchange",
      customerReference: "AKR-PAYOUT-123",
      beneficiary: {
        firstName: "Test",
        lastName: "User",
        phone: "+233200000000",
        mobileMoneyCode: "MTN",
      },
    }),
    (error) => error instanceof FincraError && error.errorType === "PAYOUTS_DISABLED"
  );

  const payoutFetch = mockFetch([
    response({
      success: true,
      data: {
        reference: "payout-123",
        customerReference: "AKR-PAYOUT-123",
        status: "processing",
      },
    }),
    response({
      success: true,
      data: {
        reference: "payout-123",
        customerReference: "AKR-PAYOUT-123",
        status: "successful",
      },
    }),
  ]);
  const payoutClient = new FincraClient({
    apiKey: "sandbox-secret",
    businessId: "business-123",
    allowMutations: true,
    allowPayouts: true,
    fetchImpl: payoutFetch,
  });
  await payoutClient.initiateMobileMoneyPayout({
    sourceCurrency: "KES",
    destinationCurrency: "GHS",
    amount: "10000",
    quoteReference: "quote-payout-123",
    description: "Akara exchange fulfillment-123",
    customerReference: "AKR-PAYOUT-123",
    beneficiary: {
      firstName: "Test",
      lastName: "User",
      type: "individual",
      phone: "+233200000000",
      mobileMoneyCode: "mtn",
    },
  });
  await payoutClient.verifyPayout("payout-123");
  assert.deepEqual(JSON.parse(payoutFetch.calls[0].options.body), {
    business: "business-123",
    sourceCurrency: "KES",
    destinationCurrency: "GHS",
    amount: "10000",
    description: "Akara exchange fulfillment-123",
    customerReference: "AKR-PAYOUT-123",
    paymentDestination: "mobile_money_wallet",
    beneficiary: {
      firstName: "Test",
      lastName: "User",
      type: "individual",
      phone: "+233200000000",
      mobileMoneyCode: "MTN",
    },
    quoteReference: "quote-payout-123",
  });
  assert.equal(
    payoutFetch.calls[1].url,
    "https://sandboxapi.fincra.com/disbursements/payouts/reference/payout-123"
  );

  const flowNow = new Date("2026-08-18T12:00:00.000Z");
  let fulfillment = createCollectFirstFulfillment({
    id: "fulfillment-123",
    userId: "user-123",
    paymentProfileId: "profile-123",
    sourceCurrency: "KES",
    sourceAmount: "10000",
    destinationCurrency: "GHS",
    destinationAmount: "580",
    collectionReference: "AKR-COLLECT-123",
    payoutCustomerReference: "AKR-PAYOUT-123",
  }, flowNow);
  assert.equal(fulfillment.status, FULFILLMENT_STATUS.CREATED);
  assert.throws(
    () => assertPayoutInitiable(fulfillment),
    (error) => error instanceof FincraError && error.errorType === "PAYOUT_NOT_READY"
  );

  fulfillment = markCollectionInitiated(fulfillment, {
    success: true,
    data: { reference: "checkout-123", status: "initiated" },
  }, flowNow);
  fulfillment = noteCollectionWebhook(fulfillment, {
    event: "charge.successful",
    data: { MerchantReference: "AKR-COLLECT-123", status: "successful" },
  }, flowNow);
  assert.equal(fulfillment.status, FULFILLMENT_STATUS.COLLECTION_VERIFICATION_REQUIRED);
  assert.throws(
    () => approvePayout(fulfillment, {
      kycVerified: true,
      riskApproved: true,
      payoutDetailsVerified: true,
    }),
    (error) => error instanceof FincraError && error.errorType === "COLLECTION_NOT_VERIFIED"
  );

  fulfillment = applyVerifiedCollection(fulfillment, {
    success: true,
    data: {
      MerchantReference: "AKR-COLLECT-123",
      transactionReference: "checkout-123",
      status: "successful",
      currency: "KES",
      amount: 10000,
    },
  }, flowNow);
  assert.equal(fulfillment.status, FULFILLMENT_STATUS.COLLECTION_CONFIRMED);
  assert.throws(
    () => approvePayout(fulfillment, {
      kycVerified: true,
      riskApproved: false,
      payoutDetailsVerified: true,
    }),
    (error) => error instanceof FincraError && error.errorType === "PAYOUT_APPROVAL_INCOMPLETE"
  );
  fulfillment = approvePayout(fulfillment, {
    kycVerified: true,
    riskApproved: true,
    payoutDetailsVerified: true,
  }, flowNow);
  assert.equal(fulfillment.status, FULFILLMENT_STATUS.PAYOUT_READY);

  const payoutRequest = buildMobileMoneyPayoutRequest(fulfillment, {
    firstName: "Test",
    lastName: "User",
    type: "individual",
    phone: "+233200000000",
    mobileMoneyCode: "MTN",
  }, {
    reference: "quote-payout-123",
    sourceCurrency: "KES",
    destinationCurrency: "GHS",
    sourceAmount: 10000,
    destinationAmount: 590,
    expiresAt: "2026-08-18T12:00:30.000Z",
  }, flowNow);
  assert.equal(payoutRequest.amount, "10000");
  assert.equal(payoutRequest.quoteReference, "quote-payout-123");
  assert.throws(
    () => buildMobileMoneyPayoutRequest(fulfillment, {}, {
      reference: "expired-quote",
      sourceCurrency: "KES",
      destinationCurrency: "GHS",
      sourceAmount: 10000,
      destinationAmount: 590,
      expiresAt: "2026-08-18T11:59:59.000Z",
    }, flowNow),
    (error) => error instanceof FincraError && error.errorType === "QUOTE_EXPIRED"
  );

  fulfillment = markPayoutInitiated(fulfillment, {
    success: true,
    data: {
      reference: "payout-123",
      customerReference: "AKR-PAYOUT-123",
      status: "processing",
    },
  }, flowNow);
  fulfillment = notePayoutWebhook(fulfillment, {
    event: "payout.successful",
    data: {
      reference: "payout-123",
      customerReference: "AKR-PAYOUT-123",
      status: "successful",
    },
  }, flowNow);
  assert.equal(fulfillment.status, FULFILLMENT_STATUS.PAYOUT_VERIFICATION_REQUIRED);
  fulfillment = applyVerifiedPayout(fulfillment, {
    success: true,
    data: {
      reference: "payout-123",
      customerReference: "AKR-PAYOUT-123",
      status: "successful",
    },
  }, flowNow);
  assert.equal(fulfillment.status, FULFILLMENT_STATUS.COMPLETED);

  let mismatchedCollection = createCollectFirstFulfillment({
    id: "fulfillment-amount-mismatch",
    userId: "user-123",
    paymentProfileId: "profile-123",
    sourceCurrency: "KES",
    sourceAmount: "10000",
    destinationCurrency: "GHS",
    destinationAmount: "580",
    collectionReference: "AKR-COLLECT-MISMATCH",
    payoutCustomerReference: "AKR-PAYOUT-MISMATCH",
  }, flowNow);
  mismatchedCollection = markCollectionInitiated(mismatchedCollection, {
    data: { reference: "checkout-mismatch", status: "initiated" },
  }, flowNow);
  mismatchedCollection = applyVerifiedCollection(mismatchedCollection, {
    data: {
      MerchantReference: "AKR-COLLECT-MISMATCH",
      status: "successful",
      currency: "KES",
      amount: 9999,
    },
  }, flowNow);
  assert.equal(mismatchedCollection.status, FULFILLMENT_STATUS.MANUAL_REVIEW);

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

  console.log("Fincra tests passed: sandbox auth, quotes, collect-first safety gates, mobile payouts, verification, and webhooks.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
