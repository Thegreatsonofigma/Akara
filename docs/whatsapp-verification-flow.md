# Akara WhatsApp Verification Flow

Akara can collect identity text details in a native WhatsApp Flow tray, then continue inside chat for the ID document and selfie uploads.

## What this Flow collects

- Full legal name
- Nationality
- Country of residence
- City
- ID type
- ID issuing country
- ID number
- Review and correction before final submission

Uploads stay in chat because WhatsApp Flows are best for structured form input, while the normal WhatsApp chat is better for photos and PDFs.

Nationality, residence country, ID type, and issuing country use inline radio
options. The user can select them on the current form without opening a
separate dropdown picker.

## Meta setup

1. Go to WhatsApp Manager.
2. Open Account tools, then Flows.
3. Create a new Flow named `Akara Verification`.
4. Choose category `Other`.
5. Use `Without Endpoint`.
6. Replace the default JSON with `docs/akara-verification-flow.json`.
7. Publish the Flow.
8. Copy the Flow ID into `.env`:

```bash
AKARA_VERIFICATION_FLOW_ID=your_meta_whatsapp_verification_flow_id
WHATSAPP_FLOW_MODE=draft
```

Restart the webhook server after saving `.env`.

Meta's browser preview renders and validates each screen, but its embedded
preview may not execute `navigate` actions. Test the full transition by sending
the draft Flow to a staging recipient in WhatsApp. Remove
`WHATSAPP_FLOW_MODE=draft` after publishing the Flow.

## Flow JSON

Use the production JSON in `docs/akara-verification-flow.json`. It contains
the data-entry screen and a final review screen. Users can return to the first
screen to correct a mistake before submitting.
