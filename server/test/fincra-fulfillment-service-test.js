#!/usr/bin/env node

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AKARA_FINCRA_ENABLED = "false";

const assert = require("node:assert/strict");
const {
  createCollectFirstFulfillment,
  markCollectionInitiated,
  approvePayout,
  markPayoutInitiated,
  FULFILLMENT_STATUS,
} = require("../lib/fincra-fulfillment");
const {
  processFincraWebhookEvent,
} = require("../lib/fincra-fulfillment-service");

function inMemoryRepository(initial) {
  let record = initial;
  return {
    get record() {
      return record;
    },
    async getByCollectionReference(reference) {
      return record.collectionReference === reference ? record : null;
    },
    async getByPayoutCustomerReference(reference) {
      return record.payoutCustomerReference === reference ? record : null;
    },
    async savePartnerFulfillmentTransition(previous, next) {
      assert.equal(previous.id, record.id);
      assert.equal(previous.status, record.status);
      assert.equal(previous.updatedAt, record.updatedAt);
      record = next;
      return record;
    },
  };
}

async function run() {
  const now = () => new Date("2026-08-18T12:00:00.000Z");
  let fulfillment = createCollectFirstFulfillment({
    id: "a3dd7294-c4a8-45da-bac2-71a6e486ce01",
    userId: "0d584fec-5a3c-4617-b87e-21c42c896f30",
    paymentProfileId: "887547c9-522e-44bf-a47b-58ef01151cec",
    sourceCurrency: "KES",
    sourceAmount: "10000",
    destinationCurrency: "GHS",
    destinationAmount: "580",
    collectionReference: "AKR-COLLECT-SERVICE-1",
    payoutCustomerReference: "AKR-PAYOUT-SERVICE-1",
  }, now());
  fulfillment = markCollectionInitiated(fulfillment, {
    data: { reference: "checkout-service-1", status: "initiated" },
  }, now());

  const repository = inMemoryRepository(fulfillment);
  let checkoutVerifications = 0;
  let payoutVerifications = 0;
  const client = {
    async verifyCheckout(reference) {
      checkoutVerifications += 1;
      return {
        success: true,
        data: {
          MerchantReference: reference,
          transactionReference: "checkout-service-1",
          status: "successful",
          currency: "KES",
          amount: 10000,
        },
      };
    },
    async verifyPayoutByCustomerReference(reference) {
      payoutVerifications += 1;
      return {
        success: true,
        data: {
          reference: "payout-service-1",
          customerReference: reference,
          status: "successful",
        },
      };
    },
  };

  const collectionResult = await processFincraWebhookEvent({
    event: "charge.successful",
    data: {
      MerchantReference: "AKR-COLLECT-SERVICE-1",
      status: "successful",
    },
  }, { repository, client, now });
  assert.equal(collectionResult.processed, true);
  assert.equal(checkoutVerifications, 1);
  assert.equal(repository.record.status, FULFILLMENT_STATUS.COLLECTION_CONFIRMED);

  fulfillment = approvePayout(repository.record, {
    kycVerified: true,
    riskApproved: true,
    payoutDetailsVerified: true,
  }, now());
  fulfillment = markPayoutInitiated(fulfillment, {
    data: {
      reference: "payout-service-1",
      customerReference: "AKR-PAYOUT-SERVICE-1",
      status: "processing",
    },
  }, now());
  await repository.savePartnerFulfillmentTransition(repository.record, fulfillment);

  const payoutResult = await processFincraWebhookEvent({
    event: "payout.successful",
    data: {
      reference: "payout-service-1",
      customerReference: "AKR-PAYOUT-SERVICE-1",
      status: "successful",
    },
  }, { repository, client, now });
  assert.equal(payoutResult.processed, true);
  assert.equal(payoutVerifications, 1);
  assert.equal(repository.record.status, FULFILLMENT_STATUS.COMPLETED);

  const ignored = await processFincraWebhookEvent({ event: "conversion.successful" }, {
    repository,
    client,
    now,
  });
  assert.deepEqual(ignored, { processed: false, reason: "unsupported_event" });

  console.log("Fincra fulfillment service tests passed: webhooks trigger independent collection and payout verification.");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
