# Akara WhatsApp Security Flow

Akara uses a native WhatsApp Flow for passcode setup and sensitive-action approval. This keeps the user inside WhatsApp and opens the same bottom-sheet tray style used by providers like Owo.

If Meta has not published the Flow, Akara uses a secure web challenge opened
from WhatsApp. The passcode is never collected in chat. This fallback is
production-ready and allows Akara to launch without weakening sensitive-action
authorization.

## What to create in Meta

Create one WhatsApp Flow in the Meta dashboard for the Akara WhatsApp app.

Required screen:

- `SECURITY_PIN`

Required submitted field names:

- `passcode`
- `confirm` in setup mode only

The submitted response must include WhatsApp's `flow_token`. Akara also sends `challenge_token` in the Flow data payload, so you can pass that through as a backup field if the builder requires it. Akara uses that token to find the pending action, validate the passcode, then resume the exact payout edit, delete, or other protected request.

## Flow JSON

Replace Meta's default `Hello World` JSON with
`docs/akara-security-flow.json`. The production definition uses one terminal
`SECURITY_PIN` screen. Akara sends a `setup` or `authorize` mode and the screen
shows the matching copy and fields. Keeping both operations on one terminal
screen avoids Meta rejecting the Flow as a disconnected screen graph.

## User Experience

Setup:

1. User tries a sensitive action for the first time.
2. Akara sends a WhatsApp Flow button.
3. The user taps it and sees the native bottom sheet.
4. The user enters and confirms a 6 digit Akara code.
5. Akara saves the hashed code and resumes the action.

Authorization:

1. User tries a protected action after setup.
2. Akara sends a WhatsApp Flow button with the action label.
3. The user enters their Akara code inside WhatsApp.
4. Akara approves the action and resumes the original flow.

## Environment

Add the published Flow ID to `.env`:

```bash
AKARA_SECURITY_MODE=flow
AKARA_SECURITY_FLOW_ID=your_meta_whatsapp_flow_id
```

Then restart the webhook server:

```bash
node server/index.js
```

Until Meta publishes the Flow, use:

```bash
AKARA_SECURITY_MODE=web
```

Akara then uses the secure web-link challenge even if a draft Flow ID remains
configured. Switch to `flow` only after publication succeeds.

New passcodes must contain exactly six digits. Akara temporarily accepts
existing four- or five-digit codes during authorization so current users are
not locked out; those legacy users should be migrated to six digits through a
controlled reset.
