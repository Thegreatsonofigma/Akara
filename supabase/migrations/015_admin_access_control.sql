create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  admin_code text not null unique,
  name text not null,
  email text unique,
  role text not null default 'support'
    check (role in ('super_admin', 'operations', 'compliance', 'support', 'analyst', 'custom')),
  status text not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'revoked')),
  permissions text[] not null default '{}',
  access_token_hash text unique,
  invited_by uuid references public.admin_users(id) on delete set null,
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  last_login_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  token_hash text not null unique,
  login_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.admin_access_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique
    default ('AKR-ACCESS-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  name text not null,
  email text not null,
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.admin_users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  event_name text not null,
  entity_type text not null,
  entity_id text,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.users
  add column if not exists admin_banned boolean not null default false,
  add column if not exists admin_ban_reason text,
  add column if not exists swap_restricted_currencies text[] not null default '{}';

create index if not exists admin_users_status_idx
  on public.admin_users(status, role);
create index if not exists admin_sessions_token_idx
  on public.admin_sessions(token_hash)
  where revoked_at is null;
create index if not exists admin_sessions_expiry_idx
  on public.admin_sessions(expires_at)
  where revoked_at is null;
create index if not exists admin_access_requests_status_idx
  on public.admin_access_requests(status, created_at desc);
create index if not exists admin_audit_events_actor_idx
  on public.admin_audit_events(admin_user_id, created_at desc);
create index if not exists admin_audit_events_entity_idx
  on public.admin_audit_events(entity_type, entity_id, created_at desc);
create index if not exists users_admin_banned_idx
  on public.users(admin_banned)
  where admin_banned = true;

drop trigger if exists admin_users_updated_at on public.admin_users;
create trigger admin_users_updated_at
before update on public.admin_users
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_access_requests enable row level security;
alter table public.admin_audit_events enable row level security;
