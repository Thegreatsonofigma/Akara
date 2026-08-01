create table if not exists public.conversation_turns (
  id uuid primary key default gen_random_uuid(),
  whatsapp_phone text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 1000),
  intent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists conversation_turns_phone_created_idx
  on public.conversation_turns (whatsapp_phone, created_at desc);
create index if not exists conversation_turns_expires_idx
  on public.conversation_turns (expires_at);

alter table public.conversation_turns enable row level security;
revoke all on table public.conversation_turns from anon, authenticated;
grant all on table public.conversation_turns to service_role;

create or replace function public.purge_expired_conversation_turns()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  deleted_count integer;
begin
  delete from public.conversation_turns where expires_at <= now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.purge_expired_conversation_turns() from public, anon, authenticated;
grant execute on function public.purge_expired_conversation_turns() to service_role;
