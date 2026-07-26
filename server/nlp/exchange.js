const { compactText, normalizeExchangeText } = require("./slang");
const {
  currencyMentions,
  mentionedCurrencies,
  parseAmount,
  parseAmountLimit,
  parseCurrencyAmountPairs,
} = require("./currency");

const HAVE_ROLE_PHRASE = "i have|i've got|i got|i get|i dey with|dey with|have|with|i can give|i fit give|fit give|can give|i go give|go give|i want to give|want to give|willing to give|ready to give|i can pay|can pay|i fit pay|fit pay|i go pay|go pay|i will pay|will pay|pay|i can send|can send|i fit send|fit send|i go send|go send|i will send|will send|exchange";
const WANT_ROLE_PHRASE = "i need|need|needed|i want|i wan|wan|want|wanted|looking for|looking to get|looking to collect|dey find|find who|who go help|who fit give|who can give|who get|give me|send me|help me get|help me change|get me|can i get|may i get|make i get|make i collect|i fit collect|fit collect|collect|receive|change am to|change it to|convert am to|convert it to|swap am to|swap it to|turn am to|turn it to|get";

function roleFromPhrase(phrase) {
  if (!phrase) return null;
  if (new RegExp(`^(?:${HAVE_ROLE_PHRASE})$`).test(phrase)) return "have";
  if (new RegExp(`^(?:${WANT_ROLE_PHRASE})$`).test(phrase)) return "want";
  return null;
}

// Decides whether a currency/amount mention is something the user HAS or
// WANTS, based on the phrase right before it ("I have...", "i wan...",
// "who fit give me..."). `index` must point into the normalized text.
function exchangePhraseRole(normalizedText, index) {
  const before = compactText(String(normalizedText || "").slice(0, index)).slice(-90);
  const matches = [...before.matchAll(new RegExp(`\\b(${HAVE_ROLE_PHRASE}|${WANT_ROLE_PHRASE})\\b`, "g"))];
  const last = matches.at(-1)?.[0] || "";
  return roleFromPhrase(last);
}

