const { action } = require("../lib/format");
const { compactText, normalizeExchangeText } = require("./slang");

// Single source of truth for every way users write a currency: ISO codes,
// full names, pidgin, slang, and common typos. Longer phrases come first in
// each list so regex alternation prefers them. Detection order matters too:
// RWF is checked last because its generic "franc(s)" alias would otherwise
// swallow "cfa franc" (XAF).
const CURRENCY_ALIASES = {
  NGN: [
    "nigerian naira",
    "nigeria (?:naira|money)",
    "naija money",
    "9ja money",
    "naira",
    "nara",
    "naria",
    "ngn",
  ],
  XAF: [
    "central african francs?",
    "cameroon(?:ian)? francs?",
    "cfa francs?",
    "franc cfa",
    "fcfa",
    "cfa",
    "cefa",
    "sefa",
    "safar",
    "xaf",
    "xzf",
  ],
  KES: [
    "kenyan? (?:s|c)?h?ill?ings?",
    "kenya (?:s|c)?h?ill?ings?",
    "(?:s|c)?h?ill?ings?",
    "kes",
    "kshs?",
    "bob",
  ],
  GHS: [
    "ghanaian? c(?:e|i)d(?:i|y)e?s?",
    "ghana c(?:e|i)d(?:i|y)e?s?",
    "gh cedis?",
    "c(?:e|i)d(?:i|y)e?s?",
    "cities",
    "ghs",
    "ghc",
  ],
  RWF: [
    "rwandan? francs?",
    "rwanda francs?",
    "amafaranga",
    "faranga",
    "francs?",
    "rwf",
    "frw",
    "rf",
    "rof",
    "roi",
  ],
};

const DETECTION_ORDER = ["NGN", "XAF", "KES", "GHS", "RWF"];

function supportedCurrencies() {
  return ["NGN", "RWF", "XAF", "KES", "GHS"];
}

function currencyPattern(currency) {
  return CURRENCY_ALIASES[currency].join("|");
}

function anyCurrencyPattern() {
  return DETECTION_ORDER.map(currencyPattern).join("|");
}

function normalizeCurrency(input) {
  const value = String(input || "").trim().toUpperCase();
  if (supportedCurrencies().includes(value)) return value;

  const lower = normalizeExchangeText(input);
  for (const currency of DETECTION_ORDER) {
    if (new RegExp(`\\b(?:${currencyPattern(currency)})\\b`).test(lower)) return currency;
  }
  return null;
}

