-- Akara verification OCR/admin fields
-- Run this once in Supabase SQL Editor to unblock the admin verification queue.

alter table public.verification_requests
  add column if not exists document_ocr_engine text,
  add column if not exists document_ocr_status text not null default 'not_run',
  add column if not exists document_ocr_confidence numeric,
  add column if not exists document_ocr_legal_name text,
  add column if not exists document_ocr_document_type text,
  add column if not exists document_ocr_country text,
  add column if not exists document_ocr_text text,
  add column if not exists document_ocr_error text,
  add column if not exists document_name_match_status text,
  add column if not exists document_name_match_score numeric,
  add column if not exists payout_name_match_status text,
  add column if not exists payout_name_match_score numeric,
  add column if not exists face_match_status text,
  add column if not exists face_match_score numeric,
  add column if not exists selfie_match_status text,
  add column if not exists selfie_match_score numeric,
  add column if not exists verification_review_reason text,
  add column if not exists verification_review_priority text not null default 'normal',
  add column if not exists verification_risk_flags jsonb not null default '[]'::jsonb;

create index if not exists verification_requests_document_ocr_status_idx
  on public.verification_requests (document_ocr_status);

create index if not exists verification_requests_review_priority_idx
  on public.verification_requests (verification_review_priority);

comment on column public.verification_requests.document_ocr_engine is
  'OCR engine used for ID document extraction, for example tesseract.';

comment on column public.verification_requests.document_ocr_text is
  'OCR text extracted from submitted identity documents for KYC review. Retain under Akara data retention policy.';

comment on column public.verification_requests.document_name_match_status is
  'Result of comparing OCR legal name with user-submitted legal name.';

comment on column public.verification_requests.payout_name_match_status is
  'Result of comparing payout account name with verified legal name.';

comment on column public.verification_requests.face_match_status is
  'Result of comparing selfie with the face on the submitted identity document.';
