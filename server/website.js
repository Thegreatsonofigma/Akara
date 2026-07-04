const path = require("node:path");
const { serveFile } = require("./lib/http");

const SITE_ROOT = path.join(__dirname, "assets", "site");
const CARD_ROOT = path.join(__dirname, "assets", "cards");
const FONT_ROOT = path.join(__dirname, "assets", "fonts");

const site = {
  name: "Akara",
  legalName: "Akara Fintech Solutions",
  registrationNumber: "BN 9656395",
  entityType: "Business Name",
  businessType: "Sole Proprietor",
  country: "Nigeria",
  registeredAt: "July 4, 2026",
  status: "Active",
  address: "No. 19, Afam Emma Chukwura Lane, Bonsaac, Asaba, Delta State, Nigeria",
  supportEmail: "support@tryakara.com",
  fallbackEmail: "tryakara@gmail.com",
  complaintsEmail: "complaints@tryakara.com",
  url: "https://tryakara.com",
  law: "Nigeria, with applicable local laws in supported user countries where required",
};

const noCustodyNotice =
  "Akara does not hold, receive, escrow, custody, remit, convert, or move user funds. Users send money directly to each other through their own bank or mobile money accounts. Always confirm payout details before sending money.";

const mandatoryRegulatoryWording =
  "Akara Fintech Solutions is registered in Nigeria as a business name under BN 9656395. Akara provides software tools that help verified users discover, list, coordinate, and track peer-to-peer currency exchange arrangements. Akara is not currently licensed as a bank, remittance company, bureau de change, wallet, escrow provider, payment processor, or money transfer operator.";

const sharedLegalNotice =
  "Akara does not hold, receive, escrow, custody, remit, convert, or move user funds. Users send money directly to each other through their own bank or mobile money accounts. Users must confirm payout details before sending money. KYC data, receipts, and WhatsApp chat records may be used for fraud prevention and dispute review. Akara may pause trades, restrict accounts, suspend listings, require admin review, or block users where needed for safety.";

const currencies = [
  ["NGN", "Nigeria"],
  ["RWF", "Rwanda"],
  ["GHS", "Ghana"],
  ["KES", "Kenya"],
  ["XAF", "Cameroon"],
];

