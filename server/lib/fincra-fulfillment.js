const { FincraError } = require("./fincra");

const FULFILLMENT_STATUS = Object.freeze({
  CREATED: "created",
  COLLECTION_PENDING: "collection_pending",
  COLLECTION_VERIFICATION_REQUIRED: "collection_verification_required",
  COLLECTION_CONFIRMED: "collection_confirmed",
  PAYOUT_READY: "payout_ready",
  PAYOUT_PROCESSING: "payout_processing",
  PAYOUT_VERIFICATION_REQUIRED: "payout_verification_required",
  COMPLETED: "completed",
  COLLECTION_FAILED: "collection_failed",
  PAYOUT_FAILED: "payout_failed",
  MANUAL_REVIEW: "manual_review",
});

const SUCCESS_STATUSES = new Set(["success", "successful"]);
const PENDING_STATUSES = new Set(["initiated", "pending", "processing"]);

function requiredText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

function currencyCode(value, label) {
  const normalized = requiredText(value, label).toUpperCase();
  if (!/^[A-Z0-9]{3,5}$/.test(normalized)) {
    throw new TypeError(`${label} must be a valid currency code`);
  }
  return normalized;
}

function money(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || Number(normalized) <= 0) {
    throw new TypeError(`${label} must be a positive decimal value`);
  }
  return normalized;
}

function moneyMatches(left, right) {
  return Math.abs(Number(left) - Number(right)) < 0.00000001;
}

function payloadData(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
}

function transactionStatus(data) {
  return String(data?.status || "").trim().toLowerCase();
}

function collectionReference(data) {
  return String(
    data?.merchantReference
      || data?.MerchantReference
      || data?.reference
      || ""
  ).trim();
}

function payoutCustomerReference(data) {
  return String(data?.customerReference || "").trim();
}

function transition(fulfillment, status, event, changes = {}) {
  return Object.freeze({
    ...fulfillment,
    ...changes,
    status,
    lastEvent: event,
    updatedAt: changes.updatedAt || new Date().toISOString(),
  });
}

