# Akara Website

Marketing site and legal center for Akara — a WhatsApp-first peer-to-peer
currency exchange coordination platform.

Built with Next.js (App Router), TypeScript, Tailwind CSS v4, Motion for
React, and Phosphor Icons.

## Routes

- `/` — landing page (hero, problem/solution, how it works, currencies,
  verification, payout name match, receipts & disputes, safety controls,
  designed for, compliance, FAQ, final CTA)
- `/trust` — trust & safety center
- `/support` — support channels, hours, and escalation
- `/legal` — legal index (Akara Legal, Trust, and Safety Center)
- `/legal/[slug]` — 16 policy pages, statically generated from
  `lib/legal-content.ts`

## Getting started

```bash
cd website
npm install
npm run dev        # http://localhost:3000
```

## Scripts

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | Start the dev server            |
| `npm run build`     | Production build (all pages SSG) |
| `npm run start`     | Serve the production build      |
| `npm run lint`      | ESLint                          |
| `npm run typecheck` | TypeScript `tsc --noEmit`       |

## Brand notes

- Fonts: Campton (UI) and Coolvetica (numbers/amounts) are loaded from
  `public/fonts/` via `next/font/local` — copied from the licensed files in
  `server/assets/fonts/`. Fallback stacks are defined in `app/globals.css`.
- Colors: black-dominant surfaces, Akara Green `#9DFF1E` as the primary
  signal, with sparing pink/red/acid/electric accents. Tokens live in
  `app/globals.css` under `@theme`.
- All product UI in the hero (WhatsApp chat, listing card, trade tracker,
  receipt card) is hand-built with CSS — no screenshots.

## Compliance guardrails

Copy across the site must never state or imply that Akara holds, receives,
escrows, custodies, remits, converts, or moves user funds. Shared mandatory
wording lives in `lib/site.ts` (`MANDATORY_WORDING`, `NO_CUSTODY_LINE`,
`SHARED_LEGAL_NOTICE`) — reuse those constants rather than rewording them.
Legal page content lives in `lib/legal-content.ts`; every legal page renders
through `components/legal/LegalLayout.tsx`, which automatically includes
business details, the shared legal notice, key reminders, and the
draft-for-legal-review disclaimer.
