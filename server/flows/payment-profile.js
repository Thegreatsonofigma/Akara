const { supabaseRequest, filterValue } = require("../lib/supabase");
const {
  isCoinProfileEnabled,
  listNigerianBanks,
  findNigerianBanks,
  resolveBankAccount,
} = require("../lib/coinprofile");
const { title, caption, action, labeled, normalizeShortText, digitsOnly } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { paymentOptionLines, parsePaymentCurrency } = require("../nlp/currency");
const { isEditIntent, isCancelIntent, isDeclineIntent } = require("../nlp/intents");
const { getUserById, updateUser, latestVerificationRequest } = require("../db/users");
const { upsertSession, clearSession } = require("../db/sessions");
const { mainMenu, mainMenuListPayload } = require("../messages/copy");
const { mobileNumberRule, normalizeMobileMoneyNumber } = require("../lib/mobile-number");

function paymentMethodForCurrency(currency) {
  return currency === "NGN" ? "bank" : "momo";
}

function paymentChoicePrompt(excludeCurrency = null) {
  return [
    title("Payout details"),
    caption("Choose where incoming payments should land."),
    "",
    ...paymentOptionLines(excludeCurrency),
    "",
    caption("Example: add NGN bank"),
  ].join("\n");
}

const PAYOUT_LIST_OPTIONS = [
  {
    currency: "NGN",
    title: "🇳🇬 NGN bank",
    description: "Nigerian bank account.",
  },
  {
    currency: "RWF",
    title: "🇷🇼 RWF MoMo",
    description: "Rwanda mobile money.",
  },
  {
    currency: "XAF",
    title: "🇨🇲 XAF mobile",
    description: "CFA mobile money.",
  },
  {
    currency: "KES",
    title: "🇰🇪 KES mobile",
    description: "Kenya M-Pesa.",
  },
  {
    currency: "GHS",
    title: "🇬🇭 GHS mobile",
    description: "Ghana mobile money.",
  },
];

function whatsappListReply(list, fallbackText) {
  return {
    type: "whatsapp_list",
    list,
    fallbackText,
  };
}

function whatsappButtonsReply(body, buttons, fallbackText = body) {
  return {
    type: "whatsapp_buttons",
    body,
    buttons,
    fallbackText,
  };
}

function payoutCurrencyListPayload(excludeCurrency = null) {
  return {
    body: [
      title("Payout details"),
      "Choose where incoming payments should land.",
    ].join("\n"),
    button: "Choose payout",
    sections: [
      {
        title: "Payout accounts",
        rows: PAYOUT_LIST_OPTIONS
          .filter((option) => option.currency !== excludeCurrency)
          .map((option) => ({
            id: `payout_currency:${option.currency}`,
            title: option.title,
            description: option.description,
          })),
      },
    ],
  };
}

function paymentChoicePromptReply(excludeCurrency = null, bodyOverride = null) {
  const list = payoutCurrencyListPayload(excludeCurrency);
  if (bodyOverride) list.body = bodyOverride;
  return whatsappListReply(list, paymentChoicePrompt(excludeCurrency));
}

function mobileNetworkOptions(currency) {
  const options = {
    RWF: ["MTN", "Airtel"],
    XAF: ["MTN", "Orange"],
    KES: ["M-Pesa"],
    GHS: ["MTN", "Vodafone", "AirtelTigo"],
  };
  return options[currency] || [];
}

function mobileNetworkOptionLines(currency) {
  return mobileNetworkOptions(currency).map((network, index) => `${index + 1}. ${action(network)}`);
}

function normalizeMobileNetwork(currency, input) {
  const value = compactText(parsePayoutNetworkSelection(input));
  const options = mobileNetworkOptions(currency);
  if (/^\d+$/.test(value)) return options[Number(value) - 1] || null;

  const aliases = {
    "mtn": "MTN",
    "airtel": "Airtel",
    "orange": "Orange",
    "mpesa": "M-Pesa",
    "m pesa": "M-Pesa",
    "m-pesa": "M-Pesa",
    "vodafone": "Vodafone",
    "airteltigo": "AirtelTigo",
    "airtel tigo": "AirtelTigo",
    "airtel-tigo": "AirtelTigo",
  };
  const normalized = aliases[value] || null;
  return normalized && options.includes(normalized) ? normalized : null;
}

function parsePayoutCurrencySelection(input) {
  const match = String(input || "").trim().match(/^payout_currency:([a-z]{3})$/i);
  if (match) return match[1].toUpperCase();
  return parsePaymentCurrency(input);
}

function parsePayoutNetworkSelection(input) {
  const match = String(input || "").trim().match(/^payout_network:(.+)$/i);
  return match ? match[1] : input;
}

function networkPrompt(currency) {
  const options = mobileNetworkOptionLines(currency);
  if (!options.length) return "Which network?";
  return [
    title(`${currency} mobile network`),
    caption("Choose one option so the payout detail stays clean."),
    "",
    ...options,
  ].join("\n");
}

function networkListPayload(currency) {
  return {
    body: [
      title(`${currency} mobile network`),
      "Choose one option so the payout detail stays clean.",
    ].join("\n"),
    button: "Choose network",
    sections: [
      {
        title: `${currency} networks`,
        rows: mobileNetworkOptions(currency).map((network) => ({
          id: `payout_network:${network}`,
          title: network,
          description: `Use ${network} for this payout.`,
        })),
      },
    ],
  };
}

function networkPromptReply(currency) {
  return whatsappListReply(networkListPayload(currency), networkPrompt(currency));
}

function paymentProfileStartPrompt(currency) {
  return paymentMethodForCurrency(currency) === "bank"
    ? [
        title(`Add ${currency} bank account`),
        caption("This is where your trade partner will send your money."),
        "",
        "Send the bank name first.",
        caption("Example: GTBank, Access, Kuda"),
      ].join("\n")
    : [
        title(`Add ${currency} mobile money`),
        caption("This is where your trade partner will send your money."),
        "",
        networkPrompt(currency),
      ].join("\n");
}

