# Akara NDPC Compliance Audit

This audit is an internal readiness checklist for NDPC-aligned data protection compliance. It is not a formal certification, legal opinion, or regulator approval.

Akara should have this reviewed by a Nigerian privacy lawyer or Data Protection Compliance Organisation before claiming NDPC certification or filing formal audit documents.

## 1. Executive Summary

Akara processes personal data for a WhatsApp-first, AI-assisted peer-to-peer currency exchange coordination platform.

Current risk level: High, because Akara handles identity documents, selfies, payout details, receipts, dispute evidence, and financial-context records.

Current compliance readiness: In progress.

Primary blockers before certification:

- final DPCO or legal review;
- vendor DPAs and transfer assessments;
- production retention and deletion controls;
- admin access review and audit evidence;
- final KYC provider terms;
- user-facing legal pages published;
- NDPC registration or audit filing route confirmed.

## 2. Audit Checklist

| Area | Requirement | Current Status | Evidence | Action Needed | Owner |
| --- | --- | --- | --- | --- | --- |
| Business identity | CAC registration and business details confirmed. | In progress. | CAC certificate and status report where available. | Verify legal name, registration number, address, directors/proprietor details. | Founder. |
| Privacy governance | Privacy lead or DPO contact appointed. | Pending. | Appointment note. | Appoint named privacy owner and escalation contact. | Founder. |
| Policies | Data protection policy documented. | Drafted. | `docs/compliance/data-protection-policy.md`. | Legal/DPCO review and approval. | Privacy Lead. |
| RoPA | Processing activities mapped. | Drafted. | `docs/compliance/record-of-processing-activities.md`. | Validate against production database and vendors. | Privacy Lead / Engineering. |
| DPIA | High-risk processing assessed. | Drafted. | `docs/compliance/dpia-akara-whatsapp-p2p-exchange.md`. | DPCO review before launch. | Privacy Lead. |
| Privacy Notice | Website-ready Privacy Notice published. | Pending. | Website legal pages. | Publish and link in WhatsApp onboarding. | Product / Legal. |
| Terms | User terms and trade rules published. | Pending. | Website legal pages. | Publish no-custody, no-escrow, dispute and fee rules. | Legal / Product. |
| KYC Notice | KYC and liveness notice published. | Pending. | KYC flow copy. | Include provider, data use, retention, consent where required. | Compliance. |
| User rights | Rights request procedure documented. | Drafted. | `docs/compliance/data-subject-rights-procedure.md`. | Implement request log and response templates. | Support. |
| Breach response | Breach plan documented. | Drafted. | `docs/compliance/data-breach-response-plan.md`. | Test plan and assign incident team. | Engineering / Privacy Lead. |
| Vendor management | Vendor register created. | Drafted. | `docs/compliance/vendor-and-processor-register.md`. | Collect DPAs, security evidence, subprocessor lists. | Privacy Lead. |
| Cross-border transfers | Transfer risks assessed. | Pending. | Vendor register. | Complete transfer assessment for each high-risk vendor. | Legal / Privacy Lead. |
| KYC controls | Verification, face match, name match, tier review. | Partially implemented. | Product flows and admin dashboard. | Confirm live provider integration and failure paths. | Engineering / Compliance. |
| Payout controls | No third-party payout accounts; strict name match. | Partially implemented. | Product flows. | Add API validation later and admin review evidence. | Engineering. |
| Receipt controls | Receipt required after paid status. | Partially implemented. | Product flow. | Ensure mandatory evidence for disputes and paid status. | Engineering. |
| Disputes | Admin can review, resolve, reject, resume, or close trade. | Partially implemented. | Admin dashboard. | Confirm evidence visibility, user notifications, and outcome logs. | Admin / Engineering. |
| Retention | Retention schedule defined. | Drafted. | Policy. | Implement deletion jobs and legal holds. | Engineering. |
| Access control | Admin least privilege and review. | Pending. | Admin role matrix. | Define roles, enable audit logs, schedule access reviews. | Engineering. |
| Audit logs | Admin and system actions logged. | Partially implemented. | `audit_events` table. | Confirm all sensitive actions create logs. | Engineering. |
| Training | Admins trained on privacy, KYC, disputes, breach. | Pending. | Training register. | Create simple training checklist. | Privacy Lead. |
| NDPC route | Registration, audit return, or certification path confirmed. | Pending. | NDPC/DPCO guidance. | Engage DPCO or legal counsel and file through official route if applicable. | Founder. |

## 3. Product Controls Audit

### Strengths

- Users must verify before sensitive actions.
- Payout names are expected to match verified legal names.
- Trade references and listing references exist.
- Receipts and disputes are part of the product flow.
- Admin dashboard exists for reviews.
- Launch model is no-custody and no-escrow.
- Tier limits reduce high-value exposure.

### Gaps

- Vendor contracts and DPAs are not final.
- KYC provider and biometric terms need final review.
- Retention and deletion need technical enforcement.
- Duplicate account and self-trade detection needs stronger controls.
- Admin access review process needs documentation.
- Formal NDPC or DPCO audit filing route needs confirmation.

## 4. Evidence Pack To Prepare

Maintain an evidence folder with:

- CAC certificate and status report;
- Privacy Notice;
- Terms of Use;
- KYC Notice;
- Cookie Notice if website analytics is used;
- Data Protection Policy;
- RoPA;
- DPIA;
- Breach Response Plan;
- Vendor Register;
- signed DPAs or vendor terms;
- admin role matrix;
- access review log;
- user rights request log;
- breach register;
- dispute resolution samples;
- KYC review samples;
- retention/deletion evidence;
- screenshots of user consent and notices.

## 5. Certification Readiness Decision

Akara should not claim NDPC certification yet.

Akara can move toward certification after:

1. a DPCO or Nigerian privacy lawyer reviews this pack;
2. vendor DPAs are collected;
3. user-facing notices are published;
4. retention and deletion controls are implemented;
5. admin controls and audit logs are verified;
6. NDPC registration or audit filing obligations are confirmed and completed.

## 6. Recommended Immediate Actions

| Priority | Action |
| --- | --- |
| P0 | Appoint privacy owner and open vendor DPA tracker. |
| P0 | Publish Privacy Notice, Terms, KYC Notice, and Dispute Rules. |
| P0 | Confirm KYC provider contract, liveness consent, and data retention. |
| P1 | Implement retention and deletion jobs. |
| P1 | Verify admin dashboard handles KYC, disputes, evidence, restrictions, tier upgrades, and notifications. |
| P1 | Add duplicate account and self-trading risk controls. |
| P1 | Conduct DPCO/legal review. |
| P2 | Build self-serve data export and deletion workflow. |

## 7. Audit Conclusion

Akara has enough product clarity to prepare for NDPC compliance review, but certification readiness depends on completing vendor governance, user-facing legal pages, retention implementation, access controls, and formal DPCO/legal review.

## 8. Official Filing References

Use official portals and regulator pages when confirming filing or certification obligations:

- NDPC: https://ndpc.gov.ng/
- NDPC services portal for data controller / processor registration, licensed DPCOs, breach reporting, and audit filing: https://services.ndpc.gov.ng/
- CAC: https://www.cac.gov.ng/
- CBN: https://www.cbn.gov.ng/
