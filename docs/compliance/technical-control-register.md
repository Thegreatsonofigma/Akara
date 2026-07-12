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

## Certification Boundary

These controls support NDPC readiness but do not create certification by themselves. Akara still needs:

1. DPCO or privacy counsel review.
2. Signed vendor contracts and Data Processing Agreements.
3. Published privacy, KYC, terms, dispute, cookie, and WhatsApp notice pages.
4. Named privacy owner or DPO contact.
5. Evidence that the Supabase migration has been applied in production.
6. Evidence that staff/admin users have been trained on the procedures.
7. NDPC registration, audit filing, or certification steps where applicable.