function createCollectFirstFulfillment(input = {}, now = new Date()) {
  const sourceCurrency = currencyCode(input.sourceCurrency, "source currency");
  const destinationCurrency = currencyCode(input.destinationCurrency, "destination currency");
  if (sourceCurrency === destinationCurrency) {
    throw new TypeError("collect-first fulfillment must exchange two different currencies");
  }
  const timestamp = now.toISOString();
  return Object.freeze({
    id: requiredText(input.id, "fulfillment ID"),
    provider: "fincra",
    status: FULFILLMENT_STATUS.CREATED,
    userId: requiredText(input.userId, "user ID"),
    paymentProfileId: requiredText(input.paymentProfileId, "payment profile ID"),
    sourceCurrency,
    sourceAmount: money(input.sourceAmount, "source amount"),
    destinationCurrency,
    destinationAmount: money(input.destinationAmount, "destination amount"),
    collectionReference: requiredText(input.collectionReference, "collection reference"),
    collectionProviderReference: null,
    collectionStatus: null,
    collectionVerifiedAt: null,
    payoutCustomerReference: requiredText(
      input.payoutCustomerReference,
      "payout customer reference"
    ),
    payoutProviderReference: null,
    payoutStatus: null,
    payoutVerifiedAt: null,
    lastEvent: "fulfillment.created",
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function markCollectionInitiated(fulfillment, payload, now = new Date()) {
  if (fulfillment.status !== FULFILLMENT_STATUS.CREATED) {
    throw new FincraError("Collection can only be initiated once", {
      errorType: "INVALID_FULFILLMENT_STATE",
    });
  }
  const data = payloadData(payload);
  return transition(
    fulfillment,
    FULFILLMENT_STATUS.COLLECTION_PENDING,
    "collection.initiated",
    {
      collectionProviderReference: String(
        data.reference || data.transactionReference || ""
      ).trim() || null,
      collectionStatus: transactionStatus(data) || "initiated",
      updatedAt: now.toISOString(),
    }
  );
}

function noteCollectionWebhook(fulfillment, event, now = new Date()) {
  if (event?.event !== "charge.successful") return fulfillment;
  if (![
    FULFILLMENT_STATUS.COLLECTION_PENDING,
    FULFILLMENT_STATUS.COLLECTION_VERIFICATION_REQUIRED,
  ].includes(fulfillment.status)) return fulfillment;

  const data = payloadData(event);
  if (collectionReference(data) !== fulfillment.collectionReference) {
    return transition(
      fulfillment,
      FULFILLMENT_STATUS.MANUAL_REVIEW,
      "collection.webhook_reference_mismatch",
      { updatedAt: now.toISOString() }
    );
  }
  return transition(
    fulfillment,
    FULFILLMENT_STATUS.COLLECTION_VERIFICATION_REQUIRED,
    "collection.webhook_received",
    { updatedAt: now.toISOString() }
  );
}

function applyVerifiedCollection(fulfillment, payload, now = new Date()) {
  if (![
    FULFILLMENT_STATUS.COLLECTION_PENDING,
    FULFILLMENT_STATUS.COLLECTION_VERIFICATION_REQUIRED,
  ].includes(fulfillment.status)) {
    throw new FincraError("Collection verification is not allowed in this state", {
      errorType: "INVALID_FULFILLMENT_STATE",
    });
  }
  const data = payloadData(payload);
  const status = transactionStatus(data);
  const reference = collectionReference(data);
  const currency = String(data.currency || "").toUpperCase();
  const amount = data.amount;

  if (reference !== fulfillment.collectionReference) {
    return transition(fulfillment, FULFILLMENT_STATUS.MANUAL_REVIEW, "collection.reference_mismatch", {
      collectionStatus: status || null,
      updatedAt: now.toISOString(),
    });
  }
  if (status === "failed" || status === "expired") {
    return transition(fulfillment, FULFILLMENT_STATUS.COLLECTION_FAILED, "collection.failed", {
      collectionStatus: status,
      updatedAt: now.toISOString(),
    });
  }
  if (PENDING_STATUSES.has(status)) {
    return transition(fulfillment, FULFILLMENT_STATUS.COLLECTION_PENDING, "collection.still_pending", {
      collectionStatus: status,
      updatedAt: now.toISOString(),
    });
  }
  if (!SUCCESS_STATUSES.has(status)) {
    return transition(fulfillment, FULFILLMENT_STATUS.MANUAL_REVIEW, "collection.unknown_status", {
      collectionStatus: status || null,
      updatedAt: now.toISOString(),
    });
  }
  if (currency !== fulfillment.sourceCurrency || !moneyMatches(amount, fulfillment.sourceAmount)) {
    return transition(fulfillment, FULFILLMENT_STATUS.MANUAL_REVIEW, "collection.terms_mismatch", {
      collectionStatus: status,
      updatedAt: now.toISOString(),
    });
  }

  return transition(
    fulfillment,
    FULFILLMENT_STATUS.COLLECTION_CONFIRMED,
    "collection.independently_verified",
    {
      collectionStatus: status,
      collectionProviderReference: String(
        data.transactionReference || data.chargeReference || data.reference || ""
      ).trim() || fulfillment.collectionProviderReference,
      collectionVerifiedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
  );
}

function approvePayout(fulfillment, approvals = {}, now = new Date()) {
  if (fulfillment.status !== FULFILLMENT_STATUS.COLLECTION_CONFIRMED) {
    throw new FincraError("Payout approval requires a verified collection", {
      errorType: "COLLECTION_NOT_VERIFIED",
    });
  }
  if (
    approvals.kycVerified !== true
    || approvals.riskApproved !== true
    || approvals.payoutDetailsVerified !== true
  ) {
    throw new FincraError("Payout approval requires KYC, risk, and payout-detail checks", {
      errorType: "PAYOUT_APPROVAL_INCOMPLETE",
    });
  }
  return transition(fulfillment, FULFILLMENT_STATUS.PAYOUT_READY, "payout.approved", {
    updatedAt: now.toISOString(),
  });
}

function assertPayoutInitiable(fulfillment) {
  if (fulfillment.status !== FULFILLMENT_STATUS.PAYOUT_READY) {
    throw new FincraError("Payout is blocked until collection and compliance checks pass", {
      errorType: "PAYOUT_NOT_READY",
    });
  }
}

function buildMobileMoneyPayoutRequest(
  fulfillment,
  beneficiary,
  quote,
  now = new Date()
) {
  assertPayoutInitiable(fulfillment);
  if (!quote) {
    throw new FincraError("A fresh cross-currency payout quote is required", {
      errorType: "QUOTE_REQUIRED",
    });
  }
  const expiresAt = new Date(quote.expiresAt || "");
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    throw new FincraError("The payout quote has expired", { errorType: "QUOTE_EXPIRED" });
  }
  if (
    quote.sourceCurrency !== fulfillment.sourceCurrency
    || quote.destinationCurrency !== fulfillment.destinationCurrency
    || !moneyMatches(quote.sourceAmount, fulfillment.sourceAmount)
    || Number(quote.destinationAmount) < Number(fulfillment.destinationAmount)
  ) {
    throw new FincraError("The payout quote does not cover the promised transaction", {
      errorType: "QUOTE_TERMS_MISMATCH",
    });
  }

  return {
    sourceCurrency: fulfillment.sourceCurrency,
    destinationCurrency: fulfillment.destinationCurrency,
    amount: fulfillment.sourceAmount,
    description: `Akara exchange ${fulfillment.id}`,
    customerReference: fulfillment.payoutCustomerReference,
    quoteReference: requiredText(quote.reference, "quote reference"),
    beneficiary,
  };
}

function markPayoutInitiated(fulfillment, payload, now = new Date()) {
  assertPayoutInitiable(fulfillment);
  const data = payloadData(payload);
  const status = transactionStatus(data);
  if (payoutCustomerReference(data) !== fulfillment.payoutCustomerReference) {
    return transition(fulfillment, FULFILLMENT_STATUS.MANUAL_REVIEW, "payout.reference_mismatch", {
      payoutStatus: status || null,
      updatedAt: now.toISOString(),
    });
  }
  if (![...PENDING_STATUSES, ...SUCCESS_STATUSES].includes(status)) {
    throw new FincraError("Fincra returned an invalid initial payout status", {
      errorType: "INVALID_RESPONSE",
      details: payload,
    });
  }
  return transition(
    fulfillment,
    SUCCESS_STATUSES.has(status)
      ? FULFILLMENT_STATUS.PAYOUT_VERIFICATION_REQUIRED
      : FULFILLMENT_STATUS.PAYOUT_PROCESSING,
    "payout.initiated",
    {
      payoutProviderReference: requiredText(data.reference, "payout provider reference"),
      payoutStatus: status,
      updatedAt: now.toISOString(),
    }
  );
}

function notePayoutWebhook(fulfillment, event, now = new Date()) {
  if (!["payout.successful", "payout.failed"].includes(event?.event)) return fulfillment;
  if (![
    FULFILLMENT_STATUS.PAYOUT_PROCESSING,
    FULFILLMENT_STATUS.PAYOUT_VERIFICATION_REQUIRED,
  ].includes(fulfillment.status)) return fulfillment;
  const data = payloadData(event);
  if (payoutCustomerReference(data) !== fulfillment.payoutCustomerReference) {
    return transition(fulfillment, FULFILLMENT_STATUS.MANUAL_REVIEW, "payout.webhook_reference_mismatch", {
      updatedAt: now.toISOString(),
    });
  }
  return transition(
    fulfillment,
    FULFILLMENT_STATUS.PAYOUT_VERIFICATION_REQUIRED,
    "payout.webhook_received",
    { payoutStatus: transactionStatus(data) || null, updatedAt: now.toISOString() }
  );
}

function applyVerifiedPayout(fulfillment, payload, now = new Date()) {
  if (![
    FULFILLMENT_STATUS.PAYOUT_PROCESSING,
    FULFILLMENT_STATUS.PAYOUT_VERIFICATION_REQUIRED,
  ].includes(fulfillment.status)) {
    throw new FincraError("Payout verification is not allowed in this state", {
      errorType: "INVALID_FULFILLMENT_STATE",
    });
  }
  const data = payloadData(payload);
  const status = transactionStatus(data);
  if (
    payoutCustomerReference(data) !== fulfillment.payoutCustomerReference
    || (fulfillment.payoutProviderReference
      && String(data.reference || "") !== fulfillment.payoutProviderReference)
  ) {
    return transition(fulfillment, FULFILLMENT_STATUS.MANUAL_REVIEW, "payout.verification_mismatch", {
      payoutStatus: status || null,
      updatedAt: now.toISOString(),
    });
  }
  if (PENDING_STATUSES.has(status)) {
    return transition(fulfillment, FULFILLMENT_STATUS.PAYOUT_PROCESSING, "payout.still_processing", {
      payoutStatus: status,
      updatedAt: now.toISOString(),
    });
  }
  if (status === "failed") {
    return transition(fulfillment, FULFILLMENT_STATUS.PAYOUT_FAILED, "payout.failed", {
      payoutStatus: status,
      payoutVerifiedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    });
  }
  if (!SUCCESS_STATUSES.has(status)) {
    return transition(fulfillment, FULFILLMENT_STATUS.MANUAL_REVIEW, "payout.unknown_status", {
      payoutStatus: status || null,
      updatedAt: now.toISOString(),
    });
  }
  return transition(fulfillment, FULFILLMENT_STATUS.COMPLETED, "payout.independently_verified", {
    payoutStatus: status,
    payoutVerifiedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

module.exports = {
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
};
