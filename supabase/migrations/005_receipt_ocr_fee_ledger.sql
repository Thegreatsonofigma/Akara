alter table public.deal_proofs
  add column if not exists ocr_status text not null default 'pending',
  add column if not exists ocr_text text,
  add column if not exists ocr_amount numeric(18, 2),
  add column if not exists ocr_currency text,
  add column if not exists ocr_expected_amount numeric(18, 2),
  add column if not exists ocr_expected_currency text,
  add column if not exists ocr_matched boolean not null default false,
  add column if not exists ocr_mismatch_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'deal_proofs_ocr_status_check'
  ) then
    alter table public.deal_proofs
      add constraint deal_proofs_ocr_status_check
      check (ocr_status in ('pending', 'matched', 'mismatch', 'unavailable'));
  end if;
end $$;

alter table public.fees
  add column if not exists fee_type text not null default 'success_fee',
  add column if not exists billing_threshold integer not null default 5;

create index if not exists deal_proofs_ocr_status_idx on public.deal_proofs (ocr_status);
create index if not exists fees_user_status_idx on public.fees (user_id, status);
