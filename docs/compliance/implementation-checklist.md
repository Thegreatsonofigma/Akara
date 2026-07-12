# NDPC Technical Implementation Checklist

Use this checklist before claiming Akara is ready for NDPC review.

## Database And Storage

- [ ] Apply `supabase/migrations/004_ndpc_compliance_controls.sql` to production.
- [ ] Confirm `verification-documents` storage bucket is private.
- [ ] Confirm `deal-proofs` storage bucket is private.
- [ ] Confirm Row Level Security is enabled on user, KYC, payout, trade, dispute, audit, and compliance tables.
- [ ] Confirm only the server service-role key can access private KYC and receipt media.
- [ ] Confirm production backups follow the retention policy.

## Product Controls

- [ ] Record privacy notice acceptance before verification.
- [ ] Record WhatsApp opt-in source and date.
- [ ] Require verification before listings, trades, and payout setup.
- [ ] Enforce payout name match against verified legal name.
- [ ] Require receipt evidence before marking payment as sent.
- [ ] Require supporting evidence before opening a dispute.
- [ ] Prevent deletion during active trade, dispute, fraud, or legal hold.
- [ ] Redact sensitive payout data in admin previews where full values are not needed.

## Admin Controls

- [ ] Review `/admin/api/compliance` dashboard.
- [ ] Assign an owner for every open DSR, breach, processor review, and compliance task.
- [ ] Resolve DSRs within 30 days or document the legal reason for delay/blocking.
- [ ] Log breach containment, notification decisions, and remediation.
- [ ] Keep processor DPA evidence URLs updated.
- [ ] Review retention rules every quarter.

## Vendor And Legal Controls

- [ ] Execute or confirm DPAs with Meta, Supabase, KYC provider, Vercel, Cloudflare, and AI provider.
- [ ] Complete cross-border transfer assessment for each processor.
- [ ] Publish public-facing legal pages on `tryakara.com`.
- [ ] Appoint a privacy owner or DPO contact.
- [ ] Complete DPCO/legal review.
- [ ] Complete NDPC registration or annual audit filing if Akara qualifies as a data controller or processor of major importance.

## Local Audit

Run:

```bash
node scripts/ndpc-compliance-audit.js
```

The script checks repository evidence only. It does not verify Supabase production state, vendor contracts, public pages, or regulator filing.
