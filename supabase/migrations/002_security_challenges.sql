alter table public.users
add column if not exists security_passcode_hash text,
add column if not exists security_passcode_set_at timestamptz;

create table if not exists public.security_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  challenge_token_hash text not null unique,
  purpose text not null,
  action_label text not null,
  return_flow text,
  return_step text,
  return_context jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'failed', 'expired', 'cancelled')),
  attempt_count integer not null default 0,
  expires_at timestamptz not null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists security_challenges_user_status_idx
on public.security_challenges (user_id, status, expires_at desc);

create index if not exists security_challenges_token_hash_idx
on public.security_challenges (challenge_token_hash);

drop trigger if exists security_challenges_set_updated_at on public.security_challenges;
create trigger security_challenges_set_updated_at
before update on public.security_challenges
for each row execute function public.set_updated_at();

alter table public.security_challenges enable row level security;