const BANK_LIST_PAGE_SIZE = 8;
const POPULAR_NIGERIAN_BANKS = [
  ["kuda"],
  ["paycom", "opay"],
  ["guaranty trust", "gtbank"],
  ["access"],
  ["zenith"],
  ["united bank for africa", "uba"],
  ["first bank"],
  ["palmpay"],
  ["nomba"],
  ["pocket"],
];

function bankPopularityRank(name) {
  const value = String(name || "").toLowerCase();
  const rank = POPULAR_NIGERIAN_BANKS.findIndex((aliases) =>
    aliases.some((alias) => value.includes(alias))
  );
  return rank === -1 ? POPULAR_NIGERIAN_BANKS.length : rank;
}

function sortBanksForDisplay(banks) {
  return banks.slice().sort((a, b) => {
    const rankDifference = bankPopularityRank(a.name) - bankPopularityRank(b.name);
    if (rankDifference) return rankDifference;
    return String(a.name).localeCompare(String(b.name));
  });
}

function parseBankListAction(input) {
  const value = String(input || "").trim();
  const bank = value.match(/^payout_bank:(.+)$/i);
  if (bank) return { type: "bank", value: bank[1] };
  const page = value.match(/^payout_bank_page:(\d+)$/i);
  if (page) return { type: "page", value: Number(page[1]) };
  if (/^payout_bank_search$/i.test(value)) return { type: "search", value: null };
  return null;
}

function bankSearchPrompt() {
  return [
    title("Search Nigerian banks"),
    "",
    "Send the bank name or a familiar short name.",
    caption("Examples: GTBank, Access, Kuda, Zenith, UBA"),
  ].join("\n");
}

async function bankSelectionPromptReply(flow, user, context, requestedPage = 0) {
  if (!isCoinProfileEnabled()) {
    await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_name", context);
    return paymentProfileStartPrompt("NGN");
  }

  let banks;
  try {
    banks = await listNigerianBanks();
  } catch (error) {
    console.error("CoinProfile bank list failed:", error.message);
    await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_lookup_error", context);
    return bankLookupUnavailableReply();
  }

  if (!banks.length) {
    await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_lookup_error", context);
    return bankLookupUnavailableReply();
  }

  const displayBanks = sortBanksForDisplay(banks.map((bank) => ({
    ...bank,
    name: /\bpaycom\b/i.test(bank.name) ? "Opay" : bank.name,
  })));
  const pageCount = Math.max(1, Math.ceil(displayBanks.length / BANK_LIST_PAGE_SIZE));
  const page = Math.min(Math.max(0, Number(requestedPage) || 0), pageCount - 1);
  const pageBanks = displayBanks.slice(page * BANK_LIST_PAGE_SIZE, (page + 1) * BANK_LIST_PAGE_SIZE);
  context.payment_bank_page = page;
  context.payment_bank_page_options = pageBanks;
  await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_name", context);

  const rows = pageBanks.map((bank) => ({
    id: `payout_bank:${bank.code}`,
    title: bank.name.slice(0, 24),
    description: "Use this Nigerian bank.",
  }));
  rows.push({
    id: "payout_bank_search",
    title: "Search bank",
    description: "Type a bank name or familiar short name.",
  });
  if (page > 0) {
    rows.push({
      id: `payout_bank_page:${page - 1}`,
      title: "Previous banks",
      description: `Go to page ${page}.`,
    });
  }
  if (page + 1 < pageCount) {
    rows.push({
      id: `payout_bank_page:${page + 1}`,
      title: "More banks",
      description: `Go to page ${page + 2} of ${pageCount}.`,
    });
  }

  const body = [
    title("Choose your Nigerian bank"),
    `Page ${page + 1} of ${pageCount}. Select a bank or search by name.`,
  ].join("\n");
  return whatsappListReply(
    {
      body,
      button: "Choose bank",
      sections: [{ title: "Nigerian banks", rows }],
    },
    [
      body,
      "",
      ...pageBanks.map((bank, index) => `${index + 1}. ${bank.name}`),
      "",
      "You can also send the bank name.",
    ].join("\n")
  );
}

async function startPaymentProfileForCurrency(user, currency, context = {}) {
  const paymentContext = {
    ...context,
    payment_currency: currency,
  };
  const nextStep = paymentMethodForCurrency(currency) === "bank" ? "payment_bank_name" : "payment_network";
  if (nextStep === "payment_bank_name") {
    return bankSelectionPromptReply("payment_profile", user, paymentContext);
  }
  await upsertSession(user, user.whatsapp_phone, "payment_profile", nextStep, paymentContext);
  return networkPromptReply(currency);
}

async function startPaymentProfileFlow(user, context = {}) {
  if (context.payment_currency) {
    return startPaymentProfileForCurrency(user, context.payment_currency, context);
  }

  await upsertSession(user, user.whatsapp_phone, "payment_profile", "payment_currency", context);
  return paymentChoicePromptReply();
}

function bankAccountNumberStatus(input) {
  const digits = digitsOnly(input);
  if (!digits) return { digits, valid: false, reason: "missing" };
  if (digits.length < 10) return { digits, valid: false, reason: "short" };
  if (digits.length > 11) return { digits, valid: false, reason: "long" };
  return { digits, valid: true, reason: "ok" };
}

function looksLikeAccountNumber(input) {
  const value = String(input || "").trim();
  const digits = digitsOnly(value);
  if (!digits) return false;
  return digits.length >= 6 && digits.length >= value.replace(/\s+/g, "").length * 0.7;
}

