-- Akara's public schema is a backend-only data plane. The Node/Railway
-- service and trusted website route use the Supabase service role; browsers
-- must not receive direct table or function write access.

revoke usage on schema public from anon, authenticated;
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- Keep future migrations closed by default. A reviewed migration must
-- explicitly grant any intentionally public read capability.
alter default privileges in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- Pin function resolution to trusted schemas to prevent object-shadowing
-- attacks. These functions are currently trigger-only.
alter function public.set_updated_at()
  set search_path = public, extensions;
alter function public.protect_anchored_integrity()
  set search_path = public, extensions;
alter function public.protect_confirmed_stellar_batch()
  set search_path = public, extensions;
alter function public.protect_reputation_snapshot()
  set search_path = public, extensions;
alter function public.protect_locked_quote_terms()
  set search_path = public, extensions;
alter function public.protect_market_rate_snapshot()
  set search_path = public, extensions;
alter function public.protect_reputation_credential()
  set search_path = public, extensions;
alter function public.protect_liquidity_route_terms()
  set search_path = public, extensions;
alter function public.enforce_single_open_trade_per_user()
  set search_path = public, extensions;

grant execute on function public.set_updated_at() to service_role;
grant execute on function public.protect_anchored_integrity() to service_role;
grant execute on function public.protect_confirmed_stellar_batch() to service_role;
grant execute on function public.protect_reputation_snapshot() to service_role;
grant execute on function public.protect_locked_quote_terms() to service_role;
grant execute on function public.protect_market_rate_snapshot() to service_role;
grant execute on function public.protect_reputation_credential() to service_role;
grant execute on function public.protect_liquidity_route_terms() to service_role;
grant execute on function public.enforce_single_open_trade_per_user() to service_role;
