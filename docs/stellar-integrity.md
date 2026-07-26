# Akara Stellar Integrity Layer

Akara uses Stellar as an invisible integrity rail. Users continue exchanging
local fiat directly through bank and mobile money. They do not receive a
wallet prompt, hold crypto, pay a blockchain fee, or send an on-chain asset.

## What It Does

When an exchange is completed, Akara creates:

1. A privacy-safe trade completion snapshot.
2. A reputation snapshot for each participant.
3. A salted SHA-256 commitment for each snapshot.
4. A Merkle batch containing pending commitments.
5. One Stellar transaction containing the Merkle root.

The private snapshot and salt remain in Akara's restricted database. Only the
32-byte Merkle root, Akara's dedicated public account, normal Stellar
transaction metadata, and transaction time become public.

## What Never Goes On Stellar

- Names.
- WhatsApp numbers.
- Bank or mobile money details.
- KYC documents or selfie data.
- Receipt files or OCR text.
- Dispute descriptions or admin notes.
- Internal user, deal, listing, proof, or dispute UUIDs.
- Individual amounts or currency pairs.

Akara uses HMAC-derived opaque subjects inside private snapshots. Receipt
files are represented by their SHA-256 digest. Dispute text is represented by
a digest rather than its content.

## Security Design

- **Dedicated signer:** Use a Stellar account created only for integrity
  anchors. Never use it for user money, treasury, fees, or settlement.
- **Low balance:** Keep only the small XLM balance required for transaction
  fees and account reserve.
- **Public-key pinning:** `AKARA_STELLAR_PUBLIC_KEY` must match the configured
  secret key or the server refuses to sign.
- **Fee ceiling:** Akara refuses to submit when the network base fee exceeds
  `AKARA_STELLAR_MAX_FEE_STROOPS`.
- **HTTPS Horizon:** Remote Horizon endpoints must use HTTPS.
- **Salted commitments:** A random 32-byte salt prevents guessing a record
  from predictable trade values.
- **Domain separation:** Record, Merkle leaf, and Merkle parent hashes use
  distinct domains.
- **Merkle batching:** Up to 256 commitments share one Stellar transaction.
- **Prepared transaction recovery:** The signed XDR and transaction hash are
  stored before submission. A timeout is checked against Stellar before Akara
  retries.
- **Distributed submission lease:** A database-backed lease prevents multiple
  Akara instances from racing the same Stellar signer. Expired submissions are
  verified or safely released for retry.
- **Mainnet guard:** Public-network anchoring also requires the explicit
  `AKARA_STELLAR_MAINNET_ACK=true` setting.
- **Fail-open product flow:** Stellar failure never blocks or reverses the
  user's fiat exchange. The integrity record remains queued.
- **Database immutability:** Anchored records, confirmed batches, and
  reputation snapshots are append-only through PostgreSQL triggers.
- **No secret logging:** The signing seed and HMAC secret must never be logged,
  returned by an API, placed in WhatsApp, or committed to Git.

## Setup

1. Apply `supabase/migrations/008_stellar_integrity_reputation.sql`.
2. Create a dedicated Stellar testnet account.
3. Fund it with test XLM.
4. Generate an independent HMAC secret with at least 32 random bytes.
5. Add the following private environment variables:

```env
AKARA_STELLAR_INTEGRITY_ENABLED=true
AKARA_STELLAR_NETWORK=testnet
AKARA_STELLAR_MAINNET_ACK=false
AKARA_STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
AKARA_STELLAR_SECRET_KEY=...
AKARA_STELLAR_PUBLIC_KEY=...
AKARA_STELLAR_MAX_FEE_STROOPS=10000
AKARA_STELLAR_BATCH_SIZE=64
AKARA_STELLAR_ANCHOR_INTERVAL_MS=60000
AKARA_INTEGRITY_HMAC_SECRET=...
```

For production, keep the signing key in the hosting provider's encrypted
secret store. A managed KMS or signing service is preferred before material
scale. Do not place it in frontend or Vercel `NEXT_PUBLIC_` variables.

## Activation Order

1. Run all tests with anchoring disabled.
2. Apply migration 008.
3. Enable testnet.
4. Complete two controlled test exchanges.
5. Open Admin > Integrity.
6. Confirm the records show `Anchored`.
7. Select `Verify` and confirm the Merkle proof and Stellar transaction.
8. Backfill existing completed exchanges:

```bash
npm run stellar:backfill
```

9. Review testnet records for at least seven days.
10. Complete a security review before changing the network to `public`.

## Reputation Snapshot

Akara derives reputation from authoritative trade and dispute records:

- completed exchanges;
- cancelled exchanges;
- expired exchanges;
- completion rate;
- total disputes;
- open disputes;
- resolved disputes.

The displayed band is deterministic:

- `new`: no completed exchange;
- `active`: at least one completed exchange;
- `established`: at least three and 80% completion;
- `strong`: at least ten and 95% completion;
- `review`: one or more unresolved disputes.

Each snapshot links to the previous commitment hash. A correction creates a
new snapshot instead of rewriting the old one.

## Incident Response

If the signing key may be compromised:

1. Set `AKARA_STELLAR_INTEGRITY_ENABLED=false`.
2. Preserve logs and record a security incident.
3. Move remaining XLM to a new dedicated account.
4. Rotate the signing key and pin the new public key.
5. Keep the old public key in the verification history because existing
   anchors remain valid.
6. Review all anchors created after the suspected compromise time.

If the HMAC secret may be compromised, disable anchoring and treat it as a
security incident. Do not rotate it casually because opaque subject
continuity depends on it.

## Limits

Stellar proves that a particular commitment existed at or before a ledger
time and has not changed. It does not prove that the underlying payment
happened, that a receipt was genuine, or that Akara's original input was
truthful. Recipient confirmation, receipt controls, KYC, fraud monitoring,
and dispute review remain necessary.