function bankAccountNumberPrompt(status = null) {
  if (status?.reason === "short") {
    return [
      title("Check the account number"),
      "",
      "That number is shorter than a Nigerian bank account number.",
      "",
      "Send a 10 or 11 digit account number.",
    ].join("\n");
  }

  if (status?.reason === "long") {
    return [
      title("Check the account number"),
      "",
      "That number is longer than a Nigerian bank account number.",
      "",
      "Send only the 10 or 11 digit account number.",
    ].join("\n");
  }

  return [
    title("Bank account number"),
    "",
    "Send the 10 or 11 digit account number.",
  ].join("\n");
}

function bankAccountNumberPromptReply(context = {}, status = null, intro = "") {
  const body = [
    intro,
    context.payment_bank_name ? labeled("Bank", context.payment_bank_name) : "",
    bankAccountNumberPrompt(status),
  ].filter(Boolean).join("\n\n");
  return whatsappButtonsReply(body, [
    { id: "edit_account_bank", title: "Change bank" },
  ], [
    body,
    "",
    action("change bank"),
  ].join("\n"));
}

function mobileMoneyNumberPrompt(currency, status = null) {
  const rule = status?.rule || mobileNumberRule(currency);
  if (!rule) return "Send the mobile money phone number.";

  if (status?.reason === "wrong_country") {
    return [
      title(`${rule.country} number needed`),
      "",
      `That appears to use the ${status.detectedCountry} country code.`,
      `Send the ${rule.country} mobile money number for this ${currency} payout.`,
      "",
      caption(`Use ${rule.localDigits} digits, like ${rule.example}.`),
    ].join("\n");
  }

  if (["short", "long", "format"].includes(status?.reason)) {
    const lengthText = status.reason === "short"
      ? `That number is shorter than a ${rule.country} mobile money number.`
      : status.reason === "long"
        ? `That number is longer than a ${rule.country} mobile money number.`
        : `That does not look like a ${rule.country} mobile money number.`;
    return [
      title("Check the mobile money number"),
      "",
      lengthText,
      "",
      `Send a ${rule.localDigits} digit number.`,
      caption(`Example: ${rule.example}`),
    ].join("\n");
  }

  return [
    title("Mobile money number"),
    "",
    `Send the phone number registered on this ${currency} mobile money account.`,
    "",
    caption(`Example: ${rule.example}`),
  ].join("\n");
}

function paymentStepPrompt(step, context = {}) {
  const currency = context.payment_currency;
  if (step === "payment_bank_name") {
    return [
      title(`Add ${currency} bank account`),
      "",
      "Send the bank name.",
      caption("Example: GTBank, Access, Kuda"),
    ].join("\n");
  }
  if (step === "payment_network") return networkPrompt(currency);
  if (step === "payment_account_name") {
    return paymentMethodForCurrency(currency) === "bank"
      ? "Send the name on that bank account."
      : "Send the name registered on that mobile money account.";
  }
  if (step === "payment_account_number") return bankAccountNumberPrompt();
  if (step === "payment_number") return mobileMoneyNumberPrompt(currency);
  return paymentChoicePrompt();
}

function accountNamePrompt(user, context = {}) {
  const verifiedName = normalizeShortText(user?.legal_name || context.legal_name || "", 120);
  const target = paymentMethodForCurrency(context.payment_currency) === "bank"
    ? "bank account"
    : "mobile money account";
  const lines = [
    `What name is registered on that ${target}?`,
  ];

  if (verifiedName) {
    lines.push(
      "",
      title("Quick option"),
      `${action("1")} ${verifiedName}`,
      `${action("different name")} if the account uses another name`,
    );
  }

  return lines.join("\n");
}

function parseAccountNameReply(text, user, context = {}) {
  const value = compactText(text);
  const verifiedName = normalizeShortText(user?.legal_name || context.legal_name || "", 120);
  if (verifiedName && /^(?:1|one|option 1|first|same|use same|use verified|verified name|my name|legal name|full name|use my name|my verified name)$/.test(value)) {
    return verifiedName;
  }
  if (verifiedName && /\b(different|another|not same|not the same|manual)\b/.test(value)) {
    return null;
  }
  return normalizeShortText(text, 120);
}

function paymentEditMenuPrompt(context = {}) {
  const method = paymentMethodForCurrency(context.payment_currency);
  const options = method === "bank"
    ? [
        `${action("bank")} Bank name`,
        `${action("number")} Account number`,
        `${action("name")} Account name`,
      ]
    : [
        `${action("network")} Mobile money network`,
        `${action("number")} Mobile money number`,
        `${action("name")} Registered name`,
      ];

  return [
    title(`Edit ${context.payment_currency} payout`),
    caption("Choose only the detail you want to update."),
    "",
    ...options,
    "",
    `${action("cancel")} to keep the current details`,
  ].join("\n");
}

function paymentEditMenuStep(text, context = {}) {
  const value = compactText(text);
  const method = paymentMethodForCurrency(context.payment_currency);
  if (method === "bank") {
    if (/^(1|bank|bank name)$/.test(value) || /\bbank\b/.test(value)) return "payment_bank_name";
    if (/^(2|number|account number|acct number)$/.test(value) || /\b(account )?number\b/.test(value)) return "payment_account_number";
    if (/^(3|name|account name)$/.test(value) || /\bname\b/.test(value)) return "payment_account_name";
    return null;
  }

  if (/^(1|network|momo network|mobile money network)$/.test(value) || /\bnetwork\b/.test(value)) return "payment_network";
  if (/^(2|number|phone|momo number|mobile money number)$/.test(value) || /\b(number|phone)\b/.test(value)) return "payment_number";
  if (/^(3|name|registered name|account name)$/.test(value) || /\bname\b/.test(value)) return "payment_account_name";
  return null;
}

