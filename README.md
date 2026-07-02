# Akara MVP

Akara is a WhatsApp-first, no-custody peer-to-peer FX matching assistant for students and expats in Rwanda.

The first corridor is NGN <-> RWF. Users can verify their profile, create fixed or negotiable listings, discover available offers, reserve a deal, complete transfers outside Akara, upload proof, confirm receipt, and build reputation.

## MVP Positioning

Akara does not hold funds in the MVP. It provides verified matching, transaction guidance, status tracking, reminders, success-fee collection, reputation, and dispute support.

This keeps the first version lighter while leaving room for a regulated wallet or escrow model later.

## Core Artifacts

- [MVP build plan](docs/mvp-build-plan.md)
- [WhatsApp conversation map](docs/whatsapp-conversation-map.md)
- [Data model](docs/data-model.md)
- [Reference codes](docs/reference-codes.md)
- [Supabase setup](docs/supabase-setup.md)
- [Meta WhatsApp setup](docs/meta-whatsapp-setup.md)
- [Admin platform](docs/admin-platform.md)
- [Real WhatsApp test](docs/real-whatsapp-test.md)

## Recommended First Build

1. WhatsApp bot using the WhatsApp Business Platform Cloud API.
2. Backend webhook for incoming WhatsApp messages and button/list replies.
3. Database for users, verifications, listings, deals, fees, proof uploads, disputes, and penalties.
4. Secure web verification form for ID upload.
5. Lightweight admin dashboard for review, override, disputes, and transaction monitoring.

## Local Setup

Install the server dependency before running Akara:

```bash
npm install
npm start
```

`sharp` is used to render dynamic listing cards as PNG images for WhatsApp and link previews. The SVG preview pages still work without it, but PNG delivery needs `npm install` or a system SVG renderer such as `librsvg`.

## Important Guardrails

- Do not ask users to send full identity documents directly inside WhatsApp.
- Use secure upload links for verification and proof files.
- Do not describe the MVP as Akara exchanging, converting, or remitting money.
- Use language like "verified matching", "deal tracking", and "community exchange coordination".
- Add clear terms that transfers happen directly between users and that Akara is not custodying funds in the MVP.
