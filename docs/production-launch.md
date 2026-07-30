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
AKARA_VERIFICATION_MODE=manual
AKARA_SECURITY_MODE=web
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

Meta Flows are an upgrade, not a production launch dependency. Until Meta has
published them, keep the complete manual verification journey and secure web
passcode challenge active:

```env
AKARA_VERIFICATION_MODE=manual
AKARA_SECURITY_MODE=web
```

After Meta publishes both Flows, set:

```env
AKARA_VERIFICATION_MODE=flow
AKARA_SECURITY_MODE=flow
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
6. Use manual verification and web security for launch. After Meta publishes
   the KYC and security Flows, replace the Railway Flow IDs, switch both
   `AKARA_*_MODE` values to `flow`, set `WHATSAPP_FLOW_MODE=published`, and
   redeploy Railway.
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

1. Start KYC and complete the active manual or published-Flow journey.
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

## 7. Stellar Integrity Activation

Stellar is an invisible integrity rail, not a user payment rail. Users still
send and receive local currency through their own bank or mobile-money
accounts. No user wallet, crypto transfer, or XLM balance is required.

Activate it on the live Railway service in two stages:

1. Apply migrations 008 and 009, then re-run migration 016 so the Stellar
   tables and trigger functions receive the production grants and hardening.
2. Create and fund a dedicated Stellar testnet account.
3. Add the `AKARA_STELLAR_*` and `AKARA_INTEGRITY_HMAC_SECRET` variables shown
   in `.env.example` to Railway. Keep `AKARA_STELLAR_NETWORK=testnet` and
   `AKARA_STELLAR_MAINNET_ACK=false`.
4. Set `AKARA_STELLAR_INTEGRITY_ENABLED=true` and redeploy.
5. In the Railway service shell, run:

```bash
npm run stellar:readiness
```

6. Complete controlled exchanges and verify the resulting records in
   Admin > Integrity.
7. Run `npm run stellar:backfill` only after new test records verify.
8. Keep testnet running for at least seven days before following the
   public-network cutover in `docs/stellar-integrity.md`.

Akara now fails startup when Stellar is enabled with a weak HMAC secret,
invalid network, insecure Horizon URL, missing or mismatched signer, missing
production public-key pin, or an unacknowledged public-network configuration.