const legalPages = [
  {
    slug: "privacy-policy",
    title: "Privacy Policy",
    intro: "This Privacy Policy explains how Akara collects, uses, stores, shares, and protects user information.",
    sections: [
      ["Information We Collect", "Akara may collect legal name, WhatsApp number, nationality, residence, ID issuing country, ID type, ID number, ID document image, selfie or liveness image, payout details, listings, trade records, receipts, dispute evidence, support messages, WhatsApp chat records, timestamps, verification results, opt-in records, risk flags, admin notes, and complaint records."],
      ["Why We Use Your Information", "We use information for account creation, identity verification, payout name matching, listing and trade flows, receipt review, reminders, dispute resolution, fraud monitoring, platform records, and support."],
      ["Sharing Information", "We may share information with identity verification providers, WhatsApp Business Platform providers, cloud providers, fraud review tools, admin reviewers, legal advisers, or authorities where required by law."],
      ["Your Rights", "You may request access, correction, restriction, or deletion by contacting support@tryakara.com. If the domain email is unavailable, use tryakara@gmail.com temporarily."],
      ["Retention", "Some records may be retained for fraud prevention, dispute review, legal compliance, and platform safety."],
    ],
  },
  {
    slug: "terms-of-service",
    title: "Terms of Service",
    intro: "These Terms explain how users may access and use Akara.",
    sections: [
      ["What Akara Does", "Akara provides software tools for verified users to discover, list, coordinate, and track peer-to-peer exchange arrangements."],
      ["What Akara Does Not Do", mandatoryRegulatoryWording],
      ["Eligibility", "Users must be 18 or older. Akara supports individual users only at launch. Users outside Africa may use Akara only if they are verified and transacting within supported currency corridors."],
      ["Verification Requirement", "Users may browse basic information, but must be verified before creating listings, opening trades, adding payout accounts, or completing exchanges."],
      ["User Responsibilities", "Users must provide accurate information, use their own payout account, confirm payout details, upload true receipts, avoid bypassing Akara, and cooperate with safety reviews."],
      ["Trade Rules", "A trade expires after 15 minutes. After payment is marked sent, the user cannot cancel and must raise a dispute if something is wrong."],
      ["Fees", "Akara is free during the launch period. Fees may apply later and will be shown clearly before a user opens or completes a trade."],
      ["Safety Action", "Akara may restrict accounts, pause trades, suspend listings, require admin review, or ban users for confirmed misuse."],
    ],
  },
  {
    slug: "no-custody-risk-disclosure",
    title: "No-Custody Risk Disclosure",
    intro: "This disclosure explains Akara’s no-custody model and the risks users must understand.",
    sections: [
      ["Akara Does Not Hold Funds", noCustodyNotice],
      ["What This Means", "Akara cannot stop a payment after it is sent, force a reversal, guarantee a refund, or make a bank or mobile money provider return funds."],
      ["Your Responsibility Before Sending Money", "Confirm payout name, account or mobile money number, currency, amount, reference code, and trade status before sending money."],
      ["Fraud and Dispute Review", "Akara may review KYC data, receipts, payout details, chat records, risk notes, and admin notes when fraud or disputes are reported."],
      ["Important Warning", "If you send money to wrong details, outside Akara’s flow, or after expiry, recovery may not be possible."],
    ],
  },
  {
    slug: "kyc-and-identity-verification-consent",
    title: "KYC and Identity Verification Consent",
    intro: "Akara requires identity verification before users can create listings, open trades, add payout accounts, or complete exchanges.",
    sections: [
      ["Verification Information We Collect", "Akara may collect legal name, WhatsApp number, nationality, residence, ID country, ID type, ID number, document image, selfie or liveness image, face match result, and payout account name."],
      ["Accepted Documents", "Akara may accept national ID, passport, driver’s licence, residence permit, or other government-issued ID accepted by Akara."],
      ["Third-Party Verification", "Akara may use a third-party KYC provider such as Didit to support document checks, face matching, and liveness review."],
      ["Your Consent", "By using Akara, you consent to collection, checking, storage, and use of verification data for account approval, fraud prevention, dispute review, safety checks, and compliance."],
      ["Verification Outcomes", "A verification may be approved, rejected, restricted, sent to admin review, appealed, or require additional information."],
      ["Reverification", "Akara may require reverification after payout detail changes, especially where a payout name changes or does not clearly match the verified legal name."],
    ],
  },
  {
    slug: "payout-details-and-account-name-match-policy",
    title: "Payout Details and Account Name-Match Policy",
    intro: "This policy explains how Akara handles bank and mobile money payout details.",
    sections: [
      ["Payout Details We May Collect", "Akara may collect NGN bank details and RWF, GHS, KES, and XAF mobile money or supported payout details depending on country and network."],
      ["Name-Match Rule", "The payout name must strictly match the verified legal name. Minor spelling differences may go to admin review. Someone else’s payout account is not allowed at launch."],
      ["Saved Payout Accounts", "Users may save up to 2 payout accounts per currency at launch."],
      ["Editing Payout Details", "A 6-digit passcode is required for payout edits. Selfie or admin review may be required for risky changes."],
      ["User Responsibility", "Users must confirm payout details before sending money."],
      ["Safety Action", "Akara may reject payout details, pause trades, restrict accounts, require admin review, or block users."],
    ],
  },
  {
    slug: "aml-and-fraud-prevention-policy",
    title: "AML and Fraud Prevention Policy",
    intro: "Akara uses fraud prevention and anti-abuse controls to help keep peer-to-peer exchange coordination safer.",
    sections: [
      ["Akara’s Role", "Akara provides software tools only. It is not a licensed bank, payment provider, remittance company, wallet provider, or escrow provider."],
      ["What Akara Reviews", "Akara may review fake receipts, abandoned trades, repeated cancellations, mismatched payout names, duplicate listings, high-value activity, bypass attempts, fraud reports, abusive behaviour, and users receiving money without fulfilling their side."],
      ["User Responsibilities", "Users must use a real identity, provide accurate information, use their own payout account, confirm details, upload true receipts, and avoid unlawful or deceptive activity."],
      ["Safety Actions", "Akara may restrict accounts, pause trades, remove listings, reduce limits, request evidence, block users, preserve records, or report where required by law."],
      ["Use of Records", "Akara may use KYC records, receipts, payout details, trade history, risk notes, and chats to support review."],
    ],
  },
  {
    slug: "user-verification-tier-and-transaction-limit-policy",
    title: "User Verification Tier and Transaction Limit Policy",
    intro: "This policy explains how Akara may use verification tiers and transaction limits to manage platform safety.",
    sections: [
      ["Why Akara Uses Tiers", "Tiers support fraud prevention, user protection, abuse reduction, and risk management."],
      ["Example Tier Structure", "Tier 1 supports low-value trades only. Tier 2 supports medium limits after stronger verification. Tier 3 supports higher limits after admin-approved KYC."],
      ["Minimum Trade Amounts", "NGN: 1,000. RWF: 1,000. KES: 100. GHS: 10. XAF: 1,000."],
      ["Limit Reviews", "Akara may increase, reduce, freeze, or review limits based on verification, history, disputes, receipt quality, payout name match, suspicious activity, country risk, or compliance concerns."],
      ["User Responsibility", "Users must confirm payout details and must not split trades to avoid limits."],
    ],
  },
  {
    slug: "dispute-resolution-policy",
    title: "Dispute Resolution Policy",
    intro: "This policy explains how Akara handles disputes between users.",
    sections: [
      ["When You Can Raise a Dispute", "You may raise a dispute if you sent money and did not receive value, received money but the other user claims otherwise, saw a fake or unclear receipt, found mismatched payout details, experienced an abandoned trade, or suspect fraud."],
      ["Timing", "Raise disputes within 24 hours of opening or completing a trade, or immediately if payment was sent and value was not received."],
      ["Evidence You May Need", "You may need a bank receipt, mobile money receipt, SMS, app screenshot, PDF receipt, transaction screenshot, reference, trade code, amount, date, time, or WhatsApp chat."],
      ["Review Process", "Akara may pause the trade, request evidence, review KYC, receipts, payout details, chats, restrict accounts during review, and assign an admin or compliance reviewer."],
      ["Response Time", "Akara aims to respond within 24 to 72 hours. Complex cases may take longer."],
      ["Decision", "An admin or compliance reviewer may resolve, reject, close, or escalate a dispute. Akara may close a trade without both confirmations only after admin review and clear evidence."],
      ["No Guarantee", "Akara cannot guarantee refund, reversal, or recovery."],
    ],
  },
  {
    slug: "cancellation-refund-and-reversal-policy",
    title: "Cancellation, Refund, and Reversal Policy",
    intro: "This policy explains how cancellations, refunds, and reversals work on Akara.",
    sections: [
      ["Cancelling a Trade", "Cancellation may be possible before payment is sent, if both users agree, if a trade expires after 15 minutes, if it is abandoned, or if Akara pauses or closes it for safety."],
      ["After Payment Is Marked Sent", "After payment is marked sent, the user cannot cancel and must raise a dispute."],
      ["Refunds", "Refunds are handled directly between users, banks, or mobile money providers."],
      ["Reversals", "Users should contact their bank or mobile money provider. Akara may help prepare evidence subject to privacy, legal, and safety checks."],
      ["No Compensation by Default", "Akara does not compensate users from its own funds unless it separately chooses to do so in writing."],
    ],
  },
  {
    slug: "receipt-upload-and-evidence-policy",
    title: "Receipt Upload and Evidence Policy",
    intro: "This policy explains how payment receipts and evidence are handled on Akara.",
    sections: [
      ["Accepted Evidence", "Akara may accept bank receipts, mobile money receipts, SMS confirmations, app screenshots, PDF receipts, transaction screenshots, transaction references, and other requested proof."],
      ["Receipt Quality", "Receipts should show amount, currency, date, time, reference, payment status, sender or receiver details where visible, and provider."],
      ["Bad or Suspicious Receipts", "Akara may reject blurry, cropped, edited, mismatched, reused, incomplete, suspicious, or inconsistent receipts."],
      ["Fake Receipts", "Fake receipts may lead to restriction, permanent ban, dispute escalation, evidence preservation, and possible reporting where required."],
      ["Evidence Review", "Akara may compare receipts with trade details, payout details, KYC, chats, confirmations, and admin notes."],
    ],
  },
  {
    slug: "data-retention-policy",
    title: "Data Retention Policy",
    intro: "This policy explains how long Akara may keep user data and why.",
    sections: [
      ["Records Akara May Retain", "Akara may retain account records, KYC, payout details, listings, trade history, receipts, dispute evidence, WhatsApp chats, support records, risk review notes, and admin decisions."],
      ["Retention Periods", "KYC records may be retained for 5 years after account closure or last transaction unless law requires longer. Receipts and dispute records may be retained for 5 years. WhatsApp chat records may be retained for 2 years unless linked to disputes, fraud, legal review, compliance review, or safety concerns."],
      ["Why Records May Be Kept", "Records may be kept to verify activity, prevent fraud, review disputes, investigate suspicious behaviour, handle complaints, meet legal obligations, and protect users."],
      ["Deletion and Legal Holds", "Records may not be deleted immediately if linked to an active dispute, fraud review, legal request, compliance review, or safety investigation."],
    ],
  },
  {
    slug: "data-deletion-policy",
    title: "Data Deletion Policy",
    intro: "This policy explains how users can request deletion of their Akara data.",
    sections: [
      ["How to Request Deletion", "Request deletion through WhatsApp or support@tryakara.com. If unavailable, use tryakara@gmail.com temporarily."],
      ["Response Time", "Akara aims to respond within 30 days."],
      ["What May Be Deleted", "Eligible profile data, saved payout details, marketing preferences, inactive account data, and non-essential support records may be deleted."],
      ["What May Be Retained", "KYC, receipts, chats, trade history, dispute records, risk notes, and admin review records may be retained where needed."],
      ["When Deletion May Be Delayed or Refused", "Deletion may be delayed or refused during an active dispute, fraud review, legal request, compliance review, or safety investigation."],
      ["Effect of Deletion", "Deletion may close the account or limit the ability to use Akara."],
    ],
  },
  {
    slug: "whatsapp-opt-in-and-messaging-policy",
    title: "WhatsApp Opt-In and Messaging Policy",
    intro: "Akara is a WhatsApp-first platform. This policy explains how users opt in to receive Akara messages.",
    sections: [
      ["Official WhatsApp Channel", "Use Akara’s approved WhatsApp Business number once final. Until then, use the official number shown on tryakara.com."],
      ["How Users Opt In", "Users opt in by starting a chat, clicking an Akara link, completing a WhatsApp Flow, or replying AGREE."],
      ["Messages Users May Receive", "Users may receive verification, trade updates, listing notifications, receipt prompts, reminders, confirmations, dispute updates, account alerts, safety warnings, support, and policy updates."],
      ["Marketing Opt-Out", "Users may opt out of marketing but still receive trade, security, dispute, account, and support messages."],
      ["Message Records", "Akara may keep WhatsApp records to operate the service, verify instructions, prevent fraud, review disputes, support users, and protect account safety."],
    ],
  },
  {
    slug: "acceptable-use-policy",
    title: "Acceptable Use Policy",
    intro: "This policy explains how users must behave on Akara.",
    sections: [
      ["Acceptable Use", "Users may verify identity, browse offers, create lawful listings, open trades with verified users, share accurate payout details, upload receipts, confirm payments, raise genuine disputes, view history, and contact support."],
      ["User Conduct", "Users must use a real identity, accurate information, their own payout accounts, confirmed details, true receipts, respectful communication, honest completion, and cooperate with reviews."],
      ["Unsafe Use", "Users must not use fake receipts, impersonation, someone else’s payout account, misleading listings, harassment, pressure, bypassing, splitting trades to avoid limits, or unlawful activity."],
      ["Trading Outside Akara", "After opening a trade, users must not move the trade outside Akara to avoid records, safety checks, receipts, dispute review, or rules."],
      ["Enforcement", "Akara may restrict accounts, pause trades, remove listings, require admin review, permanently ban users, or preserve evidence."],
    ],
  },
  {
    slug: "prohibited-transactions-policy",
    title: "Prohibited Transactions Policy",
    intro: "This policy explains what Akara must not be used for.",
    sections: [
      ["Prohibited Transactions", "Akara must not be used for fraud, scams, stolen funds, identity theft, fake receipts, money laundering, terrorist financing, sanctions evasion, illegal goods or services, bribery, corruption, unlawful gambling, Ponzi schemes, pyramid schemes, blackmail, extortion, ransom payments, exploitation, or any transaction prohibited by law."],
      ["Prohibited Platform Behaviour", "Users must not create false listings, use another person’s identity, use another person’s payout account, split trades to avoid limits, hide trade purpose, pressure users to pay outside Akara, or continue a trade outside Akara after opening it."],
      ["Review and Enforcement", "Akara may review unsafe, suspicious, unlawful, or abusive activity. Akara may restrict accounts, pause trades, remove listings, require admin review, permanently ban users, preserve evidence, or report where required."],
    ],
  },
  {
    slug: "support-and-complaints-policy",
    title: "Support and Complaints Policy",
    intro: "This policy explains how users can contact Akara for help, complaints, disputes, and safety concerns.",
    sections: [
      ["Support Channels", "Users may contact Akara through the official WhatsApp Business number, support@tryakara.com, and channels listed on https://tryakara.com. If domain email is not active, use tryakara@gmail.com temporarily."],
      ["Complaints Email", "Complaints may be sent to complaints@tryakara.com."],
      ["Support Hours", "Support is available Monday to Saturday, 9:00 AM to 6:00 PM WAT/CAT."],
      ["Response Time", "Akara aims to respond within 24 to 72 hours. Complex reviews may take longer."],
      ["What Support Can Help With", "Support may help with account access, verification, payout details, listings, trade status, receipt upload, disputes, complaints, safety concerns, and platform guidance."],
      ["What to Include", "Include registered WhatsApp number, trade reference code, currency pair, amount, receipt or screenshot if relevant, and a clear issue."],
      ["Complaints and Escalation", "Akara may review complaints, request more information, check KYC, receipts, payout details, trade history, chats, and escalate to an admin or compliance reviewer."],
    ],
  },
];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugToLegal(slug) {
  return legalPages.find((page) => page.slug === slug);
}

