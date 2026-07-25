# Akara Trust, Liquidity, Risk, And Revenue Model

This document turns the next product gaps into a launch operating model for Akara.

Scope covered:

1. Trust scoring
2. Liquidity strategy
4. Fraud response
5. Escrow roadmap
6. Rate intelligence
7. Dispute playbook
8. Fee model

Akara is still no-custody at launch. Users move money directly between each other, while Akara verifies users, helps them find listings, coordinates exchange steps, captures evidence, manages dispute workflow, and applies account controls.

## 1. Trust Scoring

### Goal

Give users enough confidence to decide whether to trade with a person without exposing private identity details too early.

### User-Facing Trust Labels

Use simple labels instead of raw risk scores.

- New: verified, but no completed exchange yet.
- Good: verified with clean completed exchange history.
- Strong: high completion history and very low dispute/cancellation record.
- Review: account can still use limited actions while Akara checks a risk signal.
- Blocked: account cannot create listings or open trades.

### Trust Inputs

Positive signals:

- Verification completed.
- Payout name matches verified legal name.
- Completed exchanges.
- Receipt provided on time.
- Peer confirmations.
- No unresolved disputes.
- No repeated cancellations.

Risk signals:

- Same payout detail used by multiple accounts.
- Same document hash or selfie match across multiple accounts.
- Same device/session/IP fingerprint where available.
- Repeated cancellations.
- Receipt mismatch.
- User tries to trade with a linked account.
- User repeatedly opens trades and lets them expire.
- Multiple disputes in a short period.
- Attempts to move users outside Akara after opening a trade.

### Scoring Bands

Internal score range: 0 to 100.

- 85-100: Strong
- 60-84: Good
- 35-59: New or Review depending on evidence
- 0-34: Blocked or manual review

Do not show the numeric score to users. Show labels and useful context:

```text
Trust: Good
Completed exchanges: 4
Disputes: None unresolved
```

### Controls

- New users can trade only within Tier 1 limits.
- Review users require manual review for high-value listings.
- Blocked users cannot publish listings, open trades, or edit payout details.
- Linked-account trade attempts should be blocked before a trade opens.

## 2. Liquidity Strategy

### Goal

Make Akara feel useful even when the marketplace is still small.

### Launch Corridors

Focus liquidity where users already have urgent need:

- NGN to RWF
- RWF to NGN
- GHS to RWF
- KES to RWF
- XAF to RWF
- Corridor expansion only after there are enough listings or inbound requests.

### Liquidity Sources

1. Student and expat WhatsApp groups.
2. Trusted liquidity partners who post recurring listings.
3. Frequent users with strong trust labels.
4. Admin-seeded example listings clearly marked as examples if used on the website only.
5. Waitlist demand captured when no offer is available.

### Product Behavior When No Offer Exists

If the user states what they need and no matching offer exists:

1. Tell them clearly that no live listing can currently satisfy it.
2. Convert their message into a review listing.
3. Let them publish or edit it immediately.

Example:

```text
No live offer can send 30,000 NGN right now.

I can turn your request into a listing so verified users can find it.
```

### Ranking Offers

When a user asks for a currency and amount:

1. Negotiable listings that can cover the amount.
2. Fixed listings with exact or close fit.
3. Larger listings that can partially satisfy the request if partial matching is enabled.
4. Nearby corridor listings involving the requested currency.

Never show the user's own listing as something they can open.

### Partial Fill Matching

Ship partial-fill matching now for negotiable listings.

If a negotiable listing has more value than the taker needs, Akara should open a trade for the accepted amount and leave the remaining balance as a new live listing.

Example:

- User A lists 65,000 RWF for 60,000 NGN.
- User B needs 55,000 RWF and offers 50,000 NGN.
- Akara opens a trade for 55,000 RWF and creates a remaining live listing for 10,000 RWF and 10,000 NGN.

Fixed-rate listings should still require the posted terms unless the owner edits the listing first.

## 4. Fraud Response

### Goal

Make fraud expensive, detectable, and quickly contained, even without holding funds.

