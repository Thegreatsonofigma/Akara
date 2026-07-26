# Yellow Card And Flutterwave Partner Readiness

This checklist is a product and engineering preparation guide. A provider's
compliance team may request more information after reviewing Akara's exact
business model, countries, volumes, and money flow.

## Akara Positioning

Describe Akara accurately:

- WhatsApp-first peer exchange discovery and coordination;
- verified individual users;
- peer-set local-fiat listings;
- no custody in the current product;
- receipts are supporting evidence, not final proof;
- users confirm receipt in their own bank or mobile-money accounts;
- Stellar is used only for privacy-safe integrity commitments.

Do not describe Akara as a bank, wallet, escrow, bureau de change, remittance
operator, or licensed payment processor unless the required licence or partner
structure is in place.

## Yellow Card

Yellow Card's published API onboarding requires:

- introductory discovery call;
- pre-integration form covering business model, volumes, and requirements;
- business registration documents;
- ownership and director information;
- compliance questionnaires;
- jurisdiction-specific documents;
- review of Akara's AML processes and systems;
- executed partnership agreement;
- sandbox integration and transaction evidence;
- Yellow Card sign-off before production credentials;
- static production IP address for whitelisting;
- HMAC API authentication and verified webhooks;
- end-customer KYC metadata on receive and send requests;
- production funding through Yellow Card's supported USD-stablecoin balance.

What Akara should prepare:

- CAC registration pack and ownership chart;
- AML/CFT policy and risk assessment;
- customer KYC and sanctions-screening flow;
- corridor, volume, and transaction-limit forecast;
- data-flow diagram and privacy documentation;
- complaints, disputes, refunds, and incident procedures;
- product walkthrough and sandbox test IDs;
- production hosting with a stable outbound IP;
- named compliance and technical contacts.

Important product constraint:

Yellow Card's payment API uses a USD-stablecoin treasury balance behind its
fiat receives and sends. This is not a zero-compliance shortcut. Yellow Card
will assess Akara as a business partner and requires KYC metadata per
transaction.

## Flutterwave

### Material eligibility warning

Flutterwave's published merchant terms list **Currency Exchange Services** as
a prohibited merchant category. Akara should therefore not assume that a
standard Flutterwave merchant account can be used for exchange principal,
conversion, or peer payouts. The only responsible path is a written,
product-specific approval from Flutterwave's partnerships and compliance teams,
potentially through a separately regulated sponsor or bespoke remittance
arrangement. Ordinary dashboard activation does not override this restriction.

For a Nigerian registered business, Flutterwave's published requirements can
include:

- CAC certificate or certificate of incorporation;
- memorandum and articles for a limited company;
- corporate bank account matching the registered business;
- BVN and valid ID for the business representative;
- IDs for directors and shareholders;
- proof of operational address issued recently;
- verifiable website showing business activity;
- CAC status report and ownership structure where applicable;
- estimated monthly sales or transaction volume;
- TIN or tax certificate;
- operating licence where the activity is regulated;
- completed director verification and live identity checks.

Technical production requirements include:

- approved live KYC account;
- backend-only API credential storage;
- webhook endpoint and signature verification;
- unique trace and idempotency keys;
- IP whitelisting for transfer products;
- sufficient funded balance;
- verification of amount, currency, reference, customer, and final transfer
  status before giving value.

What Akara should ask Flutterwave:

- whether Akara's peer-to-peer FX coordination model is an approved use case;
- whether a regulated licence or licensed sponsor is required for collections,
  cross-currency conversion, transfers, or fee deduction;
- which of NGN, RWF, GHS, KES, and XAF are available to Akara's Nigerian
  entity for collection, conversion, mobile money, and payout;
- whether marketplace or subaccount architecture is required;
- reserve, settlement, chargeback, and transaction-monitoring requirements;
- commercial pricing, limits, and settlement timing.

## Practical Sequence

1. Use both providers' sandbox environments without changing Akara's current
   no-custody production flow.
2. Send each provider the same accurate money-flow diagram.
3. Ask for written approval of the use case and corridors.
4. Complete KYB, AML review, legal agreements, and technical sign-off.
5. Enable a provider only behind a feature flag and corridor allowlist.
6. Never route exchange principal through Akara's service-fee account.