function paymentContextFromProfile(profile, extra = {}) {
  return {
    ...extra,
    payment_currency: profile.currency,
    payment_profile_id: profile.id,
    payment_bank_name: profile.bank_name || "",
    payment_account_number: profile.account_number_encrypted || "",
    payment_network: profile.momo_network || "",
    payment_number: profile.momo_number_encrypted || "",
    payment_account_name: profile.account_name || "",
  };
}

function formatPayoutReview(context) {
  const currency = context.payment_currency;
  const method = paymentMethodForCurrency(currency);
  const lines = method === "bank"
    ? [
        labeled("Payout method", `${currency} bank account`),
        "",
        labeled("Bank", context.payment_bank_name),
        labeled("Account", context.payment_account_number),
        labeled("Name", context.payment_account_name),
        ...(context.payment_account_resolved ? [caption("Account name confirmed by the bank ✅")] : []),
      ]
    : [
        labeled("Payout method", `${currency} mobile money`),
        "",
        labeled("Network", context.payment_network),
        labeled("Number", context.payment_number),
        labeled("Name", context.payment_account_name),
      ];

  return [
    title("Review payout detail"),
    caption("Check this carefully before I save it."),
    "",
    ...lines,
    "",
    title("Check before saving"),
    "Only save payout details you own. Confirm carefully before saving.",
    "",
    `${action("save payout")} to confirm`,
    `${action("edit")} to correct something`,
    `${action("cancel")} to stop`,
  ].join("\n");
}

function payoutReviewReply(context) {
  return whatsappButtonsReply(formatPayoutReview(context), [
    { id: "save payout", title: "Save payout" },
    { id: "edit", title: "Edit" },
    { id: "cancel", title: "Cancel" },
  ]);
}

async function promptPaymentProfileConfirmation(user, flow, context) {
  await upsertSession(user, user.whatsapp_phone, flow, "payment_confirm", context);
  return payoutReviewReply(context);
}

function normalizeNameForMatch(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(name) {
  return normalizeNameForMatch(name)
    .split(" ")
    .filter((token) => token.length > 1);
}

function namesLikelyMatch(kycName, payoutName) {
  const kyc = normalizeNameForMatch(kycName);
  const payout = normalizeNameForMatch(payoutName);
  if (!kyc || !payout) return false;
  if (kyc === payout) return true;
  if (kyc.length > 5 && payout.length > 5 && (kyc.includes(payout) || payout.includes(kyc))) return true;

  const kycTokens = new Set(nameTokens(kyc));
  const payoutTokens = new Set(nameTokens(payout));
  if (!kycTokens.size || !payoutTokens.size) return false;

  const overlap = [...payoutTokens].filter((token) => kycTokens.has(token)).length;
  const required = Math.max(1, Math.ceil(Math.min(kycTokens.size, payoutTokens.size) * 0.7));
  return overlap >= required;
}

function verifiedBankNameMatch(verifiedName, bankName) {
  const verified = normalizeNameForMatch(verifiedName);
  const bank = normalizeNameForMatch(bankName);
  if (!verified || !bank) return false;
  if (verified === bank) return true;

  const verifiedTokens = new Set(nameTokens(verified));
  const bankTokens = new Set(nameTokens(bank));
  if (verifiedTokens.size < 2 || bankTokens.size < 2) return false;

  const overlap = [...bankTokens].filter((token) => verifiedTokens.has(token)).length;
  const bankCoverage = overlap / bankTokens.size;
  const verifiedCoverage = overlap / verifiedTokens.size;

  // Banks often omit middle names or prepend a wallet/provider label. Two
  // exact legal-name tokens are required, and they must cover either the
  // complete bank name or most of both names.
  return overlap >= 2
    && bankCoverage >= (2 / 3)
    && (bankCoverage === 1 || verifiedCoverage >= 0.6);
}

function canResolveNgnAccounts(context = {}) {
  return context.payment_currency === "NGN" && isCoinProfileEnabled();
}

function clearResolvedBankAccount(context) {
  context.payment_account_number = "";
  context.payment_account_name = "";
  context.payment_account_resolved = false;
  context.payment_account_name_matched = false;
  context.payment_account_owner_confirmed = false;
  delete context.payment_verified_name;
}

async function restartBankAccountNumber(flow, user, context, intro = "Enter a different account number.") {
  clearResolvedBankAccount(context);
  await upsertSession(user, user.whatsapp_phone, flow, "payment_account_number", context);
  return bankAccountNumberPromptReply(context, null, [
    title("Change account number"),
    "",
    intro,
  ].join("\n"));
}

function resolvedBankOwnerReply(context) {
  const body = [
    title("Bank account found"),
    caption("These are the details registered to that account."),
    "",
    labeled("Bank", context.payment_bank_name),
    labeled("Account number", context.payment_account_number),
    labeled("Account name", context.payment_account_name),
    "",
    "Does this bank account belong to you?",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "confirm_account_owner", title: "Yes, this is mine" },
    { id: "wrong_account", title: "Wrong account" },
  ], body);
}

function bankNameMismatchReply(context) {
  const body = [
    title("Account name does not match"),
    "",
    labeled("Name on account", context.payment_account_name),
    labeled("Verified identity", context.payment_verified_name),
    "",
    "Akara can only save a bank account held in your verified legal name.",
    "Change the account number or choose another bank to continue.",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "edit_account_number", title: "Change number" },
    { id: "edit_account_bank", title: "Change bank" },
    { id: "cancel", title: "Cancel" },
  ], body);
}

function bankVerificationUnavailableReply(context) {
  const body = [
    title("Bank check unavailable"),
    "",
    "I could not verify this account with the bank right now.",
    "No payout detail was saved. Please retry or use another account.",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "retry_account_check", title: "Retry check" },
    { id: "edit_account_number", title: "Change number" },
    { id: "cancel", title: "Cancel" },
  ], body);
}