function mentionedCurrencyRole(input) {
  const text = normalizeExchangeText(input);
  const mentions = currencyMentions(text);
  if (mentions.length !== 1) return null;
  return exchangePhraseRole(text, mentions[0].index);
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
  const command = compactText(text);
  const listingType = /\b(fixed|firm)\b/.test(command) ? "fixed" : "negotiable";
  const pairs = parseCurrencyAmountPairs(text);
  const details = {
    have_currency: null,
    want_currency: null,
    have_amount: null,
    want_amount: null,
    listing_type: listingType,
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

function parseLooseAmountMentions(text) {
  const amountPattern = /\b\d[\d,]*(?:\.\d+)?(?:\s*(?:k|m|thousand|grand|million)\b)?/gi;
  const amounts = [];
  let match;

  while ((match = amountPattern.exec(text))) {
    const amount = parseAmount(match[0]);
    if (!amount) continue;

    const after = text.slice(match.index + match[0].length);
    const isListNumber = amount <= 100 && /^[.)]\s/.test(after);
    const isBatchCount = amount <= 100
      && /^\s*(?:offers?|listings?|items?|entries?|rates?)\b/.test(after);
    if (isListNumber || isBatchCount) continue;

    amounts.push({
      amount,
      index: match.index,
    });
  }

  return amounts;
}

function sharedBulkCurrencies(text) {
  const mentions = currencyMentions(text);
  const currencies = mentionedCurrencies(text);
  if (currencies.length < 2) return null;

  const classified = mentions.map((mention) => ({
    ...mention,
    role: exchangePhraseRole(text, mention.index),
  }));
  const haveMention = classified.find((mention) => mention.role === "have");
  const wantMention = classified.find((mention) => mention.role === "want");
  const haveCurrency = haveMention?.currency
    || currencies.find((currency) => currency !== wantMention?.currency)
    || currencies[0];
  const wantCurrency = wantMention?.currency
    || currencies.find((currency) => currency !== haveCurrency)
    || currencies[1];

  if (!haveCurrency || !wantCurrency || haveCurrency === wantCurrency) return null;
  return { have_currency: haveCurrency, want_currency: wantCurrency };
}

function bulkAmountOrder(text, amounts, firstListing) {
  const firstRole = exchangePhraseRole(text, amounts[0]?.index);
  const secondRole = exchangePhraseRole(text, amounts[1]?.index);
  if (firstRole === "want" && secondRole === "have") return "want_have";
  if (firstRole === "have" && secondRole === "want") return "have_want";

  if (firstListing?.have_amount && firstListing?.want_amount) {
    if (
      amounts[0]?.amount === firstListing.want_amount
      && amounts[1]?.amount === firstListing.have_amount
    ) {
      return "want_have";
    }
  }
  return "have_want";
}

// Turns one message containing several complete exchanges into independent
// listing drafts. The amount/currency pairs stay in message order, while
// nearby "have" and "want" language decides their direction.
function parseBulkListingDetails(input) {
  const text = normalizeExchangeText(input);
  const pairs = parseCurrencyAmountPairs(text);
  const appliesFixedToAll = (
    /\b(?:all|every|both)\b.{0,24}\b(?:fixed|firm)\b/.test(text)
    || /\b(?:fixed|firm)\b.{0,24}\b(?:all|every|both)\b/.test(text)
  );
  const listings = [];

  if (pairs.length >= 4 && pairs.length % 2 === 0) {
    for (let index = 0; index < pairs.length; index += 2) {
      const first = pairs[index];
      const second = pairs[index + 1];
      const firstRole = exchangePhraseRole(text, first.index);
      const secondRole = exchangePhraseRole(text, second.index);
      const sectionStart = index === 0 ? 0 : first.index;
      const sectionEnd = pairs[index + 2]?.index ?? text.length;
      const section = text.slice(sectionStart, sectionEnd);
      const listing = {
        have_currency: null,
        want_currency: null,
        have_amount: null,
        want_amount: null,
        listing_type: appliesFixedToAll || /\b(?:fixed|firm)\b/.test(section)
          ? "fixed"
          : "negotiable",
      };

      if (firstRole === "have" && secondRole === "want") {
        assignPair(listing, "have", first);
        assignPair(listing, "want", second);
      } else if (firstRole === "want" && secondRole === "have") {
        assignPair(listing, "want", first);
        assignPair(listing, "have", second);
      } else {
        assignPair(listing, "have", first);
        assignPair(listing, "want", second);
      }

      if (missingListingFields(listing).length || listing.have_currency === listing.want_currency) {
        return [];
      }
      listings.push(listing);
    }
    return listings;
  }

  const amounts = parseLooseAmountMentions(text);
  const sharedCurrencies = sharedBulkCurrencies(text);
  if (!sharedCurrencies || amounts.length < 4 || amounts.length % 2 !== 0) return [];

  const amountOrder = bulkAmountOrder(text, amounts, parseListingDetails(text));
  for (let index = 0; index < amounts.length; index += 2) {
    const first = amounts[index];
    const second = amounts[index + 1];
    const sectionEnd = amounts[index + 2]?.index ?? text.length;
    const section = text.slice(index === 0 ? 0 : first.index, sectionEnd);
    const haveAmount = amountOrder === "want_have" ? second.amount : first.amount;
    const wantAmount = amountOrder === "want_have" ? first.amount : second.amount;

    listings.push({
      ...sharedCurrencies,
      have_amount: haveAmount,
      want_amount: wantAmount,
      listing_type: appliesFixedToAll || /\b(?:fixed|firm)\b/.test(section)
        ? "fixed"
        : "negotiable",
    });
  }
  return listings;
}

function parseSearchDetails(input) {
  const text = normalizeExchangeText(input);
  const details = parseListingDetails(text);
  const compact = compactText(text);
  const needCurrency = new RegExp(`\\b(?:${WANT_ROLE_PHRASE}|change am|change it|convert am|convert it|swap am|swap it|turn am|turn it)\\b`).test(compact);
  const haveCurrency = new RegExp(`\\b(?:${HAVE_ROLE_PHRASE})\\b`).test(compact);
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
    const looseAmount = parseAmount(text);
    if (looseAmount && (role === "have" || role === "want" || needCurrency || haveCurrency)) {
      const resolvedRole = role || (haveCurrency && !needCurrency ? "have" : "want");
      return {
        have_currency: resolvedRole === "have" ? currencies[0] : null,
        want_currency: resolvedRole === "want" ? currencies[0] : null,
        have_amount: resolvedRole === "have" ? looseAmount : null,
        want_amount: resolvedRole === "want" ? looseAmount : null,
        max_want_amount: null,
        amount: looseAmount,
      };
    }
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
  const hasHaveSide = new RegExp(`\\b(?:${HAVE_ROLE_PHRASE})\\b`).test(value);
  const hasWantSide = new RegExp(`\\b(?:${WANT_ROLE_PHRASE}|change am|change it|convert am|convert it|swap am|swap it|turn am|turn it)\\b`).test(value);
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
    listing_type: context.listing_type || "negotiable",
  };

  return missingListingFields(draft).length === 0 ? draft : null;
}

module.exports = {
  exchangePhraseRole,
  mentionedCurrencyRole,
  parseListingDetails,
  parseBulkListingDetails,
  parseSearchDetails,
  missingListingFields,
  nextSearchStep,
  hasDirectionalExchangeText,
  mergePresentDetails,
  listingDraftFromSearch,
};
