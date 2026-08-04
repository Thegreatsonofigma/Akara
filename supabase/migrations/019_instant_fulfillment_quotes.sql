begin;

create table if not exists public.instant_fulfillment_quotes (
  id uuid primary key default gen_random_uuid(),
  quote_code text not null unique,
  listing_id uuid not null references public.listings(id) on delete restrict,
  requester_user_id uuid not null references public.users(id) on delete restrict,
  provider_code text not null check (provider_code ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  provider_name text not null,
  provider_quote_id text not null,
  send_currency text not null check (send_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  send_amount numeric(18, 2) not null check (send_amount > 0),
  receive_currency text not null check (receive_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  receive_amount numeric(18, 2) not null check (receive_amount > 0),
  rate numeric(24, 10) not null check (rate > 0),
  partner_fee_amount numeric(18, 2) not null default 0 check (partner_fee_amount >= 0),
  partner_fee_currency text not null check (partner_fee_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES')),
  akara_fee_amount numeric(18, 2) not null default 0 check (akara_fee_amount = 0),
  settlement_eta_seconds integer not null default 0 check (settlement_eta_seconds >= 0),
  checkout_url text,
  status text not null default 'available'
    check (status in ('available', 'selected', 'completed', 'expired', 'cancelled', 'failed')),
  selected_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_code, provider_quote_id),
  constraint instant_quote_currency_direction check (send_currency <> receive_currency),
  constraint instant_quote_checkout_https check (checkout_url is null or checkout_url ~ '^https://')
);

create index if not exists instant_quotes_listing_status_idx
  on public.instant_fulfillment_quotes(listing_id, status, expires_at);
create index if not exists instant_quotes_user_created_idx
  on public.instant_fulfillment_quotes(requester_user_id, created_at desc);

drop trigger if exists instant_fulfillment_quotes_updated_at on public.instant_fulfillment_quotes;
create trigger instant_fulfillment_quotes_updated_at
before update on public.instant_fulfillment_quotes
for each row execute function public.set_updated_at();

create or replace function public.protect_instant_fulfillment_quote()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Instant fulfilment quotes cannot be deleted';
  end if;
  if (
    to_jsonb(new) - 'status' - 'selected_at' - 'updated_at'
      <> to_jsonb(old) - 'status' - 'selected_at' - 'updated_at'
  ) then
    raise exception 'Instant fulfilment quote terms cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_instant_fulfillment_quote_terms on public.instant_fulfillment_quotes;
create trigger protect_instant_fulfillment_quote_terms
before update or delete on public.instant_fulfillment_quotes
for each row execute function public.protect_instant_fulfillment_quote();

alter table public.instant_fulfillment_quotes enable row level security;
revoke all on table public.instant_fulfillment_quotes from public, anon, authenticated;

comment on table public.instant_fulfillment_quotes is
  'Firm quotes returned by licensed liquidity partners. Akara fees are permanently constrained to zero.';

commit;