function bankLookupUnavailableReply() {
  const body = [
    title("Bank list unavailable"),
    "",
    "I could not load supported Nigerian banks right now.",
    "No payout detail was saved. Please retry shortly.",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "retry_bank_search", title: "Retry" },
    { id: "cancel", title: "Cancel" },
  ], body);
}

function bankPickPrompt(candidates = []) {
  return [
    title("Which bank exactly?"),
    caption("Reply with a number."),
    "",
    ...candidates.map((bank, index) => `${index + 1}. ${action(bank.name)}`),
    "",
    caption("Or send the bank name again."),
  ].join("\n");
}

// Matches the typed bank name against CoinProfile's NGN bank list. Provider
// failures pause the flow so an unverified bank name cannot be saved manually.
async function handleBankNameWithResolution(flow, user, context, bankName) {
  let matches;
  try {
    matches = await findNigerianBanks(bankName);
  } catch (error) {
    console.error("CoinProfile bank lookup failed:", error.message);
    await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_lookup_error", context);
    return bankLookupUnavailableReply();
  }

  if (!matches.length) {
    return [
      title("Bank not found"),
      "",
      `I could not find a Nigerian bank called "${bankName}".`,
      "Send the bank name again.",
      "",
      caption("Example: GTBank, Access, Kuda, Zenith, UBA"),
    ].join("\n");
  }

  if (matches.length > 1) {
    context.payment_bank_candidates = matches
      .slice(0, 3)
      .map((bank) => ({ name: bank.name, code: bank.code }));
    await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_pick", context);
    return bankPickPrompt(context.payment_bank_candidates);
  }

  context.payment_bank_name = matches[0].name;
  context.payment_bank_code = matches[0].code;
  delete context.payment_bank_candidates;
  return proceedAfterBankChosen(flow, user, context);
}

async function proceedAfterBankChosen(flow, user, context) {
  if (context.payment_account_number) {
    return resolveAndConfirmAccount(flow, user, context);
  }

  await upsertSession(user, user.whatsapp_phone, flow, "payment_account_number", context);
  return bankAccountNumberPromptReply(context);
}

// Resolves an NGN account number, enforces KYC-name ownership, and asks the user
// to confirm that the bank-returned account belongs to them before final review.
async function resolveAndConfirmAccount(flow, user, context) {
  let resolved = null;
  try {
    resolved = await resolveBankAccount(context.payment_account_number, context.payment_bank_code);
  } catch (error) {
    console.error("CoinProfile account resolve failed:", error.message);

    // CoinProfile answers 404 when the bank does not recognise the account.
    if (error.statusCode === 422 || error.statusCode === 400 || error.statusCode === 404) {
      context.payment_account_number = "";
      context.payment_account_resolved = false;
      await upsertSession(user, user.whatsapp_phone, flow, "payment_account_number", context);
      return [
        title("Account not found"),
        "",
        `${context.payment_bank_name} did not recognise that account number.`,
        "Check the digits and send the account number again.",
        "",
        caption("You can say edit bank if the bank is wrong."),
      ].join("\n");
    }

    // A typed name is not sufficient evidence for a bank payout. Keep the
    // account unsaved until the provider can return its registered name.
    context.payment_account_resolved = false;
    context.payment_account_owner_confirmed = false;
    await upsertSession(user, user.whatsapp_phone, flow, "payment_account_verification_error", context);
    return bankVerificationUnavailableReply(context);
  }

  const accountName = normalizeShortText(resolved?.account_name || "", 120);
  if (!accountName) {
    context.payment_account_resolved = false;
    context.payment_account_owner_confirmed = false;
    await upsertSession(user, user.whatsapp_phone, flow, "payment_account_verification_error", context);
    return bankVerificationUnavailableReply(context);
  }

  const freshUser = await getUserById(user.id);
  const request = await latestVerificationRequest(user.id);
  const verifiedName = normalizeShortText(
    request?.extracted_name || freshUser?.legal_name || user.legal_name || "",
    120
  );
  context.payment_account_name = accountName;
  context.payment_account_resolved = true;
  context.payment_verified_name = verifiedName;
  context.payment_account_name_matched = verifiedBankNameMatch(verifiedName, accountName);
  context.payment_account_owner_confirmed = false;

  if (!context.payment_account_name_matched) {
    await upsertSession(user, user.whatsapp_phone, flow, "payment_account_name_mismatch", context);
    return bankNameMismatchReply(context);
  }

  await upsertSession(user, user.whatsapp_phone, flow, "payment_account_owner_confirm", context);
  return resolvedBankOwnerReply(context);
}

async function assessPayoutNameTrust(user, payoutName, { notifyVerificationSuccess = true } = {}) {
  const freshUser = await getUserById(user.id);
  if (!freshUser) return { status: "unknown", reason: "User not found." };

  const request = await latestVerificationRequest(user.id);
  const kycName = freshUser.legal_name || request?.extracted_name || "";
  if (!kycName || !payoutName) return { status: "unknown", reason: "KYC name or payout name is missing." };

  const hasIdentityEvidence = Boolean(request?.document_front_path && request?.selfie_path);

  const matched = namesLikelyMatch(kycName, payoutName);
  if (matched) {
    if (request?.id) {
      await supabaseRequest(`verification_requests?id=eq.${filterValue(request.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          automated_decision: "payout_name_matched",
          automated_reason: "Payout account name matches the submitted legal name. Document-name and selfie match checks are still required before approval.",
        }),
      });
    }

    return { status: "matched", reason: "Payout name matches KYC name." };
  }

  if (request?.id) {
    await supabaseRequest(`verification_requests?id=eq.${filterValue(request.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        automated_decision: "name_mismatch",
        automated_reason: "Payout account name does not closely match the submitted KYC name. Manual review required before higher limits.",
      }),
    });
  }

  if (hasIdentityEvidence && ["unverified", "pending_input", "pending_review"].includes(freshUser.verification_status)) {
    await updateUser(user.id, {
      verification_status: "pending_review",
      verification_score: Math.max(Number(freshUser.verification_score || 0), 45),
      risk_status: "watch",
    });
  }

  return { status: "mismatch", reason: "Payout name does not match KYC name." };
}

