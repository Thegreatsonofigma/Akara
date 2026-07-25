export type SeoGuide = {
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  intro: string;
  sections: { heading: string; body: string }[];
  faqs: { question: string; answer: string }[];
};

export const SEO_GUIDES: SeoGuide[] = [
  {
    slug: "exchange-money-on-whatsapp-africa",
    title: "Exchange Money On WhatsApp Across African Corridors",
    description:
      "Learn how Akara helps verified users find, list, and track peer-to-peer currency exchange offers on WhatsApp across NGN, RWF, GHS, KES, and XAF.",
    keywords: [
      "exchange money on WhatsApp",
      "currency exchange on WhatsApp Africa",
      "African currency exchange",
      "peer-to-peer currency exchange",
    ],
    intro:
      "Akara turns WhatsApp into a cleaner way to discover exchange offers, agree on terms, exchange payout details, upload receipts, and track the status of a peer-to-peer trade.",
    sections: [
      {
        heading: "What Akara Does",
        body:
          "Akara helps verified users list the currency they have, show the currency they need, browse live offers, open a trade room, and keep the exchange record in one WhatsApp conversation.",
      },
      {
        heading: "Why WhatsApp Matters",
        body:
          "Many students, expats, freelancers, and travellers already coordinate exchange through chats. Akara keeps that familiar behaviour, then adds verification, structured trade records, receipts, reminders, and dispute evidence.",
      },
      {
        heading: "Important Safety Note",
        body:
          "Akara does not hold or move user funds. Users send money directly through their own bank or mobile money accounts, and Akara helps both parties keep a clear record of what was agreed.",
      },
    ],
    faqs: [
      {
        question: "Can I exchange currency inside WhatsApp with Akara?",
        answer:
          "You can use WhatsApp to discover offers, create listings, open Akara Trades, share payout details, upload receipts, and track status. The actual money movement happens through users' own bank or mobile money accounts.",
      },
      {
        question: "Does Akara hold my money?",
        answer:
          "No. Akara does not hold, receive, escrow, custody, remit, convert, or move user funds.",
      },
    ],
  },
  {
    slug: "ngn-to-rwf-exchange-on-whatsapp",
    title: "NGN To RWF Exchange On WhatsApp",
    description:
      "A practical guide for finding Naira to Rwandan Franc exchange offers on WhatsApp using Akara.",
    keywords: ["NGN to RWF", "Naira to Rwandan Franc", "Naira exchange Rwanda", "RWF exchange on WhatsApp"],
    intro:
      "Akara helps users looking for Rwandan Francs discover live NGN to RWF listings, compare terms, and open a structured trade room on WhatsApp.",
    sections: [
      {
        heading: "Find A Live Offer",
        body:
          "Tell Akara what you have or need in natural language, for example: I have 50k naira and need RWF. Akara can search matching and nearby listings.",
      },
      {
        heading: "Create Your Own Rate Listing",
        body:
          "If no live listing fits, Akara can help you review and publish your own rate listing so another verified user can take it.",
      },
      {
        heading: "Keep The Record Clean",
        body:
          "Akara keeps the agreed amount, rate terms, payout details, receipts, reminders, and dispute evidence tied to the same trade reference.",
      },
    ],
    faqs: [
      {
        question: "Who is NGN to RWF useful for?",
        answer:
          "It is useful for Nigerian students, expats, travellers, and freelancers who need Rwandan Francs from verified peer listings.",
      },
      {
        question: "Are NGN to RWF rates fixed by Akara?",
        answer:
          "No. Rates are posted by verified users. Akara helps users discover and coordinate those listings.",
      },
    ],
  },
  {
    slug: "rwf-to-ngn-exchange-on-whatsapp",
    title: "RWF To NGN Exchange On WhatsApp",
    description:
      "Learn how Akara helps users coordinate Rwandan Franc to Naira exchange listings through WhatsApp.",
    keywords: ["RWF to NGN", "Rwandan Franc to Naira", "RWF exchange", "Naira exchange on WhatsApp"],
    intro:
      "Akara makes it easier to find users who need RWF and can send NGN, while keeping the exchange record visible inside WhatsApp.",
    sections: [
      {
        heading: "Browse RWF Listings",
        body:
          "Users can ask for available RWF offers and browse matching or nearby listings before opening a trade.",
      },
      {
        heading: "Use Payout Details Carefully",
        body:
          "Akara asks users to save payout details that match their verified identity, reducing confusion before money is sent.",
      },
      {
        heading: "Track The Trade",
        body:
          "The trade room keeps both parties aligned with receipt upload, payment status, confirmation prompts, reminders, and dispute routes.",
      },
    ],
    faqs: [
      {
        question: "Can I list RWF and ask for NGN?",
        answer:
          "Yes. Akara supports both directions for supported currencies, subject to verification and available payout details.",
      },
      {
        question: "Can users negotiate?",
        answer:
          "Listings can use fixed or negotiable terms, depending on how the owner publishes the offer.",
      },
    ],
  },
  {
    slug: "mobile-money-currency-exchange-africa",
    title: "Mobile Money Currency Exchange Coordination In Africa",
    description:
      "How Akara helps users coordinate mobile money and bank payout details for peer-to-peer currency exchange.",
    keywords: ["mobile money exchange Africa", "MoMo currency exchange", "bank to mobile money exchange", "African mobile money exchange"],
    intro:
      "Akara supports exchange coordination where one side may use a bank account and the other side may use mobile money, depending on the currency corridor.",
    sections: [
      {
        heading: "Built Around Local Rails",
        body:
          "Supported payout details can include Nigerian bank accounts, Rwanda mobile money, Ghana mobile money, Kenya mobile money, and XAF mobile money where available.",
      },
      {
        heading: "Name Matching Matters",
        body:
          "Akara is designed to compare payout names with verified identity records and route mismatches for review.",
      },
      {
        heading: "Receipts Are Evidence",
        body:
          "Receipts help support a trade record, but they do not replace recipient confirmation that money landed in their own account.",
      },
    ],
    faqs: [
      {
        question: "Does Akara process mobile money transfers?",
        answer:
          "No. Akara coordinates the exchange record. Users move funds through their own bank or mobile money providers.",
      },
      {
        question: "Why does Akara ask for payout details?",
        answer:
          "Payout details help both parties know where value should be sent after a trade is opened.",
      },
    ],
  },
  {
    slug: "peer-to-peer-currency-exchange-for-students",
    title: "Peer-To-Peer Currency Exchange For Students",
    description:
      "A guide for students who need a cleaner way to find verified currency exchange offers without leaving WhatsApp.",
    keywords: ["student currency exchange", "currency exchange for African students", "student exchange Rwanda", "WhatsApp student exchange"],
    intro:
      "Akara is built for the real way students already coordinate exchange: by asking in communities and moving to chat. Akara adds structure and trust signals.",
    sections: [
      {
        heading: "For Students In New Countries",
        body:
          "Students who move between Nigeria, Rwanda, Ghana, Kenya, Cameroon, and other supported markets often need fast access to local currency.",
      },
      {
        heading: "Less Chaos In Group Chats",
        body:
          "Instead of searching old messages manually, students can browse live listings, share swap cards, and open structured trade rooms.",
      },
      {
        heading: "Verification First",
        body:
          "Akara requires verification before users can create listings, add payout details, or open trades.",
      },
    ],
    faqs: [
      {
        question: "Can students use Akara?",
        answer:
          "Yes. Akara is designed for students, expats, travellers, freelancers, and other verified individuals who need supported currency corridors.",
      },
      {
        question: "Can I share my listing in a group?",
        answer:
          "Yes. Akara listings can include shareable cards and links that help another verified user open the listing from their own chat.",
      },
    ],
  },
  {
    slug: "safe-peer-to-peer-currency-exchange-with-receipts",
    title: "Safer Peer-To-Peer Currency Exchange With Receipts",
    description:
      "How Akara uses verification, receipts, trade rooms, and dispute records to make peer-to-peer exchange coordination clearer.",
    keywords: ["safe peer-to-peer currency exchange", "currency exchange receipts", "verified P2P currency exchange", "exchange dispute evidence"],
    intro:
      "Peer-to-peer exchange needs clear records. Akara is built to keep identities, payout details, receipts, confirmations, and disputes connected to the right trade.",
    sections: [
      {
        heading: "Receipts Do Not Close A Trade Alone",
        body:
          "Akara can store receipts as evidence, but a trade is only complete when both sides confirm that the expected value has arrived.",
      },
      {
        heading: "Disputes Need Evidence",
        body:
          "If something goes wrong, users can raise a dispute with a reason and supporting evidence for admin review.",
      },
      {
        heading: "Bad Actors Should Not Scale",
        body:
          "Akara can use verification, limits, restrictions, reputation, and audit logs to reduce repeated abuse.",
      },
    ],
    faqs: [
      {
        question: "Can Akara stop every scam?",
        answer:
          "No platform can promise that, especially without holding funds. Akara reduces risk by adding verification, records, receipts, restrictions, and dispute handling.",
      },
      {
        question: "Who confirms receipt?",
        answer:
          "The recipient confirms when the money has landed in their own bank or mobile money account.",
      },
    ],
  },
  {
    slug: "naira-to-kenyan-shilling-whatsapp",
    title: "Naira To Kenyan Shilling Exchange On WhatsApp",
    description:
      "Find or create NGN to KES exchange listings on WhatsApp with Akara.",
    keywords: ["NGN to KES", "Naira to Kenyan Shilling", "Kenyan Shilling exchange", "Naira exchange Kenya"],
    intro:
      "Akara helps verified users coordinate NGN to KES exchange listings without downloading a new app.",
    sections: [
      {
        heading: "Search Before You List",
        body:
          "Ask Akara for KES offers or tell it what you have and need. If a listing exists, Akara can show matching or nearby offers.",
      },
      {
        heading: "Publish A Rate",
        body:
          "If no listing works, Akara can help you review and publish a rate listing for another user to take.",
      },
      {
        heading: "Use Clear Payout Details",
        body:
          "Before a trade opens, Akara checks that the required payout detail exists for the currency you expect to receive.",
      },
    ],
    faqs: [
      {
        question: "Does Akara support Kenyan Shilling?",
        answer:
          "Yes. KES is part of Akara's supported launch currencies.",
      },
      {
        question: "Can I browse all KES offers?",
        answer:
          "Yes. Akara can show available listings that include KES, depending on live marketplace supply.",
      },
    ],
  },
  {
    slug: "ghana-cedi-to-rwandan-franc-whatsapp",
    title: "Ghana Cedi To Rwandan Franc Exchange On WhatsApp",
    description:
      "A guide to GHS to RWF exchange listings through Akara on WhatsApp.",
    keywords: ["GHS to RWF", "Ghana Cedi to Rwandan Franc", "Ghana Cedi exchange", "Rwandan Franc exchange"],
    intro:
      "Akara helps verified users list Ghana Cedis, find Rwandan Franc offers, and coordinate trade details on WhatsApp.",
    sections: [
      {
        heading: "For Cross-Border Lives",
        body:
          "GHS to RWF can matter for students, expats, freelancers, and travellers moving value between Ghana and Rwanda.",
      },
      {
        heading: "Offer Discovery",
        body:
          "Akara can browse live offers, show nearby listings, or help you publish your own listing if no offer fits.",
      },
      {
        heading: "Trade Evidence",
        body:
          "Trade rooms store instructions, receipts, confirmations, reminders, and dispute evidence in one place.",
      },
    ],
    faqs: [
      {
        question: "Can Akara show GHS offers?",
        answer:
          "Yes. Users can ask for GHS offers or search for pairs that include Ghana Cedis.",
      },
      {
        question: "Are GHS to RWF trades instant?",
        answer:
          "Akara can make discovery and coordination faster, but users still send funds through their own bank or mobile money providers.",
      },
    ],
  },
];

export function getSeoGuide(slug: string) {
  return SEO_GUIDES.find((guide) => guide.slug === slug);
}
