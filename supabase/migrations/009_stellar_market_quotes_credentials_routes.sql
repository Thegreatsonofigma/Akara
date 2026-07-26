-- Stellar-backed market intelligence and trust primitives.
-- No user PII or exchange funds are written to Stellar. Only salted,
-- privacy-safe commitments are queued in integrity_records.

alter table public.integrity_records
  drop constraint if exists integrity_records_record_type_check;
alter table public.integrity_records
  add constraint integrity_records_record_type_check
  check (
    record_type in (
      'trade_completion',
      'dispute_outcome',
      'reputation_snapshot',
      'market_rate_snapshot',
      'locked_quote',
      'reputation_credential',
      'liquidity_route'
    )
  );

alter table public.integrity_records
  drop constraint if exists integrity_records_entity_type_check;
alter table public.integrity_records
  add constraint integrity_records_entity_type_check
  check (
    entity_type in (
      'deal',
      'dispute',
      'user',
      'market_rate',
      'quote',
      'credential',
      'route'
    )
  );

create table if not exists public.market_rate_snapshots (
  id uuid primary key default gen_random_uuid(),
  corridor_key text not null,
  send_currency text not null check (send_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  receive_currency text not null check (receive_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  median_rate numeric(24, 10) not null check (median_rate > 0),
  weighted_rate numeric(24, 10) not null check (weighted_rate > 0),
  low_rate numeric(24, 10) not null check (low_rate > 0),
  high_rate numeric(24, 10) not null check (high_rate > 0),
  best_rate numeric(24, 10) not null check (best_rate > 0),
  active_listing_count integer not null default 0 check (active_listing_count >= 0),
  completed_trade_count integer not null default 0 check (completed_trade_count >= 0),
  total_visible_liquidity numeric(24, 2) not null default 0 check (total_visible_liquidity >= 0),
  source_window_start timestamptz not null,
  source_window_end timestamptz not null,
  expires_at timestamptz not null,
  commitment_hash text check (commitment_hash is null or commitment_hash ~ '^[0-9a-f]{64}$'),
  integrity_record_id uuid unique references public.integrity_records(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint market_rate_currency_direction check (send_currency <> receive_currency)
);

create table if not exists public.locked_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_code text not null unique,
  listing_id uuid not null references public.listings(id) on delete restrict,
  negotiable_offer_id uuid references public.negotiable_offers(id) on delete set null,
  maker_user_id uuid not null references public.users(id) on delete restrict,
  taker_user_id uuid not null references public.users(id) on delete restrict,
  send_currency text not null check (send_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  receive_currency text not null check (receive_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  send_amount numeric(18, 2) not null check (send_amount > 0),
  receive_amount numeric(18, 2) not null check (receive_amount > 0),
  rate numeric(24, 10) not null check (rate > 0),
  quote_type text not null check (quote_type in ('posted', 'negotiated', 'auto_match', 'routed')),
  status text not null default 'locked'
    check (status in ('locked', 'converted_to_deal', 'expired', 'cancelled')),
  terms_commitment_hash text not null check (terms_commitment_hash ~ '^[0-9a-f]{64}$'),
  integrity_record_id uuid unique references public.integrity_records(id) on delete restrict,
  deal_id uuid unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locked_quote_users_different check (maker_user_id <> taker_user_id),
  constraint locked_quote_currency_direction check (send_currency <> receive_currency)
);

create table if not exists public.reputation_credentials (
  id uuid primary key default gen_random_uuid(),
  credential_code text not null unique,
  user_id uuid not null references public.users(id) on delete restrict,
  reputation_snapshot_id uuid references public.user_reputation_snapshots(id) on delete restrict,
  subject_ref text not null check (subject_ref ~ '^[0-9a-f]{64}$'),
  reputation_band text not null
    check (reputation_band in ('new', 'active', 'established', 'strong', 'review')),
  claims jsonb not null,
  commitment_hash text check (commitment_hash is null or commitment_hash ~ '^[0-9a-f]{64}$'),
  integrity_record_id uuid unique references public.integrity_records(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.liquidity_route_plans (
  id uuid primary key default gen_random_uuid(),
  route_code text not null unique,
  requester_user_id uuid not null references public.users(id) on delete restrict,
  send_currency text not null check (send_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  receive_currency text not null check (receive_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  requested_send_amount numeric(18, 2) check (requested_send_amount is null or requested_send_amount > 0),
  requested_receive_amount numeric(18, 2) check (requested_receive_amount is null or requested_receive_amount > 0),
  planned_send_amount numeric(18, 2) not null check (planned_send_amount > 0),
  planned_receive_amount numeric(18, 2) not null check (planned_receive_amount > 0),
  coverage_percent numeric(5, 2) not null check (coverage_percent > 0 and coverage_percent <= 100),
  leg_count integer not null check (leg_count >= 2 and leg_count <= 4),
  status text not null default 'proposed'
    check (status in ('proposed', 'partially_opened', 'opened', 'completed', 'expired', 'cancelled')),
  commitment_hash text check (commitment_hash is null or commitment_hash ~ '^[0-9a-f]{64}$'),
  integrity_record_id uuid unique references public.integrity_records(id) on delete restrict,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint liquidity_route_currency_direction check (send_currency <> receive_currency)
);

create table if not exists public.liquidity_route_legs (
  id uuid primary key default gen_random_uuid(),
  route_plan_id uuid not null references public.liquidity_route_plans(id) on delete cascade,
  leg_index integer not null check (leg_index >= 1 and leg_index <= 4),
  listing_id uuid not null references public.listings(id) on delete restrict,
  send_amount numeric(18, 2) not null check (send_amount > 0),
  receive_amount numeric(18, 2) not null check (receive_amount > 0),
  rate numeric(24, 10) not null check (rate > 0),
  deal_id uuid,
  status text not null default 'available'
    check (status in ('available', 'opened', 'unavailable', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (route_plan_id, leg_index),
  unique (route_plan_id, listing_id)
);

alter table public.deals
  add column if not exists locked_quote_id uuid unique references public.locked_quotes(id) on delete restrict,
  add column if not exists route_plan_id uuid references public.liquidity_route_plans(id) on delete set null,
  add column if not exists route_leg_index integer check (route_leg_index is null or route_leg_index >= 1);

alter table public.locked_quotes
  drop constraint if exists locked_quotes_deal_id_fkey;
alter table public.locked_quotes
  add constraint locked_quotes_deal_id_fkey
  foreign key (deal_id) references public.deals(id) on delete restrict;

alter table public.liquidity_route_legs
  drop constraint if exists liquidity_route_legs_deal_id_fkey;
alter table public.liquidity_route_legs
  add constraint liquidity_route_legs_deal_id_fkey
  foreign key (deal_id) references public.deals(id) on delete set null;

create index if not exists market_rate_corridor_idx
  on public.market_rate_snapshots(send_currency, receive_currency, created_at desc);
create index if not exists locked_quotes_users_idx
  on public.locked_quotes(maker_user_id, taker_user_id, created_at desc);
create index if not exists reputation_credentials_user_idx
  on public.reputation_credentials(user_id, created_at desc);
create index if not exists liquidity_route_requester_idx
  on public.liquidity_route_plans(requester_user_id, created_at desc);

drop trigger if exists locked_quotes_updated_at on public.locked_quotes;
create trigger locked_quotes_updated_at
before update on public.locked_quotes
for each row execute function public.set_updated_at();

drop trigger if exists liquidity_route_plans_updated_at on public.liquidity_route_plans;
create trigger liquidity_route_plans_updated_at
before update on public.liquidity_route_plans
for each row execute function public.set_updated_at();

create or replace function public.protect_locked_quote_terms()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Locked quotes cannot be deleted';
  end if;
  if (
    new.quote_code is distinct from old.quote_code
    or new.listing_id is distinct from old.listing_id
    or new.negotiable_offer_id is distinct from old.negotiable_offer_id
    or new.maker_user_id is distinct from old.maker_user_id
    or new.taker_user_id is distinct from old.taker_user_id
    or new.send_currency is distinct from old.send_currency
    or new.receive_currency is distinct from old.receive_currency
    or new.send_amount is distinct from old.send_amount
    or new.receive_amount is distinct from old.receive_amount
    or new.rate is distinct from old.rate
    or new.quote_type is distinct from old.quote_type
    or new.terms_commitment_hash is distinct from old.terms_commitment_hash
    or (
      new.integrity_record_id is distinct from old.integrity_record_id
      and not (old.integrity_record_id is null and new.integrity_record_id is not null)
    )
    or new.expires_at is distinct from old.expires_at
  ) then
    raise exception 'Locked quote terms cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_locked_quote_terms_trigger on public.locked_quotes;
create trigger protect_locked_quote_terms_trigger
before update or delete on public.locked_quotes
for each row execute function public.protect_locked_quote_terms();

create or replace function public.protect_market_rate_snapshot()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Market rate snapshots are append-only';
  end if;
  if not (
    old.commitment_hash is null
    and old.integrity_record_id is null
    and new.commitment_hash is not null
    and new.integrity_record_id is not null
    and to_jsonb(new) - 'commitment_hash' - 'integrity_record_id'
      = to_jsonb(old) - 'commitment_hash' - 'integrity_record_id'
  ) then
    raise exception 'Market rate snapshots are append-only';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_market_rate_snapshots on public.market_rate_snapshots;
create trigger protect_market_rate_snapshots
before update or delete on public.market_rate_snapshots
for each row execute function public.protect_market_rate_snapshot();

create or replace function public.protect_reputation_credential()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Reputation credentials cannot be deleted';
  end if;
  if (
    to_jsonb(new) - 'commitment_hash' - 'integrity_record_id' - 'status' - 'revoked_at'
      <> to_jsonb(old) - 'commitment_hash' - 'integrity_record_id' - 'status' - 'revoked_at'
    or (
      old.commitment_hash is not null
      and new.commitment_hash is distinct from old.commitment_hash
    )
    or (
      old.integrity_record_id is not null
      and new.integrity_record_id is distinct from old.integrity_record_id
    )
  ) then
    raise exception 'Reputation credential claims cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_reputation_credentials on public.reputation_credentials;
create trigger protect_reputation_credentials
before update or delete on public.reputation_credentials
for each row execute function public.protect_reputation_credential();

create or replace function public.protect_liquidity_route_terms()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Liquidity route plans cannot be deleted';
  end if;
  if (
    to_jsonb(new) - 'status' - 'commitment_hash' - 'integrity_record_id' - 'updated_at'
      <> to_jsonb(old) - 'status' - 'commitment_hash' - 'integrity_record_id' - 'updated_at'
    or (
      old.commitment_hash is not null
      and new.commitment_hash is distinct from old.commitment_hash
    )
    or (
      old.integrity_record_id is not null
      and new.integrity_record_id is distinct from old.integrity_record_id
    )
  ) then
    raise exception 'Liquidity route terms cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_liquidity_route_terms_trigger on public.liquidity_route_plans;
create trigger protect_liquidity_route_terms_trigger
before update or delete on public.liquidity_route_plans
for each row execute function public.protect_liquidity_route_terms();

alter table public.market_rate_snapshots enable row level security;
alter table public.locked_quotes enable row level security;
alter table public.reputation_credentials enable row level security;
alter table public.liquidity_route_plans enable row level security;
alter table public.liquidity_route_legs enable row level security;
