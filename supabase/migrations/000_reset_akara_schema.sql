drop table if exists public.audit_events cascade;
drop table if exists public.message_sessions cascade;
drop table if exists public.penalties cascade;
drop table if exists public.disputes cascade;
drop table if exists public.fees cascade;
drop table if exists public.deal_proofs cascade;
drop table if exists public.deals cascade;
drop table if exists public.negotiable_offers cascade;
drop table if exists public.listings cascade;
drop table if exists public.payment_profiles cascade;
drop table if exists public.verification_requests cascade;
drop table if exists public.users cascade;

drop function if exists public.set_updated_at cascade;

drop type if exists public.actor_type cascade;
drop type if exists public.dispute_status cascade;
drop type if exists public.fee_status cascade;
drop type if exists public.deal_status cascade;
drop type if exists public.negotiable_offer_status cascade;
drop type if exists public.listing_type cascade;
drop type if exists public.listing_status cascade;
drop type if exists public.risk_status cascade;
drop type if exists public.verification_status cascade;
