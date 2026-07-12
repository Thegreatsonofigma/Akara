# Akara Vendor And Processor Register

This register tracks vendors that process Akara personal data or support systems that may touch personal data.

Akara should not launch production processing until critical vendors have documented contracts, Data Processing Agreements, security evidence, breach notice commitments, deletion rules, and subprocessor lists where applicable.

## Vendor Register

| Vendor | Role | Data Handled | Purpose | Transfer / Location | Contract / DPA Status | Security Evidence Needed | Retention / Deletion | Owner | Risk | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Meta / WhatsApp Business Platform | Processor / platform provider. | WhatsApp number, messages, media metadata, interactive messages. | Messaging, WhatsApp Flows, notifications, user commands. | Cross-border likely. | To confirm. | Platform terms, security docs, data processing terms. | Based on Meta terms and Akara retention. | Product / Engineering. | High. | Confirm official WhatsApp Business terms and data processing terms. |
| Supabase | Database and storage provider. | Account, KYC metadata, payout data, listings, trades, receipts, disputes, audit logs. | Application database and file storage. | Cross-border depending on project region. | To confirm. | SOC/security docs, DPA, subprocessor list, backup policies. | Implement Akara retention and deletion rules. | Engineering. | High. | Finalise DPA and confirm storage region. |
| Vercel | Website and possibly frontend hosting. | Website logs, form data if enabled, deployment metadata. | Website hosting and deployment. | Cross-border likely. | To confirm. | DPA, security docs, logs retention. | Configure logs and data minimisation. | Engineering / Marketing. | Medium. | Confirm if product backend or only website is hosted. |
| Cloudflare | DNS, CDN, security, possibly Pages or Workers. | IP addresses, request logs, DNS and security logs. | DNS, CDN, protection, routing. | Cross-border likely. | To confirm. | DPA, security docs, log retention. | Configure minimum needed logs. | Engineering. | Medium. | Confirm Cloudflare scope for tryakara.com. |
| Didit or selected KYC provider | Processor / verification provider. | ID document, selfie, liveness result, verification result, metadata. | Identity verification, face match, liveness, fraud prevention. | Cross-border depending on provider. | Not final. | DPA, biometric data terms, retention policy, security certifications, deletion SLA. | Match Akara KYC retention unless provider requires different lawful period. | Compliance. | Very high. | Finalise vendor, confirm free tier and production pricing, execute DPA. |
| OpenAI or AI provider if used | Processor / AI service provider. | User messages needed for parsing; possibly no KYC docs unless explicitly integrated. | Natural language understanding, routing, AI assistant scope. | Cross-border likely. | To confirm. | DPA, data retention controls, no-training settings if available. | Minimise prompts and avoid unnecessary sensitive data. | Engineering / Product. | Medium to high. | Define data boundary for AI parsing. |
| Email / Support provider | Processor. | Support messages, complaints, attachments, user contact data. | Support, complaints, user rights requests. | Cross-border depending on provider. | To confirm. | DPA, retention, access controls. | Complaint records 5 years unless law requires longer. | Support. | Medium. | Select provider and configure access rules. |
| Analytics provider if used | Processor. | Website events, cookies, IP-derived location, device info. | Website analytics and growth. | Cross-border depending on provider. | To confirm. | DPA, cookie and retention controls. | Minimise and respect opt-out. | Marketing / Product. | Medium. | Choose privacy-friendly analytics or disable until notice is live. |
| Shutterstock or stock media provider | Content supplier, not product processor. | No Akara user personal data expected. | Website visuals only. | Not applicable to product data. | Licence terms. | Asset licence records. | Not applicable. | Marketing. | Low. | Keep licence evidence for images used. |

## Vendor Approval Checklist

Before approving a vendor:

- confirm what data the vendor receives;
- confirm whether the vendor is controller, processor, or independent service provider;
- sign or accept a Data Processing Agreement where required;
- review subprocessor list;
- review transfer safeguards;
- confirm breach notice timelines;
- confirm deletion and return process;
- confirm data location or region;
- confirm security certifications or equivalent controls;
- confirm support for user rights requests;
- record owner and renewal date.

## Production Blockers

These should be resolved before production launch:

- KYC provider contract and biometric/liveness terms.
- Supabase DPA and storage access model.
- Meta/WhatsApp official business terms and permissions.
- Admin access policy and audit evidence.
- Support channel retention and access control.
- Website analytics and cookie posture.
