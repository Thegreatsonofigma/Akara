# Supabase Setup

Project URL:

```text
https://jwjrktkhwovadtjhtltu.supabase.co
```

## Do Not Share These In Chat

- Supabase database password.
- Supabase service role key.
- Meta WhatsApp access token.
- WhatsApp webhook verify token.

## Run The Schema

1. Open your Supabase project.
2. Go to SQL Editor.
3. Create a new query.
4. Paste the contents of `akara/supabase/migrations/001_initial_schema.sql`.
5. Run it.

Important: make sure no small part of the SQL is highlighted/selected when you click Run. Supabase runs the selected text if anything is selected.

If a partial run failed midway:

1. Run `akara/supabase/migrations/000_reset_akara_schema.sql`.
2. Then run the full `akara/supabase/migrations/001_initial_schema.sql` again from the top.

The reset script does not delete storage buckets because Supabase blocks direct deletes from storage system tables. This is fine: the main schema safely creates buckets with `on conflict do nothing`.

## Storage Buckets

The migration creates these private buckets:

- `verification-documents`
- `deal-proofs`

They should stay private. The backend will generate upload links later.

## Environment Variables

Copy `akara/.env.example` to `akara/.env` locally and fill in your real values.

Never commit or share `akara/.env`.

## MVP Security Model

For the first backend:

- The WhatsApp webhook server uses the Supabase service role key.
- Users do not access database tables directly.
- File uploads happen through backend-generated signed links.
- Admin actions happen through the admin dashboard, protected by admin login later.

This keeps the first version simpler while avoiding direct public writes into sensitive tables.