function assetPath(file) {
  if (file.includes("..")) return "";
  return `/site-assets/${file}`;
}

function cardAsset(file) {
  if (file.includes("..")) return "";
  return `/card-assets/${file}`;
}

function nav(currentPath) {
  const items = [
    ["/product", "Product"],
    ["/how-it-works", "How it works"],
    ["/trust", "Safety"],
    ["/currencies", "Currencies"],
    ["/legal", "Legal"],
    ["/support", "Support"],
  ];
  const links = items
    .map(([href, label]) => `<a href="${href}" ${currentPath === href ? "aria-current=\"page\"" : ""}>${label}</a>`)
    .join("");
  return `
    <header class="site-nav" data-nav>
      <a class="brand" href="/" aria-label="Akara home">
        <img src="${cardAsset("akara-logo-mark.png")}" alt="" />
        <span>Akara</span>
      </a>
      <nav class="nav-links" aria-label="Primary">${links}</nav>
      <div class="nav-actions">
        <a class="button button-small button-primary" href="https://wa.me/" aria-label="Start a swap on WhatsApp">${icon("whatsapp")}Start a swap</a>
        <button class="menu-toggle" data-menu-toggle aria-label="Open menu" aria-expanded="false">Menu</button>
      </div>
    </header>
  `;
}