### High-Risk Events

- Fake or edited receipts.
- Same user attempting both sides of a trade.
- Same payout account across multiple users.
- Payment marked sent without receipt.
- Dispute opened without evidence.
- High-value transaction attempted by low-tier user.
- User receives value and becomes inactive.
- Repeated abandoned trades.

### Immediate Controls

When a risk event is detected:

1. Pause the affected trade.
2. Notify both parties with role-specific caution.
3. Prevent new trades from the risky account if needed.
4. Create an admin review task.
5. Preserve receipts, chat messages, payout details, timestamps, and audit events.

### Linked Account Detection

Block a trade if any of these match between maker and taker:

- Same verified legal identity.
- Same document hash.
- Same payout account or mobile money number.
- Same phone number in different format.
- Same device/session fingerprint if available.
- Same selfie match from KYC provider, when available.

If the match is suspicious but not conclusive, mark for admin review before trade opens.

### User-Facing Fraud Copy

Keep it direct and non-accusatory:

```text
Security check

This trade needs review before it can continue.
No one should send more money until Akara clears it.
```

## 5. Escrow Roadmap

### Goal

Move from coordination-only to stronger fund protection only when compliance and partner rails are ready.

### Phase 1: No Custody

Current launch model:

- Akara does not hold funds.
- Users pay each other directly.
- Akara records instructions, receipts, confirmations, and disputes.

### Phase 2: Licensed Partner Escrow

Akara integrates with a licensed payment, wallet, escrow, or remittance partner.

Akara should still not present itself as the licensed money handler unless it obtains the proper licence.

### Phase 3: Protected Trade Wallet

Only after legal clearance:

- Users deposit into protected partner-controlled accounts.
- Funds release after both sides satisfy conditions.
- Disputes can freeze release.
- Fees can be deducted automatically.

### Readiness Checklist

- Legal opinion on each corridor.
- Licensed partner agreement.
- Data processing agreement.
- AML policy.
- Transaction monitoring.
- Reversal and complaint workflow.
- Clear user terms explaining who holds funds.

## 6. Rate Intelligence

### Goal

Help users understand whether an offer is reasonable without pretending Akara controls market rates.

### Rate Sources

Akara should show:

- Live Akara listing rates.
- Recent completed Akara trade rates.
- User-created listing rates.
- Optional external reference rates if legally and technically safe.

### User-Facing Positioning

Avoid saying Akara gives the official rate.

Use:

```text
Akara rates come from verified users listing what they are willing to exchange.
Compare before you accept.
```

### Rate Insights

For a listing:

- Rate
- Compared with recent Akara range
- Whether it is above, within, or below recent peer-listed rates

Example:

```text
Rate check

This offer is within the recent Akara range for NGN to RWF.
```

### Admin Rate Tools

Admin should see:

- Median rate by corridor.
- High/low range.
- Outlier listings.
- Suspicious rate gaps.
- High-risk corridors with sudden spikes.

## 7. Dispute Playbook

### Goal

Make disputes structured, evidence-led, and operationally manageable.

### Required Dispute Inputs

A dispute cannot open without:

- Trade reference.
- Reason.
- Description.
- Supporting document or screenshot.

### Dispute Categories

- Paid, not received.
- Receipt looks wrong.
- Wrong amount.
- Wrong account.
- Trade partner unresponsive.
- Refund/reversal issue.
- Other.

### Dispute Statuses

- Open
- Awaiting evidence
- Under review
- Resolved and trade completed
- Resolved and trade closed
- Rejected

### Admin Resolution Options

Admin should choose one:

- Resolve and complete trade.
- Resolve and close trade.
- Resume trade.
- Request more evidence.
- Reject dispute.
- Restrict one or both users.

### User Updates

When a dispute is opened:

```text
Dispute opened

Reason: Paid, not received
Trade: AKR-TXN-001

Do not send extra value until this review is cleared.
```

When resolved and completed:

```text
Dispute resolved

The exchange is now confirmed. Your completion receipt is attached.
```

When resolved and resumed:

