# Akara Security Standard

Akara handles identity documents, payout details, payment evidence, exchange
records and privileged administrative access. Security requirements in this
document are non-optional. A control is not considered live merely because it
is described here: its code, migration and production configuration must all
be verified.

## Architecture And Trust Boundaries

- **WhatsApp:** Meta sends user messages to the Node webhook on Railway.
- **Application backend:** the Node service interprets messages, coordinates
  exchanges and performs all privileged Supabase operations.
- **Website:** the Next.js site on Vercel serves public content and sends
  waitlist submissions through a server route.
- **Database and files:** Supabase stores operational data and private KYC and
  receipt objects. The service-role key is backend-only.
- **Admin:** `admin.tryakara.com` is a privileged operations interface backed
  by role-based permissions, time-limited sessions and an audit trail.
- **External processors:** Meta, Supabase, Railway, Vercel/Cloudflare, OCR/KYC,
  OpenAI and future payment or liquidity partners are separate processors or
  trust boundaries.
- **Stellar:** only privacy-safe commitments and integrity metadata may be
  anchored. Names, phone numbers, KYC, payout details, receipts, amounts and
  currency pairs must never be written to a public ledger.

The browser, WhatsApp client, uploaded files, webhook payload fields, OCR
output, AI output and partner callbacks are untrusted input.

## Data Classification

| Class | Examples | Minimum handling |
| --- | --- | --- |
| Restricted | KYC images, selfies, payout details, passcode hashes, service-role keys, Meta/OpenAI tokens | Server-only, least privilege, encryption in transit/at rest, private storage, audited access |
| Confidential | Phone numbers, legal names, receipts, dispute evidence, transaction history, device/risk signals | Authenticated operational access, purpose limitation, retention controls |
| Internal | Admin audit events, aggregate reports, fraud rules, system diagnostics | Admin role controls and no public exposure |
| Public | Website content, published offer references and intentionally shared listing cards | Integrity checks; no hidden personal data |

Logs must not contain secrets, raw passcodes, full KYC content or unnecessary
financial details. Error messages returned to users must not expose stack
traces, SQL, provider responses or configuration.

## Non-Negotiable Agent And Developer Rules

### Secrets

- Never commit `.env` files, service-role keys, private keys, access tokens,
  database passwords, webhook secrets or admin access tokens.
- `NEXT_PUBLIC_*` variables are public and must never contain privileged data.
- Secrets must live in Railway/Vercel/Supabase/Meta secret configuration and
  be rotated after exposure or personnel/vendor changes.
- Production secrets must be different from local and staging secrets.
- Never print secrets to logs, test snapshots, screenshots or support replies.

### Supabase And RLS

- All Akara tables must have RLS enabled even when direct browser access is
  currently disabled.
- `anon` and `authenticated` receive no table, sequence or sensitive function
  privileges unless a reviewed migration explicitly introduces a narrow read.
- Privileged writes go through the Node backend or a trusted server route
  using the service role. Client components never use the service role.
- All database functions use a fixed trusted `search_path`. Sensitive
  functions are not executable by `public`, `anon` or `authenticated`.
- Storage buckets containing KYC or payment evidence stay private. Access uses
  short-lived signed URLs for allowlisted buckets and authorized admin roles.
- Run Supabase Security and Performance Advisors after every schema, RLS,
  policy, grant or function change.

### WhatsApp And Financial State

- Production webhook POSTs require a valid Meta
  `X-Hub-Signature-256` HMAC using `META_APP_SECRET`.
- The verification token is only for Meta's GET challenge; it does not
  authenticate message POSTs.
- Every inbound Meta message ID is idempotent. Replayed or duplicate messages
  must not repeat payments, notifications, listings or status transitions.
- State-changing actions use server-side authorization and allowed-state
  checks. A user cannot edit another user's payout, listing, trade or dispute.
- Receipt OCR is supporting evidence only. It must not by itself mark money as
  received or complete a trade. The intended recipient confirms settlement.
- Rates, amounts, identities and payout details are locked when a trade opens.
  Sensitive payout changes require the Akara passcode flow.
- New passcodes contain exactly six digits and are stored with scrypt and a
  unique salt. Legacy shorter codes may be accepted only during a controlled
  migration. Challenges expire, are single-use and lock after repeated failure.
- Users with an unresolved dispute, fraud hold or active trade are restricted
  according to the product's integrity rules.

### Admin

- Admin sessions use random tokens stored only as hashes in the database.
- Browser sessions use `HttpOnly`, `SameSite=Strict`, production-`Secure`
  cookies. Do not store admin sessions in browser local or session storage.
