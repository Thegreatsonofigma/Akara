# Akara Technical Control Register

This register maps Akara's NDPC readiness controls to product or repository evidence. It should be kept current as the system changes.

## Control Map

| Area | Technical Control | Evidence |
| --- | --- | --- |
| Lawful basis and notice | Consent and notice acceptance can be recorded per user, channel, purpose, lawful basis, and notice version. | `privacy_consents` table in `supabase/migrations/004_ndpc_compliance_controls.sql` |
| Data subject rights | Access, correction, deletion, restriction, objection, portability, withdrawal, and complaint requests can be logged and tracked to a 30-day due date. | `data_subject_requests` table and `/admin/api/compliance/dsr` |
| Deletion governance | Deletion requests create deletion jobs instead of silent destructive deletion, with legal hold and evidence fields. | `data_deletion_jobs` table |
| Breach response | Suspected incidents can be logged with severity, affected categories, affected subject count, notification decisions, remediation, and closure. | `data_breach_incidents` table and `/admin/api/compliance/breaches` |
| Processor governance | Meta, Supabase, KYC provider, Vercel, Cloudflare, and AI provider reviews are tracked with DPA status and review dates. | `processor_contracts` table and `/admin/api/compliance/processors` |
| Retention | Retention periods for KYC, receipts, disputes, WhatsApp records, payout details, and audit events are centrally recorded. | `retention_rules` table and `/admin/api/compliance/retention` |
| Accountability | Compliance work items are captured as operational tasks. | `compliance_tasks` table and `/admin/api/compliance/tasks` |
| Storage minimisation | KYC documents and deal proofs are stored in private Supabase buckets. | `supabase/migrations/001_initial_schema.sql` |
| Auditability | Product actions can be logged to `audit_events` for review. | `audit_events` table |
| Admin access | Compliance endpoints require the same admin token gate as the existing admin API. | `server/admin.js` |
| Redaction | Common sensitive fields can be masked before display or export. | `server/lib/privacy.js` |
| Tamper-evident product records | Completed trades, evidence digests, dispute outcomes, reputation snapshots, peer-market rates, accepted quotes, credentials, and liquidity routes are salted, hashed, batched into a Merkle root, and anchored to Stellar without blocking fiat completion. | `server/db/integrity.js`, `server/db/market.js`, `server/db/quotes.js`, `server/db/credentials.js`, `server/db/liquidity.js`, `server/lib/integrity-crypto.js`, `server/lib/stellar.js` |
| Public-ledger minimisation | Direct identifiers, internal UUIDs, amounts, currencies, receipt files, KYC, payout data, and dispute text are excluded from the Stellar transaction. | `recordCompletedDealIntegrity` and `recordDisputeOutcomeIntegrity` in `server/db/integrity.js` |
| Integrity key isolation | Anchoring requires a dedicated pinned Stellar key, HTTPS Horizon, a fee ceiling, and an independent HMAC secret. | `server/lib/stellar.js`, `.env.example`, `docs/stellar-integrity.md` |
| Append-only reputation | Anchored records, confirmed batches, and reputation snapshots are protected from ordinary update or deletion by database triggers. | `supabase/migrations/008_stellar_integrity_reputation.sql` |
| Independent verification | Admin can recompute the private commitment, verify its Merkle proof, and confirm the root against the Stellar transaction. | `/admin/api/integrity/:id/verify`, Admin > Integrity |
| Locked quote immutability | Accepted currencies, amounts, rate, users, and expiry cannot be changed after a quote is created. A deal links to the quote it accepted. | `supabase/migrations/009_stellar_market_quotes_credentials_routes.sql`, `server/db/quotes.js` |
| Market-rate transparency | Corridor guidance uses median, weighted median, interquartile range, visible depth, and recent completed trades; it is labelled as peer-market information rather than an official guaranteed rate. | `server/db/market.js`, `server/messages/assistant.js`, `server/flows/search.js` |
| Privacy-safe reputation sharing | User-shareable credentials contain aggregate reputation claims only and exclude identity, payout, KYC, receipt, and transaction-value data. | `server/db/credentials.js`, `server/messages/assistant.js` |
| Explicit split routing | Multi-offer plans contain two to four legs, preserve posted ratios, exclude the requester's listings, expire, and require each payment obligation to be opened explicitly. | `server/db/liquidity.js`, `server/flows/search.js` |

## Certification Boundary

These controls support NDPC readiness but do not create certification by themselves. Akara still needs:

1. DPCO or privacy counsel review.
2. Signed vendor contracts and Data Processing Agreements.
3. Published privacy, KYC, terms, dispute, cookie, and WhatsApp notice pages.
4. Named privacy owner or DPO contact.
5. Evidence that the Supabase migration has been applied in production.
6. Evidence that staff/admin users have been trained on the procedures.
7. NDPC registration, audit filing, or certification steps where applicable.
