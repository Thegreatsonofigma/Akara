# Akara WhatsApp Webhook Server

This is the first backend for Akara. It uses only built-in Node.js APIs, so there is no install step.

## What It Does

- Verifies Meta's WhatsApp webhook challenge.
- Receives WhatsApp messages.
- Creates or finds a user by WhatsApp phone number in Supabase.
- Stores a simple message session.
- Runs the core Akara WhatsApp flow: verification placeholder, listing creation, offer search, reservations, deal status, fees, and disputes.
- Sends replies through the WhatsApp Cloud API, or logs replies locally in development mode.

## Code Structure

The entry point is `index.js`, which starts the server. The implementation is split into focused modules:

```text
server/
  index.js       Entry point and public exports
  config.js      .env loading and runtime configuration
  app.js         HTTP server, webhook, /dev/message, receipt links
  router.js      buildReply: routes each inbound message to a flow
  admin.js       Admin dashboard API
  lib/           http, supabase, whatsapp, receipts, formatting helpers
  nlp/           slang/shorthand expansion, currency + amount parsing, intents
  db/            users, sessions, payments, listings, deals data access
  messages/      reusable copy and the scoped Q&A assistant
  flows/         conversation flows: verification, payment-profile, listing,
                 search, settings, deal-room, history
```

The bot understands slang and shorthand before parsing: pidgin ("abeg", "wetin", "i wan", "i dey with"), chat shorthand ("pls", "u", "2k", "1.5m", "2 thousand"), currency slang ("naija money", "frw", "fcfa", "ghc", "ksh", "bob", "cedis", "amafaranga"), and common typos ("avaialble"). A message like `i have 2k naira and i want rwf, show me available deals` is parsed as a full NGN→RWF request and answered with matching live RWF/NGN listings from the database.

## Setup

1. Copy the environment template:

```bash
cp akara/.env.example akara/.env
```

2. Fill in `akara/.env` locally.

Required values:

```text
SUPABASE_URL=https://jwjrktkhwovadtjhtltu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=keep_secret
HOST=127.0.0.1
PORT=3000
AKARA_SEND_MODE=log
WHATSAPP_VERIFY_TOKEN=choose_a_private_random_phrase
WHATSAPP_ACCESS_TOKEN=keep_secret
WHATSAPP_GRAPH_VERSION=v20.0
WHATSAPP_PHONE_NUMBER_ID=from_meta_api_setup
```

Optional values:

```text
OPENAI_API_KEY=from_google_ai_studio
OPENAI_MODEL=gpt-5-nano
PAYSTACK_SECRET_KEY=from_paystack_dashboard
```

`PAYSTACK_SECRET_KEY` enables free NGN bank account resolution (`lib/paystack.js`). When adding an NGN payout, Akara matches the typed bank name against Paystack's bank list, looks up the account holder's name from the account number (Paystack's free `/bank/resolve` endpoint), checks it against the user's KYC name, and asks for confirmation before saving. Sign up free at https://dashboard.paystack.com and copy the secret key from Settings → API Keys & Webhooks. Without a key, the bot falls back to asking the user to type the account name.

`GEMINI_API_KEY` enables the Gemini fallback interpreter (`nlp/interpreter.js`). When a message does not match any regex intent, Gemini classifies it into an existing action (make offer, find offer, history, settings, and so on) or answers it as a scoped question. Get a free key at https://aistudio.google.com/apikey. Without a key, the bot uses only the built-in regex replies.

Do not share `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, or `GEMINI_API_KEY`.

Use `AKARA_SEND_MODE=log` while Meta is not connected yet. In log mode, the server does not send WhatsApp messages; it prints replies locally and enables the `/dev/message` test endpoint.

3. Start the server:

```bash
node akara/server/index.js
```

By default it runs on:

```text
http://localhost:3000
```

## Local Health Check

```bash
curl http://localhost:3000/health
```

Expected:

```json
{ "ok": true, "service": "akara-whatsapp-webhook" }
```

## Local Message Testing

When `AKARA_SEND_MODE=log`, test a simulated WhatsApp message:

```bash
curl -X POST http://localhost:3000/dev/message \
  -H "content-type: application/json" \
  -d '{"from":"250700000000","text":"start","displayName":"Local Tester"}'
```

Try this local flow:

```text
start
verify
demo approve
create listing
NGN
RWF
50000
55000
fixed
publish
my listings
```

## Meta Webhook URL

For Meta to reach your local machine, you need a public tunnel later, usually with ngrok or Cloudflare Tunnel.

Your webhook callback URL will look like:

```text
https://your-public-tunnel-url/webhook
```

Your verify token must exactly match `WHATSAPP_VERIFY_TOKEN` in `akara/.env`.

## Current Bot Commands

The server currently supports:

- `start`
- `help`
- `verify`
- `demo approve`
- `create listing`
- `find offer`
- `my listings`
- `my deals`
- `sent`
- `received`
- `fee paid`
- `dispute`
- `cancel deal`
- `cancel`

`demo approve` is only for local testing before the secure verification form is connected.
