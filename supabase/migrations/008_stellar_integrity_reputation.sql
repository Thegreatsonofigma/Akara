create table if not exists public.stellar_anchor_batches (
  id uuid primary key default gen_random_uuid(),
  network text not null check (network in ('testnet', 'public')),
  merkle_root text not null check (merkle_root ~ '^[0-9a-f]{64}$'),
  leaf_count integer not null check (leaf_count > 0 and leaf_count <= 256),
  status text not null default 'pending'
    check (status in ('pending', 'submitting', 'confirmed', 'failed')),
  source_account text,
  transaction_hash text,
  transaction_xdr text,
  ledger_sequence bigint,
  explorer_url text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  last_error text,
  lease_token uuid,
  lease_expires_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, merkle_root)
);

create table if not exists public.integrity_records (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  record_type text not null
    check (record_type in ('trade_completion', 'dispute_outcome', 'reputation_snapshot')),
  entity_type text not null check (entity_type in ('deal', 'dispute', 'user')),
  entity_id uuid not null,
  subject_ref text not null check (subject_ref ~ '^[0-9a-f]{64}$'),
  payload_version integer not null default 1 check (payload_version > 0),
  payload_snapshot jsonb not null,
  salt text not null check (salt ~ '^[0-9a-f]{64}$'),
  commitment_hash text not null unique check (commitment_hash ~ '^[0-9a-f]{64}$'),
  previous_commitment_hash text
    check (previous_commitment_hash is null or previous_commitment_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'batched', 'anchored', 'failed')),
  batch_id uuid references public.stellar_anchor_batches(id) on delete restrict,
  leaf_index integer check (leaf_index is null or leaf_index >= 0),
  merkle_proof jsonb not null default '[]'::jsonb,
  anchored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stellar_anchor_batches
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz;

create table if not exists public.user_reputation_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  user_id uuid not null references public.users(id) on delete restrict,
  trigger_type text not null check (trigger_type in ('deal', 'dispute')),
  trigger_entity_id uuid not null,
  completed_trades integer not null default 0 check (completed_trades >= 0),
  cancelled_trades integer not null default 0 check (cancelled_trades >= 0),
  expired_trades integer not null default 0 check (expired_trades >= 0),
  completion_rate numeric(5, 2) not null default 0
    check (completion_rate >= 0 and completion_rate <= 100),
  disputes_total integer not null default 0 check (disputes_total >= 0),
  open_disputes integer not null default 0 check (open_disputes >= 0),
  resolved_disputes integer not null default 0 check (resolved_disputes >= 0),
  reputation_band text not null
    check (reputation_band in ('new', 'active', 'established', 'strong', 'review')),
  previous_commitment_hash text
    check (previous_commitment_hash is null or previous_commitment_hash ~ '^[0-9a-f]{64}$'),
  commitment_hash text not null check (commitment_hash ~ '^[0-9a-f]{64}$'),
  integrity_record_id uuid not null unique
    references public.integrity_records(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.deal_proofs
  add column if not exists content_sha256 text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deal_proofs_content_sha256_check'
  ) then
    alter table public.deal_proofs
      add constraint deal_proofs_content_sha256_check
      check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');
  end if;
end $$;

create index if not exists stellar_anchor_batches_status_idx
  on public.stellar_anchor_batches(status, next_retry_at, created_at);
create index if not exists integrity_records_status_idx
  on public.integrity_records(status, created_at);
create index if not exists integrity_records_entity_idx
  on public.integrity_records(entity_type, entity_id, created_at desc);
create index if not exists integrity_records_batch_idx
  on public.integrity_records(batch_id, leaf_index);
create index if not exists reputation_snapshots_user_idx
  on public.user_reputation_snapshots(user_id, created_at desc);

drop trigger if exists stellar_anchor_batches_updated_at on public.stellar_anchor_batches;
create trigger stellar_anchor_batches_updated_at
before update on public.stellar_anchor_batches
for each row execute function public.set_updated_at();

drop trigger if exists integrity_records_updated_at on public.integrity_records;
create trigger integrity_records_updated_at
before update on public.integrity_records
for each row execute function public.set_updated_at();

create or replace function public.protect_anchored_integrity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status = 'anchored' then
    raise exception 'Anchored integrity records cannot be deleted';
  end if;

  if tg_op = 'UPDATE' and old.status = 'anchored' and (
    new.event_key is distinct from old.event_key
    or new.record_type is distinct from old.record_type
    or new.entity_type is distinct from old.entity_type
    or new.entity_id is distinct from old.entity_id
    or new.subject_ref is distinct from old.subject_ref
    or new.payload_version is distinct from old.payload_version
    or new.payload_snapshot is distinct from old.payload_snapshot
    or new.salt is distinct from old.salt
    or new.commitment_hash is distinct from old.commitment_hash
    or new.previous_commitment_hash is distinct from old.previous_commitment_hash
    or new.batch_id is distinct from old.batch_id
    or new.leaf_index is distinct from old.leaf_index
    or new.merkle_proof is distinct from old.merkle_proof
    or new.anchored_at is distinct from old.anchored_at
  ) then
    raise exception 'Anchored integrity record contents cannot be changed';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_anchored_integrity_records on public.integrity_records;
create trigger protect_anchored_integrity_records
before update or delete on public.integrity_records
for each row execute function public.protect_anchored_integrity();

create or replace function public.protect_confirmed_stellar_batch()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status = 'confirmed' then
    raise exception 'Confirmed Stellar anchor batches cannot be deleted';
  end if;

  if tg_op = 'UPDATE' and old.status = 'confirmed' and (
    new.network is distinct from old.network
    or new.merkle_root is distinct from old.merkle_root
    or new.leaf_count is distinct from old.leaf_count
    or new.source_account is distinct from old.source_account
    or new.transaction_hash is distinct from old.transaction_hash
    or new.transaction_xdr is distinct from old.transaction_xdr
    or new.ledger_sequence is distinct from old.ledger_sequence
    or new.confirmed_at is distinct from old.confirmed_at
  ) then
    raise exception 'Confirmed Stellar anchor batch contents cannot be changed';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_confirmed_stellar_batches on public.stellar_anchor_batches;
create trigger protect_confirmed_stellar_batches
before update or delete on public.stellar_anchor_batches
for each row execute function public.protect_confirmed_stellar_batch();

create or replace function public.protect_reputation_snapshot()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Reputation snapshots are append-only';
  return old;
end;
$$;

drop trigger if exists protect_reputation_snapshots on public.user_reputation_snapshots;
create trigger protect_reputation_snapshots
before update or delete on public.user_reputation_snapshots
for each row execute function public.protect_reputation_snapshot();

alter table public.stellar_anchor_batches enable row level security;
alter table public.integrity_records enable row level security;
alter table public.user_reputation_snapshots enable row level security;

insert into public.retention_rules (
  data_category,
  retention_period,
  retention_basis,
  default_action,
  legal_hold_allowed
)
values (
  'stellar_integrity_commitments',
  'Public commitment and transaction hash are permanent; private snapshots follow the source trade retention period',
  'Platform integrity, fraud prevention, accountability, and dispute evidence',
  'retain',
  true
)
on conflict (data_category) do update set
  retention_period = excluded.retention_period,
  retention_basis = excluded.retention_basis,
  default_action = excluded.default_action,
  legal_hold_allowed = excluded.legal_hold_allowed,
  updated_at = now();
