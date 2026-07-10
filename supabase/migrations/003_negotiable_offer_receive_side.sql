-- Two-way negotiation: counters can also adjust the amount the taker
-- receives (the listing's have side). Null means the listing terms apply.
alter table public.negotiable_offers
add column if not exists receive_amount numeric(18, 2) check (receive_amount is null or receive_amount > 0),
add column if not exists receive_currency text check (receive_currency is null or receive_currency in ('NGN', 'RWF', 'XAF', 'GHS', 'KES'));
