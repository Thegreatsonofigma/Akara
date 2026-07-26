create index if not exists negotiable_offers_open_status_idx
  on public.negotiable_offers(status, listing_id, created_at desc)
  where status in ('pending', 'countered');

create index if not exists audit_events_matching_lookup_idx
  on public.audit_events(entity_type, entity_id, event_name, created_at desc)
  where event_name in (
    'match_pair_excluded',
    'smart_match_cleared',
    'smart_match_requeued',
    'smart_match_negotiation_suggested'
  );