```text
Review cleared

You can continue this exchange. I will show the next step now.
```

### Admin SLA

- First review: within 24 hours.
- Standard resolution: 24 to 72 hours.
- Critical fraud: restrict account immediately, then review evidence.

## 8. Fee Model

### Goal

Make revenue feel fair and predictable without creating custody obligations.

### Launch Fee

Service fee: Free during launch.

User-facing copy:

```text
Service fee: Free
```

No extra referral copy inside trade or listing review screens.

### Akara Fee Account

When fees are enabled, Akara should use an invoice ledger, not a wallet.

Each completed trade creates a fee entry for both users. The entry belongs to the user's Akara Fee Account and carries a unique fee payment reference. This is only a receivable record owed to Akara; it is not user balance, wallet value, escrow money, or exchange principal.

Example:

| Activity | Fee balance |
| --- | --- |
| First completed trade | RWF 100 |
| Second completed trade | RWF 200 |
| Third completed trade | RWF 300 |

Users pay accumulated fees daily, weekly, or after 5 completed trades into Akara's official business bank or mobile money account using their unique Akara fee reference.

Akara's service-fee account must never receive users' exchange money.

### Receipt Evidence Checks

Receipts are supporting evidence only. They do not prove payment by themselves.

Akara should automatically inspect readable receipt text, captions, and filenames where available. If the readable amount or currency conflicts with the locked trade terms, Akara rejects that receipt before notifying the trade partner.

If the receipt is an image or file with no readable text yet, Akara can store it as pending evidence and forward it for review, but the exchange is still not complete until the recipient confirms money arrived in their bank or mobile money account.

Receipt states:

- Matched: readable receipt amount and currency match the locked trade.
- Pending: no readable text, amount, or currency was available.
- Mismatch: readable receipt amount or currency conflicts with the locked trade.
- Unavailable: OCR service or media extraction is unavailable.

Final proof remains recipient confirmation, supported by receipt evidence and admin review where needed.

### Post-Launch Options

Option A: Success fee through a licensed partner

- Both users pay a small fee after successful exchange.
- Simple to understand.
- Only enforceable cleanly through a licensed payment, wallet, escrow, or remittance partner.
- Akara should not collect success fees through manual chat transfers.

Option B: Listing boost fee

- User pays to promote a listing.
- Easier to charge without custody.
- Should not make normal listings invisible.

Option C: Subscription for frequent users

- Monthly access for higher limits, faster reviews, and priority support.
- Better for heavy users, expats, and informal liquidity providers.

Option D: Partner-supported fee

- Licensed partner handles money movement and deducts Akara fee automatically.
- Best long-term model if Akara moves beyond no-custody coordination.

### Recommended Path

1. Launch with fees visible but free during the first rollout.
2. Track completed trades and volume.
3. Enable the Akara Fee Account ledger after user trust and support flows are stable.
4. Add listing boosts as the first optional no-custody revenue feature.
5. Add automatic success-fee deduction only through a licensed partner rail.

### Fee Principles

- Always show fees before a trade opens.
- Never hide fee obligations inside long text.
- Do not ask users to pay fees to random numbers.
- No admin follow-up language for fees in user chat.
- Fee payments must be separate from exchange principal and clearly referenced.

## Implementation Backlog

### Now

- Add internal trust labels and risk triggers.
- Block self-trades and linked-account trades.
- Make offer ranking prioritize negotiable listings that cover requested value.
- Require dispute evidence before opening a dispute.
- Add admin dispute resolution outcomes.
- Add partial-fill matching for negotiable listings.
- Store receipt OCR/check status on every payment proof.
- Record pending success-fee ledger rows after completed trades.
- Keep visible launch fees simple and clear.

### Next

- Add rate intelligence by corridor.
- Add liquidity admin dashboard.
- Add rate outlier alerts.
- Add listing boost controls and fee experiment flags.
- Prepare licensed partner success-fee integration.

### Later

- Licensed partner escrow.
- Automatic fee deduction.
- Stronger device fingerprinting.
- External rate source integrations.
- Formal AML transaction monitoring.
