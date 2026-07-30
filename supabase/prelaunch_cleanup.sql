-- One-time pre-launch cleanup.
--
-- This removes test users and all user-owned operational records while
-- preserving admin access, compliance configuration, and waitlist signups.
-- TRUNCATE is intentional: several audit/integrity tables are append-only and
-- linked in cycles, so row-by-row deletion would leave a partial cleanup.
--
-- This statement is atomic. If a new foreign-key dependency was not included,
-- PostgreSQL rejects the entire transaction without deleting anything.

begin;

do $cleanup$
declare
  requested_tables text[] := array[
    'data_deletion_jobs',
    'data_subject_requests',
    'privacy_consents',
    'security_challenges',
    'liquidity_route_legs',
    'reputation_credentials',
    'user_reputation_snapshots',
    'market_rate_snapshots',
    'locked_quotes',
    'liquidity_route_plans',
    'integrity_records',
    'stellar_anchor_batches',
    'deal_proofs',
    'fees',
    'disputes',
    'negotiable_offers',
    'deals',
    'listings',
    'payment_profiles',
    'verification_requests',
    'penalties',
    'message_sessions',
    'audit_events',
    'users'
  ];
  existing_tables text;
begin
  select string_agg(format('public.%I', table_name), ', ')
    into existing_tables
  from unnest(requested_tables) as table_name
  where to_regclass(format('public.%I', table_name)) is not null;

  if existing_tables is not null then
    execute 'truncate table ' || existing_tables || ' restart identity';
  end if;
end
$cleanup$;

commit;