function footerLegalGroups() {
  const groups = [
    ["Core", ["terms-of-service", "privacy-policy", "acceptable-use-policy", "whatsapp-opt-in-and-messaging-policy"]],
    ["Trading", ["no-custody-risk-disclosure", "dispute-resolution-policy", "cancellation-refund-and-reversal-policy", "receipt-upload-and-evidence-policy"]],
    ["Account", ["kyc-and-identity-verification-consent", "payout-details-and-account-name-match-policy", "user-verification-tier-and-transaction-limit-policy", "data-deletion-policy"]],
  ];
  return groups.map(([label, slugs]) => `
    <div>
      <h4>${label}</h4>
      ${slugs.map((slug) => {
        const page = slugToLegal(slug);
        return page ? `<a href="/legal/${page.slug}">${esc(page.title.replace(" Policy", "").replace(" and ", " + "))}</a>` : "";
      }).join("")}
    </div>
  `).join("");
}

function footer() {
  return `
    <footer class="footer">
      <div class="footer-hero">
        <span>AKARA</span>
        <p>A cleaner way to swap from chat.</p>
      </div>
      <div class="footer-grid">
        <div class="footer-about">
          <a class="brand footer-brand" href="/">
            <img src="${cardAsset("akara-logo-mark.png")}" alt="" />
            <span>Akara</span>
          </a>
          <p>${esc(site.legalName)}, ${esc(site.registrationNumber)}.</p>
          <p>Headquarters: Nigeria and Rwanda.</p>
          <p class="fineprint">Akara coordinates the record. Users send money directly through their own bank or mobile money accounts.</p>
        </div>
        <div>
          <h3>Product</h3>
          <a href="/product">Product</a>
          <a href="/how-it-works">How it works</a>
          <a href="/trust">Trust and safety</a>
          <a href="/currencies">Currencies</a>
          <a href="/support">Support</a>
        </div>
        <div class="footer-legal">
          <h3>Legal</h3>
          <div class="footer-legal-grid">${footerLegalGroups()}</div>
        </div>
        <div>
          <h3>Contact</h3>
          <a href="mailto:${site.supportEmail}">${site.supportEmail}</a>
          <a href="mailto:${site.complaintsEmail}">${site.complaintsEmail}</a>
          <a href="https://wa.me/">WhatsApp support</a>
        </div>
      </div>
    </footer>
  `;
}

function layout({ path: currentPath = "/", title, description, body, legal = false }) {
  const pageTitle = title ? `${title} | Akara` : "Akara | Peer-to-peer currency exchange coordination on WhatsApp";
  const metaDescription =
    description ||
    "Akara helps verified users discover, coordinate, and track peer-to-peer currency exchange arrangements across African currencies. Akara does not hold or move user funds.";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(metaDescription)}" />
  <meta property="og:title" content="${esc(pageTitle)}" />
  <meta property="og:description" content="${esc(metaDescription)}" />
  <meta property="og:url" content="${site.url}${currentPath}" />
  <meta property="og:site_name" content="Akara" />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="en" />
  <link rel="canonical" href="${site.url}${currentPath}" />
  <link rel="stylesheet" href="${assetPath("styles.css")}" />
</head>
<body class="${legal ? "legal-body" : ""}">
  <a class="skip-link" href="#main">Skip to content</a>
  ${nav(currentPath)}
  <main id="main">${body}</main>
  ${footer()}
  <script src="${assetPath("app.js")}" defer></script>
