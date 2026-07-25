-- Adds every OCR field the admin dashboard and backend need for review.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.verification_requests
  add column if not exists document_ocr_engine text,
  add column if not exists document_ocr_status text,
  add column if not exists document_ocr_confidence numeric,
  add column if not exists document_ocr_text text,
  add column if not exists document_ocr_name text,
  add column if not exists document_ocr_country text,
  add column if not exists document_ocr_type text,
  add column if not exists document_ocr_raw jsonb not null default '{}'::jsonb,
  add column if not exists document_ocr_checked_at timestamptz,
  add column if not exists document_name_match boolean,
  add column if not exists document_country_match boolean,
  add column if not exists document_type_match boolean,
  add column if not exists document_ocr_reasons text[] not null default '{}';

alter table public.deal_proofs
  add column if not exists ocr_engine text,
  add column if not exists ocr_status text not null default 'pending',
  add column if not exists ocr_confidence numeric,
  add column if not exists ocr_text text,
  add column if not exists ocr_amount numeric(18, 2),
  add column if not exists ocr_amounts jsonb not null default '[]'::jsonb,
  add column if not exists ocr_currency text,
  add column if not exists ocr_expected_amount numeric(18, 2),
  add column if not exists ocr_expected_currency text,
  add column if not exists ocr_reference text,
  add column if not exists ocr_checked_at timestamptz,
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

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'verification_requests_document_ocr_status_check'
  ) then
    alter table public.verification_requests
      add constraint verification_requests_document_ocr_status_check
      check (
        document_ocr_status is null
        or document_ocr_status in ('pending_review', 'matched', 'mismatch', 'unavailable')
      );
  end if;
end $$;

create index if not exists verification_requests_document_ocr_status_idx
  on public.verification_requests (document_ocr_status);

create index if not exists verification_requests_document_name_match_idx
  on public.verification_requests (document_name_match);

create index if not exists verification_requests_document_country_match_idx
  on public.verification_requests (document_country_match);

create index if not exists deal_proofs_ocr_status_idx
  on public.deal_proofs (ocr_status);

create index if not exists deal_proofs_ocr_matched_idx
  on public.deal_proofs (ocr_matched);
