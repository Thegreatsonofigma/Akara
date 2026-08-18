const { config } = require("../config");
const repository = require("../db/partner-fulfillments");
const { createFincraClient } = require("./fincra-liquidity");
const {
  FULFILLMENT_STATUS,
  createCollectFirstFulfillment,
  markCollectionInitiated,
  noteCollectionWebhook,
  applyVerifiedCollection,
  approvePayout,
  buildMobileMoneyPayoutRequest,
  markPayoutInitiated,
  notePayoutWebhook,
  applyVerifiedPayout,
} = require("./fincra-fulfillment");

function serviceDependencies(dependencies = {}) {
  const client = dependencies.client || createFincraClient(config, dependencies);
  if (!client) throw new Error("Fincra is not enabled");
  return {
    client,
    repository: dependencies.repository || repository,
    now: dependencies.now || (() => new Date()),
  };
}

function collectionReferenceFromEvent(event) {
  return String(
    event?.data?.merchantReference
      || event?.data?.MerchantReference
      || ""
  ).trim();
}

function payoutReferenceFromEvent(event) {
  return String(event?.data?.customerReference || "").trim();
}

async function initiateCollectFirstCheckout(input, customer, dependencies = {}) {
  const deps = serviceDependencies(dependencies);
  let fulfillment = createCollectFirstFulfillment(input, deps.now());
  fulfillment = await deps.repository.createPartnerFulfillment(fulfillment);

  const checkout = await deps.client.initiateCheckout({
    currency: fulfillment.sourceCurrency,
    amount: fulfillment.sourceAmount,
    reference: fulfillment.collectionReference,
    customer,
    paymentMethods: input.paymentMethods,
    defaultPaymentMethod: input.defaultPaymentMethod,
    redirectUrl: input.redirectUrl,
  });
  const next = markCollectionInitiated(fulfillment, checkout, deps.now());
  return deps.repository.savePartnerFulfillmentTransition(fulfillment, next);
}

async function verifyCollectionAfterWebhook(event, dependencies = {}) {
  const reference = collectionReferenceFromEvent(event);
  if (!reference) return { processed: false, reason: "missing_collection_reference" };
  const deps = serviceDependencies(dependencies);
  let fulfillment = await deps.repository.getByCollectionReference(reference);
  if (!fulfillment) return { processed: false, reason: "unknown_collection_reference" };

  const noted = noteCollectionWebhook(fulfillment, event, deps.now());
  if (noted === fulfillment) return { processed: false, reason: "event_not_applicable" };
  fulfillment = await deps.repository.savePartnerFulfillmentTransition(fulfillment, noted);

  const verification = await deps.client.verifyCheckout(reference);
  const verified = applyVerifiedCollection(fulfillment, verification, deps.now());
  fulfillment = await deps.repository.savePartnerFulfillmentTransition(fulfillment, verified);
  return { processed: true, status: fulfillment.status, fulfillmentId: fulfillment.id };
}

async function approveAndInitiateMobileMoneyPayout(
  fulfillmentId,
  approvals,
  beneficiary,
  dependencies = {}
) {
  const deps = serviceDependencies(dependencies);
  let fulfillment = await deps.repository.getPartnerFulfillmentById(fulfillmentId);
  if (!fulfillment) throw new Error("Partner fulfillment was not found");

  if (fulfillment.status === FULFILLMENT_STATUS.COLLECTION_CONFIRMED) {
    const approved = approvePayout(fulfillment, approvals, deps.now());
    fulfillment = await deps.repository.savePartnerFulfillmentTransition(fulfillment, approved);
  }

  const quote = await deps.client.generateQuote({
    sourceCurrency: fulfillment.sourceCurrency,
    destinationCurrency: fulfillment.destinationCurrency,
    amount: fulfillment.sourceAmount,
    action: "send",
    transactionType: "disbursement",
    paymentDestination: "mobile_money_wallet",
    beneficiaryType: beneficiary?.type || "individual",
  });
  const payoutRequest = buildMobileMoneyPayoutRequest(
    fulfillment,
    beneficiary,
    quote,
    deps.now()
  );
  const payout = await deps.client.initiateMobileMoneyPayout(payoutRequest);
  const processing = markPayoutInitiated(fulfillment, payout, deps.now());
  return deps.repository.savePartnerFulfillmentTransition(fulfillment, processing);
}

async function verifyPayoutAfterWebhook(event, dependencies = {}) {
  const reference = payoutReferenceFromEvent(event);
  if (!reference) return { processed: false, reason: "missing_payout_reference" };
  const deps = serviceDependencies(dependencies);
  let fulfillment = await deps.repository.getByPayoutCustomerReference(reference);
  if (!fulfillment) return { processed: false, reason: "unknown_payout_reference" };

  const noted = notePayoutWebhook(fulfillment, event, deps.now());
  if (noted === fulfillment) return { processed: false, reason: "event_not_applicable" };
  fulfillment = await deps.repository.savePartnerFulfillmentTransition(fulfillment, noted);

  const verification = await deps.client.verifyPayoutByCustomerReference(reference);
  const verified = applyVerifiedPayout(fulfillment, verification, deps.now());
  fulfillment = await deps.repository.savePartnerFulfillmentTransition(fulfillment, verified);
  return { processed: true, status: fulfillment.status, fulfillmentId: fulfillment.id };
}

async function processFincraWebhookEvent(event, dependencies = {}) {
  if (event?.event === "charge.successful") {
    return verifyCollectionAfterWebhook(event, dependencies);
  }
  if (["payout.successful", "payout.failed"].includes(event?.event)) {
    return verifyPayoutAfterWebhook(event, dependencies);
  }
  return { processed: false, reason: "unsupported_event" };
}

module.exports = {
  initiateCollectFirstCheckout,
  verifyCollectionAfterWebhook,
  approveAndInitiateMobileMoneyPayout,
  verifyPayoutAfterWebhook,
  processFincraWebhookEvent,
};
