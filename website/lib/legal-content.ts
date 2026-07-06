export type LegalSectionData = {
  heading: string;
  paragraphs?: string[];
  items?: string[];
  note?: string;
};

export type LegalCategory =
  | "Core Terms"
  | "Risk & Safety"
  | "Privacy & Data"
  | "Support";

export type LegalDoc = {
  slug: string;
  title: string;
  shortTitle: string;
  description: string;
  intro: string;
  category: LegalCategory;
  sections: LegalSectionData[];
};

export const LEGAL_DOCS: LegalDoc[] = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    shortTitle: "Privacy Policy",
    description:
      "How Akara collects, uses, stores, shares, and protects user information across verification, listings, trades, receipts, and support.",
    intro:
      "This Privacy Policy explains how Akara collects, uses, stores, shares, and protects user information.",
    category: "Privacy & Data",
    sections: [
      {
        heading: "Information We Collect",
        paragraphs: [
          "Akara collects information that users provide directly, information generated while using the platform, and information required for verification and safety review. This may include:",
        ],
        items: [
          "Legal name",
          "WhatsApp number",
          "Nationality and country of residence",
          "ID issuing country, ID type, and ID number",
          "ID document image",
          "Selfie or liveness image",
          "Payout details (bank or mobile money)",
          "Listings and trade records",
          "Receipts and dispute evidence",
          "Support messages and WhatsApp chat records",
          "Timestamps and verification results",
          "Opt-in records",
          "Risk flags, admin notes, and complaint records",
        ],
      },
      {
        heading: "Why We Use Your Information",
        paragraphs: [
          "Akara uses this information to operate the platform safely and keep a clear record of peer-to-peer exchange coordination. Purposes include:",
        ],
        items: [
          "Account creation and management",
          "Identity verification",
          "Payout name matching",
          "Running the listing and trade flow",
          "Receipt review",
          "Reminders and trade notifications",
          "Dispute resolution",
          "Fraud monitoring and abuse prevention",
          "Maintaining accurate platform records",
        ],
      },
      {
        heading: "Sharing Information",
        paragraphs: [
          "Akara does not sell user information. Information may be shared with a limited set of parties who help operate the platform or where the law requires it:",
        ],
        items: [
          "Identity verification providers",
          "WhatsApp Business Platform providers",
          "Cloud hosting and storage providers",
          "Fraud review tools",
          "Admin reviewers handling verification, disputes, or safety cases",
          "Legal advisers",
          "Authorities where required by law",
        ],
      },
      {
        heading: "Your Rights",
        paragraphs: [
          "Users may request access, correction, restriction, or deletion of their information by contacting support@tryakara.com. If the domain email is unavailable, tryakara@gmail.com may be used temporarily.",
          "Some requests may be delayed or limited where records are linked to an active dispute, fraud review, legal request, compliance review, or safety investigation. See the Data Deletion Policy for details.",
        ],
      },
      {
        heading: "Retention",
        paragraphs: [
          "Some records may be retained after account closure for fraud prevention, dispute review, legal compliance, or platform safety. Retention periods are described in the Data Retention Policy.",
        ],
      },
    ],
  },
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    shortTitle: "Terms of Service",
    description:
      "The terms that govern access to and use of Akara's peer-to-peer currency exchange coordination tools.",
    intro: "These Terms explain how users may access and use Akara.",
    category: "Core Terms",
    sections: [
      {
        heading: "What Akara Does",
        paragraphs: [
          "Akara provides software tools for verified users to discover, list, coordinate, and track peer-to-peer currency exchange arrangements. Akara supports verification, offer discovery, listings, matching, payout detail exchange, receipt upload, confirmations, reminders, dispute handling, transaction history, and fraud monitoring.",
        ],
      },
      {
        heading: "What Akara Does Not Do",
        paragraphs: [
          "Akara Fintech Solutions is registered in Nigeria as a business name under BN 9656395. Akara provides software tools that help verified users discover, list, coordinate, and track peer-to-peer currency exchange arrangements. Akara is not currently licensed as a bank, remittance company, bureau de change, wallet, escrow provider, payment processor, or money transfer operator.",
          "Akara does not hold, receive, escrow, custody, remit, convert, or move user funds. Users send money directly to each other through their own bank or mobile money accounts.",
        ],
      },
      {
        heading: "Eligibility",
        items: [
          "Users must be at least 18 years old.",
          "Only individual users are supported at launch. Business accounts are not available yet.",
          "Users outside Africa may use Akara only if they are verified and transacting within supported currency corridors.",
        ],
      },
      {
        heading: "Verification Requirement",
        paragraphs: [
          "Users may browse basic information, but must be verified before creating listings, opening trades, adding payout accounts, or completing exchanges.",
        ],
      },
      {
        heading: "User Responsibilities",
        items: [
          "Provide accurate and truthful information.",
          "Use only your own payout account.",
          "Confirm payout details before sending money.",
          "Upload true, unedited receipts.",
          "Do not bypass Akara's flow, records, or safety checks.",
          "Cooperate with safety reviews and admin requests.",
        ],
      },
      {
        heading: "Trade Rules",
        items: [
          "An open trade expires after 15 minutes if not progressed.",
          "After marking payment as sent, a user cannot cancel the trade and must raise a dispute if something goes wrong.",
        ],
      },
      {
        heading: "Fees",
        paragraphs: [
          "Akara is free during launch. Fees may apply later and will be shown clearly before a trade is opened.",
        ],
      },
      {
        heading: "Safety Action",
        paragraphs: [
          "Akara may restrict accounts, pause trades, suspend listings, require admin review, or ban users for confirmed misuse. KYC data, receipts, and WhatsApp chat records may be used for fraud prevention and dispute review.",
        ],
      },
    ],
  },
  {
    slug: "no-custody-risk-disclosure",
    title: "No-Custody Risk Disclosure",
    shortTitle: "No-Custody Risk Disclosure",
    description:
      "Akara's no-custody model explained: Akara never holds or moves funds, and users must understand the risks of direct peer-to-peer payment.",
    intro:
      "This disclosure explains Akara's no-custody model and the risks users must understand.",
    category: "Risk & Safety",
    sections: [
      {
        heading: "Akara Does Not Hold Funds",
        paragraphs: [
          "Akara does not hold, receive, escrow, custody, remit, convert, or move user funds. Every payment on an Akara-coordinated trade travels directly from one user's bank or mobile money account to the other user's account. Akara is a coordination layer around that direct payment — not a participant in it.",
        ],
      },
      {
        heading: "What This Means",
        paragraphs: ["Because Akara never touches the money, Akara cannot:"],
        items: [
          "Stop a payment after it has been sent",
          "Force a reversal of a completed payment",
          "Guarantee a refund",
          "Make a bank or mobile money provider return funds",
        ],
      },
      {
        heading: "Your Responsibility Before Sending Money",
        paragraphs: [
          "Before sending any money, you are responsible for confirming:",
        ],
        items: [
          "The payout account name",
          "The account number or mobile money number",
          "The currency",
          "The amount",
          "The trade reference code",
          "The current trade status",
        ],
      },
      {
        heading: "Fraud and Dispute Review",
        paragraphs: [
          "KYC data, receipts, and WhatsApp chat records may be used for fraud prevention and dispute review. Akara may pause trades, restrict accounts, or require admin review where needed for safety. Disputes are reviewed under the Dispute Resolution Policy, but review outcomes cannot create refunds from funds Akara does not hold.",
        ],
      },
      {
        heading: "Important Warning",
        paragraphs: [
          "If a user sends money to the wrong details, sends money outside Akara's flow, or sends money after a trade has expired, recovery may not be possible. Always confirm payout details inside the trade before sending money.",
        ],
      },
    ],
  },
  {
    slug: "kyc-and-identity-verification-consent",
    title: "KYC and Identity Verification Consent",
    shortTitle: "KYC Consent",
    description:
      "What identity information Akara collects for verification, which documents are accepted, and what users consent to.",
    intro:
      "Akara requires identity verification before users can create listings, open trades, add payout accounts, or complete exchanges.",
    category: "Privacy & Data",
    sections: [
      {
        heading: "Verification Information We Collect",
        items: [
          "Legal name",
          "WhatsApp number",
          "Nationality and country of residence",
          "ID issuing country, ID type, and ID number",
          "ID document image",
          "Selfie or liveness capture",
          "Face match result",
          "Payout account name",
        ],
      },
      {
        heading: "Accepted Documents",
        paragraphs: [
          "Akara accepts a national ID, passport, driver's licence, residence permit, or other government-issued identity document accepted by Akara.",
        ],
      },
      {
        heading: "Third-Party Verification",
        paragraphs: [
          "Akara may use a third-party KYC provider such as Didit to perform document checks, face matching, and liveness detection. Verification data shared with such providers is used only for verification and safety purposes.",
        ],
      },
      {
        heading: "Your Consent",
        paragraphs: [
          "By starting verification, you consent to the collection, checking, storage, and use of your verification information for identity verification, account approval, fraud prevention, dispute review, safety checks, and compliance.",
        ],
      },
      {
        heading: "Verification Outcomes",
        paragraphs: [
          "Verification may result in approval, rejection, restriction, or admin review. Users may appeal an outcome or be asked to provide additional information.",
        ],
      },
      {
        heading: "Reverification",
        paragraphs: [
          "Reverification may be required after payout detail changes, especially name changes or unclear payout name matches.",
        ],
      },
    ],
  },
  {
    slug: "payout-details-and-account-name-match-policy",
    title: "Payout Details and Account Name-Match Policy",
    shortTitle: "Payout Name-Match Policy",
    description:
      "How Akara handles bank and mobile money payout details, and why payout names must match the verified account holder.",
    intro:
      "This policy explains how Akara handles bank and mobile money payout details.",
    category: "Risk & Safety",
    sections: [
      {
        heading: "Payout Details We May Collect",
        paragraphs: [
          "For NGN, Akara collects bank account details. For RWF, GHS, KES, and XAF, Akara collects mobile money or other supported payout details depending on the country and network.",
        ],
      },
      {
        heading: "Name-Match Rule",
        paragraphs: [
          "The payout account name must strictly match the verified legal name on the Akara account. Minor spelling differences may go to admin review. Using someone else's payout account is not allowed at launch.",
        ],
      },
      {
        heading: "Saved Payout Accounts",
        paragraphs: [
          "Users may save up to 2 payout accounts per currency at launch.",
        ],
      },
      {
        heading: "Editing Payout Details",
        paragraphs: [
          "A 6-digit passcode is required to edit payout details. A selfie check or admin review may be required for risky changes, such as name changes or unusual editing patterns.",
        ],
      },
      {
        heading: "User Responsibility",
        paragraphs: [
          "Users must confirm payout details before sending money. Akara shares payout details inside the trade flow so both sides can verify them, but the sender is responsible for checking before payment.",
        ],
      },
      {
        heading: "Safety Action",
        paragraphs: [
          "Akara may reject payout details, pause trades, restrict accounts, require admin review, or block users where payout information appears unsafe, mismatched, or suspicious.",
        ],
      },
    ],
  },
  {
    slug: "aml-and-fraud-prevention-policy",
    title: "AML and Fraud Prevention Policy",
    shortTitle: "AML & Fraud Prevention",
    description:
      "The fraud prevention and anti-abuse controls Akara applies to keep peer-to-peer exchange coordination safer.",
    intro:
      "Akara uses fraud prevention and anti-abuse controls to help keep peer-to-peer exchange coordination safer.",
    category: "Risk & Safety",
    sections: [
      {
        heading: "Akara's Role",
        paragraphs: [
          "Akara provides software tools only. Akara is not a licensed bank, payment processor, remittance company, wallet, or escrow provider, and does not hold or move user funds. Akara's controls focus on the coordination layer: who is verified, what is listed, what is claimed, and what evidence supports it.",
        ],
      },
      {
        heading: "What Akara Reviews",
        items: [
          "Fake or manipulated receipts",
          "Abandoned trades",
          "Repeated cancellations",
          "Mismatched payout names",
          "Duplicate listings",
          "High-value activity",
          "Attempts to bypass Akara's flow",
          "Fraud reports from users",
          "Abusive behaviour",
          "Users receiving money without fulfilling their side of a trade",
        ],
      },
      {
        heading: "User Responsibilities",
        items: [
          "Verify with your real identity",
          "Provide accurate information",
          "Use only your own payout account",
          "Confirm payout details before sending money",
          "Upload true, unedited receipts",
          "Avoid unlawful or deceptive activity",
        ],
      },
      {
        heading: "Safety Actions",
        paragraphs: [
          "Where Akara identifies risk, it may restrict accounts, pause trades, remove listings, reduce limits, request additional evidence, block users, preserve records, and report activity where required by law.",
        ],
      },
      {
        heading: "Use of Records",
        paragraphs: [
          "KYC data, receipts, payout details, trade history, risk notes, and WhatsApp chat records may be used for fraud prevention and dispute review.",
        ],
      },
    ],
  },
  {
    slug: "user-verification-tier-and-transaction-limit-policy",
    title: "User Verification Tier and Transaction Limit Policy",
    shortTitle: "Verification Tiers & Limits",
    description:
      "How Akara may use verification tiers and transaction limits to manage platform safety.",
    intro:
      "This policy explains how Akara may use verification tiers and transaction limits to manage platform safety.",
    category: "Core Terms",
    sections: [
      {
        heading: "Why Akara Uses Tiers",
        paragraphs: [
          "Verification tiers and limits exist for fraud prevention, user protection, abuse reduction, and risk management. Higher limits require stronger verification because higher-value coordination carries higher risk.",
        ],
      },
      {
        heading: "Example Tier Structure",
        items: [
          "Tier 1 — Low-value trades only.",
          "Tier 2 — Medium limits after stronger verification.",
          "Tier 3 — Higher limits after admin-approved KYC.",
        ],
      },
      {
        heading: "Minimum Trade Amounts",
        items: [
          "NGN: 1,000",
          "RWF: 1,000",
          "KES: 100",
          "GHS: 10",
          "XAF: 1,000",
        ],
      },
      {
        heading: "Limit Reviews",
        paragraphs: [
          "Akara may increase, reduce, freeze, or review limits based on verification level, trade history, disputes, receipt quality, payout name match results, suspicious activity, country risk, or compliance requirements.",
        ],
      },
      {
        heading: "User Responsibility",
        paragraphs: [
          "Users must confirm payout details before sending money and must not split trades into smaller amounts to avoid limits. Splitting trades to evade limits is treated as a safety violation.",
        ],
      },
    ],
  },
  {
    slug: "dispute-resolution-policy",
    title: "Dispute Resolution Policy",
    shortTitle: "Dispute Resolution",
    description:
      "When and how users can raise disputes on Akara, what evidence is needed, and how reviews are decided.",
    intro: "This policy explains how Akara handles disputes between users.",
    category: "Risk & Safety",
    sections: [
      {
        heading: "When You Can Raise a Dispute",
        items: [
          "You sent money and did not receive the agreed value",
          "You received money but the other user claims otherwise",
          "A receipt looks fake or unclear",
          "Payout details appear mismatched",
          "The other user abandoned the trade",
          "You suspect fraud",
        ],
      },
      {
        heading: "Timing",
        paragraphs: [
          "Raise a dispute within 24 hours of opening or completing a trade, or immediately if payment was sent and value was not received.",
        ],
      },
      {
        heading: "Evidence You May Need",
        items: [
          "Bank receipt or mobile money receipt",
          "SMS confirmation",
          "App screenshot or PDF receipt",
          "Transaction screenshot and reference",
          "Trade code, amount, date, and time",
          "Relevant WhatsApp chat",
        ],
      },
      {
        heading: "Review Process",
        paragraphs: [
          "When a dispute is raised, Akara may pause the trade, request evidence from both sides, review KYC data, receipts, payout details, and chat records, restrict accounts during review, and assign an admin or compliance reviewer.",
        ],
      },
      {
        heading: "Response Time",
        paragraphs: [
          "Akara aims to respond within 24 to 72 hours. Complex cases may take longer.",
        ],
      },
      {
        heading: "Decision",
        paragraphs: [
          "An admin or compliance reviewer may resolve, reject, close, or escalate a dispute. Akara may close a trade without both confirmations only after admin review and clear evidence.",
        ],
      },
      {
        heading: "No Guarantee",
        paragraphs: [
          "Because Akara does not hold funds, Akara cannot guarantee a refund, reversal, or recovery in any dispute.",
        ],
      },
    ],
  },
  {
    slug: "cancellation-refund-and-reversal-policy",
    title: "Cancellation, Refund, and Reversal Policy",
    shortTitle: "Cancellation & Refunds",
    description:
      "How cancellations, refunds, and reversals work on Akara's no-custody peer-to-peer model.",
    intro:
      "This policy explains how cancellations, refunds, and reversals work on Akara.",
    category: "Core Terms",
    sections: [
      {
        heading: "Cancelling a Trade",
        paragraphs: ["A trade can be cancelled:"],
        items: [
          "Before payment is sent",
          "If both users agree to cancel",
          "If the trade expires after 15 minutes",
          "If the trade is abandoned",
          "If Akara pauses or closes it for safety",
        ],
      },
      {
        heading: "After Payment Is Marked Sent",
        paragraphs: [
          "Once a user marks payment as sent, that user cannot cancel the trade. If something goes wrong after this point, the user must raise a dispute.",
        ],
      },
      {
        heading: "Refunds",
        paragraphs: [
          "Refunds are handled directly between users, their banks, or their mobile money providers. Akara does not hold funds, so Akara cannot issue refunds.",
        ],
      },
      {
        heading: "Reversals",
        paragraphs: [
          "Users seeking a reversal should contact their bank or mobile money provider. Akara may help prepare evidence for a reversal request, subject to privacy, legal, and safety checks.",
        ],
      },
      {
        heading: "No Compensation by Default",
        paragraphs: [
          "Akara does not compensate users from its own funds unless it separately chooses to do so in writing.",
        ],
      },
    ],
  },
  {
    slug: "receipt-upload-and-evidence-policy",
    title: "Receipt Upload and Evidence Policy",
    shortTitle: "Receipts & Evidence",
    description:
      "How payment receipts and evidence are handled, reviewed, and rejected on Akara.",
    intro:
      "This policy explains how payment receipts and evidence are handled on Akara.",
    category: "Risk & Safety",
    sections: [
      {
        heading: "Accepted Evidence",
        items: [
          "Bank receipts",
          "Mobile money receipts",
          "SMS confirmations",
          "App screenshots",
          "PDF receipts",
          "Transaction screenshots",
          "Transaction references",
          "Other proof requested by Akara",
        ],
      },
      {
        heading: "Receipt Quality",
        paragraphs: [
          "A good receipt should show the amount, currency, date, time, reference, payment status, sender and receiver details where visible, and the provider.",
        ],
      },
      {
        heading: "Bad or Suspicious Receipts",
        paragraphs: [
          "Akara may reject receipts that are blurry, cropped, edited, mismatched, reused, incomplete, suspicious, or inconsistent with trade details.",
        ],
      },
      {
        heading: "Fake Receipts",
        paragraphs: [
          "Uploading a fake receipt may lead to account restriction, permanent ban, dispute escalation, evidence preservation, and possible reporting where required by law.",
        ],
      },
      {
        heading: "Evidence Review",
        paragraphs: [
          "During review, Akara compares receipts with trade details, payout details, KYC records, chat records, confirmations, and admin notes.",
        ],
      },
    ],
  },
  {
    slug: "data-retention-policy",
    title: "Data Retention Policy",
    shortTitle: "Data Retention",
    description:
      "How long Akara may keep user data — including KYC records, receipts, and chat records — and why.",
    intro:
      "This policy explains how long Akara may keep user data and why.",
    category: "Privacy & Data",
    sections: [
      {
        heading: "Records Akara May Retain",
        items: [
          "Account records",
          "KYC and verification records",
          "Payout details",
          "Listings and trade history",
          "Receipts and dispute evidence",
          "WhatsApp chat records",
          "Support records",
          "Risk review notes and admin decisions",
        ],
      },
      {
        heading: "Retention Periods",
        items: [
          "KYC records: 5 years after account closure or last transaction, unless law requires longer.",
          "Receipts and dispute records: 5 years.",
          "WhatsApp chat records: 2 years, unless linked to disputes, fraud review, legal review, compliance review, or safety concerns.",
        ],
      },
      {
        heading: "Why Records May Be Kept",
        items: [
          "Verifying platform activity",
          "Preventing fraud",
          "Reviewing disputes",
          "Investigating suspicious behaviour",
          "Handling complaints",
          "Legal compliance",
          "User protection",
        ],
      },
      {
        heading: "Deletion and Legal Holds",
        paragraphs: [
          "Records may not be deleted immediately if they are linked to an active dispute, fraud review, legal request, compliance review, or safety investigation. Once the hold ends, normal retention and deletion rules apply.",
        ],
      },
    ],
  },
  {
    slug: "data-deletion-policy",
    title: "Data Deletion Policy",
    shortTitle: "Data Deletion",
    description:
      "How users can request deletion of their Akara data, what can be deleted, and what may be retained.",
    intro:
      "This policy explains how users can request deletion of their Akara data.",
    category: "Privacy & Data",
    sections: [
      {
        heading: "How to Request Deletion",
        paragraphs: [
          "Users can request deletion through WhatsApp or by emailing support@tryakara.com. If the domain email is unavailable, tryakara@gmail.com may be used temporarily.",
        ],
      },
      {
        heading: "Response Time",
        paragraphs: ["Akara aims to respond to deletion requests within 30 days."],
      },
      {
        heading: "What May Be Deleted",
        items: [
          "Eligible profile data",
          "Saved payout details",
          "Marketing preferences",
          "Inactive account data",
          "Non-essential support records",
        ],
      },
      {
        heading: "What May Be Retained",
        paragraphs: [
          "KYC records, receipts, chat records, trade history, dispute records, risk notes, and admin review records may be retained where needed for fraud prevention, dispute review, legal compliance, or platform safety.",
        ],
      },
      {
        heading: "When Deletion May Be Delayed or Refused",
        items: [
          "Active dispute",
          "Fraud review",
          "Legal request",
          "Compliance review",
          "Safety investigation",
        ],
      },
      {
        heading: "Effect of Deletion",
        paragraphs: [
          "Deleting data may close the account or limit the ability to use Akara, since verification records are required for trade actions.",
        ],
      },
    ],
  },
  {
    slug: "whatsapp-opt-in-and-messaging-policy",
    title: "WhatsApp Opt-In and Messaging Policy",
    shortTitle: "WhatsApp Messaging",
    description:
      "How users opt in to receive Akara messages on WhatsApp, and what messages they can expect.",
    intro:
      "Akara is a WhatsApp-first platform. This policy explains how users opt in to receive Akara messages.",
    category: "Core Terms",
    sections: [
      {
        heading: "Official WhatsApp Channel",
        paragraphs: [
          "Akara operates through its official WhatsApp Business number: [Official WhatsApp Number]. Messages from any other number claiming to be Akara should be reported to support.",
        ],
      },
      {
        heading: "How Users Opt In",
        items: [
          "Starting a chat with Akara's official WhatsApp number",
          "Clicking an Akara link that opens the WhatsApp chat",
          "Completing a WhatsApp Flow",
          "Replying AGREE to an opt-in prompt",
        ],
      },
      {
        heading: "Messages Users May Receive",
        items: [
          "Verification messages",
          "Trade updates",
          "Listing notifications",
          "Receipt prompts",
          "Reminders and confirmations",
          "Dispute updates",
          "Account alerts and safety warnings",
          "Support responses",
          "Policy updates",
        ],
      },
      {
        heading: "Marketing Opt-Out",
        paragraphs: [
          "Users may opt out of marketing messages at any time. Opting out of marketing does not stop trade, security, dispute, account, or support messages, which are required to operate the service safely.",
        ],
      },
      {
        heading: "Message Records",
        paragraphs: [
          "Akara may keep WhatsApp message records to operate the service, verify instructions, prevent fraud, review disputes, support users, and protect account safety.",
        ],
      },
    ],
  },
  {
    slug: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    shortTitle: "Acceptable Use",
    description:
      "How users must behave on Akara — acceptable use, conduct rules, unsafe use, and enforcement.",
    intro: "This policy explains how users must behave on Akara.",
    category: "Core Terms",
    sections: [
      {
        heading: "Acceptable Use",
        items: [
          "Verify your identity",
          "Browse offers",
          "Create lawful listings",
          "Open trades with verified users",
          "Share accurate payout details",
          "Upload true receipts",
          "Confirm payments honestly",
          "Raise genuine disputes",
          "View your trade history",
          "Contact support",
        ],
      },
      {
        heading: "User Conduct",
        items: [
          "Use your real identity",
          "Keep account information accurate",
          "Use only your own payout accounts",
          "Confirm payout details before sending money",
          "Upload true, unedited receipts",
          "Communicate respectfully",
          "Complete trades honestly",
          "Cooperate with safety reviews",
        ],
      },
      {
        heading: "Unsafe Use",
        paragraphs: ["The following are not allowed on Akara:"],
        items: [
          "Fake or edited receipts",
          "Impersonation",
          "Using someone else's payout account",
          "Misleading listings",
          "Harassment or pressure tactics",
          "Bypassing Akara's flow or safety checks",
          "Splitting trades to avoid limits",
          "Any unlawful activity",
        ],
      },
      {
        heading: "Trading Outside Akara",
        paragraphs: [
          "After opening a trade, users must not move the trade outside Akara to avoid records, safety checks, receipts, dispute review, or platform rules. Trades completed outside Akara's flow cannot be supported in dispute review.",
        ],
      },
      {
        heading: "Enforcement",
        paragraphs: [
          "Violations may lead to account restriction, trade pauses, listing removal, admin review, permanent ban, and evidence preservation.",
        ],
      },
    ],
  },
  {
    slug: "prohibited-transactions-policy",
    title: "Prohibited Transactions Policy",
    shortTitle: "Prohibited Transactions",
    description:
      "The transactions and platform behaviour that Akara must never be used for, and how violations are enforced.",
    intro: "This policy explains what Akara must not be used for.",
    category: "Risk & Safety",
    sections: [
      {
        heading: "Prohibited Transactions",
        paragraphs: [
          "Akara must not be used to coordinate any exchange connected to:",
        ],
        items: [
          "Fraud or scams",
          "Stolen funds",
          "Identity theft",
          "Fake receipts",
          "Money laundering",
          "Terrorist financing",
          "Sanctions evasion",
          "Illegal goods or services",
          "Bribery or corruption",
          "Unlawful gambling",
          "Ponzi or pyramid schemes",
          "Blackmail, extortion, or ransom payments",
          "Exploitation of any kind",
          "Any transaction prohibited by law",
        ],
      },
      {
        heading: "Prohibited Platform Behaviour",
        items: [
          "Creating false listings",
          "Using another person's identity",
          "Using another person's payout account",
          "Splitting trades to avoid limits",
          "Hiding the purpose of a trade",
          "Pressuring users to pay outside Akara",
          "Continuing a trade outside Akara after opening it",
        ],
      },
      {
        heading: "Review and Enforcement",
        paragraphs: [
          "Akara reviews unsafe, suspicious, unlawful, or abusive activity. Akara may restrict accounts, pause trades, remove listings, require admin review, permanently ban users, preserve evidence, and report activity where required by law.",
        ],
      },
    ],
  },
  {
    slug: "support-and-complaints-policy",
    title: "Support and Complaints Policy",
    shortTitle: "Support & Complaints",
    description:
      "How to contact Akara for help, complaints, disputes, and safety concerns — channels, hours, and response times.",
    intro:
      "This policy explains how users can contact Akara for help, complaints, disputes, and safety concerns.",
    category: "Support",
    sections: [
      {
        heading: "Support Channels",
        paragraphs: [
          "Users can reach Akara through the official WhatsApp Business number, support@tryakara.com, and channels listed on https://tryakara.com. If the domain email is not active, tryakara@gmail.com may be used temporarily.",
        ],
      },
      {
        heading: "Complaints Email",
        paragraphs: [
          "Formal complaints can be sent to complaints@tryakara.com.",
        ],
      },
      {
        heading: "Support Hours",
        paragraphs: ["Monday to Saturday, 9:00 AM to 6:00 PM WAT/CAT."],
      },
      {
        heading: "Response Time",
        paragraphs: [
          "Akara aims to respond within 24 to 72 hours. Complex reviews may take longer.",
        ],
      },
      {
        heading: "What Support Can Help With",
        items: [
          "Account access",
          "Verification",
          "Payout details",
          "Listings",
          "Trade status",
          "Receipt upload",
          "Disputes",
          "Complaints",
          "Safety concerns",
          "Platform guidance",
        ],
      },
      {
        heading: "What to Include",
        items: [
          "Your registered WhatsApp number",
          "Trade reference code",
          "Currency pair",
          "Amount",
          "Receipt or screenshot if relevant",
          "A clear description of the issue",
        ],
      },
      {
        heading: "Complaints and Escalation",
        paragraphs: [
          "Akara may review complaints, request more information, and check KYC records, receipts, payout details, trade history, and chat records. Serious cases may be escalated to an admin or compliance reviewer.",
        ],
      },
    ],
  },
];

export function getLegalDoc(slug: string): LegalDoc | undefined {
  return LEGAL_DOCS.find((doc) => doc.slug === slug);
}

export const LEGAL_CATEGORIES: LegalCategory[] = [
  "Core Terms",
  "Risk & Safety",
  "Privacy & Data",
  "Support",
];
