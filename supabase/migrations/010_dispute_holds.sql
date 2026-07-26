alter table public.users
  add column if not exists dispute_hold boolean not null default false;

alter table public.listings
  add column if not exists dispute_paused boolean not null default false;

create index if not exists users_dispute_hold_idx
  on public.users (dispute_hold)
  where dispute_hold = true;

create index if not exists listings_dispute_paused_idx
  on public.listings (owner_user_id, dispute_paused)
  where dispute_paused = true;
