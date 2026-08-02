const { title, caption } = require("../lib/format");

// Compatibility module for older callers. Akara no longer creates,
// accumulates, invoices, or collects user fees.
const FEE_BILLING_THRESHOLD = null;

function feeAmountForCurrency() {
  return 0;
}

function feeReference() {
  return null;
}

async function recordDealFeeForUser() {
  return null;
}

async function recordDealFees() {
  return [];
}

function feeLedgerNote() {
  return [
    title("Service fee"),
    "Free",
    caption("No fee balance, invoice, subscription, or monthly bill."),
  ].join("\n\n");
}

module.exports = {
  FEE_BILLING_THRESHOLD,
  feeAmountForCurrency,
  feeLedgerNote,
  feeReference,
  recordDealFees,
  recordDealFeeForUser,
};
