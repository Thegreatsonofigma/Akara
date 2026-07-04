# Akara WhatsApp Security Flow

Akara uses a native WhatsApp Flow for passcode setup and sensitive-action approval. This keeps the user inside WhatsApp and opens the same bottom-sheet tray style used by providers like Owo.

## What to create in Meta

Create one WhatsApp Flow in the Meta dashboard for the Akara WhatsApp app.

Required screens:

- `SETUP_PIN`
- `AUTHORIZE_PIN`

Required submitted field names:

- `passcode`
- `confirm` on `SETUP_PIN` only

The submitted response must include WhatsApp's `flow_token`. Akara also sends `challenge_token` in the Flow data payload, so you can pass that through as a backup field if the builder requires it. Akara uses that token to find the pending action, validate the passcode, then resume the exact payout edit, delete, or other protected request.

## User Experience

Setup:

1. User tries a sensitive action for the first time.
2. Akara sends a WhatsApp Flow button.
3. The user taps it and sees the native bottom sheet.
4. The user enters and confirms a 4 to 6 digit Akara code.
5. Akara saves the hashed code and resumes the action.

Authorization:

1. User tries a protected action after setup.
2. Akara sends a WhatsApp Flow button with the action label.
3. The user enters their Akara code inside WhatsApp.
4. Akara approves the action and resumes the original flow.

## Environment

Add the published Flow ID to `.env`:

```bash
AKARA_SECURITY_FLOW_ID=your_meta_whatsapp_flow_id
```

Then restart the webhook server:

```bash
node server/index.js
```

If `AKARA_SECURITY_FLOW_ID` is missing, Akara falls back to the secure web-link flow for local development.
