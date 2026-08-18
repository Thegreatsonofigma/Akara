# Fincra sandbox integration

This integration gives Akara a guarded Fincra client for business-profile checks, indicative rates, fresh executable quotes, hosted checkout collection, mobile-money payouts, independent transaction verification, and webhook-signature verification. All money-moving capabilities remain disabled by default.

## Safety boundary

- Fincra is disabled by default.
- The read-only check calls only the business profile and rates endpoints.
- Every mutating request requires `AKARA_FINCRA_ALLOW_MUTATIONS=true`.
- Checkout collection additionally requires `AKARA_FINCRA_ALLOW_COLLECTIONS=true`.
- Payout additionally requires `AKARA_FINCRA_ALLOW_PAYOUTS=true`.
- Live access also requires `AKARA_FINCRA_LIVE_ACK=true`.
- Live payout requires the separate `AKARA_FINCRA_LIVE_PAYOUT_ACK=true` acknowledgement.
- RWF is not in the initial corridor allowlist because Fincra has not confirmed it for Akara.
- Fincra partner quotes are typed as `partner_quote` and `isPeerOffer: false`. They must never be stored or displayed as offers created by Akara users.
- A partner quote remains `executionReady: false`. The new transaction engine is not yet connected to WhatsApp offer discovery, and refunds and bank-account payouts still require implementation and sandbox approval.
- Akara remains free to users. This integration does not add a service fee, subscription, transaction allowance, billing balance, or payment restriction.

## Quote lifecycle

The Rates API may be used for indicative discovery. When a customer chooses a partner option, Akara must request a fresh amount-based quote. Fincra quotes expire quickly, so Akara must display the expiry and must not reuse an expired reference.

The intended money movement is:

1. Show the customer a fresh final amount and expiry.
2. Collect the source currency through hosted Fincra Checkout and independently verify successful collection.
3. Run compliance and risk checks.
4. Request or refresh the provider quote when required.
5. Initiate the beneficiary payout only when the global and payout-specific mutation flags are approved.
6. Verify final provider status independently, reconcile the transaction, and handle failure or refund states.

The transaction state machine enforces these steps in order. A webhook can only move a transaction into a `*_verification_required` state. It can never confirm collection or complete payout. Akara must query Fincra using its own merchant or customer reference and validate the returned status and transaction terms.

The current payout builder supports only Fincra's documented `mobile_money_wallet` request shape. Bank-account payouts are intentionally blocked until Akara confirms the exact request contract and eligible payment schemes for its approved account. No live route currently calls payout initiation.

## Durable transaction states

Migration `019_partner_fulfillments.sql` adds a private, service-role-only transaction table. Its state machine is:

```text
created
  -> collection_pending
  -> collection_verification_required
  -> collection_confirmed
  -> payout_ready
  -> payout_processing
  -> payout_verification_required
  -> completed
```

Failed, mismatched, expired, or unknown responses move to `collection_failed`, `payout_failed`, or `manual_review`. Completing a record at the database layer requires both independent collection and payout verification timestamps.

The signed webhook endpoint is `POST /webhooks/fincra`. It performs an independent API lookup before persisting a successful collection or payout outcome.

## Configuration

Copy the Fincra variables from `.env.example` into a local `.env`, using sandbox credentials only. Keep both safety acknowledgements false:

```dotenv
AKARA_FINCRA_ENABLED=true
AKARA_FINCRA_ENVIRONMENT=sandbox
AKARA_FINCRA_API_KEY=...
AKARA_FINCRA_PUBLIC_KEY=...
AKARA_FINCRA_BUSINESS_ID=...
AKARA_FINCRA_WEBHOOK_SECRET=...
AKARA_FINCRA_CORRIDORS=KES-NGN,GHS-NGN,XAF-NGN
AKARA_FINCRA_ALLOW_MUTATIONS=false
AKARA_FINCRA_ALLOW_COLLECTIONS=false
AKARA_FINCRA_ALLOW_PAYOUTS=false
AKARA_FINCRA_LIVE_ACK=false
AKARA_FINCRA_LIVE_PAYOUT_ACK=false
```

Run the offline client tests:

```bash
node server/test/fincra-test.js
```

After sandbox credentials are configured locally, run the read-only connectivity check:

```bash
npm run fincra:check
```

The check reports the authenticated sandbox business, KYC state, webhook state, and the number of rates returned for `AKARA_FINCRA_TEST_PAIR`. It does not generate a quote, initiate a checkout, initiate a conversion, initiate a payout, or move funds.

## Official Fincra references

- API environments: <https://docs.fincra.com/docs/api-environments>
- Authentication: <https://docs.fincra.com/docs/authentication>
- Rates: <https://docs.fincra.com/reference/rates>
- Generate quote: <https://docs.fincra.com/reference/generate-quote>
- Hosted checkout: <https://docs.fincra.com/reference/initiate-checkout>
- Verify checkout: <https://docs.fincra.com/reference/verify-checkout-status>
- Mobile-money payout: <https://docs.fincra.com/reference/initiate-payout-1>
- Verify payout: <https://docs.fincra.com/reference/fetch-payout-by-customer-reference>
- Conversions: <https://docs.fincra.com/docs/conversions>
- Webhook validation: <https://docs.fincra.com/docs/validating-webhook>
