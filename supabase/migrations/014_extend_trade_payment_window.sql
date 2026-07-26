update public.deals
set reservation_expires_at = greatest(
  reservation_expires_at,
  created_at + interval '30 minutes'
)
where status in (
  'reserved',
  'instructions_viewed',
  'maker_sent',
  'taker_sent',
  'partially_confirmed'
);