</body>
</html>`;
}

function badge(text) {
  return `<span class="badge"><span></span>${esc(text)}</span>`;
}

function icon(name) {
  const paths = {
    verify: '<path d="M9 12.2 11.1 14.3 15.5 9.6"/><path d="M12 2.8 4.2 6.1v5.8c0 4.3 3 7.7 7.8 9.3 4.8-1.6 7.8-5 7.8-9.3V6.1L12 2.8Z"/>',
    list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3.5 6h.01"/><path d="M3.5 12h.01"/><path d="M3.5 18h.01"/>',
    trade: '<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/><path d="M18 7l-4 4"/><path d="M6 17l4-4"/>',
    receipt: '<path d="M7 3h10v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L5 21V5a2 2 0 0 1 2-2Z"/><path d="M8.5 8h7"/><path d="M8.5 12h7"/><path d="M8.5 16h4"/>',
    dispute: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 8v5"/><path d="M12 17h.01"/><path d="M17 3v5h5"/>',
    chat: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6A3.5 3.5 0 0 1 16.5 15H10l-5 5v-5.8A3.5 3.5 0 0 1 4 11.5v-6Z"/>',
    whatsapp: '<path d="M19.7 4.4A9.6 9.6 0 0 0 4.6 16l-1.1 4.1 4.2-1.1A9.6 9.6 0 0 0 21.6 10a9.5 9.5 0 0 0-1.9-5.6Z"/><path d="M8.6 7.7c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.7 1.7c.1.2.1.4 0 .6l-.4.5c-.1.2-.1.3 0 .5.4.8 1.2 1.6 2.1 2 .2.1.4.1.5-.1l.6-.7c.2-.2.4-.2.6-.1l1.7.8c.3.1.4.3.4.6 0 .7-.5 1.4-1.2 1.6-.7.2-1.6 0-2.8-.6-1.5-.7-2.7-1.9-3.5-3.4-.6-1.1-.9-2.2-.6-2.9Z"/>',
  };
  return `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.chat}</svg>`;
}

function currencyChips() {
  return currencies.map(([code, country]) => `<span class="currency-chip"><b>${code}</b><small>${country}</small></span>`).join("");
}

function listingShot() {
  return `
    <div class="listing-shot" aria-hidden="true">
      <div class="listing-shot-top">Swap <b>with me on Akara</b></div>
      <div class="listing-shot-main">
        <strong>50,000</strong>
        <span>x</span>
        <strong>55,000</strong>
      </div>
      <div class="listing-shot-pills">
        <span>I have <b>NGN</b></span>
        <span>I need <b>RWF</b></span>
      </div>
      <div class="listing-shot-foot">Open AKR-LIST-028</div>
    </div>
  `;
}

function productMockup() {
  return `
    <div class="product-stage" aria-label="Akara WhatsApp trade flow preview">
      <div class="phone-shell">
        <div class="phone-top"><span></span><b>Akara</b><small>WhatsApp</small></div>
        <div class="chat-bubble incoming">Hi Divine. Tell Akara what you want to swap.</div>
        <div class="chat-bubble outgoing">I have 50k NGN and need RWF</div>
        <div class="chat-card">
          <strong>AKR-LIST-028</strong>
          <div class="swap-row"><span>You send</span><b>50,000 NGN</b></div>
          <div class="swap-row"><span>You receive</span><b>55,000 RWF</b></div>
          <div class="status-line"><i></i> Fixed rate. Payout name matched.</div>
        </div>
        <div class="chat-bubble outgoing">Paid. Receipt uploaded.</div>
        <div class="chat-action"><span></span>Click to Select</div>
        <div class="chat-card receipt-card">
          <strong>Receipt received</strong>
          <p>Waiting for the other party to confirm.</p>
        </div>
      </div>
      <div class="floating-card listing-preview">
        ${listingShot()}
        <div>
          <p>Shareable listing cards</p>
          <strong>Open trades from any chat</strong>
        </div>
      </div>
      <div class="floating-card tracker-preview">
        <span class="live-dot"></span>
        <p>15 min payment window</p>
        <strong>Every step recorded</strong>
      </div>
    </div>
  `;
}

function commandStrip() {
  return `
    <div class="command-strip" aria-label="Natural Akara chat examples">
      ${[
        "Show me RWF offers",
        "I have 50k naira and need francs",
        "Open AKR-LIST-028",
        "Paid, receipt attached",
      ].map((item) => `<span>${esc(item)}</span>`).join("")}
    </div>
  `;
}

function personaCards() {
  const people = [
    ["student", "International students", "Rent, food, fees, and weekend money without hunting through old group chats."],
    ["traveller", "Frequent travellers", "Find a cleaner route before the next border, flight, or work trip."],
    ["freelancer", "Remote earners", "Move between invoices, family support, and local spending with a better record."],
    ["community", "Community groups", "Share one listing card. Keep the trade itself inside Akara."],
  ];
  return people.map(([tone, titleText, text]) => `
    <article class="persona-card ${tone}">
      <div class="persona-photo" aria-hidden="true">
        <span></span><i></i><b></b>
      </div>
      <div>
        <h3>${titleText}</h3>
        <p>${text}</p>
      </div>
    </article>
  `).join("");
}

function homePage() {
  const body = `
    <section class="hero">
      <div class="hero-glow"></div>
      <div class="container hero-grid">
        <div class="hero-copy reveal">
          <p class="eyebrow">Akara, ${site.registrationNumber}</p>
          <h1><span>The currency desk</span><span>inside WhatsApp.</span></h1>
          <p class="hero-lede">List, find, open, and track peer-to-peer currency swaps by texting Akara.</p>
          <div class="hero-actions">
            <a class="button button-primary" href="https://wa.me/">${icon("whatsapp")}Try Akara on WhatsApp</a>
            <a class="button button-secondary" href="#how">See the flow</a>
          </div>
          ${commandStrip()}
          <div class="badge-row">${["No custody", "Verified users", "Receipt trail", "5 launch currencies"].map(badge).join("")}</div>
        </div>
        ${productMockup()}
      </div>
    </section>

    <section class="proof-band">
      <div class="container proof-band-inner">
        <span>Built for campus groups</span>
        <span>Expat communities</span>
        <span>Frequent travellers</span>
        <span>Remote earners</span>
        <span>Family support</span>
      </div>
    </section>

    <section class="section visual-proof">
      <div class="container">
        <div class="section-header">
          <p class="eyebrow">Why it clicks</p>
          <h2>People already swap in chat. Akara gives the chat a system.</h2>
        </div>
        <div class="bento-grid">
          <article class="bento-card bento-large">
            <div class="mini-phone">
              <div class="mini-bubble incoming">Show me RWF offers</div>
              <div class="mini-offer">
                <b>AKR-LIST-016</b>
                <span>Send 50,000 NGN</span>
                <strong>Receive 55,000 RWF</strong>
              </div>
              <div class="mini-action">Open trade</div>
            </div>
            <div>
              <span class="bento-icon">${icon("chat")}</span>
              <h3>Type what you mean.</h3>
              <p>Akara reads intent and routes it to offers, listings, trades, receipts, or history.</p>
            </div>
          </article>
          ${[
            ["verify", "Verified first", "KYC and payout names before serious actions."],
            ["list", "Share the rate", "Post a card people can open from their own chat."],
            ["receipt", "Proof attached", "Receipts stay with the exact trade."],
            ["dispute", "Review ready", "Evidence and status stay clear for admins."],
          ].map(([name, title, text]) => `
            <article class="bento-card">
              <span class="bento-icon">${icon(name)}</span>
              <h3>${title}</h3>
              <p>${text}</p>
            </article>
          `).join("")}
        </div>
      </div>
    </section>

    <section class="section no-custody-section" id="how">
      <div class="container split">
        <div>
          <p class="eyebrow">How it works</p>
          <h2>A cleaner flow for peer-to-peer exchange.</h2>
          <p>Akara keeps the trail clean while users pay each other directly through their own bank or mobile money accounts.</p>
          <div class="notice-card">No wallet. No escrow. No custody. Just verified coordination and a better record.</div>
        </div>
        <div class="flow-diagram" aria-label="No custody exchange diagram">
          <div class="flow-user">User A<br><small>Bank or mobile money</small></div>
          <div class="flow-layer">
            <span>Verify</span><span>List</span><span>Open</span><span>Receipt</span><span>Confirm</span>
          </div>
          <div class="flow-user">User B<br><small>Bank or mobile money</small></div>
          <div class="direct-line">direct payment between users</div>
        </div>
      </div>
      <div class="container steps-grid">
        ${[
          ["verify", "Verify", "Identity and payout name checks."],
          ["list", "Find", "Browse live peer listings."],
          ["trade", "Open", "Reveal payout details."],
          ["receipt", "Confirm", "Upload receipts and close safely."],
        ].map(([name, title, text]) => `
          <article class="step-card">
            <span>${icon(name)}</span>
            <h3>${title}</h3>
            <p>${text}</p>
          </article>
        `).join("")}
      </div>
    </section>

    <section class="section" id="currencies">
      <div class="container corridor-section">
        <div class="section-header">
          <p class="eyebrow">Currencies</p>
          <h2>Made for African corridors.</h2>
          <p>Launch support covers the currencies people already ask for in real WhatsApp groups.</p>
        </div>
        <div class="currency-board">${currencyChips()}</div>
        <div class="example-listing">
          <div>
            <small>Example listing</small>
            <strong>100,000 NGN</strong>
          </div>
          <span>for</span>
          <div>
            <small>Peer requested</small>
            <strong>115,000 RWF</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="section trust-strip">
      <div class="container trust-grid">
        <article>
          <span class="bento-icon">${icon("verify")}</span>
          <h2>Verification before trades.</h2>
          <p>Users verify before creating listings, opening trades, adding payout accounts, or completing exchanges.</p>
          <ul class="check-list">
            <li>Legal name</li>
            <li>ID and selfie/liveness</li>
            <li>Payout name match</li>
          </ul>
        </article>
        <article>
          <span class="bento-icon">${icon("receipt")}</span>
          <h2>Receipts stay with the trade.</h2>
          <p>The evidence trail stays attached to the exchange, so users and admins can review what happened.</p>
          <ol class="timeline">
            <li>Payment marked sent</li>
            <li>Receipt uploaded</li>
            <li>Waiting for confirmation</li>
          </ol>
        </article>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section-header">
          <p class="eyebrow">Safety controls</p>
          <h2>Small controls. Big difference.</h2>
        </div>
        <div class="safety-grid">
          ${[
            ["receipt", "Fake receipt review"],
            ["verify", "Payout mismatch checks"],
            ["trade", "Duplicate listing guards"],
            ["dispute", "Dispute review"],
          ].map(([name, item]) => `
            <div class="safety-card">${icon(name)}${item}</div>
          `).join("")}
        </div>
      </div>
    </section>

    <section class="section audience-section">
      <div class="container">
        <div class="section-header">
          <p class="eyebrow">Built for</p>
          <h2>For people who live between currencies.</h2>
          <p>Students, travellers, expats, freelancers, families, and communities who need exchange to feel less improvised.</p>
        </div>
        <div class="persona-grid">${personaCards()}</div>
      </div>
    </section>

    ${faqSection()}

    <section class="section final-cta">
      <div class="container final-panel">
        <p class="eyebrow">Start cleaner</p>
        <h2>Bring the swap back into one clean thread.</h2>
        <p>Chat, list, pay directly, upload receipts, and close with a record.</p>
        <div class="hero-actions">
          <a class="button button-primary" href="https://wa.me/">${icon("whatsapp")}Try Akara on WhatsApp</a>
          <a class="button button-secondary" href="/legal/no-custody-risk-disclosure">Read no-custody disclosure</a>
        </div>
      </div>
    </section>
  `;
  return layout({ path: "/", body });
}

function productPage() {
  const body = `
    <section class="subhero product-subhero">
      <div class="container page-showcase">
        <div>
          <p class="eyebrow">Product</p>
          <h1>The exchange desk that feels like a chat.</h1>
          <p>Akara turns a message into offers, listings, trades, receipts, reminders, disputes, and history.</p>
          <div class="hero-actions">
            <a class="button button-primary" href="https://wa.me/">${icon("whatsapp")}Try Akara on WhatsApp</a>
            <a class="button button-secondary" href="/how-it-works">See how it works</a>
          </div>
        </div>
        ${productMockup()}
      </div>
    </section>
    <section class="section">
      <div class="container product-rhythm">
        ${[
          ["chat", "Chat naturally", "Ask, list, open, pay, and confirm without learning a new app."],
          ["verify", "Verify once", "Identity and payout checks happen before money moves."],
          ["list", "Share the rate", "Turn a listing into a visual card for groups, status, or DMs."],
          ["receipt", "Keep proof close", "Receipts, reminders, and disputes stay tied to the trade."],
        ].map(([name, titleText, text]) => `
          <article class="rhythm-card">
            <span class="bento-icon">${icon(name)}</span>
            <h2>${titleText}</h2>
            <p>${text}</p>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="section">
      <div class="container split">
        <div>
          <p class="eyebrow">Shareable listings</p>
          <h2>A rate can travel before the money does.</h2>
          <p>Post a listing, share the card, and let interested people open the trade from their own WhatsApp chat.</p>
        </div>
        <div class="standalone-listing">${listingShot()}</div>
      </div>
    </section>
  `;
  return layout({ path: "/product", title: "Product", description: "Akara is a WhatsApp-first product for verified peer-to-peer currency exchange coordination.", body });
}

function howItWorksPage() {
  const body = `
    <section class="subhero">
      <div class="container">
        <p class="eyebrow">How it works</p>
        <h1>From intent to receipt, still in chat.</h1>
        <p>Akara guides the exchange without taking custody. Users send directly through their own bank or mobile money accounts.</p>
      </div>
    </section>
    <section class="section">
      <div class="container journey-grid">
        ${[
          ["verify", "1", "Verify", "Add identity and payout details."],
          ["list", "2", "Browse or list", "See live offers or post your own rate."],
          ["trade", "3", "Open", "Payout details reveal inside the trade."],
          ["receipt", "4", "Upload proof", "Paid updates need receipts."],
          ["dispute", "5", "Resolve", "Disputes keep reasons, proof, and outcomes together."],
        ].map(([name, number, titleText, text]) => `
          <article class="journey-step" data-step="${number}">
            <span>${number}</span>
            <div class="bento-icon">${icon(name)}</div>
            <h2>${titleText}</h2>
            <p>${text}</p>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="section no-custody-section">
      <div class="container split">
        <div>
          <p class="eyebrow">No custody</p>
          <h2>Akara records the exchange. Users move the money.</h2>
          <p>Akara does not hold, receive, escrow, custody, remit, convert, or move user funds.</p>
        </div>
        <div class="flow-diagram" aria-label="Akara exchange flow">
          <div class="flow-user">Sender<br><small>Bank or mobile money</small></div>
          <div class="flow-layer">
            <span>Open</span><span>Pay</span><span>Receipt</span><span>Confirm</span>
          </div>
          <div class="flow-user">Receiver<br><small>Bank or mobile money</small></div>
          <div class="direct-line">direct transfer outside Akara custody</div>
        </div>
      </div>
    </section>
  `;
  return layout({ path: "/how-it-works", title: "How It Works", description: "How verified users browse offers, create listings, open trades, upload receipts, and complete peer-to-peer exchanges on Akara.", body });
}

function currenciesPage() {
  const body = `
    <section class="subhero">
      <div class="container page-showcase">
        <div>
          <p class="eyebrow">Currencies</p>
          <h1>Africa’s everyday corridors, in one chat.</h1>
          <p>Akara starts with the currencies people already search for in student, travel, family, and community chats.</p>
          <div class="hero-actions">
            <a class="button button-primary" href="https://wa.me/">${icon("whatsapp")}Browse offers</a>
            <a class="button button-secondary" href="/legal/no-custody-risk-disclosure">Read safety notes</a>
          </div>
        </div>
        <div class="currency-orbit" aria-label="Supported currencies">
          ${currencies.map(([code, country], index) => `<span style="--i:${index}"><b>${code}</b><small>${country}</small></span>`).join("")}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="section-header">
          <p class="eyebrow">Launch support</p>
          <h2>Five currencies first. More corridors later.</h2>
        </div>
        <div class="corridor-list">
          ${currencies.map(([code, country]) => `
            <article>
              <span>${code}</span>
              <h3>${country}</h3>
              <p>Available for verified listings, payout setup, offer browsing, and Akara trade records.</p>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container split">
        <div>
          <p class="eyebrow">Marketplace view</p>
          <h2>Browse first. Choose with your eyes.</h2>
          <p>Ask for all offers, or any supported currency, then open the listing that works.</p>
        </div>
        <div class="offer-stack">
          ${[
            ["AKR-LIST-028", "You send", "50,000 NGN", "You receive", "55,000 RWF"],
            ["AKR-LIST-031", "You send", "12,000 GHS", "You receive", "180,000 RWF"],
            ["AKR-LIST-042", "You send", "40,000 KES", "You receive", "302,000 XAF"],
          ].map(([ref, labelA, valueA, labelB, valueB]) => `
            <article>
              <b>${ref}</b>
              <span>${labelA}</span><strong>${valueA}</strong>
              <span>${labelB}</span><strong>${valueB}</strong>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
  `;
  return layout({ path: "/currencies", title: "Currencies", description: "Akara supports NGN, RWF, GHS, KES, and XAF launch currency corridors.", body });
}

function faqSection() {
  const faqs = [
    ["Does Akara hold my money?", "No. Akara does not hold, move, escrow, remit, convert, or receive user funds. Users pay each other directly."],
    ["Do I need verification?", "Yes. Verification is required before creating listings, opening trades, adding payout accounts, or completing exchanges."],
    ["What currencies are supported?", "Akara launches with NGN, RWF, GHS, KES, and XAF."],
    ["What if something goes wrong?", "Raise a dispute. Akara reviews receipts, payout details, KYC records, chats, and admin notes."],
  ];
  return `
    <section class="section faq-section">
      <div class="container split">
        <div>
          <p class="eyebrow">FAQ</p>
          <h2>Clear answers before money moves.</h2>
        </div>
        <div class="faq-list">
          ${faqs.map(([question, answer]) => `
            <details>
              <summary>${esc(question)}</summary>
              <p>${esc(answer)}</p>
            </details>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function trustPage() {
  const body = `
    <section class="subhero">
      <div class="container">
        <p class="eyebrow">Trust and safety</p>
        <h1>Safety begins before the transfer.</h1>
        <p>Akara verifies users, checks payout names, attaches receipts, and keeps disputes reviewable.</p>
      </div>
    </section>
    <section class="section">
      <div class="container trust-stage-grid">
        <div class="security-console">
          <div class="console-top"><span></span><span></span><span></span></div>
          ${[
            ["Identity", "ID and selfie checked"],
            ["Payout", "Name match required"],
            ["Receipt", "Evidence attached"],
            ["Dispute", "Admin review ready"],
          ].map(([label, text]) => `
            <div class="console-row">
              <b>${label}</b>
              <span>${text}</span>
              <i>clear</i>
            </div>
          `).join("")}
        </div>
        <div class="trust-copy">
          <p class="eyebrow">Control layer</p>
          <h2>Verified users, cleaner records, fewer blind swaps.</h2>
          <p>Akara does not hold funds. It keeps the exchange visible, timed, evidenced, and easier to review.</p>
          <div class="trust-metrics">
            <span><b>15 min</b> trade window</span>
            <span><b>24 to 72h</b> dispute target</span>
            <span><b>0</b> custody of funds</span>
          </div>
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container split">
        <div>
          <p class="eyebrow">Disputes</p>
          <h2>When something feels wrong, evidence moves first.</h2>
          <p>Akara can pause a trade, request proof, compare details, and share an admin outcome.</p>
        </div>
        <ol class="timeline large">
          <li>Reason submitted</li>
          <li>Evidence requested</li>
          <li>Trade paused if needed</li>
          <li>Admin review</li>
          <li>Outcome sent to users</li>
        </ol>
      </div>
    </section>
  `;
  return layout({ path: "/trust", title: "Trust and Safety", description: "How Akara uses verification, payout name checks, receipts, dispute review, and no-custody safeguards.", body });
}

function supportPage() {
  const supportCards = [
    ["WhatsApp", "Open a support ticket from chat.", "Open WhatsApp", "https://wa.me/", ""],
    ["Email support", "For account, listing, and verification help.", "Copy email", "#", site.supportEmail],
    ["Complaints", "For escalations with evidence and references.", "Send message", `mailto:${site.complaintsEmail}`, ""],
  ];
  const body = `
    <section class="subhero">
      <div class="container">
        <p class="eyebrow">Support</p>
        <h1>Support with the trade in view.</h1>
        <p>Monday to Saturday, 9:00 AM to 6:00 PM WAT/CAT. Most reviews get a response within 24 to 72 hours.</p>
      </div>
    </section>
    <section class="section">
      <div class="container support-grid">
        ${supportCards.map(([titleText, text, cta, href, copy]) => `
          <article class="support-card">
            <span class="bento-icon">${icon(titleText === "WhatsApp" ? "chat" : titleText === "Complaints" ? "dispute" : "receipt")}</span>
            <h2>${titleText}</h2>
            <p>${text}</p>
            ${copy
              ? `<button class="support-action" type="button" data-copy="${esc(copy)}">${cta}</button>`
              : `<a class="support-action" href="${href}">${cta}</a>`}
          </article>
        `).join("")}
      </div>
    </section>
    <section class="section">
      <div class="container split">
        <div>
          <p class="eyebrow">What to include</p>
          <h2>Send the details that shorten the review.</h2>
        </div>
        <ul class="check-list big">
          <li>Registered WhatsApp number</li>
          <li>Trade reference code</li>
          <li>Currency pair and amount</li>
          <li>Receipt or screenshot if relevant</li>
          <li>A clear description of what happened</li>
        </ul>
      </div>
    </section>
  `;
  return layout({ path: "/support", title: "Support", description: "Get Akara support for verification, payout details, listings, trades, receipts, and disputes.", body });
}

function legalIndexPage() {
  const legalGroups = [
    ["Start here", "The main rules for using Akara.", ["terms-of-service", "privacy-policy", "no-custody-risk-disclosure"]],
    ["Trading", "Listings, receipts, disputes, and reversals.", ["dispute-resolution-policy", "receipt-upload-and-evidence-policy", "cancellation-refund-and-reversal-policy", "prohibited-transactions-policy"]],
    ["Account safety", "Verification, payout names, limits, and restrictions.", ["kyc-and-identity-verification-consent", "payout-details-and-account-name-match-policy", "user-verification-tier-and-transaction-limit-policy", "acceptable-use-policy"]],
    ["Data and messages", "Retention, deletion, support, and WhatsApp opt-in.", ["data-retention-policy", "data-deletion-policy", "support-and-complaints-policy", "whatsapp-opt-in-and-messaging-policy"]],
  ];
  const body = `
    <section class="subhero legal-hero">
      <div class="container">
        <p class="eyebrow">Legal center</p>
        <h1>The rules behind the swap.</h1>
        <p>Verification, no-custody trading, receipts, disputes, records, and safety in one place.</p>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="legal-group-grid">
          ${legalGroups.map(([titleText, text, slugs]) => `
            <article class="legal-group-card">
              <span>Policy group</span>
              <h2>${esc(titleText)}</h2>
              <p>${esc(text)}</p>
              <div>
                ${slugs.map((slug) => {
                  const page = slugToLegal(slug);
                  return page ? `<a href="/legal/${page.slug}">${esc(page.title)}</a>` : "";
                }).join("")}
              </div>
            </article>
          `).join("")}
        </div>
      </div>
    </section>
  `;
  return layout({ path: "/legal", title: "Legal, Trust, and Safety Center", description: "Akara legal policies for privacy, terms, no-custody risk, KYC, disputes, receipts, and platform safety.", body, legal: true });
}

function businessDetails() {
  const rows = [
    ["Legal business name", site.legalName],
    ["Registration number", site.registrationNumber],
    ["Entity type", site.entityType],
    ["Business type", site.businessType],
    ["Country of registration", site.country],
    ["Date of registration", site.registeredAt],
    ["Business status", site.status],
    ["Principal place of business", site.address],
    ["Public support email", site.supportEmail],
    ["Temporary email", site.fallbackEmail],
    ["Website", site.url],
    ["Governing law", site.law],
    ["Regulator", "[Regulator if applicable]"],
  ];
  return `<dl class="business-details">${rows.map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
}

function legalPage(page) {
  const body = `
    <section class="subhero legal-hero">
      <div class="container">
        <p class="eyebrow">Last updated: July 4, 2026</p>
        <h1>${esc(page.title)}</h1>
        <p>${esc(page.intro)}</p>
      </div>
    </section>
    <section class="section legal-section">
      <div class="container legal-layout">
        <article class="legal-document">
          <div class="legal-notice">${esc(sharedLegalNotice)}</div>
          <h2>Business details</h2>
          ${businessDetails()}
          ${page.sections.map(([title, text]) => `
            <section>
              <h2>${esc(title)}</h2>
              <p>${esc(text)}</p>
            </section>
          `).join("")}
          <section>
            <h2>No-custody notice</h2>
            <p>${esc(noCustodyNotice)}</p>
          </section>
          <p class="draft-note">This page is a draft and should be reviewed by a qualified legal professional before launch.</p>
        </article>
        <aside class="legal-sidebar" aria-label="Key reminders">
          <h2>Key reminders</h2>
          <ul>
            <li>Akara does not hold or move funds.</li>
            <li>Confirm payout details before sending.</li>
            <li>KYC data, receipts, and chat records may be used for fraud prevention and dispute review.</li>
            <li>Akara may pause trades or restrict accounts for safety.</li>
          </ul>
          <a class="button button-secondary" href="/legal">Back to legal center</a>
        </aside>
      </div>
    </section>
  `;
  return layout({
    path: `/legal/${page.slug}`,
    title: page.title,
    description: page.intro,
    body,
    legal: true,
  });
}

function notFoundPage() {
  return layout({
    path: "/404",
    title: "Page not found",
    description: "The requested Akara page could not be found.",
    body: `
      <section class="subhero">
        <div class="container">
          <p class="eyebrow">404</p>
          <h1>This Akara page is not here.</h1>
          <p>Return to the homepage or visit the legal center.</p>
          <div class="hero-actions">
            <a class="button button-primary" href="/">Go home</a>
            <a class="button button-secondary" href="/legal">Legal center</a>
          </div>
        </div>
      </section>
    `,
  });
}

function writeHtml(res, statusCode, html) {
  res.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
}

function contentTypeFor(file) {
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".otf")) return "font/otf";
  return "application/octet-stream";
}

async function handleWebsiteRoute(req, res, url) {
  if (req.method !== "GET") return false;

  if (url.pathname.startsWith("/site-assets/")) {
    const file = url.pathname.replace("/site-assets/", "");
    if (!file || file.includes("..")) return false;
    serveFile(res, path.join(SITE_ROOT, file), contentTypeFor(file));
    return true;
  }

  if (url.pathname.startsWith("/card-assets/")) {
    const file = url.pathname.replace("/card-assets/", "");
    if (!file || file.includes("..")) return false;
    serveFile(res, path.join(CARD_ROOT, file), contentTypeFor(file));
    return true;
  }

  if (url.pathname.startsWith("/font-assets/")) {
    const file = url.pathname.replace("/font-assets/", "");
    if (!file || file.includes("..")) return false;
    serveFile(res, path.join(FONT_ROOT, file), contentTypeFor(file));
    return true;
  }

  if (url.pathname === "/" || url.pathname === "") {
    writeHtml(res, 200, homePage());
    return true;
  }

  if (url.pathname === "/product") {
    writeHtml(res, 200, productPage());
    return true;
  }

  if (url.pathname === "/how-it-works") {
    writeHtml(res, 200, howItWorksPage());
    return true;
  }

  if (url.pathname === "/trust") {
    writeHtml(res, 200, trustPage());
    return true;
  }

  if (url.pathname === "/currencies") {
    writeHtml(res, 200, currenciesPage());
    return true;
  }

  if (url.pathname === "/support") {
    writeHtml(res, 200, supportPage());
    return true;
  }

  if (url.pathname === "/legal") {
    writeHtml(res, 200, legalIndexPage());
    return true;
  }

  const legalMatch = url.pathname.match(/^\/legal\/([a-z0-9-]+)$/);
  if (legalMatch) {
    const page = slugToLegal(legalMatch[1]);
    if (page) {
      writeHtml(res, 200, legalPage(page));
      return true;
    }
  }

  return false;
}

module.exports = {
  handleWebsiteRoute,
  legalPages,
  notFoundPage,
};
