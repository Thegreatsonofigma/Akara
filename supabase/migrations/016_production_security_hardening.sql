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
-- attacks. Production environments may be upgraded incrementally, so only
-- harden functions that are installed instead of aborting the whole migration
-- when an optional Stellar migration has not been applied yet.
do $$
declare
  function_signature text;
  installed_function regprocedure;
begin
  foreach function_signature in array array[
    'public.set_updated_at()',
    'public.protect_anchored_integrity()',
    'public.protect_confirmed_stellar_batch()',
    'public.protect_reputation_snapshot()',
    'public.protect_locked_quote_terms()',
    'public.protect_market_rate_snapshot()',
    'public.protect_reputation_credential()',
    'public.protect_liquidity_route_terms()',
    'public.enforce_single_open_trade_per_user()'
  ]
  loop
    installed_function := to_regprocedure(function_signature);

    if installed_function is null then
      raise notice 'Skipping absent function %', function_signature;
      continue;
    end if;

    execute format(
      'alter function %s set search_path = public, extensions',
      installed_function
    );
    execute format(
      'grant execute on function %s to service_role',
      installed_function
    );
  end loop;
end
$$;