- Every admin endpoint requires authentication and a named permission.
- Mutations reject cross-site browser requests. Sign-in and access requests
  are rate limited.
- High-impact actions such as bans, KYC decisions, dispute outcomes, payout
  access, role changes and restrictions are written to an immutable operational
  audit trail with actor, time, target and outcome.
- Administrators receive least privilege. Super-admin access is exceptional,
  protected by Meta/business-account MFA and reviewed regularly.
- Employees and collaborators must never silently alter transaction records.

### HTTP, Input And Uploads

- Apply HSTS in production, CSP on the Node/admin surface, anti-framing,
  `nosniff`, restrictive referrer policy and a restrictive permissions policy.
- JSON endpoints accept explicit JSON, enforce body limits and return 400/413/
  415 rather than internal errors for malformed input.
- Validate identifiers, enums, currencies, amounts, phone numbers and lengths
  before database access. Never construct SQL from untrusted strings.
- Public writes require validation, bot resistance and rate limiting. The
  waitlist also uses consent, a honeypot and data minimization.
- Uploaded KYC and receipt files require size/type checks, content inspection,
  private storage, malware scanning when available, random object names and
  short-lived signed access. File extensions alone are not trusted.
- CORS is deny-by-default. Do not use `*` on authenticated or sensitive routes.

### AI, OCR And External Providers

- Send the minimum necessary data to AI/OCR/KYC processors. Do not send service
  credentials, unrelated chat history or full database records.
- AI output never directly authorizes payment, KYC approval, dispute closure
  or an irreversible account action without deterministic checks.
- Provider responses, OCR text and callbacks are untrusted and validated.
- Maintain processor agreements, subprocessors, purpose, data location,
  retention and deletion support in Akara's RoPA.
- Payment/liquidity integrations must use licensed partners and separate
  Akara's service-fee account from user exchange funds.

## Enforced Request Architecture

- WhatsApp users authenticate through possession of their WhatsApp identity
  plus Meta-signed delivery; critical changes add an Akara passcode challenge.
- Admins authenticate with a private invitation/bootstrap credential that is
  exchanged for a time-limited server session.
- The public website never writes directly to protected tables. Its waitlist
  route validates and rate limits input before a service-role write.
- Direct browser writes to operational Supabase tables are prohibited.
- Anonymous user-specific cloud state is prohibited.

## Required Checks Before Merge

1. Run `npm run security:check`, `npm run check` and `npm test`.
2. Run `npm audit --omit=dev --audit-level=high` in the root and `website`.
3. Review the diff for secrets, new public routes, new data collection,
   privilege changes, logging and retention impact.
4. For database changes, apply them in staging and run Supabase Security and
   Performance Advisors.
5. Exercise negative tests: unsigned webhook, replayed message, malformed or
   oversized body, unauthorized admin, wrong role, cross-site mutation,
   disallowed file bucket and repeated passcode failures.
6. Confirm production variables are present without displaying their values.
7. Require human review for changes to authentication, authorization, money
   state, KYC, disputes, storage access or migrations.

## Production Operations

- Put Cloudflare/Railway/Vercel edge limits in front of public endpoints.
  In-process throttling is a first layer, not a distributed global limit.
- Alert on repeated admin failures, invalid webhook signatures, unusual
  message volume, KYC/download spikes, dispute spikes and service-role errors.
- Retain audit, dispute and legally required records according to Akara's
  approved retention schedule. Delete or anonymize expired data.
- Test database restoration. Supabase database backups do not restore Storage
  objects, so private KYC/receipt object recovery needs a separate encrypted,
  access-controlled procedure.
- Maintain staging separately from production and never test with real KYC or
  payment details unless explicitly authorized and protected.
- Review admin access, vendor access, secrets, RLS/grants and incident contacts
  at least quarterly.

## Incident Response

1. Contain: disable affected endpoints/accounts and preserve evidence.
2. Rotate affected keys immediately, including derived sessions where needed.
3. Audit RLS, grants, signed URLs, admin events, Meta events and provider logs.
4. Determine affected data subjects, records, countries and time window.
5. Follow the NDPA/NDPC breach assessment and notification process with
   qualified privacy counsel or a licensed DPCO where required.
6. Recover from verified clean state and monitor for recurrence.
7. Record cause, impact, decisions, remediation owner and deadlines.
8. Add a regression test or automated check before closing the incident.

Security reports should be sent privately to `security@tryakara.com` once that
mailbox is active; until then use the restricted internal incident channel.
Do not disclose exploitable details publicly before remediation.
