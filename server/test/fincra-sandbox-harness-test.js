#!/usr/bin/env node

const assert = require("node:assert/strict");
const {
  extractCheckoutUrl,
  checkoutVerificationSummary,
} = require("../../scripts/run-fincra-sandbox-checkout");

assert.equal(extractCheckoutUrl({
  success: true,
  data: { checkoutUrl: "https://checkout.fincra.example/sandbox/123" },
}), "https://checkout.fincra.example/sandbox/123");
assert.equal(extractCheckoutUrl({ data: { checkoutUrl: "javascript:alert(1)" } }), null);

const verified = checkoutVerificationSummary({
  success: true,
  data: {
    MerchantReference: "AKR-SBX-123",
    status: "successful",
    currency: "KES",
    amount: 1000,
  },
}, {
  reference: "AKR-SBX-123",
  currency: "KES",
  amount: 1000,
});
assert.equal(verified.termsMatch, true);
assert.equal(verified.independentlyVerified, true);

const mismatch = checkoutVerificationSummary({
  data: {
    merchantReference: "AKR-SBX-123",
    status: "successful",
    currency: "KES",
    amount: 999,
  },
}, {
  reference: "AKR-SBX-123",
  currency: "KES",
  amount: 1000,
});
assert.equal(mismatch.termsMatch, false);
assert.equal(mismatch.independentlyVerified, false);

console.log("Fincra sandbox harness tests passed: hosted URL and independent term validation.");
