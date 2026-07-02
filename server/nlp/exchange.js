const { compactText, normalizeExchangeText } = require("./slang");
const {
  currencyMentions,
  mentionedCurrencies,
  parseAmountLimit,
  parseCurrencyAmountPairs,
} = require("./currency");

// Decides whether a currency/amount mention is something the user HAS or
// WANTS, based on the phrase right before it ("I have...", "i wan...",
// "change am to..."). `index` must point into the normalized text.
function exchangePhraseRole(normalizedText, index) {
  const before = compactText(String(normalizedText || "").slice(0, index)).slice(-90);
  const matches = [...before.matchAll(/\b(i have|i've got|i got|i get|i dey with|dey with|have|with|i can give|i fit give|fit give|can give|give|pay|send|i need|need|i want|i wan|wan|want|looking for|dey find|find who|who go help|change am to|change it to|convert am to|convert it to|swap am to|swap it to|turn am to|turn it to|receive|get)\b/g)];
  const last = matches.at(-1)?.[0] || "";

  if (/^(i have|i've got|i got|i get|i dey with|dey with|have|with|i can give|i fit give|fit give|can give|give|pay|send)$/.test(last)) return "have";
  if (/^(i need|need|i want|i wan|wan|want|looking for|dey find|find who|who go help|change am to|change it to|convert am to|convert it to|swap am to|swap it to|turn am to|turn it to|receive|get)$/.test(last)) return "want";
  return null;
}

function assignPair(details, role, pair) {
  if (role === "have") {
    details.have_amount = pair.amount;
    details.have_currency = pair.currency;
  }

  if (role === "want") {
    details.want_amount = pair.amount;
    details.want_currency = pair.currency;
  }
}

function parseListingDetails(input) {
  const text = normalizeExchangeText(input);
  const pairs = parseCurrencyAmountPairs(text);
  const details = {
    have_currency: null,
    want_currency: null,
    have_amount: null,
    want_amount: null,
    listing_type: /\b(negotiate|negotiable|nego|flex|flexible|offers?)\b/.test(compactText(text)) ? "negotiable" : "fixed",
  };

  const classifiedPairs = pairs.map((pair) => ({ ...pair, role: exchangePhraseRole(text, pair.index) }));
  for (const pair of classifiedPairs) {
    if (pair.role && !details[`${pair.role}_currency`]) assignPair(details, pair.role, pair);
  }

  if (pairs.length >= 2) {
    const unusedPairs = classifiedPairs.filter((pair) => {
      if (details.have_currency === pair.currency && details.have_amount === pair.amount) return false;
      if (details.want_currency === pair.currency && details.want_amount === pair.amount) return false;
      return true;
    });

    if (!details.have_currency && details.want_currency && unusedPairs[0]) assignPair(details, "have", unusedPairs[0]);
    if (!details.want_currency && details.have_currency && unusedPairs[0]) assignPair(details, "want", unusedPairs[0]);

    if (!details.have_currency && !details.want_currency) {
      assignPair(details, "have", pairs[0]);
      assignPair(details, "want", pairs[1]);
    }
  }

  if (pairs.length === 1) {
    const currencies = mentionedCurrencies(text);
    const otherCurrency = currencies.find((currency) => currency !== pairs[0].currency) || null;
    const role = classifiedPairs[0].role || "have";
    assignPair(details, role, pairs[0]);
    if (role === "have") details.want_currency = otherCurrency;
    if (role === "want") details.have_currency = otherCurrency;
  }

  if (details.have_currency && details.want_currency && details.have_currency === details.want_currency) {
    details.want_currency = null;
  }

  return details;
}

function parseSearchDetails(input) {
  const text = normalizeExchangeText(input);
  const details = parseListingDetails(text);
  const compact = compactText(text);
  const needCurrency = /\b(need|wan|want|looking for|dey find|find who|who go help|change am|change it|convert am|convert it|swap am|swap it|turn am|turn it|get|receive)\b/.test(compact);
  const haveCurrency = /\b(have|i get|get|dey with|give|fit give|pay|send|exchange)\b/.test(compact);
  const amountLimit = parseAmountLimit(text);

  if (needCurrency && details.have_currency && details.want_currency) {
    return {
      have_currency: details.have_currency,
      want_currency: details.want_currency,
      have_amount: details.have_amount,
      want_amount: details.want_amount,
      max_want_amount: amountLimit?.role === "max" ? amountLimit.amount : null,
      amount: details.have_amount || details.want_amount,
    };
  }

  const pairs = parseCurrencyAmountPairs(text);
  if (pairs.length === 1) {
    const currencies = mentionedCurrencies(text);
    const mentionedOther = currencies.find((currency) => currency !== pairs[0].currency) || null;
    const role = exchangePhraseRole(text, pairs[0].index);
    if (role === "have") {
      return {
        have_currency: pairs[0].currency,
        want_currency: mentionedOther,
        have_amount: pairs[0].amount,
        want_amount: null,
        max_want_amount: null,
        amount: pairs[0].amount,
      };
    }
    if (role === "want") {
      return {
        have_currency: mentionedOther,
        want_currency: pairs[0].currency,
        have_amount: null,
        want_amount: pairs[0].amount,
        max_want_amount: null,
        amount: pairs[0].amount,
      };
    }
    return {
      have_currency: haveCurrency ? pairs[0].currency : mentionedOther,
      want_currency: needCurrency && !haveCurrency ? pairs[0].currency : mentionedOther,
      have_amount: haveCurrency ? pairs[0].amount : null,
      want_amount: needCurrency && !haveCurrency ? pairs[0].amount : null,
      max_want_amount: null,
      amount: pairs[0].amount,
    };
  }

  const currencies = mentionedCurrencies(text);
  if (currencies.length === 1) {
    const mention = currencyMentions(text)[0];
    const role = mention ? exchangePhraseRole(text, mention.index) : null;
    return {
      have_currency: role === "have" ? currencies[0] : null,
      want_currency: role === "have" ? null : currencies[0],
      max_want_amount: amountLimit?.role === "max" ? amountLimit.amount : null,
      amount: null,
    };
  }

  if (currencies.length >= 2) {
    const mentions = currencyMentions(text).map((mention) => ({
      ...mention,
      role: exchangePhraseRole(text, mention.index),
    }));
    const haveMention = mentions.find((mention) => mention.role === "have");
    const wantMention = mentions.find((mention) => mention.role === "want");
    if (haveMention || wantMention) {
      const haveResolved = haveMention?.currency || mentions.find((mention) => mention.currency !== wantMention?.currency)?.currency || null;
      const wantResolved = wantMention?.currency || mentions.find((mention) => mention.currency !== haveMention?.currency)?.currency || null;
      return {
        have_currency: haveResolved,
        want_currency: wantResolved,
        max_want_amount: amountLimit?.role === "max" ? amountLimit.amount : null,
        amount: null,
      };
    }

    return {
      have_currency: currencies[0],
      want_currency: currencies[1],
      max_want_amount: amountLimit?.role === "max" ? amountLimit.amount : null,
      amount: null,
    };
  }

  return {
    have_currency: details.have_currency,
    want_currency: details.want_currency,
    max_want_amount: amountLimit?.role === "max" ? amountLimit.amount : null,
    amount: details.have_amount,
  };
}

function missingListingFields(details) {
  return ["have_currency", "want_currency", "have_amount", "want_amount"].filter((field) => !details[field]);
}

function nextSearchStep(details = {}) {
  if (!details.have_currency) return "have_currency";
  if (!details.want_currency) return "want_currency";
  if (!details.have_amount) return "have_amount";
  if (!details.want_amount) return "want_amount";
  return "ready";
}

function hasDirectionalExchangeText(text) {
  const value = compactText(text);
  const hasHaveSide = /\b(i have|have|i've got|i got|i get|i dey with|dey with|with|give|fit give|pay|send)\b/.test(value);
  const hasWantSide = /\b(i need|need|i want|i wan|wan|want|looking for|dey find|find who|who go help|change am|change it|convert am|convert it|swap am|swap it|turn am|turn it|receive|get)\b/.test(value);
  return parseCurrencyAmountPairs(text).length >= 2
    || currencyMentions(text).length >= 2
    || (hasHaveSide && hasWantSide);
}

function mergePresentDetails(base, parsed) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(parsed || {})) {
    if (value !== null && value !== undefined && value !== "") merged[key] = value;
  }
  return merged;
}

function listingDraftFromSearch(context) {
  const draft = {
    have_currency: context.have_currency,
    want_currency: context.want_currency,
    have_amount: context.have_amount,
    want_amount: context.want_amount,
    listing_type: context.listing_type || "fixed",
  };

  return missingListingFields(draft).length === 0 ? draft : null;
}

module.exports = {
  exchangePhraseRole,
  parseListingDetails,
  parseSearchDetails,
  missingListingFields,
  nextSearchStep,
  hasDirectionalExchangeText,
  mergePresentDetails,
  listingDraftFromSearch,
};
