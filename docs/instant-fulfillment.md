# Akara Instant Fulfilment

Akara Instant Fulfilment supplements the peer marketplace with firm quotes
from licensed liquidity and payment partners. The user may accept the best
actionable quote immediately or keep the peer listing live.

Akara remains permanently free. `akara_fee_amount` is always zero in code and
is constrained to zero in the database. A partner may include its own cost in
a quote, but Akara must disclose that cost separately and must never accumulate,
invoice, or collect it as an Akara fee.

## Routing order

1. Search for a reciprocal peer match.
2. Attempt the existing peer negotiation flow.
3. Fan out a firm RFQ to every enabled partner supporting the corridor.
4. Reject quotes that require more than the user's maximum send amount or
   deliver less than the user's minimum receive amount.
5. Rank valid quotes by send amount, receive amount, partner cost, settlement
   estimate, and configured partner priority.
6. Let the user choose **Fulfil now** or **Keep waiting**.

Selecting a partner quote temporarily reserves the peer listing. Cancelling or
letting the quote expire reopens the listing during the normal matching sweep.
The partner checkout moves the funds; Akara does not take custody.

## Partner RFQ contract

Configure partners with `AKARA_LIQUIDITY_PARTNERS_JSON`. Each entry contains:

```json
{
  "code": "licensed-rwf-partner",
  "name": "Licensed RWF Partner",
  "quoteUrl": "https://partner.example/quotes",
  "apiKeyEnv": "AKARA_PARTNER_API_TOKEN",
  "corridors": ["NGN:RWF", "RWF:NGN"],
  "priority": 10
}
```

Akara sends a privacy-safe customer reference, the user's maximum send amount,
minimum receive amount, and an explicit zero Akara fee. The partner response
must contain:

```json
{
  "quote_id": "provider-unique-id",
  "send_currency": "NGN",
  "send_amount": 290000,
  "receive_currency": "RWF",
  "receive_amount": 300000,
  "partner_fee": { "amount": 0, "currency": "NGN" },
  "settlement_eta_seconds": 120,
  "checkout_url": "https://partner.example/checkout/provider-unique-id",
  "expires_at": "2026-08-04T12:10:00Z"
}
```

Only HTTPS endpoints and checkout URLs are accepted. Provider credentials are
read from environment variables and are never included in the request body or
stored with the quote.

## Partner path

- **Flutterwave:** candidate for cross-currency account-funded payouts; its
  documentation includes RWF payouts with NGN as `debit_currency`.
- **Yellow Card:** candidate stablecoin bridge with firm RFQs and NGN/RWF
  on/off ramps; settlement speed varies by channel, especially Rwanda banking.
- **Onafriq:** candidate network partner for cross-border disbursements and
  treasury coverage across Nigeria and Rwanda.
- **PAPSS:** strategic bank rail; Akara needs an eligible direct or indirect
  financial-institution participant rather than connecting as an unlicensed
  software marketplace.

Production activation requires a signed partner agreement, corridor-specific
legal review, KYC/data-sharing terms, webhook reconciliation, refund handling,
and proven sandbox/live settlement tests.
