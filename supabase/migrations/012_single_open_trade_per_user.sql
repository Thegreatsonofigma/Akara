create or replace function public.enforce_single_open_trade_per_user()
returns trigger
language plpgsql
as $$
declare
  first_user uuid;
  second_user uuid;
begin
  if new.status not in (
    'reserved',
    'instructions_viewed',
    'maker_sent',
    'taker_sent',
    'partially_confirmed',
    'disputed'
  ) then
    return new;
  end if;

  first_user := least(new.maker_user_id, new.taker_user_id);
  second_user := greatest(new.maker_user_id, new.taker_user_id);

  perform pg_advisory_xact_lock(hashtextextended(first_user::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(second_user::text, 0));

  if exists (
    select 1
    from public.deals existing
    where existing.id <> new.id
      and existing.status in (
        'reserved',
        'instructions_viewed',
        'maker_sent',
        'taker_sent',
        'partially_confirmed',
        'disputed'
      )
      and (
        existing.maker_user_id in (new.maker_user_id, new.taker_user_id)
        or existing.taker_user_id in (new.maker_user_id, new.taker_user_id)
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'AKARA_ACTIVE_TRADE_EXISTS';
  end if;

  return new;
end;
$$;

drop trigger if exists deals_single_open_trade_per_user on public.deals;
create trigger deals_single_open_trade_per_user
before insert or update of status, maker_user_id, taker_user_id
on public.deals
for each row
execute function public.enforce_single_open_trade_per_user();

create index if not exists deals_blocking_maker_idx
  on public.deals(maker_user_id, created_at desc)
  where status in (
    'reserved',
    'instructions_viewed',
    'maker_sent',
    'taker_sent',
    'partially_confirmed',
    'disputed'
  );

create index if not exists deals_blocking_taker_idx
  on public.deals(taker_user_id, created_at desc)
  where status in (
    'reserved',
    'instructions_viewed',
    'maker_sent',
    'taker_sent',
    'partially_confirmed',
    'disputed'
  );
