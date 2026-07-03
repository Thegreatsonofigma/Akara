const { supabaseRequest, filterValue } = require("../lib/supabase");
const { title, caption, action, labeled, formatMoney, moneyNumber } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { normalizeCurrency, parseAmount, parseCurrencyAmountPairs, browseOfferCurrency, currencyHelpLine } = require("../nlp/currency");
const {
  parseSearchDetails,
  missingListingFields,
  nextSearchStep,
  hasDirectionalExchangeText,
  mergePresentDetails,
  listingDraftFromSearch,
} = require("../nlp/exchange");
const {
  isBrowseAllOffersIntent,
  isDeclineIntent,
  isCancelIntent,
  isSearchAgainIntent,
  isListingPublishIntent,
  isMoreResultsIntent,
} = require("../nlp/intents");
const { isVerified } = require("../db/users");
const { upsertSession, clearSession } = require("../db/sessions");
const { displayReference, listingShareUrl, listingTypeLabel } = require("../db/listings");
const { explainMissingListing } = require("../messages/copy");
const { prepareListingPreview, reserveListing } = require("./listing");

const LISTING_SEARCH_SELECT = "listings?select=id,listing_code,owner_user_id,have_currency,want_currency,have_amount,want_amount,rate,listing_type,created_at,users!listings_owner_user_id_fkey(completed_deals_count,verification_status)";

function searchPromptForStep(step, details = {}) {
  if (step === "have_currency") {
    return [title("What currency do you have?"), currencyHelpLine()].join("\n\n");
  }
  if (step === "want_currency") {
    return [title("What currency do you need?"), currencyHelpLine(details.have_currency)].join("\n\n");
  }
  if (step === "have_amount") {
    return [
      title(`How much ${details.have_currency} do you have?`),
      caption("Example: 50k"),
    ].join("\n");
  }
  if (step === "want_amount") {
    const have = details.have_amount && details.have_currency
      ? ` for ${formatMoney(details.have_amount, details.have_currency)}`
      : "";
    return [
      title(`How much ${details.want_currency} do you want${have}?`),
      caption("Example: 55k"),
    ].join("\n");
  }
  return "Tell me what you need.";
}

async function continueSearchOrShowMatches(user, details) {
  if (details.have_currency && details.want_currency && details.max_want_amount) {
    return showOfferMatches(user, details);
  }

  const step = nextSearchStep(details);
  if (step === "ready") return showOfferMatches(user, details);

  await upsertSession(user, user.whatsapp_phone, "find_offer", step, details);
  return searchPromptForStep(step, details);
}

