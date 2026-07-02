# Akara Admin Platform

The admin platform runs from the same local server as the WhatsApp webhook.

## Local URL

```text
http://127.0.0.1:3000/admin
```

## Admin Token

The dashboard asks for an admin token.

For local development, the default is:

```text
local-admin
```

Before any public deployment, set a stronger value in `akara/.env`:

```text
AKARA_ADMIN_TOKEN=replace_with_a_long_private_value
```

Do not share the admin token in chat.

## Current Sections

- Overview
- Users
- Verifications
- Offers
- Deals
- Disputes

## Current Admin Actions

- Change user verification status.
- Change user risk status.
- Pause, flag, cancel, or expire offers.
- Update dispute status.

## Notes

The browser never receives the Supabase service role key. The dashboard calls the Akara server, and the server talks to Supabase.

