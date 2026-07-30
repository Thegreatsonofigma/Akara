import { BUSINESS, CURRENCIES, NO_CUSTODY_LINE, SEO_CORRIDORS, SITE } from "@/lib/site";

const organization = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE.legalName,
  alternateName: SITE.name,
  url: SITE.url,
  logo: `${SITE.url}/akara-logo-mark.webp`,
  email: SITE.supportEmail,
  legalName: BUSINESS.legalName,
  foundingLocation: {
    "@type": "Country",
    name: BUSINESS.country,
  },
  areaServed: CURRENCIES.map((currency) => ({
    "@type": "Country",
    name: currency.country,
  })),
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SITE.supportEmail,
      availableLanguage: ["English"],
      areaServed: CURRENCIES.map((currency) => currency.country),
    },
  ],
  knowsAbout: [
    "WhatsApp currency exchange",
    "peer-to-peer currency exchange",
    "NGN to RWF exchange",
    "RWF to NGN exchange",
    "GHS, KES, and XAF exchange",
    "mobile money payout verification",
    "receipt-supported trade tracking",
  ],
};

const jsonLd = [
  organization,
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE.name,
    url: SITE.url,
    description: SITE.description,
    inLanguage: "en",
    publisher: organization,
    about: "Peer-listed African currency exchange offers on WhatsApp",
    keywords: SITE.keywords.join(", "),
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    applicationCategory: "FinanceApplication",
    operatingSystem: "WhatsApp",
    url: SITE.url,
    description: SITE.description,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "Service",
    name: "Peer-to-peer currency exchange coordination",
    serviceType: "Currency exchange coordination software",
    provider: organization,
    areaServed: CURRENCIES.map((currency) => ({
      "@type": "Country",
      name: currency.country,
    })),
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: SITE.whatsappHref,
      name: "Akara on WhatsApp",
    },
    description: `${SITE.name} helps verified users discover, list, coordinate, and track peer-to-peer currency exchange arrangements on WhatsApp. ${NO_CUSTODY_LINE}`,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Supported currency corridors",
      itemListElement: SEO_CORRIDORS.map((corridor) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: corridor.label,
        },
      })),
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Does Akara hold user funds?",
        acceptedAnswer: {
          "@type": "Answer",
          text: NO_CUSTODY_LINE,
        },
      },
      {
        "@type": "Question",
        name: "Which currencies does Akara support?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Akara supports NGN, RWF, GHS, KES, and XAF at launch.",
        },
      },
      {
        "@type": "Question",
        name: "How does Akara work on WhatsApp?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Verified users can list exchange rates, browse offers, open Akara Trades, exchange payout details, upload receipts, track trade status, and raise disputes inside WhatsApp.",
        },
      },
    ],
  },
] as const;

export function StructuredData() {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
    />
  );
}
