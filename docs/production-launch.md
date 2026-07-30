# Akara Production Launch

Akara uses separate production surfaces:

- `https://tryakara.com` — public website on Vercel.
- `https://api.tryakara.com` — WhatsApp webhook and listing previews on Railway.
- `https://admin.tryakara.com` — Akara operations dashboard on the same Railway service.
- Supabase — application data and audit records.

The Node service must remain an always-on Railway service because it runs
matching, reminder, idle-menu, and Stellar-integrity schedulers in process.

## 1. Railway Service

Create a Railway project from `Thegreatsonofigma/Akara`, select the production
branch, and let `railway.json` configure the start command and `/health`
deployment check.

Set these non-secret production values:

```env
NODE_ENV=production
HOST=0.0.0.0
AKARA_SEND_MODE=whatsapp
AKARA_PUBLIC_URL=https://api.tryakara.com
AKARA_SHARE_URL=https://api.tryakara.com
AKARA_ADMIN_HOST=admin.tryakara.com
AKARA_REQUIRE_WEBHOOK_SIGNATURE=true
```

Copy every required secret from the private local `.env` into Railway
Variables. Never upload `.env`, tokens, service-role keys, app secrets, or
Stellar secret keys to GitHub.

Railway injects `PORT`; do not hard-code a different production port.
Akara deliberately fails startup in production if WhatsApp delivery, HTTPS
public URLs, signature verification, or a strong admin token is missing.

## 2. Production Domains

In Railway Public Networking, attach:

- `api.tryakara.com`
- `admin.tryakara.com`

Add the exact CNAME and verification records Railway provides to the DNS
provider for `tryakara.com`. Wait until Railway shows valid SSL for both.

Verify:

```text
https://api.tryakara.com/health
https://admin.tryakara.com/admin
```

## 3. Meta Webhook

In the Akara Meta app, configure:

```text
Callback URL: https://api.tryakara.com/webhook
Verify token: the exact WHATSAPP_VERIFY_TOKEN stored in Railway
```

Subscribe the production WABA to `messages`. Store the Meta App Secret as
`META_APP_SECRET`; Akara rejects unsigned or incorrectly signed webhook POSTs
in production.

## 4. WhatsApp Flows

Create and test the security and KYC verification Flows from the JSON and
instructions in `docs/`. Publish each Flow only after its preview is correct,
then set:

```env
AKARA_SECURITY_FLOW_ID=<published security Flow ID>
AKARA_VERIFICATION_FLOW_ID=<published verification Flow ID>
```

Redeploy after changing either ID.

## 5. Meta Production Readiness

After Meta marks Akara Fintech Solutions as **Verified**:

1. In **Meta for Developers > Akara > App settings > Basic**, complete the
   app contact email, icon, category, app domain, privacy-policy URL, terms URL,
   and user-data deletion URL:
   - `https://tryakara.com/legal/privacy-policy`
   - `https://tryakara.com/legal/terms-of-service`
   - `https://tryakara.com/legal/data-deletion-policy`
2. In **WhatsApp > Production setup**, confirm the Akara Cloud API number is
   registered, connected, and protected by its six-digit registration PIN.
3. In **WhatsApp Manager**, complete the production business profile and add a
   payment method for business-initiated conversations.
4. Confirm the Akara app is subscribed to the production WABA and the
   `messages` webhook field. The callback must remain
   `https://api.tryakara.com/webhook`.
5. Use a permanent system-user token assigned to both the Akara app and
   production WABA, with `whatsapp_business_messaging` and
   `whatsapp_business_management`.
6. Publish the KYC and security Flows, replace the Railway Flow IDs with the
   published IDs, set `WHATSAPP_FLOW_MODE=published`, and redeploy Railway.
7. Create and obtain approval for utility templates covering match alerts,
   reminders, KYC outcomes, disputes, and time-sensitive trade updates outside
   the customer-service window.
8. Complete every item Meta shows under **Required actions** or **Publish**,
   run the production smoke test below, then switch the Meta app to **Live**.

Akara operates its own WABA. Do not request Tech Provider or partner-level
permissions unless Akara later needs to onboard and manage WhatsApp accounts
belonging to other businesses.

## 6. Smoke Test

Use two verified test users and synthetic documents/receipts:

1. Start KYC and complete the verification Flow.
2. Add payout details and confirm name validation.
3. Publish reciprocal negotiable listings.
4. Confirm the background matcher alerts both users without a new inbound chat.
5. Open one trade and verify a second concurrent trade is blocked.
6. Upload an invalid receipt and confirm OCR rejects it.
7. Upload a valid receipt and confirm only the correct trade changes.
8. Confirm both peers before completing the exchange.
9. Raise and resolve a dispute from the admin dashboard.
10. Open a listing share URL and confirm its swap-card preview and WhatsApp handoff.

Keep ngrok available only for local development. Meta production callbacks must
use `https://api.tryakara.com/webhook`.
