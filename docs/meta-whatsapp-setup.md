# Meta WhatsApp App Setup

Use this checklist to create the Meta app and connect it to Akara.

## What You Need

- A Meta/Facebook account.
- Access to Meta for Developers.
- A Meta Business portfolio/account.
- Your Supabase schema already created.

## Create The App

1. Go to `https://developers.facebook.com/apps/`.
2. Click `Create App`.
3. Choose a business app type if Meta asks.
4. App name: `Akara`.
5. App contact email: your email.
6. Business portfolio: choose the business portfolio you created for Akara.
7. Finish app creation.

## Add WhatsApp

1. Inside the new Meta app, find `Add product`.
2. Choose `WhatsApp`.
3. Click `Set up`.
4. Go to `WhatsApp -> API Setup`.

## Copy These Values Into `akara/.env`

From `WhatsApp -> API Setup`, copy:

- Temporary access token -> `WHATSAPP_ACCESS_TOKEN`
- Phone number ID -> `WHATSAPP_PHONE_NUMBER_ID`
- WhatsApp Business Account ID -> `WHATSAPP_BUSINESS_ACCOUNT_ID`

Choose your own private webhook token:

- `WHATSAPP_VERIFY_TOKEN`

Use the exact same `WHATSAPP_VERIFY_TOKEN` later when Meta asks for webhook verification.

## Add Your Test Recipient Number

In `WhatsApp -> API Setup`:

1. Find the `To` recipient field.
2. Add your personal WhatsApp number.
3. Confirm the code Meta sends to your WhatsApp.

For testing:

- Meta test phone number = sender.
- Your personal WhatsApp number = recipient.

## Webhook Setup Comes After Server/Tunnel

Meta cannot reach `localhost`, so first run:

```bash
node akara/server/index.js
```

Then expose it with a tunnel.

Your callback URL will be:

```text
https://your-public-tunnel-url/webhook
```

Your verify token will be the value of:

```text
WHATSAPP_VERIFY_TOKEN
```

Subscribe to the `messages` webhook field.

## Secrets

Do not share:

- Temporary or permanent access token.
- Supabase service role key.
- Webhook verify token.
- Database password.

