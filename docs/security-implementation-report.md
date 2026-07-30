# Akara Security Implementation Report

## Implemented In This Repository

- Meta webhook POST verification with HMAC-SHA256 and timing-safe comparison.
- Durable and in-process inbound message deduplication to reduce replayed
  financial actions and duplicate notifications.
- Per-sender WhatsApp burst throttling.
- Private Supabase buckets for verification documents and trade proofs.
- Admin signed URLs limited to those two approved buckets and ten minutes.
- RLS enabled on every operational, compliance, integrity, waitlist and admin
  table.
- Migration `016_production_security_hardening.sql` removes `anon` and
  `authenticated` table/sequence access, removes public function execution,
  pins function `search_path`, and installs closed defaults for future objects.
- Supabase service-role use kept on backend/server routes.
- Admin RBAC for super admin, operations, compliance, support, analyst and
  custom permissions.
- Hashed, expiring, revocable admin sessions and admin action auditing.
- Admin browser sessions moved from Web Storage to an `HttpOnly`,
  `SameSite=Strict`, production-`Secure` cookie.
- Same-origin enforcement for admin mutations.
- Throttling for admin sign-in and public admin access requests.
- Six-digit passcodes for new setups, scrypt hashing with unique salts,
  challenge expiry, single-use state and attempt lockout.
- Compatibility for existing four/five-digit passcodes during migration.
- Baseline Node/admin HTTP security headers including CSP, HSTS, anti-framing,
  MIME sniffing protection, referrer controls and permissions restrictions.
- JSON content-type enforcement, 256 KiB default JSON limit and explicit
  malformed/oversized request errors.
- Website headers for HSTS, anti-framing, MIME, referrer and permissions.
- Waitlist origin checks, 16 KiB request cap, per-instance throttling,
  honeypot, consent, format validation and minimized landing-path collection.
- Automated tracked-file secret scan and browser privileged-key check.
- GitHub security CI for syntax, tests, type checking, linting and high-severity
  production dependency audits.
- Dependabot coverage for the Node app, Next.js website and GitHub Actions.
- Security regression tests for headers, content types, passcodes, rate limits
  and admin cookie flags.
- Patched production image processing to `sharp` 0.35.3 and the website to
  Next.js 16.2.12.
- Patched nested `postcss`, `sharp` and `minimatch` dependency lines with
  compatibility-tested overrides.
- Node.js 20.9 or newer is now an explicit runtime requirement for Railway,
  Vercel and local production builds.
- Full npm audits currently report zero known vulnerabilities in both the
  backend and website dependency trees.
- A repository-wide threat model, data classification, merge gate, incident
  process and operational security standard in `SECURITY.md`.

## Production Activation Still Required

These are not completed by merging code:

1. Apply Supabase migration `016_production_security_hardening.sql`.
2. Run and clear Supabase Security and Performance Advisor findings.
3. Confirm Railway and Vercel variables are secrets and rotate any previously
   shared values.
4. Configure Cloudflare/Railway/Vercel distributed rate limits and alerts.
5. Confirm Meta app secret signature enforcement remains enabled in production.
6. Redeploy the Railway backend and Vercel website from the reviewed commit.
7. Re-publish the updated six-digit WhatsApp security Flow in Meta.
8. Migrate users with legacy four/five-digit passcodes through a controlled
   reset campaign.
9. Configure monitoring and alerts for admin failures, invalid signatures,
   anomalous evidence access, KYC spikes and webhook processing errors.
10. Establish encrypted recovery for Supabase Storage objects and test both
    database and evidence restoration.
11. Activate `security@tryakara.com` or document a restricted replacement.
12. Complete vendor DPAs/RoPA entries and NDPC organizational/legal work.

## Residual Risks

- In-memory rate limits are per process and can be bypassed across instances;
  edge/distributed enforcement is required at scale.
- Tesseract OCR cannot prove that funds moved and must remain supporting
  evidence only.
- A six-digit passcode is a transaction safeguard, not a replacement for
  device security, MFA for administrators or provider-side fraud controls.
- External services can fail or be compromised; Akara needs vendor monitoring,
  contractual controls and tested outage procedures.
- These controls materially improve technical security but do not constitute
  penetration-test assurance, NDPC certification or a guarantee against loss.
