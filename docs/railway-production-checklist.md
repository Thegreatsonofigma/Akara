# Railway production checklist

The Akara process must start before Railway can pass `/health`. If a deployment
builds successfully but fails the network health check and shows `0 Variables`,
the service has no runtime configuration.

## Required Railway Variables

Add these under **Railway > Akara service > Variables**:

```text
NODE_ENV=production
AKARA_SEND_MODE=whatsapp
SUPABASE_URL=<Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<Supabase service-role key>
AKARA_ADMIN_TOKEN=<random secret with at least 32 characters>
WHATSAPP_VERIFY_TOKEN=<the same webhook verification secret entered in Meta>
WHATSAPP_ACCESS_TOKEN=<Meta system-user access token>
WHATSAPP_PHONE_NUMBER_ID=<Meta WhatsApp phone-number ID>
META_APP_SECRET=<Meta app secret>
AKARA_PUBLIC_URL=https://api.tryakara.com
AKARA_SHARE_URL=https://tryakara.com
AKARA_ADMIN_HOST=admin.tryakara.com
AKARA_WHATSAPP_NUMBER=<business WhatsApp number, digits only>
```

Add the published Flow IDs when those Flows are ready:

```text
AKARA_SECURITY_FLOW_ID=<published security Flow ID>
AKARA_VERIFICATION_FLOW_ID=<published verification Flow ID>
WHATSAPP_FLOW_MODE=published
```

## Before redeploying

1. Apply every Supabase migration through `015_admin_access_control.sql`.
2. Confirm the Railway service exposes the generated `PORT`; do not set a fixed
   `PORT` or `HOST`.
3. Redeploy and open `https://api.tryakara.com/health`.
4. Expect:

```json
{"ok":true,"service":"akara-whatsapp-webhook"}
```

5. Use `https://api.tryakara.com/webhook` as Meta's callback URL.

Never commit the service-role key, access token, app secret, verification token,
or admin token to Git.
