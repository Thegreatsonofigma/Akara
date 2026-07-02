# Akara MVP Data Model

This is a practical first schema for Supabase/Postgres.

## users

- id
- whatsapp_phone
- display_name
- legal_name
- nationality
- residence_country
- city
- verification_status
- verification_score
- completed_deals_count
- cancelled_deals_24h
- total_cancelled_deals
- dispute_count
- risk_status
- hold_until
- created_at
- updated_at

## verification_requests

- id
- user_id
- status
- id_type
- id_country
- document_front_url
- document_back_url
- selfie_url
- extracted_name
- extracted_id_hash
- extracted_expiry_date
- automated_decision
- automated_reason
- admin_decision
- admin_notes
- created_at
- reviewed_at

## payment_profiles

- id
- user_id
- currency
- method
- account_name
- bank_name
- account_number_encrypted
- momo_network
- momo_number_encrypted
- is_default
- created_at
- updated_at

## listings

- id
- owner_user_id
- listing_code
- have_currency
- want_currency
- have_amount
- want_amount
- rate
- listing_type
- status
- payment_profile_id
- expires_at
- created_at
- updated_at

Allowed listing statuses:

- draft
- active
- reserved
- paused
- completed
- cancelled
- expired
- flagged

Allowed listing types:

- fixed
- negotiable

## negotiable_offers

- id
- listing_id
- offering_user_id
- offered_amount
- offered_currency
- status
- message
- created_at
- updated_at

Allowed statuses:

- pending
- accepted
- declined
- countered
- withdrawn

## deals

- id
- deal_code
- listing_id
- maker_user_id
- taker_user_id
- have_currency
- want_currency
- have_amount
- want_amount
- rate
- status
- reservation_expires_at
- maker_sent_at
- taker_sent_at
- maker_received_at
- taker_received_at
- completed_at
- cancelled_at
- cancelled_by_user_id
- cancellation_reason
- created_at
- updated_at

Allowed statuses:

- reserved
- instructions_viewed
- maker_sent
- taker_sent
- partially_confirmed
- completed_pending_fee
- closed
- cancelled
- expired
- disputed

## deal_proofs

- id
- deal_id
- user_id
- proof_url
- proof_type
- notes
- created_at

## fees

- id
- deal_id
- user_id
- currency
- amount
- status
- payment_reference
- proof_url
- admin_verified_by
- admin_verified_at
- created_at
- updated_at

Allowed statuses:

- pending
- user_marked_paid
- verified
- waived
- overdue

## disputes

- id
- deal_id
- opened_by_user_id
- category
- description
- status
- admin_owner
- resolution
- created_at
- resolved_at

Allowed statuses:

- open
- waiting_for_user
- under_review
- resolved
- rejected

## penalties

- id
- user_id
- reason
- severity
- starts_at
- ends_at
- created_by
- admin_notes
- created_at

## message_sessions

- id
- user_id
- whatsapp_phone
- current_flow
- current_step
- context_json
- last_message_at
- created_at
- updated_at

## audit_events

- id
- actor_user_id
- actor_type
- entity_type
- entity_id
- event_name
- event_payload
- created_at