async function showOfferMatches(user, context) {
  const maxReceiveAmount = context.max_want_amount || null;
  const exactQuery = [
    LISTING_SEARCH_SELECT,
    "status=eq.active",
    context.want_currency ? `have_currency=eq.${filterValue(context.want_currency)}` : "",
    context.have_currency ? `want_currency=eq.${filterValue(context.have_currency)}` : "",
    maxReceiveAmount ? `have_amount=lte.${filterValue(maxReceiveAmount)}` : "",
    `owner_user_id=neq.${filterValue(user.id)}`,
    "order=created_at.desc",
    "limit=5",
  ].filter(Boolean).join("&");

  let listings = (await supabaseRequest(exactQuery)).filter((listing) => listing.owner_user_id !== user.id);
  const draft = listingDraftFromSearch(context);
  const exactAutoOpen = draft
    ? listings.find((listing) => (
      moneyNumber(listing.have_amount) === moneyNumber(draft.want_amount)
      && moneyNumber(listing.want_amount) === moneyNumber(draft.have_amount)
      && listing.owner_user_id !== user.id
    ))
    : null;
  if (exactAutoOpen) {
    return reserveListing(user, exactAutoOpen);
  }

  const heading = listings.length
    ? title("Available offers")
    : title("Nearby offers");
  const subheading = listings.length
    ? caption("These are the closest live listings I found.")
    : caption("No exact offer, but these live listings may still work.");

  if (!listings.length) {
    const fallbackQuery = [
      LISTING_SEARCH_SELECT,
      "status=eq.active",
      context.want_currency ? `have_currency=eq.${filterValue(context.want_currency)}` : "",
      maxReceiveAmount ? `have_amount=lte.${filterValue(maxReceiveAmount)}` : "",
      `owner_user_id=neq.${filterValue(user.id)}`,
      "order=created_at.desc",
      "limit=5",
    ].filter(Boolean).join("&");
    listings = (await supabaseRequest(fallbackQuery)).filter((listing) => listing.owner_user_id !== user.id);
  }

  if (!listings.length) {
    if (draft) {
      return prepareListingPreview(user, draft, [
        title("No current offer"),
        "No live listing fits that request right now. I prepared yours for review.",
      ].join("\n"));
    }

    const partialDraft = {
      have_currency: context.have_currency,
      want_currency: context.want_currency,
      have_amount: context.have_amount,
      want_amount: context.want_amount,
      listing_type: context.listing_type || "fixed",
    };
    const missing = missingListingFields(partialDraft);
    if (partialDraft.have_currency && partialDraft.want_currency && missing.length < 4) {
      await upsertSession(user, user.whatsapp_phone, "create_listing", missing[0], partialDraft);
      return [
        title("No current offer"),
        "No live listing fits that request right now.",
        "",
        "If you want to list yours, I need one more detail:",
        "",
        explainMissingListing(missing, partialDraft),
      ].join("\n");
    }

    await clearSession(user, user.whatsapp_phone);
    return [
      "No live offers yet.",
      "",
      "You can make yours instead:",
      "I have 50k naira and want 55k RWF",
    ].join("\n");
  }

  const resultMap = {};
  listings.forEach((listing, index) => {
    resultMap[String(index + 1)] = listing.id;
  });

  await upsertSession(user, user.whatsapp_phone, "search_results", "select", {
    ...context,
    result_map: resultMap,
  });

  return [
    heading,
    subheading,
    "",
    listings.map((listing, index) => {
      const owner = listing.users || {};
      const shareUrl = listingShareUrl(listing.listing_code);
      return [
        title(`${index + 1}. ${displayReference(listing.listing_code, "listing")}`),
        labeled("You receive", formatMoney(listing.have_amount, listing.have_currency)),
        labeled("You send", formatMoney(listing.want_amount, listing.want_currency)),
        labeled("Rate", `1 ${listing.want_currency} gets ${(Number(listing.have_amount) / Number(listing.want_amount)).toFixed(4)} ${listing.have_currency}`),
        labeled("Terms", listingTypeLabel(listing.listing_type)),
        labeled("Owner record", `${owner.completed_deals_count || 0} completed`),
        shareUrl ? labeled("Link", shareUrl) : "",
      ].filter(Boolean).join("\n");
    }).join("\n\n"),
    "",
    title("Actions"),
    `${action("1")} or ${action("open 1")} to start an Akara Trade`,
    `${action("search again")} to try another pair`,
  ].join("\n");
}

