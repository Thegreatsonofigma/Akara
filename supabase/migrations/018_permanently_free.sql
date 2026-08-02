begin;

update public.deals
set status = 'closed'
where status = 'completed_pending_fee';

update public.fees
set status = 'waived',
    amount = 0,
    updated_at = now()
where status <> 'waived' or amount <> 0;

alter table public.fees enable row level security;
revoke all on table public.fees from public, anon, authenticated;

create or replace function public.block_akara_fee_writes()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  raise exception 'Akara is permanently free. Fee ledger writes are disabled.';
end;
$$;

revoke all on function public.block_akara_fee_writes()
from public, anon, authenticated;

grant execute on function public.block_akara_fee_writes()
to service_role;

drop trigger if exists fees_block_writes on public.fees;
create trigger fees_block_writes
before insert or update on public.fees
for each row execute function public.block_akara_fee_writes();

comment on table public.fees is
  'Legacy fee records retained for audit only. Akara is permanently free and new fee writes are blocked.';

commit;