// Finds every currency mention with its position in the normalized text.
// Earlier currencies in DETECTION_ORDER claim their spans first, so "cfa
// franc" counts once as XAF instead of XAF plus RWF.
function currencyMentions(input) {
  const text = normalizeExchangeText(input);
  const claimed = [];
  const mentions = [];

  for (const currency of DETECTION_ORDER) {
    const regex = new RegExp(`\\b(?:${currencyPattern(currency)})\\b`, "g");
    let match;
    while ((match = regex.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      if (claimed.some(([claimedStart, claimedEnd]) => start < claimedEnd && end > claimedStart)) continue;
      claimed.push([start, end]);
      mentions.push({ currency, index: start });
    }
  }

  const seen = new Set();
  return mentions
    .sort((a, b) => a.index - b.index)
    .filter((mention) => {
      if (seen.has(mention.currency)) return false;
      seen.add(mention.currency);
      return true;
    });
}

function mentionedCurrencies(input) {
  return currencyMentions(input).map((mention) => mention.currency);
}

const AMOUNT_SUFFIXES = {
  k: 1000,
  thousand: 1000,
  grand: 1000,
  m: 1000000,
  million: 1000000,
};

const amountSuffixPattern = "k|m|thousand|grand|million";

function parseAmount(input) {
  const raw = normalizeExchangeText(input).replaceAll(",", "");
  const match = raw.match(new RegExp(`\\d+(?:\\.\\d+)?(?:\\s*(${amountSuffixPattern})\\b)?`, "i"));
  if (!match) return null;

  const multiplier = AMOUNT_SUFFIXES[(match[1] || "").toLowerCase()] || 1;
  const amount = Number(match[0].replace(/[^\d.]/g, "")) * multiplier;
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return amount;
}

function parseAmountLimit(input) {
  const text = normalizeExchangeText(input).replace(/,/g, "");
  const match = text.match(new RegExp(`\\b(under|below|less than|max|maximum|not more than)\\s+(\\d[\\d,]*(?:\\.\\d+)?\\s*(?:${amountSuffixPattern})?)\\b`, "i"));
  if (!match) return null;
  const amount = parseAmount(match[2]);
  return amount ? { role: "max", amount } : null;
}

// Extracts every "amount + currency" pair ("2k naira", "rwf 55,000") with the
// position where it appears in the normalized text.
function parseCurrencyAmountPairs(input) {
  const text = normalizeExchangeText(input);
  const amountPattern = `\\d[\\d,]*(?:\\.\\d+)?(?:\\s*(?:${amountSuffixPattern})\\b)?`;
  const currencyAlternation = anyCurrencyPattern();
  const pairs = [];
  const seen = new Set();

  const amountBefore = new RegExp(`(${amountPattern})\\s*(${currencyAlternation})\\b`, "gi");
  const currencyBefore = new RegExp(`\\b(${currencyAlternation})\\s*(${amountPattern})`, "gi");

  for (const regex of [amountBefore, currencyBefore]) {
    let match;
    while ((match = regex.exec(text))) {
      const first = match[1];
      const second = match[2];
      const amount = parseAmount(/\d/.test(first[0]) ? first : second);
      const currency = normalizeCurrency(/\d/.test(first[0]) ? second : first);
      const key = `${amount}-${currency}-${match.index}`;
      if (amount && currency && !seen.has(key)) {
        pairs.push({ amount, currency, index: match.index });
        seen.add(key);
      }
    }
  }

  return pairs.sort((a, b) => a.index - b.index);
}

function browseOfferCurrency(text) {
  const mentions = currencyMentions(text);
  return mentions[0]?.currency || null;
}

function parsePaymentCurrency(input) {
  const value = compactText(input);
  const numericOptions = supportedCurrencies();
  if (/^\d+$/.test(value)) return numericOptions[Number(value) - 1] || null;
  const currency = normalizeCurrency(input);
  if (!currency || !supportedCurrencies().includes(currency)) return null;
  return currency;
}

function currencyOptionLabels(excludeCurrency = null) {
  const labels = {
    NGN: "🇳🇬 NGN",
    RWF: "🇷🇼 RWF",
    XAF: "🇨🇲 XAF",
    KES: "🇰🇪 KES",
    GHS: "🇬🇭 GHS",
  };

  return supportedCurrencies()
    .filter((currency) => currency !== excludeCurrency)
    .map((currency) => labels[currency] || currency);
}

function payoutOptionLabels(excludeCurrency = null) {
  const labels = {
    NGN: "🇳🇬 NGN bank",
    RWF: "🇷🇼 RWF MoMo",
    XAF: "🇨🇲 XAF mobile",
    KES: "🇰🇪 KES mobile",
    GHS: "🇬🇭 GHS mobile",
  };

  return supportedCurrencies()
    .filter((currency) => currency !== excludeCurrency)
    .map((currency) => labels[currency] || currency);
}

function paymentOptionLines(excludeCurrency = null) {
  return payoutOptionLabels(excludeCurrency).map((label, index) => `${index + 1}. ${action(label)}`);
}

function currencyOptionsLine(excludeCurrency = null) {
  return currencyOptionLabels(excludeCurrency).join(", ");
}

function currencyHelpLine(excludeCurrency = null) {
  return `Available: ${currencyOptionsLine(excludeCurrency)}`;
}

module.exports = {
  supportedCurrencies,
  normalizeCurrency,
  currencyMentions,
  mentionedCurrencies,
  parseAmount,
  parseAmountLimit,
  parseCurrencyAmountPairs,
  browseOfferCurrency,
  parsePaymentCurrency,
  currencyOptionLabels,
  payoutOptionLabels,
  paymentOptionLines,
  currencyOptionsLine,
  currencyHelpLine,
};
