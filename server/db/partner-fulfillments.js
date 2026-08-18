const { supabaseRequest, filterValue } = require("../lib/supabase");

const SELECT_FIELDS = [
  "id",
  "provider",
  "status",
  "user_id",
  "payment_profile_id",
  "source_currency",
  "source_amount",
  "destination_currency",
  "destination_amount",
  "collection_reference",
  "collection_provider_reference",
  "collection_status",
  "collection_verified_at",
  "payout_customer_reference",
  "payout_provider_reference",
  "payout_status",
  "payout_verified_at",
  "last_event",
  "failure_reason",
  "created_at",
  "updated_at",
].join(",");

function fromRow(row) {
  if (!row) return null;
  return Object.freeze({
    id: row.id,
    provider: row.provider,
    status: row.status,
    userId: row.user_id,
    paymentProfileId: row.payment_profile_id,
    sourceCurrency: row.source_currency,
    sourceAmount: String(row.source_amount),
    destinationCurrency: row.destination_currency,
    destinationAmount: String(row.destination_amount),
    collectionReference: row.collection_reference,
    collectionProviderReference: row.collection_provider_reference,
    collectionStatus: row.collection_status,
    collectionVerifiedAt: row.collection_verified_at,
    payoutCustomerReference: row.payout_customer_reference,
    payoutProviderReference: row.payout_provider_reference,
    payoutStatus: row.payout_status,
    payoutVerifiedAt: row.payout_verified_at,
    lastEvent: row.last_event,
    failureReason: row.failure_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function toRow(fulfillment) {
  return {
    id: fulfillment.id,
    provider: fulfillment.provider,
    status: fulfillment.status,
    user_id: fulfillment.userId,
    payment_profile_id: fulfillment.paymentProfileId,
    source_currency: fulfillment.sourceCurrency,
    source_amount: fulfillment.sourceAmount,
    destination_currency: fulfillment.destinationCurrency,
    destination_amount: fulfillment.destinationAmount,
    collection_reference: fulfillment.collectionReference,
    collection_provider_reference: fulfillment.collectionProviderReference,
    collection_status: fulfillment.collectionStatus,
    collection_verified_at: fulfillment.collectionVerifiedAt,
    payout_customer_reference: fulfillment.payoutCustomerReference,
    payout_provider_reference: fulfillment.payoutProviderReference,
    payout_status: fulfillment.payoutStatus,
    payout_verified_at: fulfillment.payoutVerifiedAt,
    last_event: fulfillment.lastEvent,
    failure_reason: fulfillment.failureReason || null,
    created_at: fulfillment.createdAt,
    updated_at: fulfillment.updatedAt,
  };
}

async function createPartnerFulfillment(fulfillment) {
  const rows = await supabaseRequest("partner_fulfillments", {
    method: "POST",
    body: JSON.stringify(toRow(fulfillment)),
  });
  return fromRow(rows[0]);
}

async function getPartnerFulfillmentById(id) {
  const rows = await supabaseRequest(
    `partner_fulfillments?select=${SELECT_FIELDS}&id=eq.${filterValue(id)}&limit=1`
  );
  return fromRow(rows[0]);
}

async function getByCollectionReference(reference) {
  const rows = await supabaseRequest(
    [
      `partner_fulfillments?select=${SELECT_FIELDS}`,
      `collection_reference=eq.${filterValue(reference)}`,
      "limit=1",
    ].join("&")
  );
  return fromRow(rows[0]);
}

async function getByPayoutCustomerReference(reference) {
  const rows = await supabaseRequest(
    [
      `partner_fulfillments?select=${SELECT_FIELDS}`,
      `payout_customer_reference=eq.${filterValue(reference)}`,
      "limit=1",
    ].join("&")
  );
  return fromRow(rows[0]);
}

async function savePartnerFulfillmentTransition(previous, next) {
  if (!previous?.id || previous.id !== next?.id) {
    throw new TypeError("A fulfillment transition must preserve the record ID");
  }
  const row = toRow(next);
  delete row.id;
  delete row.created_at;
  const rows = await supabaseRequest(
    `partner_fulfillments?${[
      `id=eq.${filterValue(previous.id)}`,
      `status=eq.${filterValue(previous.status)}`,
      `updated_at=eq.${filterValue(previous.updatedAt)}`,
    ].join("&")}`,
    {
      method: "PATCH",
      body: JSON.stringify(row),
    }
  );
  if (!rows.length) {
    const error = new Error("Partner fulfillment changed concurrently");
    error.code = "FULFILLMENT_CONFLICT";
    throw error;
  }
  return fromRow(rows[0]);
}

module.exports = {
  fromRow,
  toRow,
  createPartnerFulfillment,
  getPartnerFulfillmentById,
  getByCollectionReference,
  getByPayoutCustomerReference,
  savePartnerFulfillmentTransition,
};