async function showBrowseOffers(user, currency = null, page = 0) {
  const pageSize = 5;
  const offset = Math.max(0, Number(page || 0)) * pageSize;
  const query = [
    LISTING_SEARCH_SELECT,
    "status=eq.active",
    currency ? `or=(have_currency.eq.${filterValue(currency)},want_currency.eq.${filterValue(currency)})` : "",
    `owner_user_id=neq.${filterValue(user.id)}`,
    "order=created_at.desc",
    `limit=${pageSize + 1}`,
    `offset=${offset}`,
  ].filter(Boolean).join("&");

  const fetched = (await supabaseRequest(query)).filter((listing) => listing.owner_user_id !== user.id);
  const hasMore = fetched.length > pageSize;
  const listings = fetched.slice(0, pageSize);
  if (!listings.length) {
    return [
      title(page ? "No more offers" : currency ? `No ${currency} offers yet` : "No live offers yet"),
      "",
      page
        ? "You have reached the end of the current list."
        : currency
          ? `I could not find any live listing that includes ${currency}.`
          : "I could not find any live listing right now.",
      "",
      caption("You can create one by typing something like:"),
      action(currency ? `I have ${currency} and want NGN` : "I have 50k naira and want 55k RWF"),
    ].join("\n");
  }

  const resultMap = {};
  listings.forEach((listing, index) => {
    resultMap[String(index + 1)] = listing.id;
  });

  await upsertSession(user, user.whatsapp_phone, "search_results", "select", {
    browse_mode: true,
    browse_currency: currency,
    browse_page: page,
    has_more: hasMore,
    result_map: resultMap,
  });

  return [
    title(currency ? `All ${currency} offers` : "All live offers"),
    caption(page ? `Page ${page + 1}. Choose a number if one works for you.` : "Choose a number if one works for you."),
    "",
    listings.map((listing, index) => {
      const owner = listing.users || {};
      return [
        title(`${index + 1}. ${displayReference(listing.listing_code, "listing")}`),
        labeled("They offer", formatMoney(listing.have_amount, listing.have_currency)),
        labeled("They want", formatMoney(listing.want_amount, listing.want_currency)),
        labeled("Rate", `1 ${listing.want_currency} gets ${(Number(listing.have_amount) / Number(listing.want_amount)).toFixed(4)} ${listing.have_currency}`),
        labeled("Terms", listingTypeLabel(listing.listing_type)),
        labeled("Owner record", `${owner.completed_deals_count || 0} completed`),
      ].join("\n");
    }).join("\n\n"),
    "",
    title("Actions"),
    `${action("1")} or ${action("open 1")} to start an Akara Trade`,
    hasMore ? `${action("view more")} to see more offers` : "",
    `${action("search again")} to narrow it down`,
  ].filter(Boolean).join("\n");
}

// Users often mix a directional request with browse words, like "I have 2k
// naira and want rwf, show me available deals". When both sides of the pair
// are known we show matched offers for that pair instead of a generic browse.
async function showBrowseOrPairMatches(user, text, fallbackCurrency = null) {
  const details = parseSearchDetails(text);
  if (details.have_currency && details.want_currency) {
    return showOfferMatches(user, details);
  }
  return showBrowseOffers(user, browseOfferCurrency(text) || fallbackCurrency);
}

async function handleFindOffer(text, user, session) {
  const context = session.context_json || {};
  const step = session.current_step;

  if (isBrowseAllOffersIntent(text)) {
    await clearSession(user, user.whatsapp_phone);
    const merged = mergePresentDetails(context, parseSearchDetails(text));
    if (merged.have_currency && merged.want_currency) {
      return showOfferMatches(user, merged);
    }
    return showBrowseOffers(user, browseOfferCurrency(text) || context.want_currency || context.have_currency || null);
  }

  if (isDeclineIntent(text) || isCancelIntent(text)) {
    await clearSession(user, user.whatsapp_phone);
    return [
      title("No problem"),
      "",
      "I have closed that search.",
      "Tell me what you need next whenever you are ready.",
    ].join("\n");
  }

  if (step === "suggest_listing") {
    const numberedChoice = compactText(text);

    if (numberedChoice === "2" || isSearchAgainIntent(text)) {
      await upsertSession(user, user.whatsapp_phone, "find_offer", "quick", {});
      return [
        title("Search again"),
        "",
        "Tell me what you need.",
        "",
        caption("Example"),
        "`I want RWF deals under 1,000`",
      ].join("\n");
    }

    if (numberedChoice === "1" || isListingPublishIntent(text)) {
      return prepareListingPreview(user, context.suggested_listing);
    }

    if (hasDirectionalExchangeText(text) || parseCurrencyAmountPairs(text).length) {
      const details = mergePresentDetails({}, parseSearchDetails(text));
      return continueSearchOrShowMatches(user, details);
    }

    if (/\b(search|find|show|look)\b/i.test(text)) {
      await upsertSession(user, user.whatsapp_phone, "find_offer", "quick", {});
      return [
        title("Search again"),
        "",
        "Tell me what you need.",
        "",
        caption("Example"),
        "`I want RWF deals under 1,000`",
      ].join("\n");
    }

    return [
      title("Choose next step"),
      "",
      `${action("list it")} or ${action("publish this list")} to create your own listing`,
      `${action("search again")} to try another search`,
    ].join("\n");
  }

  if (step === "quick") {
    const details = {
      ...context,
      ...Object.fromEntries(Object.entries(parseSearchDetails(text)).filter(([, value]) => value)),
    };

    return continueSearchOrShowMatches(user, details);
  }

  if (hasDirectionalExchangeText(text)) {
    const details = mergePresentDetails(context, parseSearchDetails(text));
    return continueSearchOrShowMatches(user, details);
  }

  if (step === "have_currency") {
    const currency = normalizeCurrency(text);
    if (!currency) return [title("Choose what you have"), currencyHelpLine()].join("\n\n");

    context.have_currency = currency;
    return continueSearchOrShowMatches(user, context);
  }

  if (step === "want_currency") {
    const currency = normalizeCurrency(text);
    if (!currency) return [title("Choose what you need"), currencyHelpLine(context.have_currency)].join("\n\n");
    if (currency === context.have_currency) return "Choose a different currency from the one you have.";

    context.want_currency = currency;
    return continueSearchOrShowMatches(user, context);
  }

  if (step === "amount" || step === "have_amount" || step === "want_amount") {
    const amount = parseAmount(text);
    if (!amount) return "Enter a valid amount, like 55000.";

    const currency = normalizeCurrency(text);
    if (step === "want_amount" || currency === context.want_currency) {
      context.want_amount = amount;
    } else {
      context.have_amount = amount;
    }
    context.amount = amount;
    return continueSearchOrShowMatches(user, context);
  }

  await clearSession(user, user.whatsapp_phone);
  return "I reset that search. Tell me what you need when you are ready.";
}

