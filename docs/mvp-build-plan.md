# Akara MVP Build Plan

## Product Definition

Akara is a WhatsApp-first matching assistant for people in Rwanda who need to exchange money directly with other verified users.

The MVP starts with NGN <-> RWF and later expands to XAF <-> RWF, GHS <-> RWF, and KES <-> RWF.

## MVP Scope

### Included

- WhatsApp onboarding.
- User profile creation.
- Secure verification link.
- Automated verification score with admin override.
- Fixed listings.
- Negotiable listings.
- Listing search and filtering.
- Listing reservation.
- Deal room managed by the bot.
- Transfer instructions shared only after reservation.
- Timers and reminders.
- Success-fee tracking.
- Proof upload link.
- Mutual confirmation.
- Cancellation penalties.
- Reputation and completed-trade count.
- Dispute reporting.
- Admin dashboard.

### Excluded For MVP

- Wallets.
- Escrow.
- Holding user funds.
- Automatic bank or MoMo payouts.
- Direct bank account linking.
- In-chat collection of full government ID documents.
- Fully automated dispute resolution.

## Success Fee

Akara should charge a small success fee from both sides after a successful match.

Recommended MVP fee:

- NGN side: 100 NGN.
- RWF side: 100 RWF.

Fee timing:

1. Both users confirm the deal is completed.
2. Akara marks the deal as "completed_pending_fee".
3. Bot sends each party a fee instruction.
4. User confirms fee payment.
5. Admin can manually verify the fee in the dashboard.

This avoids custody while teaching users from day one that Akara is a paid trust layer.

## Trust And Accountability

Akara cannot lock funds in the MVP, so accountability comes from behavior controls:

- Verified identity badge.
- Completed deals count.
- Cancellation count.
- Late response count.
- Report count.
- Temporary hold after repeated cancellation.
- Admin review for risky accounts.
- Deal timers.
- Proof uploads.
- Mutual confirmation.

### Cancellation Rules

- First cancellation in 24 hours: no penalty.
- Second cancellation in 24 hours: warning.
- Third cancellation in 24 hours: 30-minute hold.
- Fourth cancellation in 24 hours: 2-hour hold.
- Fifth cancellation in 24 hours: manual review.

The dashboard should let the admin override penalties.

## Verification

Verification should be hybrid:

- Automated by default.
- Admin-reviewable.
- Admin can switch auto-approval off.

Recommended verification inputs:

- Legal name.
- WhatsApp number.
- Nationality.
- Country of residence.
- City.
- ID type.
- ID image upload through secure web form.
- Selfie image.
- Optional school or community affiliation.

Automated checks for MVP:

- Required fields present.
- ID type allowed.
- Name entered by user roughly matches OCR name.
- Face/selfie is present.
- Document is not obviously expired if expiry is readable.
- Duplicate WhatsApp number check.
- Duplicate ID number/hash check if extracted.

Statuses:

- unverified
- pending_review
- verified_auto
- verified_manual
- rejected
- suspended

## Admin Dashboard

The first admin dashboard can be simple and operational:

- User list.
- Verification queue.
- Listing list.
- Active deals.
- Completed deals.
- Cancelled deals.
- Fee queue.
- Disputes.
- Risk flags.
- Manual notes.
- Settings.

Settings should include:

- Auto-approve verification on/off.
- Max active listings per user.
- Reservation timer.
- Fee amounts by currency.
- Supported corridors.
- Cancellation penalty thresholds.

## Suggested Tech Stack

Product-designer-friendly path:

- WhatsApp: Meta WhatsApp Business Platform Cloud API.
- Backend: Node.js + TypeScript.
- Database/Auth/Storage: Supabase.
- Admin dashboard: Next.js or Retool/Softr for speed.
- Verification OCR: start manual/assisted, later use a document verification provider.
- Hosting: Render, Railway, Fly.io, or Supabase Edge Functions.

Fastest validation path:

- WhatsApp Cloud API.
- Make/Zapier only for very early webhook experiments.
- Supabase table storage.
- Manual admin dashboard in Retool or a simple Next.js app.

Best long-term path:

- Custom backend.
- Supabase/Postgres.
- Custom admin dashboard.
- Later licensed payment partner for custody/escrow.

## Build Phases

### Phase 0: Product Spec And Test Script

Time: 1-2 days.

Deliverables:

- Conversation map.
- Admin rules.
- Data model.
- Pilot terms.
- Manual operations playbook.

### Phase 1: Clickable/Scripted WhatsApp Prototype

Time: 2-4 days.

Deliverables:

- Simulated conversation.
- Test listings.
- Admin spreadsheet or Supabase tables.
- Manual verification.
- Manual deal tracking.

### Phase 2: Real WhatsApp Bot

Time: 5-10 days.

Deliverables:

- WhatsApp webhook.
- Message router.
- User sessions.
- Create listing.
- Search listings.
- Reserve listing.
- Deal room.
- Reminders.
- Basic admin dashboard.

### Phase 3: Verification, Fees, And Disputes

Time: 7-14 days.

Deliverables:

- Secure upload forms.
- Admin verification queue.
- Fee confirmation flow.
- Proof upload.
- Dispute queue.
- Risk flags.
- Reputation scoring.

### Phase 4: Pilot And Iteration

Time: 2-4 weeks.

Deliverables:

- 30-100 real users.
- Manual review of every dispute.
- Improve matching.
- Improve trust rules.
- Decide whether custody/escrow is worth regulatory work.

## Realistic Timeline

If you are building mostly alone:

- Usable internal prototype: 3-5 days.
- Real WhatsApp MVP: 2-3 weeks.
- Safer public pilot: 4-6 weeks.
- Custody/escrow version: do not estimate until legal/payment partner path is confirmed.

## Next Build Step

Start with the WhatsApp state machine and database schema. Once those are stable, the backend is mostly implementation work.

