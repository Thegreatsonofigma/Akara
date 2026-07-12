# DPIA: Akara WhatsApp P2P Exchange Coordination

## 1. Assessment Summary

Akara is a WhatsApp-first, AI-assisted product that helps verified users list, discover, coordinate, evidence, and track peer-to-peer currency exchange arrangements.

Akara does not hold funds, move funds, operate custody, provide escrow, operate a wallet, act as a bank, act as a remittance company, or act as a bureau de change.

The product still processes high-risk personal data because it involves identity verification, payout details, receipts, financial transaction evidence, cross-border use, and fraud prevention.

## 2. Processing Description

Akara processes user data to:

- verify users;
- match payout names to verified identity;
- let users create and browse listings;
- open time-limited Akara Trades;
- exchange payout details between trade parties;
- collect receipts and supporting evidence;
- manage disputes;
- restrict suspicious users;
- upgrade user tiers after stronger verification.

## 3. Data Subjects

- verified individuals;
- prospective users;
- students;
- expats;
- travellers;
- freelancers;
- cross-border workers;
- trade counterparties;
- admins and support staff.

## 4. Data Categories

- identity data;
- WhatsApp contact data;
- KYC documents;
- selfie or liveness data;
- payout details;
- listing and trade data;
- receipts and evidence;
- dispute records;
- support messages;
- audit logs;
- risk flags.

## 5. Why A DPIA Is Needed

A DPIA is appropriate because Akara may process:

- government-issued identity documents;
- face or selfie verification data;
- financial account information;
- transaction receipts;
- fraud and risk signals;
- data across multiple countries;
- automated or assisted decisions about account tier, limits, restrictions, and verification status.

## 6. Necessity And Proportionality

| Requirement | Reason | Minimisation Decision |
| --- | --- | --- |
| KYC document and selfie | Needed to reduce impersonation, fake accounts, and repeat fraud. | Required only before sensitive actions. |
| Payout details | Needed so counterparties know where to pay. | Shared only after trade opens. |
| Receipt upload | Needed to evidence payment and support disputes. | Required only after payment status is marked sent. |
| Trade records | Needed to track active, completed, expired, disputed, and cancelled trades. | Kept under retention schedule. |
| Admin review notes | Needed for KYC mismatches, disputes, restrictions, and appeals. | Restricted to authorised reviewers. |

## 7. Risk Assessment

| Risk | Impact | Likelihood | Mitigation | Residual Risk |
| --- | --- | --- | --- | --- |
| Fake user creates multiple accounts to inflate completion history. | High. | Medium. | KYC, payout name matching, phone uniqueness, duplicate account signals, suspicious self-trading detection, admin review. | Medium. |
| User sends fake receipt. | High. | High. | Mandatory receipt, evidence quality checks, admin review, fake receipt warning, restrictions, permanent ban for confirmed fraud. | Medium. |
| User pays outside Akara and loses evidence trail. | High. | Medium. | Strong warnings, trade-room instructions, dispute flow, receipt requirement, no off-platform trade encouragement. | Medium. |
| Payout details belong to another person. | High. | Medium. | Strict legal-name match, no third-party accounts, admin review for mismatch, passcode for payout edits. | Low to medium. |
| KYC or selfie data is exposed. | Very high. | Low to medium. | Restricted storage, least privilege, signed URLs, audit logs, vendor DPA, breach response plan. | Medium. |
| User cannot exercise deletion rights because of disputes. | Medium. | Medium. | Rights procedure, 30-day target, clear lawful hold for active dispute/fraud review. | Low. |
| Admin misuse or excessive access. | High. | Medium. | Role-based access, audit logs, least privilege, access review, admin training. | Medium. |
| Inaccurate automated parsing causes wrong trade flow. | Medium. | Medium. | Review screens, confirmation prompts, natural language fallback, user edit/cancel options. | Low to medium. |
| Cross-border vendor processing without proper controls. | High. | Medium. | Vendor register, DPAs, transfer assessment, subprocessor review. | Medium until vendor contracts are final. |
| User thinks Akara guarantees payment or holds funds. | High. | Medium. | Clear no-custody language, trade-room warnings, terms, dispute limits, receipts, no compensation promise. | Medium. |

## 8. Safeguards To Implement Before Production

- Publish Privacy Notice, Terms, KYC Notice, Dispute Rules, and WhatsApp summaries.
- Require verification before listings, trades, payout details, and completions.
- Require strict payout name matching.
- Require receipt upload after payment is marked sent.
- Block normal cancellation after payment is sent and route to dispute.
- Show clear no-custody warnings before trade actions.
- Keep admin audit logs for KYC, tier upgrades, disputes, and restrictions.
- Add duplicate account and self-trade detection.
- Add passcode or WhatsApp Flow confirmation for sensitive payout and account changes.
- Enforce retention and deletion holds.
- Store IDs, selfies, and receipts in restricted storage.
- Maintain vendor DPAs and transfer assessments.
- Train admins on dispute handling and privacy.

## 9. Outcome

Akara may proceed to controlled pilot only after the safeguards above are implemented and reviewed.

Akara should not claim NDPC certification until a formal compliance review, audit, and any required NDPC or DPCO process is completed.

## 10. Review Triggers

Review this DPIA when Akara:

- adds custody, escrow, wallet, payment processing, or remittance features;
- adds a new country or currency;
- changes KYC provider;
- adds biometric or liveness automation;
- adds automated risk scoring;
- suffers a data breach;
- receives a regulator inquiry;
- materially changes dispute or payout flows.
