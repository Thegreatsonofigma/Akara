# Real WhatsApp Test

Use this when you are ready to test Akara inside an actual WhatsApp chat instead of the local `/dev/message` simulator.

## What Changes

Local testing uses:

```text
AKARA_SEND_MODE=log
```

Real WhatsApp testing uses:

```text
AKARA_SEND_MODE=whatsapp
```

Meta sends real WhatsApp messages to:

```text
https://your-public-url/webhook
```

Akara replies through the WhatsApp Cloud API.

## Step 1: Fill WhatsApp Env Values

In `akara/.env`, set:

```text
AKARA_SEND_MODE=whatsapp
WHATSAPP_VERIFY_TOKEN=choose_a_private_phrase
WHATSAPP_ACCESS_TOKEN=your_meta_temporary_or_permanent_token
WHATSAPP_PHONE_NUMBER_ID=your_meta_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_meta_whatsapp_business_account_id
```

Keep these private.

## Step 2: Start Akara

```bash
cd "/Users/STEVEN/Documents/New project"
node akara/server/index.js
```

Expected:

```text
Akara webhook server listening on http://127.0.0.1:3000
```

## Step 3: Expose Local Server

Meta cannot reach `127.0.0.1`, so use a tunnel.

Example with ngrok:

```bash
ngrok http 3000
```

Copy the HTTPS forwarding URL.

Your webhook callback URL becomes:

```text
https://your-ngrok-url.ngrok-free.app/webhook
```

## Step 4: Configure Meta Webhook

In Meta for Developers:

```text
Your App -> WhatsApp -> Configuration
```

Set:

```text
Callback URL: https://your-public-url/webhook
Verify token: same value as WHATSAPP_VERIFY_TOKEN
```

Then subscribe to:

```text
messages
```

## Step 5: Add Your Phone As Test Recipient

In:

```text
WhatsApp -> API Setup
```

Add your personal WhatsApp number as the recipient.

Meta will send a code to your WhatsApp. Confirm it.

## Step 6: Send The First Test Message

From your personal WhatsApp, message the Meta test number.

Try:

```text
start
```

Akara should reply with the menu.

Then test:

```text
verify
demo approve
create listing
```

## Common Problems

If Meta webhook verification fails:

- The Akara server may not be running.
- The tunnel URL may be wrong.
- The callback URL must end with `/webhook`.
- The verify token must match exactly.

If messages arrive but Akara does not reply:

- Check `WHATSAPP_ACCESS_TOKEN`.
- Check `WHATSAPP_PHONE_NUMBER_ID`.
- Make sure `AKARA_SEND_MODE=whatsapp`.
- Temporary Meta tokens expire.

If you cannot message the test number:

- Add your personal WhatsApp number as a test recipient in Meta API Setup.
- Confirm the recipient code Meta sends.

