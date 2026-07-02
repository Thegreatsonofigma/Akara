# Akara Reference Codes

Akara references should feel like transaction receipts, not random passwords or backend IDs.

## Format

```text
AKR-{Reference Type}-{Sequence}
```

Examples:

```text
AKR-OFFER-001
AKR-TXN-001
AKR-OFFER-002
```

## Meaning

- `AKR`: compact Akara brand marker.
- `OFFER`: a public listing someone has posted into the market.
- `TXN`: a reserved exchange between two people.
- `001`: simple sequence number.

## Why This Works

- Users can read it aloud quickly.
- It feels like Akara's own transaction language.
- Support can identify object type quickly.
- It feels more official than random mixed characters.
- It has a little personality without becoming confusing.
- It avoids exposing phone numbers, user IDs, or database IDs.

## Compatibility

Older MVP references such as `Kara Offer 001` and `Kara Drop 001` are still recognized by the WhatsApp bot so early test links do not break. New references should use `AKR-OFFER` and `AKR-TXN`.

## Internal Note

The reference is stored as text in the database. It is intentionally user-facing and should stay short enough to paste into WhatsApp without feeling noisy.
