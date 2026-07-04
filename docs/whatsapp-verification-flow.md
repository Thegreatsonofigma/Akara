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

Uploads stay in chat because WhatsApp Flows are best for structured form input, while the normal WhatsApp chat is better for photos and PDFs.

## Meta setup

1. Go to WhatsApp Manager.
2. Open Account tools, then Flows.
3. Create a new Flow named `Akara Verification`.
4. Choose category `Other`.
5. Use `Without Endpoint`.
6. Replace the default JSON with the JSON below.
7. Publish the Flow.
8. Copy the Flow ID into `.env`:

```bash
AKARA_VERIFICATION_FLOW_ID=your_meta_whatsapp_verification_flow_id
```

Restart the webhook server after saving `.env`.

## Flow JSON

```json
{
  "version": "7.3",
  "screens": [
    {
      "id": "KYC_DETAILS",
      "title": "Verify on Akara",
      "terminal": true,
      "success": true,
      "data": {
        "mode": {
          "type": "string",
          "__example__": "verification"
        },
        "verification_token": {
          "type": "string",
          "__example__": "sample-token"
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "name": "verification_form",
            "children": [
              {
                "type": "TextHeading",
                "text": "Verify your Akara profile"
              },
              {
                "type": "TextBody",
                "text": "Add the details exactly as they appear on your ID. You will upload your ID and selfie in chat after this."
              },
              {
                "type": "TextInput",
                "name": "legal_name",
                "label": "Full legal name",
                "required": true
              },
              {
                "type": "Dropdown",
                "name": "nationality",
                "label": "Nationality",
                "required": true,
                "data-source": [
                  { "id": "NG", "title": "Nigeria" },
                  { "id": "RW", "title": "Rwanda" },
                  { "id": "GH", "title": "Ghana" },
                  { "id": "KE", "title": "Kenya" },
                  { "id": "CM", "title": "Cameroon" },
                  { "id": "GA", "title": "Gabon" },
                  { "id": "OTHER", "title": "Other" }
                ]
              },
              {
                "type": "Dropdown",
                "name": "residence_country",
                "label": "Country of residence",
                "required": true,
                "data-source": [
                  { "id": "RW", "title": "Rwanda" },
                  { "id": "NG", "title": "Nigeria" },
                  { "id": "GH", "title": "Ghana" },
                  { "id": "KE", "title": "Kenya" },
                  { "id": "CM", "title": "Cameroon" },
                  { "id": "GA", "title": "Gabon" },
                  { "id": "OTHER", "title": "Other" }
                ]
              },
              {
                "type": "TextInput",
                "name": "city",
                "label": "City",
                "required": true
              },
              {
                "type": "Dropdown",
                "name": "id_type",
                "label": "ID type",
                "required": true,
                "data-source": [
                  { "id": "passport", "title": "Passport" },
                  { "id": "national_id", "title": "National ID" },
                  { "id": "residence_permit", "title": "Residence permit" },
                  { "id": "student_id", "title": "Student ID" }
                ]
              },
              {
                "type": "Dropdown",
                "name": "id_country",
                "label": "ID issuing country",
                "required": true,
                "data-source": [
                  { "id": "NG", "title": "Nigeria" },
                  { "id": "RW", "title": "Rwanda" },
                  { "id": "GH", "title": "Ghana" },
                  { "id": "KE", "title": "Kenya" },
                  { "id": "CM", "title": "Cameroon" },
                  { "id": "GA", "title": "Gabon" },
                  { "id": "OTHER", "title": "Other" }
                ]
              },
              {
                "type": "TextInput",
                "name": "id_number",
                "label": "ID number",
                "required": true
              },
              {
                "type": "Footer",
                "label": "Submit details",
                "on-click-action": {
                  "name": "complete",
                  "payload": {
                    "mode": "${data.mode}",
                    "verification_token": "${data.verification_token}",
                    "legal_name": "${form.legal_name}",
                    "nationality": "${form.nationality}",
                    "residence_country": "${form.residence_country}",
                    "city": "${form.city}",
                    "id_type": "${form.id_type}",
                    "id_country": "${form.id_country}",
                    "id_number": "${form.id_number}"
                  }
                }
              }
            ]
          }
        ]
      }
    }
  ]
}
```

