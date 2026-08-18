begin;

create table if not exists public.partner_fulfillments (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z0-9_]{2,32}$'),
  status text not null check (status in (
    'created',
    'collection_pending',
    'collection_verification_required',
    'collection_confirmed',
    'payout_ready',
    'payout_processing',
    'payout_verification_required',
    'completed',
    'collection_failed',
    'payout_failed',
    'manual_review'
  )),
  user_id uuid not null references public.users(id) on delete restrict,
  payment_profile_id uuid not null references public.payment_profiles(id) on delete restrict,
  source_currency text not null check (source_currency ~ '^[A-Z0-9]{3,5}$'),
  source_amount numeric(24, 8) not null check (source_amount > 0),
  destination_currency text not null check (destination_currency ~ '^[A-Z0-9]{3,5}$'),
  destination_amount numeric(24, 8) not null check (destination_amount > 0),
  collection_reference text not null unique,
  collection_provider_reference text,
  collection_status text,
  collection_verified_at timestamptz,
  payout_customer_reference text not null unique,
  payout_provider_reference text unique,
  payout_status text,
  payout_verified_at timestamptz,
  last_event text not null,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_fulfillment_currency_direction
    check (source_currency <> destination_currency),
  constraint partner_fulfillment_payout_requires_verified_collection
    check (status not in (
      'collection_confirmed',
      'payout_ready',
      'payout_processing',
      'payout_verification_required',
      'payout_failed',
      'completed'
    ) or (
      collection_verified_at is not null
      and collection_status in ('success', 'successful')
    )),
  constraint partner_fulfillment_processing_requires_payout_reference
    check (status not in (
      'payout_processing',
      'payout_verification_required',
      'payout_failed',
      'completed'
    ) or payout_provider_reference is not null),
  constraint partner_fulfillment_completed_only_after_verification
    check (status <> 'completed' or (
      collection_verified_at is not null
      and payout_verified_at is not null
      and payout_status in ('success', 'successful')
    ))
);

create index if not exists partner_fulfillments_user_created_idx
  on public.partner_fulfillments (user_id, created_at desc);

create index if not exists partner_fulfillments_status_updated_idx
  on public.partner_fulfillments (status, updated_at);

drop trigger if exists partner_fulfillments_set_updated_at
  on public.partner_fulfillments;
create trigger partner_fulfillments_set_updated_at
before update on public.partner_fulfillments
for each row execute function public.set_updated_at();

alter table public.partner_fulfillments enable row level security;
revoke all on table public.partner_fulfillments from public, anon, authenticated;
grant all on table public.partner_fulfillments to service_role;

comment on table public.partner_fulfillments is
  'Backend-only collect-first partner transactions. No payout-ready or completed state may be inferred from a webhook alone.';

commit;
