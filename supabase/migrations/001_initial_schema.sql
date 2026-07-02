create extension if not exists pgcrypto;

create type verification_status as enum (
  'unverified',
  'pending_input',
  'pending_review',
  'verified_auto',
  'verified_manual',
  'rejected',
  'suspended'
);

create type risk_status as enum (
  'normal',
  'watch',
  'limited',
  'suspended'
);

create type listing_status as enum (
  'draft',
  'active',
  'reserved',
  'paused',
  'completed',
  'cancelled',
  'expired',
  'flagged'
);

create type listing_type as enum (
  'fixed',
  'negotiable'
);

create type negotiable_offer_status as enum (
  'pending',
  'accepted',
  'declined',
  'countered',
  'withdrawn'
);

create type deal_status as enum (
  'reserved',
  'instructions_viewed',
  'maker_sent',
  'taker_sent',
  'partially_confirmed',
  'completed_pending_fee',
  'closed',
  'cancelled',
  'expired',
  'disputed'
);

create type fee_status as enum (
  'pending',
  'user_marked_paid',
  'verified',
  'waived',
  'overdue'
);

create type dispute_status as enum (
  'open',
  'waiting_for_user',
  'under_review',
  'resolved',
  'rejected'
);

create type actor_type as enum (
  'user',
  'admin',
  'system'
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  whatsapp_phone text not null unique,
  display_name text,
  legal_name text,
  nationality text,
  residence_country text,
  city text,
  verification_status verification_status not null default 'unverified',
  verification_score integer not null default 0 check (verification_score >= 0 and verification_score <= 100),
  completed_deals_count integer not null default 0,
  cancelled_deals_24h integer not null default 0,
  total_cancelled_deals integer not null default 0,
  dispute_count integer not null default 0,
  risk_status risk_status not null default 'normal',
  hold_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  status verification_status not null default 'pending_input',
  id_type text,
  id_country text,
  document_front_path text,
  document_back_path text,
  selfie_path text,
  extracted_name text,
  extracted_id_hash text,
  extracted_expiry_date date,
  automated_decision text,
  automated_reason text,
  admin_decision text,
  admin_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table public.payment_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  currency text not null check (currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  method text not null check (method in ('bank', 'momo')),
  account_name text not null,
  bank_name text,
  account_number_encrypted text,
  momo_network text,
  momo_number_encrypted text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_profile_has_bank_or_momo check (
    (method = 'bank' and bank_name is not null and account_number_encrypted is not null)
    or
    (method = 'momo' and momo_network is not null and momo_number_encrypted is not null)
  )
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  listing_code text not null unique,
  have_currency text not null check (have_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  want_currency text not null check (want_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  have_amount numeric(18, 2) not null check (have_amount > 0),
  want_amount numeric(18, 2) not null check (want_amount > 0),
  rate numeric(18, 8) generated always as (want_amount / have_amount) stored,
  listing_type listing_type not null default 'fixed',
  status listing_status not null default 'draft',
  payment_profile_id uuid references public.payment_profiles(id) on delete set null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_currency_direction check (have_currency <> want_currency)
);

create table public.negotiable_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  offering_user_id uuid not null references public.users(id) on delete cascade,
  offered_amount numeric(18, 2) not null check (offered_amount > 0),
  offered_currency text not null check (offered_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  status negotiable_offer_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  deal_code text not null unique,
  listing_id uuid not null references public.listings(id) on delete restrict,
  maker_user_id uuid not null references public.users(id) on delete restrict,
  taker_user_id uuid not null references public.users(id) on delete restrict,
  have_currency text not null check (have_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  want_currency text not null check (want_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  have_amount numeric(18, 2) not null check (have_amount > 0),
  want_amount numeric(18, 2) not null check (want_amount > 0),
  rate numeric(18, 8) generated always as (want_amount / have_amount) stored,
  status deal_status not null default 'reserved',
  reservation_expires_at timestamptz not null,
  maker_sent_at timestamptz,
  taker_sent_at timestamptz,
  maker_received_at timestamptz,
  taker_received_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references public.users(id) on delete set null,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_users_different check (maker_user_id <> taker_user_id),
  constraint deal_currency_direction check (have_currency <> want_currency)
);

create table public.deal_proofs (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  proof_path text not null,
  proof_type text not null default 'transfer_receipt',
  notes text,
  created_at timestamptz not null default now()
);

create table public.fees (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  currency text not null check (currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  amount numeric(18, 2) not null check (amount >= 0),
  status fee_status not null default 'pending',
  payment_reference text,
  proof_path text,
  admin_verified_by uuid references public.users(id) on delete set null,
  admin_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deal_id, user_id)
);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  opened_by_user_id uuid not null references public.users(id) on delete cascade,
  category text not null,
  description text,
  status dispute_status not null default 'open',
  admin_owner uuid references public.users(id) on delete set null,
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  reason text not null,
  severity integer not null default 1 check (severity between 1 and 5),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  admin_notes text,
  created_at timestamptz not null default now()
);

create table public.message_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  whatsapp_phone text not null,
  current_flow text,
  current_step text,
  context_json jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (whatsapp_phone)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.users(id) on delete set null,
  actor_type actor_type not null default 'system',
  entity_type text not null,
  entity_id uuid,
  event_name text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index users_whatsapp_phone_idx on public.users (whatsapp_phone);
create index users_verification_status_idx on public.users (verification_status);
create index users_risk_status_idx on public.users (risk_status);

create index verification_requests_user_id_idx on public.verification_requests (user_id);
create index verification_requests_status_idx on public.verification_requests (status);

create index payment_profiles_user_currency_idx on public.payment_profiles (user_id, currency);

create index listings_search_idx on public.listings (status, have_currency, want_currency, have_amount);
create index listings_owner_idx on public.listings (owner_user_id);
create index listings_created_at_idx on public.listings (created_at desc);

create index negotiable_offers_listing_idx on public.negotiable_offers (listing_id);
create index negotiable_offers_user_idx on public.negotiable_offers (offering_user_id);

create index deals_status_idx on public.deals (status);
create index deals_maker_idx on public.deals (maker_user_id);
create index deals_taker_idx on public.deals (taker_user_id);
create index deals_reservation_expiry_idx on public.deals (reservation_expires_at);

create index deal_proofs_deal_idx on public.deal_proofs (deal_id);
create index fees_status_idx on public.fees (status);
create index disputes_status_idx on public.disputes (status);
create index penalties_user_idx on public.penalties (user_id);
create index message_sessions_phone_idx on public.message_sessions (whatsapp_phone);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger payment_profiles_set_updated_at
before update on public.payment_profiles
for each row execute function public.set_updated_at();

create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

create trigger negotiable_offers_set_updated_at
before update on public.negotiable_offers
for each row execute function public.set_updated_at();

create trigger deals_set_updated_at
before update on public.deals
for each row execute function public.set_updated_at();

create trigger fees_set_updated_at
before update on public.fees
for each row execute function public.set_updated_at();

create trigger message_sessions_set_updated_at
before update on public.message_sessions
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.verification_requests enable row level security;
alter table public.payment_profiles enable row level security;
alter table public.listings enable row level security;
alter table public.negotiable_offers enable row level security;
alter table public.deals enable row level security;
alter table public.deal_proofs enable row level security;
alter table public.fees enable row level security;
alter table public.disputes enable row level security;
alter table public.penalties enable row level security;
alter table public.message_sessions enable row level security;
alter table public.audit_events enable row level security;

insert into storage.buckets (id, name, public)
values
  ('verification-documents', 'verification-documents', false),
  ('deal-proofs', 'deal-proofs', false)
on conflict (id) do nothing;

