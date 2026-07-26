# Stellar Leverage Inside Akara

## Product Rule

Akara remains a WhatsApp-first, local-fiat peer exchange product. Users do not
need a crypto wallet, do not send cryptocurrency, and do not see Stellar
transactions in the ordinary exchange flow.

Stellar is used as an independent integrity layer. Akara stores operational
records privately in Supabase and periodically anchors salted commitments in
batches to Stellar. The public ledger never receives phone numbers, legal
names, payout details, ID data, receipts, chat content, or exchange amounts.

## 1. Akara Trust Network

Completed trades, dispute outcomes, rate snapshots, locked quotes, trust
credentials, and liquidity routes create privacy-safe integrity records.

Value:

- Akara can detect later changes to a committed record.
- Admin can verify commitments against the Stellar transaction.
- Users gain stronger accountability without moving their fiat on-chain.

## 2. Akara Market Rate

`server/db/market.js` calculates a corridor snapshot from:

- active reciprocal listings;
- completed trades from the last seven days;
- median rate;
- volume-weighted median rate;
- interquartile range;
- best visible rate;
- visible market depth.

Snapshots are valid for five minutes, stored in `market_rate_snapshots`, and
committed through the integrity queue. Rate answers and matched offers use this
data. Akara presents it as peer-market information, never as an official or
guaranteed exchange rate.

## 3. Akara Locked Quotes

Every accepted posted term, accepted negotiation, automatic reciprocal match,
or routed partial fill creates a locked quote before the deal opens.

Locked fields:

- listing and participants;
- send and receive currencies;
- send and receive amounts;
- exact rate;
- quote type;
- expiry time.

The database blocks changes to locked financial terms. A trade stores the
locked quote ID, and both users see the branded quote reference in WhatsApp.

## 4. Reputation Passport

Verified users can ask Akara for `my trust record`.

The credential contains only:

- reputation band;
- completed trade count;
- completion rate;
- unresolved dispute count;
- integrity status;
- expiry date.

It excludes identity and financial data. The share link opens Akara on
WhatsApp, where another person can check the credential code. Credentials
expire after 30 days and may be revoked.

## 6. Partial-Fill Liquidity Routing

Existing single-listing partial fills remain unchanged. The added route planner
combines two to four reciprocal listings when no single listing covers the
request.

Rules:

- negotiable listings may be partially filled at their posted ratio;
- fixed listings are included only at their complete posted amounts;
- negotiable listings are ranked before fixed listings;
- no route may include the requester's own listing;
- routes below 50 percent coverage are not shown;
- the plan expires after ten minutes;
- each leg remains a separate, explicit user approval.

Akara does not silently open several payment obligations. The user sees every
leg, amount, and listing reference before selecting one.

## Deployment Order

1. Apply `008_stellar_integrity_reputation.sql`.
2. Apply `009_stellar_market_quotes_credentials_routes.sql`.
3. Configure the Stellar integrity environment variables.
4. Keep testnet enabled until operational verification is complete.
5. Review the Integrity page in admin.
6. Move to public Stellar only after setting `AKARA_STELLAR_MAINNET_ACK=true`
   and confirming the signer, fee ceiling, backup, and monitoring process.
