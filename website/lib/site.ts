export const SITE = {
  name: "Akara",
  legalName: "Akara Fintech Solutions",
  url: "https://tryakara.com",
  title: "Akara | Currency exchange on WhatsApp for Africa",
  description:
    "Akara helps verified users list, discover, coordinate, and track peer-to-peer currency exchange on WhatsApp across NGN, RWF, GHS, KES, and XAF. Akara does not hold funds.",
  ogImage: "/cards/listing.webp",
  keywords: [
    "currency exchange on WhatsApp",
    "Naira exchange on WhatsApp",
    "peer-to-peer currency exchange",
    "African currency exchange",
    "Naira to Rwandan Franc",
    "NGN to RWF",
    "RWF to NGN",
    "Rwandan Franc exchange",
    "Ghana Cedi exchange",
    "Kenyan Shilling exchange",
    "CFA Franc exchange",
    "Naira to Kenyan Shilling",
    "NGN to KES",
    "GHS to RWF",
    "XAF to NGN",
    "exchange money in Rwanda",
    "mobile money exchange Africa",
    "currency exchange for African students",
    "student currency exchange",
    "expat currency exchange",
    "verified P2P currency exchange",
    "WhatsApp money exchange",
    "exchange rate listing",
    "cross-border currency exchange Africa",
    "WhatsApp currency conversion",
    "convert Naira to Rwandan Franc",
    "Rwanda mobile money exchange",
    "peer listed exchange rates",
    "currency exchange for freelancers Africa",
    "currency exchange for expats Africa",
    "currency exchange for international students Africa",
    "NGN RWF exchange rate listing",
    "XAF RWF exchange",
    "KES RWF exchange",
    "GHS RWF exchange",
  ],
  supportEmail: "support@tryakara.com",
  fallbackEmail: "tryakara@gmail.com",
  complaintsEmail: "complaints@tryakara.com",
  waitlistHref: "/#get-started",
  whatsappNumber: "250734269158",
  whatsappLabel: "+250 734 269 158",
  whatsappHref:
    "https://wa.me/250734269158?text=Hi%20Akara%2C%20I%20want%20to%20start%20an%20exchange.",
} as const;

export const BUSINESS = {
  legalName: "Akara Fintech Solutions",
  registrationNumber: "BN 9656395",
  entityType: "Business Name",
  businessType: "Sole Proprietor",
  country: "Nigeria",
  registrationDate: "July 4, 2026",
  status: "Active",
  address:
    "No. 19, Afam Emma Chukwura Lane, Bonsaac, Asaba, Delta State, Nigeria",
  governingLaw:
    "Nigeria, with applicable local laws in supported user countries where required",
  regulator: "[Regulator if applicable]",
} as const;

export const MANDATORY_WORDING =
  "Akara Fintech Solutions is registered in Nigeria as a business name under BN 9656395. Akara provides software tools that help verified users discover, list, coordinate, and track peer-to-peer currency exchange arrangements. Akara is not currently licensed as a bank, remittance company, bureau de change, wallet, escrow provider, payment processor, or money transfer operator.";

export const NO_CUSTODY_LINE =
  "Akara does not hold, receive, escrow, custody, remit, convert, or move user funds.";

export const SHARED_LEGAL_NOTICE =
  "Akara does not hold, receive, escrow, custody, remit, convert, or move user funds. Users send money directly to each other through their own bank or mobile money accounts. Users must confirm payout details before sending money. KYC data, receipts, and WhatsApp chat records may be used for fraud prevention and dispute review. Akara may pause trades, restrict accounts, suspend listings, require admin review, or block users where needed for safety.";

export const KEY_REMINDERS = [
  "Akara does not hold or move funds",
  "Confirm payout details before sending",
  "KYC data, receipts, and chat records may be used for fraud prevention and dispute review",
  "Akara may pause trades or restrict accounts for safety",
] as const;

export const CURRENCIES = [
  { code: "NGN", country: "Nigeria", flag: "🇳🇬" },
  { code: "RWF", country: "Rwanda", flag: "🇷🇼" },
  { code: "GHS", country: "Ghana", flag: "🇬🇭" },
  { code: "KES", country: "Kenya", flag: "🇰🇪" },
  { code: "XAF", country: "Cameroon", flag: "🇨🇲" },
] as const;

export const SEO_CORRIDORS = [
  { from: "NGN", to: "RWF", label: "Naira to Rwandan Franc" },
  { from: "RWF", to: "NGN", label: "Rwandan Franc to Naira" },
  { from: "NGN", to: "GHS", label: "Naira to Ghana Cedi" },
  { from: "GHS", to: "NGN", label: "Ghana Cedi to Naira" },
  { from: "NGN", to: "KES", label: "Naira to Kenyan Shilling" },
  { from: "KES", to: "NGN", label: "Kenyan Shilling to Naira" },
  { from: "NGN", to: "XAF", label: "Naira to Central African CFA Franc" },
  { from: "GHS", to: "RWF", label: "Ghana Cedi to Rwandan Franc" },
  { from: "RWF", to: "GHS", label: "Rwandan Franc to Ghana Cedi" },
  { from: "KES", to: "RWF", label: "Kenyan Shilling to Rwandan Franc" },
  { from: "RWF", to: "KES", label: "Rwandan Franc to Kenyan Shilling" },
  { from: "XAF", to: "RWF", label: "Central African CFA Franc to Rwandan Franc" },
  { from: "RWF", to: "XAF", label: "Rwandan Franc to Central African CFA Franc" },
  { from: "GHS", to: "KES", label: "Ghana Cedi to Kenyan Shilling" },
  { from: "KES", to: "GHS", label: "Kenyan Shilling to Ghana Cedi" },
  { from: "GHS", to: "XAF", label: "Ghana Cedi to Central African CFA Franc" },
  { from: "XAF", to: "GHS", label: "Central African CFA Franc to Ghana Cedi" },
  { from: "KES", to: "XAF", label: "Kenyan Shilling to Central African CFA Franc" },
  { from: "XAF", to: "KES", label: "Central African CFA Franc to Kenyan Shilling" },
  { from: "XAF", to: "NGN", label: "Central African CFA Franc to Naira" },
] as const;
