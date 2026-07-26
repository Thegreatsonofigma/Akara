create index if not exists audit_events_matching_reminder_idx
  on public.audit_events(entity_type, entity_id, actor_user_id, event_name, created_at desc)
  where event_name in (
    'automatic_match_reminder_sent',
    'automatic_negotiation_reminder_sent'
  );
