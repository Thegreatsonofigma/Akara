# Fincra sandbox integration

This first slice gives Akara a sandbox-only Fincra client for business-profile checks, indicative rates, fresh executable quotes, conversion initiation, conversion verification, and webhook-signature verification.

## Safety boundary

- Fincra is disabled by default.
- The read-only check calls only the business profile and rates endpoints.
- Conversion initiation is blocked unless `AKARA_FINCRA_ALLOW_MUTATIONS=true`.
- Live access also requires `AKARA_FINCRA_LIVE_ACK=true`.
- RWF is not in the initial corridor allowlist because Fincra has not confirmed it for Akara.
- Fincra partner quotes are typed as `partner_quote` and `isPeerOffer: false`. They must never be stored or displayed as offers created by Akara users.
- A partner quote is marked `executionReady: false` until Akara implements and verifies the complete collect-first flow, beneficiary payout, reconciliation, refunds, and compliance controls.
- Akara remains free to users. This integration does not add a service fee, subscription, transaction allowance, billing balance, or payment restriction.

## Quote lifecycle

The Rates API may be used for indicative discovery. When a customer chooses a partner option, Akara must request a fresh amount-based quote. Fincra quotes expire quickly, so Akara must display the expiry and must not reuse an expired reference.

The intended money movement is:

1. Show the customer a fresh final amount and expiry.
2. Collect the source currency and independently verify successful collection.
3. Run compliance and risk checks.
4. Request or refresh the provider quote when required.
5. Initiate the beneficiary payout only when the payout implementation and mutation flag are approved.
6. Verify final provider status independently, reconcile the transaction, and handle failure or refund states.

This pull request stops before steps 2 through 6 and therefore cannot move customer funds.

## Configuration

Copy the Fincra variables from `.env.example` into a local `.env`, using sandbox credentials only. Keep both safety acknowledgements false:

```dotenv
AKARA_FINCRA_ENABLED=true
AKARA_FINCRA_ENVIRONMENT=sandbox
AKARA_FINCRA_API_KEY=...
AKARA_FINCRA_BUSINESS_ID=...
AKARA_FINCRA_CORRIDORS=KES-NGN,GHS-NGN,XAF-NGN
AKARA_FINCRA_ALLOW_MUTATIONS=false
AKARA_FINCRA_LIVE_ACK=false
```

Run the offline client tests:

```bash
node server/test/fincra-test.js
```

After sandbox credentials are configured locally, run the read-only connectivity check:

```bash
npm run fincra:check
```

The check reports the authenticated sandbox business, KYC state, webhook state, and the number of rates returned for `AKARA_FINCRA_TEST_PAIR`. It does not generate a quote, initiate a conversion, or move funds.

## Official Fincra references

- API environments: <https://docs.fincra.com/docs/api-environments>
- Authentication: <https://docs.fincra.com/docs/authentication>
- Rates: <https://docs.fincra.com/reference/rates>
- Generate quote: <https://docs.fincra.com/reference/generate-quote>
- Conversions: <https://docs.fincra.com/docs/conversions>
- Webhook validation: <https://docs.fincra.com/docs/validating-webhook>
