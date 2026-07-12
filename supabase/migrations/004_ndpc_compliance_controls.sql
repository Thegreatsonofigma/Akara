do $$ begin
  create type public.data_subject_request_type as enum (
    'access',
    'correction',
    'deletion',
    'restriction',
    'objection',
    'portability',
    'withdrawal',
    'complaint'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.data_subject_request_status as enum (
    'received',
    'identity_check',
    'in_progress',
    'waiting_for_user',
    'completed',
    'rejected',
    'blocked'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.breach_severity as enum ('low', 'medium', 'high', 'critical');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.breach_status as enum (
    'suspected',
    'contained',
    'investigating',
    'notifiable',
    'notified',
    'closed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.processor_contract_status as enum (
    'pending_review',
    'approved',
    'restricted',
    'rejected',
    'terminated'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.compliance_task_status as enum (
    'open',
    'in_progress',
    'waiting_external',
    'complete',
    'blocked'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.privacy_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  whatsapp_phone text,
  notice_version text not null default '2026-07',
  purpose text not null,
  lawful_basis text not null,
  source text not null default 'whatsapp',
  consent_text text,
  metadata jsonb not null default '{}'::jsonb,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text unique not null default ('AKR-DSR-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  user_id uuid references public.users(id) on delete set null,
  whatsapp_phone text,
  request_type public.data_subject_request_type not null,
  status public.data_subject_request_status not null default 'received',
  channel text not null default 'whatsapp',
  description text,
  identity_checked_at timestamptz,
  due_at timestamptz not null default (now() + interval '30 days'),
  legal_hold_reason text,
  admin_owner text,
  response_summary text,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.data_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.data_subject_requests(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  status text not null default 'scheduled',
  scope text not null default 'account',
  blocked_reason text,
  scheduled_for timestamptz,
  completed_at timestamptz,
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.data_breach_incidents (
  id uuid primary key default gen_random_uuid(),
  incident_code text unique not null default ('AKR-BR-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  severity public.breach_severity not null default 'low',
  status public.breach_status not null default 'suspected',
  summary text not null,
  affected_data_categories text[] not null default '{}',
  affected_subject_count integer not null default 0,
  discovered_at timestamptz not null default now(),
  contained_at timestamptz,
  notifiable_decision text,
  regulator_notified_at timestamptz,
  users_notified_at timestamptz,
  root_cause text,
  remediation text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.processor_contracts (
  id uuid primary key default gen_random_uuid(),
  processor_name text unique not null,
  service_category text not null,
  data_categories text[] not null default '{}',
  country text,
  transfer_mechanism text,
  dpa_status public.processor_contract_status not null default 'pending_review',
  risk_level text not null default 'medium',
  contract_url text,
  review_due_at timestamptz,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.retention_rules (
  id uuid primary key default gen_random_uuid(),
  data_category text unique not null,
  retention_period text not null,
  retention_basis text not null,
  default_action text not null default 'retain',
  legal_hold_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.compliance_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null,
  title text not null,
  status public.compliance_task_status not null default 'open',
  priority text not null default 'medium',
  owner text,
  due_at timestamptz,
  linked_entity_type text,
  linked_entity_id uuid,
  evidence_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists privacy_consents_user_idx on public.privacy_consents(user_id);
create index if not exists privacy_consents_phone_idx on public.privacy_consents(whatsapp_phone);
create index if not exists dsr_user_idx on public.data_subject_requests(user_id);
create index if not exists dsr_status_due_idx on public.data_subject_requests(status, due_at);
create index if not exists breach_status_idx on public.data_breach_incidents(status, severity);
create index if not exists processor_status_idx on public.processor_contracts(dpa_status, review_due_at);
create index if not exists compliance_tasks_status_idx on public.compliance_tasks(status, due_at);

drop trigger if exists data_subject_requests_updated_at on public.data_subject_requests;
create trigger data_subject_requests_updated_at
before update on public.data_subject_requests
for each row execute function public.set_updated_at();

drop trigger if exists data_deletion_jobs_updated_at on public.data_deletion_jobs;
create trigger data_deletion_jobs_updated_at
before update on public.data_deletion_jobs
for each row execute function public.set_updated_at();

drop trigger if exists data_breach_incidents_updated_at on public.data_breach_incidents;
create trigger data_breach_incidents_updated_at
before update on public.data_breach_incidents
for each row execute function public.set_updated_at();

drop trigger if exists processor_contracts_updated_at on public.processor_contracts;
create trigger processor_contracts_updated_at
before update on public.processor_contracts
for each row execute function public.set_updated_at();

drop trigger if exists retention_rules_updated_at on public.retention_rules;
create trigger retention_rules_updated_at
before update on public.retention_rules
for each row execute function public.set_updated_at();

drop trigger if exists compliance_tasks_updated_at on public.compliance_tasks;
create trigger compliance_tasks_updated_at
before update on public.compliance_tasks
for each row execute function public.set_updated_at();

alter table public.privacy_consents enable row level security;
alter table public.data_subject_requests enable row level security;
alter table public.data_deletion_jobs enable row level security;
alter table public.data_breach_incidents enable row level security;
alter table public.processor_contracts enable row level security;
alter table public.retention_rules enable row level security;
alter table public.compliance_tasks enable row level security;

insert into public.retention_rules (data_category, retention_period, retention_basis, default_action, legal_hold_allowed)
values
  ('kyc_records', '5 years after account closure or last transaction', 'Legal, fraud prevention, and platform integrity', 'retain', true),
  ('receipts_and_disputes', '5 years after trade or dispute closure', 'Evidence, fraud prevention, and complaint handling', 'retain', true),
  ('whatsapp_chat_records', '2 years unless linked to dispute, fraud, legal, or compliance review', 'Service continuity and user support', 'anonymize', true),
  ('payout_details', 'Until account deletion, replacement, legal hold, or fraud review closure', 'Trade execution and name-match controls', 'delete', true),
  ('audit_events', '5 years from event', 'Security, accountability, and compliance evidence', 'retain', true)
on conflict (data_category) do update set
  retention_period = excluded.retention_period,
  retention_basis = excluded.retention_basis,
  default_action = excluded.default_action,
  legal_hold_allowed = excluded.legal_hold_allowed,
  updated_at = now();

insert into public.processor_contracts (processor_name, service_category, data_categories, country, transfer_mechanism, dpa_status, risk_level, review_due_at, admin_notes)
values
  ('Meta WhatsApp Business Platform', 'Messaging platform', array['phone number', 'messages', 'media metadata'], 'Multiple', 'Vendor DPA and transfer terms required', 'pending_review', 'high', now() + interval '30 days', 'Confirm WhatsApp Business Platform terms and data processing terms before production.'),
  ('Supabase', 'Database and private storage', array['user profile', 'kyc metadata', 'payout metadata', 'trade records', 'receipts'], 'Multiple', 'Vendor DPA and region review required', 'pending_review', 'high', now() + interval '30 days', 'Confirm DPA, storage region, backup retention, and access controls.'),
  ('Didit or selected KYC provider', 'Identity verification and liveness', array['government ID', 'selfie', 'biometric match result', 'legal name'], 'Multiple', 'Vendor DPA, biometric processing terms, and transfer assessment required', 'pending_review', 'critical', now() + interval '14 days', 'Finalise provider before production KYC.'),
  ('Vercel', 'Website hosting', array['website telemetry', 'support form metadata'], 'Multiple', 'Vendor DPA required', 'pending_review', 'medium', now() + interval '30 days', 'Confirm analytics, logs, and retention.'),
  ('Cloudflare', 'DNS, edge security, and caching', array['IP address', 'security logs', 'website request metadata'], 'Multiple', 'Vendor DPA required', 'pending_review', 'medium', now() + interval '30 days', 'Confirm DNS/proxy/security logging terms.'),
  ('OpenAI or selected AI provider', 'Conversation understanding and assistant reasoning', array['messages', 'trade intent', 'support context'], 'Multiple', 'Vendor DPA and model data-use controls required', 'pending_review', 'high', now() + interval '30 days', 'Use minimised prompts and avoid sending raw KYC media unless contractually approved.')
on conflict (processor_name) do update set
  service_category = excluded.service_category,
  data_categories = excluded.data_categories,
  country = excluded.country,
  transfer_mechanism = excluded.transfer_mechanism,
  dpa_status = excluded.dpa_status,
  risk_level = excluded.risk_level,
  review_due_at = excluded.review_due_at,
  admin_notes = excluded.admin_notes,
  updated_at = now();

insert into public.compliance_tasks (task_type, title, status, priority, owner, due_at, notes)
values
  ('governance', 'Assign Akara privacy owner or DPO contact', 'open', 'high', 'Founder', now() + interval '7 days', 'Needed before public launch and NDPC filing.'),
  ('vendor_review', 'Collect DPAs for Meta, Supabase, KYC provider, Vercel, Cloudflare, and AI provider', 'open', 'high', 'Founder', now() + interval '14 days', 'Attach signed terms or evidence URLs in processor records.'),
  ('public_notice', 'Publish Privacy Notice, Terms, KYC Notice, Cookie Notice, and WhatsApp summaries', 'open', 'high', 'Founder', now() + interval '7 days', 'Use website-ready legal pages before production onboarding.'),
  ('audit', 'Complete formal DPCO or privacy counsel review', 'open', 'high', 'Founder', now() + interval '30 days', 'Required before claiming NDPC certification.')
on conflict do nothing;