async function savePaymentProfile(user, context, { notifyVerificationSuccess = true } = {}) {
  const currency = context.payment_currency;
  const method = paymentMethodForCurrency(currency);
  const body = {
    user_id: user.id,
    currency,
    method,
    account_name: context.payment_account_name,
    is_default: true,
  };

  if (method === "bank") {
    body.bank_name = context.payment_bank_name;
    body.account_number_encrypted = context.payment_account_number;
  } else {
    body.momo_network = context.payment_network;
    body.momo_number_encrypted = context.payment_number;
  }

  await supabaseRequest(
    `payment_profiles?user_id=eq.${filterValue(user.id)}&currency=eq.${filterValue(currency)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ is_default: false }),
    }
  );

  if (context.payment_profile_id) {
    const rows = await supabaseRequest(
      `payment_profiles?user_id=eq.${filterValue(user.id)}&currency=eq.${filterValue(currency)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...body,
          bank_name: method === "bank" ? body.bank_name : null,
          account_number_encrypted: method === "bank" ? body.account_number_encrypted : null,
          momo_network: method === "momo" ? body.momo_network : null,
          momo_number_encrypted: method === "momo" ? body.momo_number_encrypted : null,
        }),
      }
    );
    const profile = rows[0] || null;
    await assessPayoutNameTrust(user, context.payment_account_name, { notifyVerificationSuccess }).catch((error) => {
      console.error(`[kyc] payout name check failed for ${user.id}: ${error.message}`);
    });
    return profile;
  }

  const existingRows = await supabaseRequest(
    `payment_profiles?user_id=eq.${filterValue(user.id)}&currency=eq.${filterValue(currency)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        ...body,
        bank_name: method === "bank" ? body.bank_name : null,
        account_number_encrypted: method === "bank" ? body.account_number_encrypted : null,
        momo_network: method === "momo" ? body.momo_network : null,
        momo_number_encrypted: method === "momo" ? body.momo_number_encrypted : null,
      }),
    }
  );
  if (existingRows.length) {
    const profile = existingRows[0] || null;
    await assessPayoutNameTrust(user, context.payment_account_name, { notifyVerificationSuccess }).catch((error) => {
      console.error(`[kyc] payout name check failed for ${user.id}: ${error.message}`);
    });
    return profile;
  }

  const rows = await supabaseRequest("payment_profiles", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const profile = rows[0] || null;
  await assessPayoutNameTrust(user, context.payment_account_name, { notifyVerificationSuccess }).catch((error) => {
    console.error(`[kyc] payout name check failed for ${user.id}: ${error.message}`);
  });
  return profile;
}

async function finishPaymentProfileSave(user, flow, context) {
  // Lazy requires: these flows also route back into payment profile setup, so
  // requiring them at the top would create circular imports.
  if (paymentMethodForCurrency(context.payment_currency) === "bank"
      && canResolveNgnAccounts(context)
      && (
        !context.payment_account_resolved
        || !context.payment_account_name_matched
        || !context.payment_account_owner_confirmed
      )) {
    return resolveAndConfirmAccount(flow, user, context);
  }

  await savePaymentProfile(user, context, { notifyVerificationSuccess: flow !== "verification" });

  if (flow === "verification") {
    const paymentCount = Number(context.payment_count || 0) + 1;
    await upsertSession(user, user.whatsapp_phone, "verification", "payment_more", {
      request_id: context.request_id,
      payment_count: paymentCount,
    });

    return [
      "Payout detail saved ✅",
      "",
      "Add another payout method?",
      `${action("another")} to add one more`,
      `${action("submit")} to review and submit`,
    ].join("\n");
  }

  if (context.return_flow === "publish_listing" && context.pending_listing) {
    const { publishListing } = require("./listing");
    return publishListing(user, context.pending_listing);
  }

  if (context.return_flow === "preview_listing" && context.pending_listing) {
    const { prepareListingPreview } = require("./listing");
    return prepareListingPreview(user, context.pending_listing, "Payout detail saved ✅");
  }

  if (context.return_flow === "preview_bulk_listings" && context.pending_listings) {
    const { prepareBulkListingPreview } = require("./listing");
    return prepareBulkListingPreview(user, context.pending_listings, "Payout detail saved ✅");
  }

  if (context.return_flow === "publish_bulk_listings" && context.pending_listings) {
    const { publishBulkListings } = require("./listing");
    return publishBulkListings(user, context.pending_listings);
  }

  if (context.return_flow === "reserve_listing" && context.pending_listing_id) {
    const { reserveListingById } = require("./listing");
    return reserveListingById(user, context.pending_listing_id);
  }

  if (context.return_flow === "settings") {
    const { profileSettingsReply } = require("./settings");
    return profileSettingsReply(user, "Payout detail saved ✅");
  }

  await clearSession(user, user.whatsapp_phone);
  const body = [
    title("Payout ready ✅"),
    "",
    `Your ${context.payment_currency} payout detail is saved.`,
    "",
    `You can now receive ${context.payment_currency} when you create an offer or open an exchange.`,
  ].join("\n");
  return {
    type: "whatsapp_list",
    list: mainMenuListPayload(body),
    fallbackText: [
      body,
      "",
      mainMenu(user),
    ].join("\n"),
  };
}

function paymentEditStep(text, context = {}) {
  const value = compactText(text).replace(/_/g, " ");
  if (!context.payment_currency) return null;
  if (!/\b(edit|change|correct|fix|update)\b/.test(value)) return null;
  const method = paymentMethodForCurrency(context.payment_currency);

  if (method === "bank" && /\b(bank|bank name)\b/.test(value)) return "payment_bank_name";
  if (method === "bank" && /\b(number|account number|acct number)\b/.test(value)) return "payment_account_number";
  if (/\b(name|account name|registered name)\b/.test(value)) return "payment_account_name";
  if (method !== "bank" && /\b(network|momo|mobile money)\b/.test(value)) return "payment_network";
  if (method !== "bank" && /\b(number|phone)\b/.test(value)) return "payment_number";

  return null;
}

async function maybeHandlePaymentEdit(text, user, session, context) {
  if ([
    "payment_bank_lookup_error",
    "payment_account_owner_confirm",
    "payment_account_name_mismatch",
    "payment_account_verification_error",
  ].includes(session.current_step)) {
    return null;
  }

  const step = paymentEditStep(text, context);
  if (!step) return null;

  await upsertSession(user, user.whatsapp_phone, session.current_flow, step, context);
  if (step === "payment_bank_name" && canResolveNgnAccounts(context)) {
    clearResolvedBankAccount(context);
    context.payment_bank_name = "";
    context.payment_bank_code = "";
    return bankSelectionPromptReply(session.current_flow, user, context);
  }
  return [
    title("No problem"),
    "",
    paymentStepPrompt(step, context),
  ].join("\n");
}

// Shared step machine for collecting payout details. Both the standalone
// payment_profile flow and the verification flow use it; they differ only in
// the flow name saved on the session and what "decline" does at the review
// step. Returns a reply string, or null when the step is not a payment step.
async function handlePaymentSteps(flow, text, user, session, context, { onDecline }) {
  const step = session.current_step;

  if (step === "payment_bank_lookup_error") {
    const command = compactText(text).replace(/_/g, " ");
    if (/\b(retry bank search|retry|try again|load banks)\b/.test(command)) {
      return bankSelectionPromptReply(flow, user, context, context.payment_bank_page || 0);
    }
    return bankLookupUnavailableReply();
  }

  if (step === "payment_account_owner_confirm") {
    const command = compactText(text).replace(/_/g, " ");
    if (/\b(confirm account owner|yes|mine|this is mine|correct|confirm)\b/.test(command)) {
      if (!context.payment_account_resolved || !context.payment_account_name_matched) {
        return resolveAndConfirmAccount(flow, user, context);
      }
      context.payment_account_owner_confirmed = true;
      return promptPaymentProfileConfirmation(user, flow, context);
    }

    if (/\b(wrong account|not mine|not my account|change number|different number|incorrect)\b/.test(command)) {
      return restartBankAccountNumber(
        flow,
        user,
        context,
        "Send the correct account number and I will verify its registered name again."
      );
    }

    return resolvedBankOwnerReply(context);
  }

  if (step === "payment_account_name_mismatch") {
    const command = compactText(text).replace(/_/g, " ");
    if (/\b(edit account number|change number|different number|new number|try another|account number)\b/.test(command)) {
      return restartBankAccountNumber(
        flow,
        user,
        context,
        "Send an account number registered in your verified legal name."
      );
    }
    if (/\b(edit account bank|change bank|different bank|another bank)\b/.test(command)) {
      clearResolvedBankAccount(context);
      context.payment_bank_name = "";
      context.payment_bank_code = "";
      return bankSelectionPromptReply(flow, user, context);
    }
    return bankNameMismatchReply(context);
  }

  if (step === "payment_account_verification_error") {
    const command = compactText(text).replace(/_/g, " ");
    if (/\b(retry account check|retry|try again|check again)\b/.test(command)) {
      return resolveAndConfirmAccount(flow, user, context);
    }
    if (/\b(edit account number|change number|different number|new number|account number)\b/.test(command)) {
      return restartBankAccountNumber(flow, user, context);
    }
    return bankVerificationUnavailableReply(context);
  }

  if (step === "payment_confirm") {
    const command = compactText(text);
    if (/\b(save|confirm|yes|correct|looks good|go ahead)\b/.test(command)) {
      return finishPaymentProfileSave(user, flow, context);
    }

    if (isEditIntent(command)) {
      await upsertSession(user, user.whatsapp_phone, flow, "payment_edit_menu", context);
      return paymentEditMenuPrompt(context);
    }

    if (isDeclineIntent(command) || isCancelIntent(command) || /^(no|nope)$/.test(command)) {
      return onDecline(context);
    }

    return payoutReviewReply(context);
  }

  if (step === "payment_edit_menu") {
    if (isCancelIntent(text) || isDeclineIntent(text)) {
      await upsertSession(user, user.whatsapp_phone, flow, "payment_confirm", context);
      return payoutReviewReply(context);
    }

    const nextStep = paymentEditMenuStep(text, context);
    if (!nextStep) return paymentEditMenuPrompt(context);

    await upsertSession(user, user.whatsapp_phone, flow, nextStep, context);
    if (nextStep === "payment_network") return networkPromptReply(context.payment_currency);
    if (nextStep === "payment_bank_name") return bankSelectionPromptReply(flow, user, context);
    return [
      title("Let's update that"),
      "",
      nextStep === "payment_account_name" ? accountNamePrompt(user, context) : paymentStepPrompt(nextStep, context),
    ].join("\n");
  }

  if (step === "payment_currency") {
    const currency = parsePayoutCurrencySelection(text);
    if (!currency) return paymentChoicePromptReply();

    context.payment_currency = currency;
    const nextStep = paymentMethodForCurrency(currency) === "bank" ? "payment_bank_name" : "payment_network";
    if (nextStep === "payment_bank_name") {
      return bankSelectionPromptReply(flow, user, context);
    }
    await upsertSession(user, user.whatsapp_phone, flow, nextStep, context);
    return networkPromptReply(currency);
  }

  if (step === "payment_bank_name") {
    const bankAction = parseBankListAction(text);
    if (bankAction?.type === "page") {
      return bankSelectionPromptReply(flow, user, context, bankAction.value);
    }
    if (bankAction?.type === "search") {
      await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_name", context);
      return bankSearchPrompt();
    }
    if (bankAction?.type === "bank") {
      let selected = (context.payment_bank_page_options || [])
        .find((bank) => String(bank.code) === String(bankAction.value));
      if (!selected) {
        try {
          selected = (await listNigerianBanks())
            .map((bank) => ({
              ...bank,
              name: /\bpaycom\b/i.test(bank.name) ? "Opay" : bank.name,
            }))
            .find((bank) => String(bank.code) === String(bankAction.value));
        } catch (error) {
          console.error("CoinProfile bank selection failed:", error.message);
        }
      }
      if (!selected) return bankSelectionPromptReply(flow, user, context, context.payment_bank_page || 0);

      context.payment_bank_name = selected.name;
      context.payment_bank_code = selected.code;
      delete context.payment_bank_page_options;
      return proceedAfterBankChosen(flow, user, context);
    }

    if (looksLikeAccountNumber(text)) {
      const status = bankAccountNumberStatus(text);
      if (!status.valid) return bankAccountNumberPrompt(status);

      context.payment_account_number = status.digits;
      await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_name", context);
      return [
        title("I saved the account number"),
        "",
        "That looks like your account number, not the bank name.",
        "Send the bank name now.",
        "",
        caption("Example: GTBank, Access, Kuda"),
        caption("You can say edit number if that number is wrong."),
      ].join("\n");
    }

    const bankName = normalizeShortText(text, 80);
    if (!bankName) return "Send the bank name. Example: GTBank.";

    if (canResolveNgnAccounts(context)) {
      const resolutionReply = await handleBankNameWithResolution(flow, user, context, bankName);
      if (resolutionReply) return resolutionReply;
    }

    context.payment_bank_name = bankName;
    await upsertSession(user, user.whatsapp_phone, flow, "payment_account_name", context);
    return accountNamePrompt(user, context);
  }

  if (step === "payment_bank_pick") {
    const candidates = context.payment_bank_candidates || [];
    const value = compactText(text);
    const pick = /^\d$/.test(value) ? candidates[Number(value) - 1] : null;

    if (pick) {
      context.payment_bank_name = pick.name;
      context.payment_bank_code = pick.code;
      delete context.payment_bank_candidates;
      return proceedAfterBankChosen(flow, user, context);
    }

    const bankName = normalizeShortText(text, 80);
    if (bankName && !/^\d+$/.test(bankName)) {
      const resolutionReply = await handleBankNameWithResolution(flow, user, context, bankName);
      if (resolutionReply) return resolutionReply;
    }

    return bankPickPrompt(candidates);
  }

  if (step === "payment_network") {
    const network = normalizeMobileNetwork(context.payment_currency, text);
    if (!network) {
      return networkPromptReply(context.payment_currency);
    }

    context.payment_network = network;
    await upsertSession(user, user.whatsapp_phone, flow, "payment_account_name", context);
    return accountNamePrompt(user, context);
  }

  if (step === "payment_account_name") {
    const accountName = parseAccountNameReply(text, user, context);
    if (!accountName) return accountNamePrompt(user, context);

    context.payment_account_name = accountName;
    context.payment_account_resolved = false;
    if (paymentMethodForCurrency(context.payment_currency) === "bank" && context.payment_account_number) {
      return promptPaymentProfileConfirmation(user, flow, context);
    }

    const nextStep = paymentMethodForCurrency(context.payment_currency) === "bank" ? "payment_account_number" : "payment_number";
    await upsertSession(user, user.whatsapp_phone, flow, nextStep, context);
    return paymentMethodForCurrency(context.payment_currency) === "bank"
      ? bankAccountNumberPrompt()
      : mobileMoneyNumberPrompt(context.payment_currency);
  }

  if (step === "payment_account_number" || step === "payment_number") {
    const number = normalizeShortText(text, 40);
    if (step === "payment_account_number") {
      const status = bankAccountNumberStatus(number);
      if (!status.valid) return bankAccountNumberPromptReply(context, status);
      context.payment_account_number = status.digits;

      if (canResolveNgnAccounts(context) && context.payment_bank_code) {
        return resolveAndConfirmAccount(flow, user, context);
      }
    } else {
      const status = normalizeMobileMoneyNumber(context.payment_currency, number);
      if (!status.valid) return mobileMoneyNumberPrompt(context.payment_currency, status);
      context.payment_number = status.number;
    }

    return promptPaymentProfileConfirmation(user, flow, context);
  }

  return null;
}

async function handlePaymentProfile(text, user, session) {
  const context = session.context_json || {};
  const editReply = await maybeHandlePaymentEdit(text, user, session, context);
  if (editReply) return editReply;

  const stepReply = await handlePaymentSteps("payment_profile", text, user, session, context, {
    onDecline: async () => {
      await clearSession(user, user.whatsapp_phone);
      return [title("Payout not saved"), "", mainMenu()].join("\n");
    },
  });
  if (stepReply) return stepReply;

  await upsertSession(user, user.whatsapp_phone, "payment_profile", "payment_currency", {});
  return paymentChoicePromptReply(
    null,
    [
      title("Continue payout setup"),
      "Choose the account where you want to receive money.",
    ].join("\n")
  );
}

module.exports = {
  paymentMethodForCurrency,
  paymentChoicePrompt,
  paymentChoicePromptReply,
  paymentStepPrompt,
  startPaymentProfileForCurrency,
  startPaymentProfileFlow,
  paymentEditMenuPrompt,
  paymentContextFromProfile,
  formatPayoutReview,
  mobileMoneyNumberPrompt,
  namesLikelyMatch,
  verifiedBankNameMatch,
  maybeHandlePaymentEdit,
  handlePaymentSteps,
  handlePaymentProfile,
};
