export const SITE = {
  name: "Akara",
  legalName: "Akara Fintech Solutions",
  url: "https://tryakara.com",
  title: "Akara | Peer-to-peer currency exchange coordination on WhatsApp",
  description:
    "Akara helps verified users discover, coordinate, and track peer-to-peer currency exchange arrangements across African currencies. Akara does not hold or move user funds.",
  supportEmail: "support@tryakara.com",
  fallbackEmail: "tryakara@gmail.com",
  complaintsEmail: "complaints@tryakara.com",
  whatsappLabel: "[Official WhatsApp Number]",
  whatsappHref: "https://wa.me/",
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
