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

## Flow JSON

Replace Meta's default `Hello World` JSON with this:

```json
// {
//   "version": "7.3",
//   "screens": [
//     {
//       "id": "SETUP_PIN",
//       "title": "Setup Akara Code",
//       "terminal": true,
//       "success": true,
//       "data": {
//         "mode": {
//           "type": "string",
//           "__example__": "setup"
//         },
//         "challenge_token": {
//           "type": "string",
//           "__example__": "sample-token"
//         },
//         "action_label": {
//           "type": "string",
//           "__example__": "Edit payout detail"
//         }
//       },
//       "layout": {
//         "type": "SingleColumnLayout",
//         "children": [
//           {
//             "type": "Form",
//             "name": "setup_pin_form",
//             "children": [
//               {
//                 "type": "TextHeading",
//                 "text": "Setup your Akara code"
//               },
//               {
//                 "type": "TextBody",
//                 "text": "Create a private 4 to 6 digit code for payout edits and other sensitive actions."
//               },
//               {
//                 "type": "TextInput",
//                 "name": "passcode",
//                 "label": "Create code",
//                 "input-type": "number",
//                 "required": true
//               },
//               {
//                 "type": "TextInput",
//                 "name": "confirm",
//                 "label": "Confirm code",
//                 "input-type": "number",
//                 "required": true
//               },
//               {
//                 "type": "Footer",
//                 "label": "Save code",
//                 "on-click-action": {
//                   "name": "complete",
//                   "payload": {
//                     "mode": "${data.mode}",
//                     "challenge_token": "${data.challenge_token}",
//                     "action_label": "${data.action_label}",
//                     "passcode": "${form.passcode}",
//                     "confirm": "${form.confirm}"
//                   }
//                 }
//               }
//             ]
//           }
//         ]
//       }
//     },
//     {
//       "id": "AUTHORIZE_PIN",
//       "title": "Authorize Action",
//       "terminal": true,
//       "success": true,
//       "data": {
//         "mode": {
//           "type": "string",
//           "__example__": "authorize"
//         },
//         "challenge_token": {
//           "type": "string",
//           "__example__": "sample-token"
//         },
//         "action_label": {
//           "type": "string",
//           "__example__": "Edit payout detail"
//         }
//       },
//       "layout": {
//         "type": "SingleColumnLayout",
//         "children": [
//           {
//             "type": "Form",
//             "name": "authorize_pin_form",
//             "children": [
//               {
//                 "type": "TextHeading",
//                 "text": "Authorize this action"
//               },
//               {
//                 "type": "TextBody",
//                 "text": "${data.action_label}"
//               },
//               {
//                 "type": "TextInput",
//                 "name": "passcode",
//                 "label": "Akara code",
//                 "input-type": "number",
//                 "required": true
//               },
//               {
//                 "type": "Footer",
//                 "label": "Authorize",
//                 "on-click-action": {
//                   "name": "complete",
//                   "payload": {
//                     "mode": "${data.mode}",
//                     "challenge_token": "${data.challenge_token}",
//                     "action_label": "${data.action_label}",
//                     "passcode": "${form.passcode}"
//                   }
//                 }
//               }
//             ]
//           }
//         ]
//       }
//     }
//   ]
// }
{
  "version": "7.3",
  "screens": [
    {
      "id": "SETUP_PIN",
      "title": "Secure Your Account",
      "terminal": true,
      "success": true,
      "data": {
        "mode": {
          "type": "string",
          "__example__": "setup"
        },
        "challenge_token": {
          "type": "string",
          "__example__": "sample-token"
        },
        "action_label": {
          "type": "string",
          "__example__": "Edit payout detail"
        }
      },
      "layout": {
        "type": "SingleColumnLayout",
        "children": [
          {
            "type": "Form",
            "name": "setup_pin_form",
            "children": [
              {
                "type": "TextHeading",
                "text": "Set up your passcode"
              },
              {
                "type": "TextBody",
                "text": "Set a private 6-digit code for sensitive actions like payout changes and deal confirmations."
              },
              {
                "type": "TextInput",
                "name": "passcode",
                "label": "Create passcode",
                "input-type": "number",
                "required": true
              },
              {
                "type": "TextInput",
                "name": "confirm",
                "label": "Confirm passcode",
                "input-type": "number",
                "required": true
              },
              {
                "type": "Footer",
                "label": "Confirm & save",
                "on-click-action": {
                  "name": "complete",
                  "payload": {
                    "mode": "${data.mode}",
                    "challenge_token": "${data.challenge_token}",
                    "action_label": "${data.action_label}",
                    "passcode": "${form.passcode}",
                    "confirm": "${form.confirm}"
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