async function handleSearchResults(text, user, session) {
  if (!isVerified(user)) {
    await clearSession(user, user.whatsapp_phone);
    return "You need to verify before opening an Akara Trade. Type verify to start.";
  }

  if (isBrowseAllOffersIntent(text)) {
    await clearSession(user, user.whatsapp_phone);
    return showBrowseOrPairMatches(user, text);
  }

  if (session.context_json?.browse_mode && isMoreResultsIntent(text)) {
    const context = session.context_json || {};
    return showBrowseOffers(user, context.browse_currency || null, Number(context.browse_page || 0) + 1);
  }

  if (isDeclineIntent(text) || isCancelIntent(text)) {
    await clearSession(user, user.whatsapp_phone);
    return [
      title("No problem"),
      "",
      "I have closed that selection.",
      "Tell me what you need next whenever you are ready.",
    ].join("\n");
  }

  if (hasDirectionalExchangeText(text) || parseCurrencyAmountPairs(text).length) {
    const details = parseSearchDetails(text);
    if (details.have_currency && details.want_currency) {
      return continueSearchOrShowMatches(user, details);
    }
  }

  const context = session.context_json || {};
  const resultNumbers = Object.keys(context.result_map || {});
  const selectedNumber = String(text || "").match(/\d+/)?.[0];
  const wantsDeal = /\b(interested|deal|take|reserve|accept|yes|go ahead|i want it|pick this)\b/i.test(text);
  const impliedNumber = wantsDeal && resultNumbers.length === 1 ? resultNumbers[0] : null;
  const selectedListingId = context.result_map?.[selectedNumber || impliedNumber || text.trim()];
  if (!selectedListingId) {
    if (wantsDeal && resultNumbers.length > 1) return "Which one should I open? Reply open 1, open 2, or the offer number.";
    return "Choose a valid offer number, or type cancel.";
  }

  const listings = await supabaseRequest(`listings?id=eq.${filterValue(selectedListingId)}&status=eq.active&limit=1`);
  const listing = listings[0];
  if (!listing) {
    await clearSession(user, user.whatsapp_phone);
    return "That offer is no longer available. Type find offers to search again.";
  }

  return reserveListing(user, listing);
}

module.exports = {
  continueSearchOrShowMatches,
  showOfferMatches,
  showBrowseOffers,
  showBrowseOrPairMatches,
  handleFindOffer,
  handleSearchResults,
};
