alter table public.verification_requests
  add column if not exists document_ocr_engine text,
  add column if not exists document_ocr_status text,
  add column if not exists document_ocr_confidence numeric,
  add column if not exists document_ocr_text text,
  add column if not exists document_ocr_name text,
  add column if not exists document_ocr_country text,
  add column if not exists document_ocr_type text,
  add column if not exists document_name_match boolean,
  add column if not exists document_country_match boolean,
  add column if not exists document_type_match boolean,
  add column if not exists document_ocr_reasons text[] not null default '{}';
