create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  waitlist_code text unique not null default (
    'AKR-WAIT-' || upper(substr(gen_random_uuid()::text, 1, 8))
  ),
  email text,
  phone text,
  source text not null default 'website',
  status text not null default 'waiting'
    check (status in ('waiting', 'invited', 'joined', 'unsubscribed')),
  consent_version text not null,
  consented_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_contact_required check (
    nullif(trim(coalesce(email, '')), '') is not null
    or nullif(trim(coalesce(phone, '')), '') is not null
  )
);

create unique index if not exists waitlist_email_unique_idx
  on public.waitlist_signups (lower(email))
  where email is not null;

create unique index if not exists waitlist_phone_unique_idx
  on public.waitlist_signups (phone)
  where phone is not null;

create index if not exists waitlist_status_created_idx
  on public.waitlist_signups (status, created_at desc);

drop trigger if exists waitlist_signups_updated_at on public.waitlist_signups;
create trigger waitlist_signups_updated_at
before update on public.waitlist_signups
for each row execute function public.set_updated_at();

alter table public.waitlist_signups enable row level security;

revoke all on table public.waitlist_signups from anon, authenticated;
