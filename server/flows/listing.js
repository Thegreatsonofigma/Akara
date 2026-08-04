const { supabaseRequest, filterValue } = require("../lib/supabase");
const { sendWhatsAppText, sendWhatsAppButtons } = require("../lib/whatsapp");
const { config } = require("../config");
const { title, caption, action, labeled, fieldBlock, formatMoney, moneyNumber, positiveMoney, formatCooldown } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { normalizeCurrency, parseAmount, parseCurrencyAmountPairs } = require("../nlp/currency");
const {
  parseListingDetails,
  missingListingFields,
  hasDirectionalExchangeText,
  mergePresentDetails,
} = require("../nlp/exchange");
const {
  isEditIntent,
  isCancelIntent,
  isDeclineIntent,
  isSearchAgainIntent,
  isListingPublishIntent,
  isReminderIntent,
} = require("../nlp/intents");
const {
  getUserById,
  updateUser,
  isVerified,
  isOnHold,
  tierLimitBlockForAmount,
  tierLimitBlockForListing,
  swapRestrictionBlockForPair,
} = require("../db/users");
const { upsertSession, clearSession } = require("../db/sessions");
const { getDefaultPaymentProfile, getPaymentProfiles, formatPaymentProfile, paymentExpectationLine } = require("../db/payments");
const { sendListingCard } = require("../lib/listing-card");
const {
  displayReference,
  generateReferenceCode,
  listingShareUrl,
  listingTypeLabel,
  listingStatusDisplay,
  listingHasEnoughForDeal,
  createRatePreservingResidualListing,
  createRatePreservingWantResidualListing,
} = require("../db/listings");
const { mainMenu, feeIncludedText, listingShareCopy, explainMissingListing, currencyListReply } = require("../messages/copy");
const { startPaymentProfileForCurrency } = require("./payment-profile");
const { createLockedQuote, attachQuoteToDeal, cancelLockedQuote } = require("../db/quotes");
const { releaseExpiredInstantReservations } = require("../db/instant-fulfillment");
const { getBlockingOpenDealForUser, dealReservationExpiresAt } = require("../db/deals");
const { offerInstantFulfillment } = require("./instant-fulfillment");
const {
  buildClearingPlan,
  buildNegotiationPlan,
  compareClearingPlans,
  compareNegotiationPlans,
} = require("../lib/matching-engine");

const NEGOTIATION_REMINDER_COOLDOWN_MS = 10 * 60 * 1000;
const autoMatchRequeueTasks = new Map();
let smartMatchingSweepTask = null;
let pendingMatchReminderSweepTask = null;
let smartMatchingSweepOffset = 0;

function promptTextPart(value) {
  return typeof value === "string" ? value.trim() : "";
}

function mergePromptText(...parts) {
  return parts.map(promptTextPart).filter(Boolean).join("\n\n");
}

function prependPromptText(prompt, intro) {
  const cleanIntro = promptTextPart(intro);
  if (!cleanIntro) return prompt;
  if (!prompt || typeof prompt === "string") {
    return mergePromptText(cleanIntro, prompt || "");
  }
  if (Array.isArray(prompt)) {
    return [cleanIntro, ...prompt].filter(Boolean);
  }

  if (prompt.type === "whatsapp_list" && prompt.list && typeof prompt.list === "object") {
    const existingBody = promptTextPart(prompt.list.body);
    const fallbackSource = promptTextPart(prompt.fallbackText) || existingBody;
    const mergedBody = mergePromptText(cleanIntro, existingBody) || cleanIntro;
    return {
      ...prompt,
      list: { ...prompt.list, body: mergedBody },
      fallbackText: mergePromptText(cleanIntro, fallbackSource) || mergedBody,
    };
  }

  if (prompt.type === "whatsapp_buttons") {
    const existingBody = promptTextPart(prompt.body);
    const fallbackSource = promptTextPart(prompt.fallbackText) || existingBody;
    const mergedBody = mergePromptText(cleanIntro, existingBody) || cleanIntro;
    return {
      ...prompt,
      body: mergedBody,
      fallbackText: mergePromptText(cleanIntro, fallbackSource) || mergedBody,
    };
  }

  const existingBody =
    promptTextPart(prompt.body)
    || promptTextPart(prompt.text)
    || promptTextPart(prompt.message)
    || promptTextPart(prompt.fallbackText);
  const merged = mergePromptText(cleanIntro, existingBody) || cleanIntro;
  if (Object.prototype.hasOwnProperty.call(prompt, "body")) return { ...prompt, body: merged };
  if (Object.prototype.hasOwnProperty.call(prompt, "text")) return { ...prompt, text: merged };
  if (Object.prototype.hasOwnProperty.call(prompt, "message")) return { ...prompt, message: merged };
  if (Object.prototype.hasOwnProperty.call(prompt, "fallbackText")) return { ...prompt, fallbackText: merged };
  return { ...prompt, fallbackText: merged };
}

function normalizeRiskText(value) {
  return compactText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeRiskCountry(value) {
  return normalizeRiskText(value).replace(/\s+/g, "");
}

function payoutRiskRefs(profile) {
  if (!profile) return [];
  const refs = [];
  const accountNumber = String(profile.account_number_encrypted || "").replace(/\D/g, "");
  const momoNumber = String(profile.momo_number_encrypted || "").replace(/\D/g, "");
  const accountName = normalizeRiskText(profile.account_name);

  if (accountNumber.length >= 6) refs.push(`bank:${accountNumber}`);
  if (momoNumber.length >= 6) refs.push(`momo:${momoNumber}`);
  if (accountName && profile.currency) refs.push(`name:${profile.currency}:${accountName}`);
  return refs;
}

function usersLookLinked(owner, taker) {
  const ownerName = normalizeRiskText(owner?.legal_name);
  const takerName = normalizeRiskText(taker?.legal_name);
  if (!ownerName || !takerName || ownerName !== takerName) return false;

  const ownerCountries = new Set([
    normalizeRiskCountry(owner.nationality),
    normalizeRiskCountry(owner.residence_country),
  ].filter(Boolean));
  const takerCountries = [
    normalizeRiskCountry(taker.nationality),
    normalizeRiskCountry(taker.residence_country),
  ].filter(Boolean);

  return ownerName.length >= 8 && (
    !ownerCountries.size ||
    !takerCountries.length ||
    takerCountries.some((country) => ownerCountries.has(country))
  );
}

async function profilesLookLinked(ownerUserId, takerUserId) {
  const [ownerProfiles, takerProfiles] = await Promise.all([
    getPaymentProfiles(ownerUserId),
    getPaymentProfiles(takerUserId),
  ]);
  const ownerRefs = new Set(ownerProfiles.flatMap(payoutRiskRefs));
  if (!ownerRefs.size) return false;
  return takerProfiles.some((profile) =>
    payoutRiskRefs(profile).some((ref) => ownerRefs.has(ref))
  );
}

async function markLinkedAccountRisk(ownerUserId, takerUserId, reason) {
  await Promise.allSettled([
    updateUser(ownerUserId, { risk_status: "watch" }),
    updateUser(takerUserId, { risk_status: "watch" }),
  ]);
  console.warn(`[risk] linked-account trade attempt blocked: owner=${ownerUserId} taker=${takerUserId} reason=${reason}`);
}

function linkedAccountBlockedMessage(listing) {
  return [
    title("Trade paused for safety"),
    "",
    `I cannot open ${action(displayReference(listing.listing_code, "listing"))} from this WhatsApp profile.`,
    "",
    "This listing appears linked to another Akara profile or payout detail. If this is a mistake, contact support for review.",
  ].join("\n");
}

async function linkedAccountBlock(user, listing) {
  if (!listing?.owner_user_id || listing.owner_user_id === user.id) return "";

  const owner = await getUserById(listing.owner_user_id);
  if (!owner) return "";

  if (usersLookLinked(owner, user)) {
    await markLinkedAccountRisk(listing.owner_user_id, user.id, "same verified identity");
    return linkedAccountBlockedMessage(listing);
  }

  if (await profilesLookLinked(listing.owner_user_id, user.id)) {
    await markLinkedAccountRisk(listing.owner_user_id, user.id, "shared payout detail");
    return linkedAccountBlockedMessage(listing);
  }

  return "";
}

function fundsDisclaimer() {
  return "Akara locks the terms and records the exchange. Money moves directly between both accounts.";
}

function activeTradeBlockReply(deal) {
  const body = [
    title("Finish your open trade first"),
    caption("Akara allows one open trade at a time so payments and payout details do not get mixed up."),
    "",
    labeled("Current trade", displayReference(deal.deal_code, "deal")),
    labeled("Status", String(deal.status || "open").replace(/_/g, " ")),
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "trade_status", title: "View open trade" },
  ], [
    body,
    "",
    `${action("trade status")} to return to your open trade`,
  ].join("\n"));
}

function peerHasOpenTradeReply() {
  return [
    title("This peer is completing another trade"),
    caption("Akara keeps every person in one payment room at a time to prevent payment mix-ups."),
    "",
    "This listing remains live. I will check it again when the peer becomes available.",
  ].join("\n");
}

async function tradeOpeningBlock(user, otherUserId) {
  const yourOpenTrade = await getBlockingOpenDealForUser(user.id);
  if (yourOpenTrade) {
    await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
      deal_id: yourOpenTrade.id,
      deal_code: yourOpenTrade.deal_code,
    });
    return activeTradeBlockReply(yourOpenTrade);
  }

  const otherOpenTrade = await getBlockingOpenDealForUser(otherUserId);
  if (otherOpenTrade) return peerHasOpenTradeReply();
  return null;
}

function isSingleTradeConstraintError(error) {
  return /AKARA_ACTIVE_TRADE_EXISTS/i.test(String(error?.message || ""));
}

async function holdListingForTierReview(user, context, tierBlock) {
  await upsertSession(user, user.whatsapp_phone, "kyc_upgrade", "pending_admin", {
    return_flow: "publish_listing",
    pending_listing: context,
  });
  await createTierReviewRequest(user, context, tierBlock);

  return [
    tierBlock,
    "",
    "I saved this listing draft. Once your higher tier is approved, Akara will publish it for you.",
  ].join("\n");
}

async function createTierReviewRequest(user, context, tierBlock) {
  const reason = [
    "Tier upgrade needed before this listing can go live.",
    `Draft: ${formatMoney(context.have_amount, context.have_currency)} for ${formatMoney(context.want_amount, context.want_currency)}.`,
    compactText(tierBlock),
  ].filter(Boolean).join(" ");

  const existing = await supabaseRequest(
    `verification_requests?user_id=eq.${filterValue(user.id)}&status=eq.pending_review&order=created_at.desc&limit=1`
  );

  const payload = {
    status: "pending_review",
    automated_decision: "tier_upgrade_required",
    automated_reason: reason,
  };

  if (existing[0]) {
    await supabaseRequest(`verification_requests?id=eq.${filterValue(existing[0].id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return;
  }

  await supabaseRequest("verification_requests", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.id,
      ...payload,
    }),
  });
}

function listingLiveMessage(heading, listingCode, listing, shareUrl) {
  const code = displayReference(listingCode, "listing");
  return [
    title(heading),
    "Your swap card is attached.",
    "",
    `*Reference:* ${action(code)}`,
    "",
    `*You send:* ${title(formatMoney(listing.have_amount, listing.have_currency))}`,
    "",
    `*You receive:* ${title(formatMoney(listing.want_amount, listing.want_currency))}`,
    "",
    `*Terms:* ${action(listingTypeLabel(listing.listing_type || "negotiable"))}`,
    "",
    `*Service fee:* ${feeIncludedText()}`,
    "",
    title("Share"),
    shareUrl ? shareUrl : action(`open ${code}`),
    listingShareCopy(),
  ].filter(Boolean).join("\n\n");
}

async function deliverListingLive(user, listing, listingCode, message) {
  if (config.sendMode === "log") {
    sendListingCard(
      user.whatsapp_phone,
      listing,
      `Listing card for ${displayReference(listingCode, "listing")}`
    ).catch((error) => {
      console.error(`[listing] card send failed for ${listingCode}: ${error.message}`);
    });
    return message;
  }

  try {
    await sendListingCard(user.whatsapp_phone, listing, message);
    return "";
  } catch (error) {
    console.error(`[listing] card send failed for ${listingCode}: ${error.message}`);
    return message;
  }
}

async function deliverListingWithInstantOption(user, listing, heading) {
  const shareUrl = listingShareUrl(listing);
  const liveMessage = listingLiveMessage(
    heading,
    listing.listing_code,
    listing,
    shareUrl
  );
  const deliveryReply = await deliverListingLive(
    user,
    listing,
    listing.listing_code,
    liveMessage
  );
  const instantReply = await offerInstantFulfillment(user, listing);
  if (instantReply) return deliveryReply ? [deliveryReply, instantReply] : instantReply;
  await clearSession(user, user.whatsapp_phone);
  return deliveryReply;
}

function tradeOpenedMessage({
  heading,
  intro,
  valueHighlight,
  dealCode,
  youSend,
  youReceive,
  paymentProfile,
  expectedProfile,
  residualLine = "",
  firstInstruction,
}) {
  const facts = [
    labeled("You send", formatMoney(youSend.amount, youSend.currency)),
    labeled("You receive", formatMoney(youReceive.amount, youReceive.currency)),
    `*Rate:* Locked · *Time:* ${Math.round(config.tradePaymentWindowMs / 60000)} min · *Fee:* ${feeIncludedText()}`,
    residualLine ? labeled("Still listed", residualLine) : "",
  ].filter(Boolean).join("\n");

  const body = [
    title(`${heading} · ${dealCode}`),
    valueHighlight ? `✨ ${title(valueHighlight)}` : "",
    intro ? caption(intro) : "",
    facts,
    title("Pay this account"),
    formatPaymentProfile(paymentProfile),
    title("Where yours will arrive"),
    caption(paymentExpectationLine(youReceive.amount, youReceive.currency, expectedProfile)),
    firstInstruction,
    fundsDisclaimer(),
  ].filter(Boolean).join("\n\n");

  return {
    type: "whatsapp_buttons",
    body,
    buttons: [
      { id: "paid", title: "Paid" },
      { id: "received", title: "Received" },
      { id: "dispute", title: "Dispute" },
    ],
    preserveLayout: true,
    fallbackText: [
      body,
      "",
      `${action("paid")} after you send`,
      `${action("received")} when your money lands`,
      `${action("dispute")} if anything looks wrong`,
    ].join("\n"),
  };
}

async function sendTradeOpenedNotice(phone, notice) {
  if (notice?.type === "whatsapp_buttons") {
    return sendWhatsAppButtons(phone, notice);
  }
  return sendWhatsAppText(phone, notice);
}

function formatListingReview(context) {
  const rate = context.want_amount / context.have_amount;
  return [
    title("Review listing"),
    caption("Check the details before this goes live."),
    "",
    labeled("Reference", displayReference(context.listing_code, "listing")),
    "",
    title("1. Exchange"),
    labeled("You send", formatMoney(context.have_amount, context.have_currency)),
    labeled("You receive", formatMoney(context.want_amount, context.want_currency)),
    "",
    title("2. Rate"),
    labeled("Rate", `1 ${context.have_currency} = ${rate.toFixed(4)} ${context.want_currency}`),
    labeled("Terms", action(listingTypeLabel(context.listing_type || "negotiable"))),
    "",
    title("3. Fee"),
    labeled("Service fee", feeIncludedText()),
    "",
    title("Actions"),
    `${action("publish")} to make it live`,
    `${action("edit")} to change it`,
    `${action("cancel")} to stop`,
  ].join("\n");
}

function whatsappButtonsReply(body, buttons, fallbackText = body) {
  return {
    type: "whatsapp_buttons",
    body,
    buttons,
    fallbackText,
  };
}

function listingReviewReply(context, intro = "") {
  const body = [intro, formatListingReview(context)].filter(Boolean).join("\n\n");
  return whatsappButtonsReply(body, [
    { id: "publish", title: "Publish" },
    { id: "edit", title: "Edit" },
    { id: "cancel", title: "Cancel" },
  ]);
}

async function findActiveDuplicateListing(user, context) {
  if (!context.have_currency || !context.want_currency || !context.have_amount || !context.want_amount) return null;

  const rows = await supabaseRequest([
    "listings?select=id,listing_code,status,have_currency,want_currency,have_amount,want_amount,listing_type,created_at",
    `owner_user_id=eq.${filterValue(user.id)}`,
    "status=in.(active,reserved,paused)",
    `have_currency=eq.${filterValue(context.have_currency)}`,
    `want_currency=eq.${filterValue(context.want_currency)}`,
    `have_amount=eq.${filterValue(moneyNumber(context.have_amount))}`,
    `want_amount=eq.${filterValue(moneyNumber(context.want_amount))}`,
    `listing_type=eq.${filterValue(context.listing_type || "negotiable")}`,
    "order=created_at.desc",
    "limit=3",
  ].join("&"));

  return rows.find((listing) => listing.id !== context.editing_listing_id) || null;
}

function duplicateListingReply(listing) {
  const body = [
    title("Listing already live"),
    "",
    "You already have this exact offer open on Akara.",
    "",
    labeled("Reference", displayReference(listing.listing_code, "listing")),
    labeled("Status", listingStatusDisplay(listing.status)),
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "my_listings", title: "My listings" },
    { id: "find_offers", title: "Find offers" },
  ], [
    body,
    "",
    `${action("my listings")} to manage it`,
    `${action("find offers")} to browse live offers`,
  ].join("\n"));
}

function listingIdentityKey(context) {
  return [
    context.have_currency,
    moneyNumber(context.have_amount),
    context.want_currency,
    moneyNumber(context.want_amount),
    context.listing_type || "negotiable",
  ].join(":");
}

function nextListingCode(code, offset) {
  const match = String(code || "").match(/^(.*-)(\d+)$/);
  if (!match) return code;
  const [, prefix, sequence] = match;
  return `${prefix}${String(Number(sequence) + offset).padStart(sequence.length, "0")}`;
}

async function partitionBulkListings(user, listings) {
  const unique = [];
  const duplicates = [];
  const seen = new Map();

  for (let index = 0; index < listings.length; index += 1) {
    const listing = {
      ...listings[index],
      listing_type: listings[index].listing_type || "negotiable",
    };
    const key = listingIdentityKey(listing);
    if (seen.has(key)) {
      duplicates.push({
        index,
        listing,
        reason: "Repeated in this message",
        duplicateOf: seen.get(key) + 1,
      });
      continue;
    }

    seen.set(key, index);
    const existing = await findActiveDuplicateListing(user, listing);
    if (existing) {
      duplicates.push({
        index,
        listing,
        reason: "Already open",
        existing,
      });
      continue;
    }
    unique.push(listing);
  }

  return { unique, duplicates };
}

function bulkDuplicateLines(duplicates) {
  if (!duplicates.length) return [];
  return [
    title(`${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"} skipped`),
    ...duplicates.flatMap((duplicate) => [
      "",
      `${duplicate.index + 1}. ${formatMoney(duplicate.listing.have_amount, duplicate.listing.have_currency)} for ${formatMoney(duplicate.listing.want_amount, duplicate.listing.want_currency)}`,
      duplicate.existing
        ? labeled("Existing reference", displayReference(duplicate.existing.listing_code, "listing"))
        : caption(`Same as item ${duplicate.duplicateOf} in this message.`),
    ]),
  ];
}

function bulkListingReviewReply(listings, duplicates = [], intro = "") {
  const body = [
    intro,
    title(`Review ${listings.length} listing${listings.length === 1 ? "" : "s"}`),
    caption("One confirmation will publish every listing shown below."),
    ...listings.flatMap((listing, index) => [
      "",
      title(`${index + 1}. ${listing.have_currency} to ${listing.want_currency}`),
      labeled("Reference", displayReference(listing.listing_code, "listing")),
      labeled("You send", formatMoney(listing.have_amount, listing.have_currency)),
      labeled("You receive", formatMoney(listing.want_amount, listing.want_currency)),
      labeled("Terms", action(listingTypeLabel(listing.listing_type || "negotiable"))),
    ]),
    "",
    labeled("Service fee", feeIncludedText()),
    ...bulkDuplicateLines(duplicates),
  ].filter(Boolean).join("\n");

  return whatsappButtonsReply(body, [
    { id: "publish_bulk", title: "Publish all" },
    { id: "cancel", title: "Cancel" },
  ], [
    body,
    "",
    `${action("publish all")} to make these listings live`,
    `${action("cancel")} to stop`,
  ].join("\n"));
}

function allBulkListingsDuplicateReply(duplicates) {
  const body = [
    title("Nothing new to publish"),
    "",
    "Every listing in that message is already open or repeated.",
    ...bulkDuplicateLines(duplicates),
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "my_listings", title: "My listings" },
    { id: "make_offer", title: "New listings" },
  ]);
}

async function assignBulkListingCodes(listings) {
  const firstMissingIndex = listings.findIndex((listing) => !listing.listing_code);
  if (firstMissingIndex < 0) return listings;

  const firstCode = await generateReferenceCode("listing");
  let offset = 0;
  return listings.map((listing) => {
    if (listing.listing_code) return listing;
    const listingCode = nextListingCode(firstCode, offset);
    offset += 1;
    return { ...listing, listing_code: listingCode };
  });
}

async function prepareBulkListingPreview(user, details, intro = "") {
  if (!Array.isArray(details) || details.length < 2) {
    return "Send at least two complete listings, with a send amount and receive amount for each one.";
  }
  if (details.length > 10) {
    return "You can publish up to 10 listings in one message. Split this batch and send the rest next.";
  }

  const { unique, duplicates } = await partitionBulkListings(user, details);
  if (!unique.length) {
    await clearSession(user, user.whatsapp_phone);
    return allBulkListingsDuplicateReply(duplicates);
  }

  for (let index = 0; index < unique.length; index += 1) {
    const tierBlock = tierLimitBlockForListing(user, unique[index]);
    if (tierBlock) {
      await clearSession(user, user.whatsapp_phone);
      return [
        title(`Listing ${index + 1} needs a higher limit`),
        "",
        tierBlock,
        "",
        "Nothing in this batch was published. Reduce that value or complete the account upgrade first.",
      ].join("\n");
    }
  }

  for (const listing of unique) {
    const receiveProfile = await getDefaultPaymentProfile(user.id, listing.want_currency);
    if (!receiveProfile) {
      const prompt = await startPaymentProfileForCurrency(user, listing.want_currency, {
        return_flow: "preview_bulk_listings",
        pending_listings: unique,
      });
      return prependPromptText(
        prompt,
        [
          intro,
          title("Add payout detail"),
          caption(`Your bulk draft needs a ${listing.want_currency} payout detail before review.`),
        ].filter(Boolean).join("\n\n")
      );
    }
  }

  const listings = await assignBulkListingCodes(unique);
  await upsertSession(user, user.whatsapp_phone, "bulk_listing", "confirm", {
    listings,
  });
  return bulkListingReviewReply(listings, duplicates, intro);
}

// Opens the edit conversation for a listing draft: keeps only the edit
// metadata (which listing is being edited, its code, and the status to
// restore on cancel) and asks for fresh details. Used by the review screen's
// "edit" reply and by a direct edit request from profile settings, so a user
// who asks to edit is never bounced through the review screen first.
async function startListingEdit(user, context, intro = title("Edit listing")) {
  const hasReviewDetails = context.have_currency && context.want_currency && context.have_amount && context.want_amount;
  if (!hasReviewDetails) {
    const editContext = {
      ...(context.editing_listing_id ? { editing_listing_id: context.editing_listing_id } : {}),
      ...(context.listing_code ? { listing_code: context.listing_code } : {}),
      ...(context.previous_listing_status ? { previous_listing_status: context.previous_listing_status } : {}),
    };
    await upsertSession(user, user.whatsapp_phone, "create_listing", "have_currency", editContext);
    return currencyListReply({
      mode: "have",
      body: [intro, "What currency do you have?"].filter(Boolean).join("\n\n"),
    });
  }

  await upsertSession(user, user.whatsapp_phone, "create_listing", "edit_choice", context);
  return listingEditMenu(context);
}

function listingEditMenu(context, intro = title("What do you want to edit?")) {
  const body = [
    intro,
    caption("Choose only the part you want to change."),
    "",
    `1. ${action("send amount")} ${formatMoney(context.have_amount, context.have_currency)}`,
    `2. ${action("receive amount")} ${formatMoney(context.want_amount, context.want_currency)}`,
    `3. ${action("terms")} ${listingTypeLabel(context.listing_type || "negotiable")}`,
    `4. ${action("currencies")}`,
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "publish", title: "Publish" },
    { id: "cancel", title: "Cancel" },
  ], [
    body,
    "",
    `${action("publish")} to continue with publication`,
    `${action("cancel")} to stop`,
  ].join("\n"));
}

function listingEditChoice(text) {
  const command = compactText(text);
  if (/^(1|send amount|send|have amount|amount i send|amount to send)$/.test(command)) return "have_amount";
  if (/^(2|receive amount|receive|get amount|want amount|amount i receive|amount to receive)$/.test(command)) return "want_amount";
  if (/^(3|terms|term|rate terms|fixed|flexible|negotiable)$/.test(command)) return "terms";
  if (/^(4|currencies|currency|pair|currency pair)$/.test(command)) return "currencies";
  if (/\bsend\b.*\bamount\b/.test(command) || /\bhave\b.*\bamount\b/.test(command)) return "have_amount";
  if (/\b(receive|get|want)\b.*\bamount\b/.test(command)) return "want_amount";
  if (/\b(term|fixed|flexible|negotiable)\b/.test(command)) return "terms";
  if (/\bcurrenc(y|ies)|pair\b/.test(command)) return "currencies";
  return null;
}

function missingListingReply(fields, context = {}) {
  if (fields.includes("have_currency")) {
    return currencyListReply({ mode: "have", body: "Tell me what currency you have." });
  }
  if (fields.includes("want_currency")) {
    return currencyListReply({
      mode: "want",
      body: "Tell me what currency you want in return.",
      excludeCurrency: context.have_currency || null,
    });
  }
  return explainMissingListing(fields, context);
}

async function prepareListingPreview(user, details, intro = "") {
  const context = {
    have_currency: details.have_currency,
    want_currency: details.want_currency,
    have_amount: details.have_amount,
    want_amount: details.want_amount,
    listing_type: details.listing_type || "negotiable",
    listing_code: details.listing_code || await generateReferenceCode("listing"),
    ...(details.editing_listing_id ? { editing_listing_id: details.editing_listing_id } : {}),
    ...(details.previous_listing_status ? { previous_listing_status: details.previous_listing_status } : {}),
    ...(details.republished_from_listing_id
      ? { republished_from_listing_id: details.republished_from_listing_id }
      : {}),
  };

  const duplicate = await findActiveDuplicateListing(user, context);
  if (duplicate) {
    await clearSession(user, user.whatsapp_phone);
    return duplicateListingReply(duplicate);
  }

  const receiveProfile = await getDefaultPaymentProfile(user.id, context.want_currency);
  if (!receiveProfile) {
    const prompt = await startPaymentProfileForCurrency(user, context.want_currency, {
      return_flow: "preview_listing",
      pending_listing: context,
    });
    return prependPromptText(
      prompt,
      [
        intro,
        title("Add payout detail"),
        caption(`Before I show the final review, add where you want to receive ${context.want_currency}.`),
      ].filter(Boolean).join("\n\n")
    );
  }

  await upsertSession(user, user.whatsapp_phone, "create_listing", "confirm", context);
  return listingReviewReply(context, intro);
}

async function createListingRecord(user, context) {
  const listingCode = context.listing_code || await generateReferenceCode("listing");
  const createdListings = await supabaseRequest("listings", {
    method: "POST",
    body: JSON.stringify({
      owner_user_id: user.id,
      listing_code: listingCode,
      have_currency: context.have_currency,
      want_currency: context.want_currency,
      have_amount: context.have_amount,
      want_amount: context.want_amount,
      listing_type: context.listing_type || "negotiable",
      status: context.status || "active",
    }),
  });
  return createdListings[0];
}

async function publishListing(user, context) {
  const restrictionBlock = swapRestrictionBlockForPair(user, context.have_currency, context.want_currency);
  if (restrictionBlock) return restrictionBlock;
  const tierBlock = tierLimitBlockForListing(user, context);
  if (tierBlock) return holdListingForTierReview(user, context, tierBlock);

  const duplicate = await findActiveDuplicateListing(user, context);
  if (duplicate) {
    await clearSession(user, user.whatsapp_phone);
    return duplicateListingReply(duplicate);
  }

  const receiveProfile = await getDefaultPaymentProfile(user.id, context.want_currency);
  if (!receiveProfile) {
    const prompt = await startPaymentProfileForCurrency(user, context.want_currency, {
      return_flow: "publish_listing",
      pending_listing: context,
    });
    return prependPromptText(
      prompt,
      `Before this goes live, add your ${context.want_currency} payout detail.`
    );
  }

  if (context.editing_listing_id) {
    const rows = await supabaseRequest(
      `listings?id=eq.${filterValue(context.editing_listing_id)}&owner_user_id=eq.${filterValue(user.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          listing_code: context.listing_code || await generateReferenceCode("listing"),
          have_currency: context.have_currency,
          want_currency: context.want_currency,
          have_amount: context.have_amount,
          want_amount: context.want_amount,
          listing_type: context.listing_type || "negotiable",
          status: "active",
        }),
      }
    );
    const listing = rows[0];
    if (!listing) {
      await clearSession(user, user.whatsapp_phone);
      return "I could not find that listing anymore. Open profile to check your current listings.";
    }

    const autoMatchReply = await tryAutoMatchListing(user, listing);
    if (autoMatchReply) return autoMatchReply;
    const negotiationReply = await tryStartReciprocalNegotiation(user, listing);
    if (negotiationReply) return negotiationReply;
    const currentListing = await listingById(listing.id);
    if (currentListing?.status !== "active") return "";

    return deliverListingWithInstantOption(user, listing, "Listing updated ✅");
  }

  const listing = await createListingRecord(user, context);
  const listingCode = listing.listing_code;

  if (context.republished_from_listing_id) {
    const shareUrl = listingShareUrl(listing);
    const liveMessage = listingLiveMessage("Listing reopened ✅", listingCode, listing, shareUrl);
    const deliveryReply = await deliverListingLive(user, listing, listingCode, liveMessage);
    const autoMatchReply = await tryAutoMatchListing(user, listing);
    if (autoMatchReply) return deliveryReply ? [deliveryReply, autoMatchReply] : autoMatchReply;
    const negotiationReply = await tryStartReciprocalNegotiation(user, listing);
    if (negotiationReply) return deliveryReply ? [deliveryReply, negotiationReply] : negotiationReply;

    const instantReply = await offerInstantFulfillment(user, listing);
    if (instantReply) return deliveryReply ? [deliveryReply, instantReply] : instantReply;
    await clearSession(user, user.whatsapp_phone);
    return deliveryReply;
  }

  const autoMatchReply = await tryAutoMatchListing(user, listing);
  if (autoMatchReply) return autoMatchReply;
  const negotiationReply = await tryStartReciprocalNegotiation(user, listing);
  if (negotiationReply) return negotiationReply;
  const currentListing = await listingById(listing.id);
  if (currentListing?.status !== "active") return "";

  return deliverListingWithInstantOption(user, listing, "Your listing is live ✅");
}

async function publishBulkListings(user, listings) {
  const { unique, duplicates } = await partitionBulkListings(user, listings);
  if (!unique.length) {
    await clearSession(user, user.whatsapp_phone);
    return allBulkListingsDuplicateReply(duplicates);
  }

  for (let index = 0; index < unique.length; index += 1) {
    const listing = unique[index];
    const restrictionBlock = swapRestrictionBlockForPair(
      user,
      listing.have_currency,
      listing.want_currency
    );
    if (restrictionBlock) {
      return [
        title(`Listing ${index + 1} cannot be published`),
        "",
        restrictionBlock,
        "",
        "Nothing in this batch was published.",
      ].join("\n");
    }
    const tierBlock = tierLimitBlockForListing(user, listing);
    if (tierBlock) {
      return [
        title(`Listing ${index + 1} needs a higher limit`),
        "",
        tierBlock,
        "",
        "Nothing in this batch was published.",
      ].join("\n");
    }

    const receiveProfile = await getDefaultPaymentProfile(user.id, listing.want_currency);
    if (!receiveProfile) {
      const prompt = await startPaymentProfileForCurrency(user, listing.want_currency, {
        return_flow: "publish_bulk_listings",
        pending_listings: unique,
      });
      return prependPromptText(
        prompt,
        `Add your ${listing.want_currency} payout detail before I publish this batch.`
      );
    }
  }

  const createdListings = [];
  for (const listing of unique) {
    createdListings.push(await createListingRecord(user, listing));
  }

  let matchedListingId = null;
  let matchReply = null;
  await matchingWindowDelay();
  for (const listing of createdListings) {
    matchReply = await tryAutoMatchListing(user, listing, { skipBatchWindow: true })
      || await tryStartReciprocalNegotiation(user, listing);
    if (matchReply) {
      matchedListingId = listing.id;
      break;
    }
  }

  if (!matchReply) await clearSession(user, user.whatsapp_phone);

  const replies = duplicates.length
    ? [[title(`${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"} skipped`), "The distinct listings were published."].join("\n\n")]
    : [];

  for (let index = 0; index < createdListings.length; index += 1) {
    const listing = createdListings[index];
    if (listing.id === matchedListingId) {
      replies.push(matchReply);
      continue;
    }
    const shareUrl = listingShareUrl(listing);
    const liveMessage = listingLiveMessage(
      `Listing ${index + 1} of ${createdListings.length} is live ✅`,
      listing.listing_code,
      listing,
      shareUrl
    );
    const deliveryReply = await deliverListingLive(
      user,
      listing,
      listing.listing_code,
      liveMessage
    );
    if (deliveryReply) replies.push(deliveryReply);
  }

  return replies.length === 1 ? replies[0] : replies;
}

function isBulkListingPublishIntent(text) {
  const command = compactText(text);
  if (isListingPublishIntent(command) || command === "publish_bulk") return true;
  return /\b(publish|post|list|make|put|take)\b.*\b(all|both|them|listings?|offers?|live)\b/.test(command)
    || /\b(go ahead|proceed|continue|yes|oya)\b.*\b(all|both|them)\b/.test(command);
}

async function handleBulkListing(text, user, session) {
  const context = session.context_json || {};
  const listings = Array.isArray(context.listings) ? context.listings : [];

  if (isDeclineIntent(text) || isCancelIntent(text) || isSearchAgainIntent(text)) {
    await clearSession(user, user.whatsapp_phone);
    return [
      title("Bulk listing cancelled"),
      "",
      "Nothing was published.",
      "",
      mainMenu(user),
    ].join("\n");
  }

  if (!isBulkListingPublishIntent(text)) {
    return bulkListingReviewReply(listings);
  }

  return publishBulkListings(user, listings);
}

function matchingWindowDelay() {
  const delay = Number(config.matchingBatchWindowMs || 0);
  if (!delay) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, delay));
}

async function activeReciprocalListings(user, listing, negotiableOnly = false) {
  return supabaseRequest(
    [
      "listings?select=id,listing_code,owner_user_id,have_currency,want_currency,have_amount,want_amount,rate,listing_type,created_at",
      "status=eq.active",
      negotiableOnly ? "listing_type=eq.negotiable" : "",
      `have_currency=eq.${filterValue(listing.want_currency)}`,
      `want_currency=eq.${filterValue(listing.have_currency)}`,
      `owner_user_id=neq.${filterValue(user.id)}`,
      "order=created_at.asc",
      "limit=100",
    ].filter(Boolean).join("&")
  );
}

async function matchingUsersById(listings) {
  const ids = [...new Set(listings.map((row) => row.owner_user_id).filter(Boolean))];
  if (!ids.length) return {};
  const users = await supabaseRequest(
    [
      "users?select=id,whatsapp_phone,verification_status,risk_status,dispute_hold,hold_until,admin_banned,swap_restricted_currencies,completed_deals_count,total_cancelled_deals,dispute_count",
      `id=in.(${ids.map(filterValue).join(",")})`,
      `limit=${ids.length}`,
    ].join("&")
  );
  return Object.fromEntries(users.map((owner) => [owner.id, owner]));
}

function matchingOwnerIsEligible(owner) {
  return Boolean(
    owner
    && isVerified(owner)
    && !isOnHold(owner)
    && !owner.admin_banned
    && !["limited", "suspended"].includes(owner.risk_status)
  );
}

async function excludedReciprocalListingIds(listingId) {
  const since = new Date(Date.now() - config.matchingPairCooldownMs).toISOString();
  const rows = await supabaseRequest(
    [
      "audit_events?select=event_payload,created_at",
      "entity_type=eq.listing",
      `entity_id=eq.${filterValue(listingId)}`,
      "event_name=eq.match_pair_excluded",
      `created_at=gte.${filterValue(since)}`,
      "order=created_at.desc",
      "limit=100",
    ].join("&")
  );
  return new Set(rows.map((row) => row.event_payload?.excluded_listing_id).filter(Boolean));
}

async function recordMatchPairExclusion(leftListingId, rightListingId, actorUserId, reason) {
  if (!leftListingId || !rightListingId) return;
  const rows = [
    { entity_id: leftListingId, excluded_listing_id: rightListingId },
    { entity_id: rightListingId, excluded_listing_id: leftListingId },
  ].map((entry) => ({
    actor_user_id: actorUserId || null,
    actor_type: actorUserId ? "user" : "system",
    entity_type: "listing",
    entity_id: entry.entity_id,
    event_name: "match_pair_excluded",
    event_payload: {
      excluded_listing_id: entry.excluded_listing_id,
      reason,
      cooldown_ms: config.matchingPairCooldownMs,
    },
  }));
  await supabaseRequest("audit_events", {
    method: "POST",
    body: JSON.stringify(rows),
  }).catch((error) => {
    console.warn(`[matching] pair exclusion audit failed for ${leftListingId}/${rightListingId}: ${error.message}`);
  });
}

async function openNegotiationListingIds() {
  const rows = await supabaseRequest(
    [
      "negotiable_offers?select=id,listing_id,offering_user_id,message,status,created_at",
      "status=in.(pending,countered)",
      "order=created_at.desc",
      "limit=1000",
    ].join("&")
  );
  const ids = new Set();
  const userIds = new Set();
  for (const row of rows) {
    const createdAt = new Date(row.created_at || 0).getTime();
    const expired = createdAt > 0 && createdAt + config.negotiationWindowMs <= Date.now();
    if (expired) {
      await supabaseRequest(`negotiable_offers?id=eq.${filterValue(row.id)}&status=in.(pending,countered)`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "withdrawn",
          message: row.message || "Negotiation window elapsed.",
        }),
      });
      const sourceId = reciprocalSourceListingId(row);
      if (sourceId && row.listing_id) {
        await recordMatchPairExclusion(sourceId, row.listing_id, null, "negotiation_window_elapsed");
      }
      continue;
    }
    if (row.listing_id) ids.add(row.listing_id);
    if (row.offering_user_id) userIds.add(row.offering_user_id);
    const sourceId = reciprocalSourceListingId(row);
    if (sourceId) ids.add(sourceId);
  }
  if (ids.size) {
    const listings = await supabaseRequest(
      [
        "listings?select=id,owner_user_id",
        `id=in.(${[...ids].map(filterValue).join(",")})`,
        `limit=${ids.size}`,
      ].join("&")
    );
    for (const listing of listings) {
      if (listing.owner_user_id) userIds.add(listing.owner_user_id);
    }
  }
  ids.userIds = userIds;
  return ids;
}

async function findReciprocalPlan(user, listing, kind, options = {}) {
  if (isOnHold(user) || ["limited", "suspended"].includes(user.risk_status)) return null;
  if (await getBlockingOpenDealForUser(user.id)) return null;
  const sourceRows = await supabaseRequest(
    `listings?id=eq.${filterValue(listing.id)}&status=eq.active&limit=1`
  );
  if (!sourceRows.length) return null;
  listing = sourceRows[0];
  const rows = await activeReciprocalListings(user, listing, kind === "negotiation");
  const usersById = await matchingUsersById(rows);
  const exclusions = await excludedReciprocalListingIds(listing.id);
  const busyListings = await openNegotiationListingIds();
  if (busyListings.has(listing.id) || busyListings.userIds?.has(user.id)) return null;
  for (const id of options.excludeListingIds || []) exclusions.add(id);

  const plans = rows
    .filter((candidate) => (
      candidate.owner_user_id !== user.id
      && !exclusions.has(candidate.id)
      && !busyListings.has(candidate.id)
      && !busyListings.userIds?.has(candidate.owner_user_id)
      && matchingOwnerIsEligible(usersById[candidate.owner_user_id])
      && !swapRestrictionBlockForPair(
        usersById[candidate.owner_user_id],
        candidate.have_currency,
        candidate.want_currency
      )
    ))
    .map((candidate) => (
      kind === "clearing"
        ? buildClearingPlan(candidate, listing)
        : buildNegotiationPlan(candidate, listing, config.negotiationMaxGapPercent)
    ))
    .filter(Boolean)
    .sort((left, right) => (
      kind === "clearing"
        ? compareClearingPlans(left, right, usersById)
        : compareNegotiationPlans(left, right, usersById)
    ));

  for (const plan of plans) {
    if (await linkedAccountBlock(user, plan.candidate)) continue;
    if (await getBlockingOpenDealForUser(plan.candidate.owner_user_id)) continue;
    const makerReceiveProfile = await getDefaultPaymentProfile(
      plan.candidate.owner_user_id,
      plan.candidate.want_currency
    );
    if (!makerReceiveProfile) continue;
    return {
      ...plan,
      owner: usersById[plan.candidate.owner_user_id],
      makerReceiveProfile,
    };
  }
  return null;
}

function reciprocalSourceListingId(offer) {
  return String(offer?.message || "").match(/^reciprocal_source:([0-9a-f-]{36})$/i)?.[1] || null;
}

function reciprocalNegotiationOwnerReply(listing, offer, plan = {}) {
  const wideGap = Number(plan.gap_percent || 0) > 20;
  const body = [
    title("Potential exchange"),
    caption(wideGap
      ? "The currencies match, but your requested rates differ. Review this starting point and negotiate before opening a trade."
      : "The currencies match and the requested rates are close. Akara suggested a starting point for both sides."),
    "",
    labeled("They send you", formatMoney(offerWantAmount(listing, offer), listing.want_currency)),
    labeled("You send them", formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)),
    "",
    "Accept these values, suggest new ones, or pass.",
  ].join("\n");
  return {
    ...whatsappButtonsReply(body, [
      { id: "accept", title: "Accept" },
      { id: "counter", title: "Counter" },
      { id: "decline", title: "Decline" },
    ]),
    preserveLayout: true,
  };
}

function reciprocalNegotiationPublisherReply(listing, offer, plan = {}) {
  const wideGap = Number(plan.gap_percent || 0) > 20;
  const body = [
    title("Listing live · negotiation opened"),
    caption(wideGap
      ? "I found a reciprocal listing. Your requested rates differ, so I opened a negotiation instead of a trade."
      : "I found a close reciprocal listing and suggested a starting point."),
    "",
    labeled("You propose", formatMoney(offerWantAmount(listing, offer), listing.want_currency)),
    labeled("You receive", formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)),
    "",
    "I sent this proposal to the listing owner. You can send different values here at any time.",
  ].join("\n");
  return {
    ...whatsappButtonsReply(body, [
      { id: "change_proposal", title: "Change proposal" },
      { id: "remind", title: "Remind" },
      { id: "cancel", title: "Withdraw" },
    ]),
    preserveLayout: true,
  };
}

async function tryStartReciprocalNegotiation(user, sourceListing, options = {}) {
  const plan = await findReciprocalPlan(user, sourceListing, "negotiation", options);
  if (!plan) return null;
  sourceListing = plan.source;
  const candidate = plan.candidate;

  const offer = await createNegotiationOffer(user, candidate, {
    want_amount: plan.source_units,
    have_amount: plan.reciprocal_units,
    message: `reciprocal_source:${sourceListing.id}`,
  });
  await supabaseRequest("audit_events", {
    method: "POST",
    body: JSON.stringify({
      actor_type: "system",
      entity_type: "negotiable_offer",
      entity_id: offer.id,
      event_name: "smart_match_negotiation_suggested",
      event_payload: {
        strategy: "geometric_midpoint_v1",
        source_listing_id: sourceListing.id,
        reciprocal_listing_id: candidate.id,
        source_limit_rate: plan.source_limit_rate,
        candidate_limit_rate: plan.candidate_limit_rate,
        suggested_rate: plan.suggested_rate,
        gap_percent: Number(plan.gap_percent.toFixed(4)),
        source_coverage: plan.source_coverage,
        candidate_coverage: plan.candidate_coverage,
      },
    }),
  }).catch((error) => {
    console.warn(`[matching] negotiation audit failed for ${offer.id}: ${error.message}`);
  });

  await upsertSession(user, user.whatsapp_phone, "negotiation", "taker_waiting", {
    offer_id: offer.id,
    listing_id: candidate.id,
    reciprocal_source_listing_id: sourceListing.id,
  });

  const owner = await getUserById(candidate.owner_user_id);
  if (owner?.whatsapp_phone) {
    await upsertSession(owner, owner.whatsapp_phone, "negotiation", "owner_review", {
      offer_id: offer.id,
      listing_id: candidate.id,
      taker_user_id: user.id,
      reciprocal_source_listing_id: sourceListing.id,
    });
    sendWhatsAppButtons(
      owner.whatsapp_phone,
      reciprocalNegotiationOwnerReply(candidate, offer, plan)
    ).catch((error) => {
      console.error(`[negotiation] reciprocal notice failed: ${error.message}`);
    });
  }

  return reciprocalNegotiationPublisherReply(candidate, offer, plan);
}

async function sendMatchingReply(phone, reply) {
  if (!phone || !reply) return;
  if (Array.isArray(reply)) {
    for (const part of reply) await sendMatchingReply(phone, part);
    return;
  }
  if (reply?.type === "whatsapp_buttons") {
    await sendWhatsAppButtons(phone, reply);
    return;
  }
  await sendWhatsAppText(phone, typeof reply === "string" ? reply : reply.fallbackText || reply.body || "");
}

async function performSmartMatchingSweep(options = {}) {
  try {
    await releaseExpiredInstantReservations();
  } catch (error) {
    if (!/(instant_fulfillment_quotes|does not exist|relation|42P01)/i.test(error.message)) throw error;
  }
  const requestedBatchSize = Number(options.batchSize || config.matchingSweepBatchSize);
  const batchSize = Number.isFinite(requestedBatchSize)
    ? Math.max(1, Math.min(500, Math.floor(requestedBatchSize)))
    : 100;
  const loadListings = (offset) => supabaseRequest(
    [
      "listings?select=id,listing_code,owner_user_id,have_currency,want_currency,have_amount,want_amount,rate,listing_type,status,created_at",
      "status=eq.active",
      "order=created_at.asc",
      offset ? `offset=${offset}` : "",
      `limit=${batchSize}`,
    ].filter(Boolean).join("&")
  );
  let listings = await loadListings(smartMatchingSweepOffset);
  if (!listings.length && smartMatchingSweepOffset) {
    smartMatchingSweepOffset = 0;
    listings = await loadListings(0);
  }
  smartMatchingSweepOffset = listings.length < batchSize
    ? 0
    : smartMatchingSweepOffset + batchSize;

  const result = {
    scanned: listings.length,
    matched: 0,
    negotiations: 0,
    skipped: 0,
    failed: 0,
  };

  for (const listing of listings) {
    try {
      const owner = await getUserById(listing.owner_user_id);
      if (!matchingOwnerIsEligible(owner) || !owner.whatsapp_phone) {
        result.skipped += 1;
        continue;
      }

      const reply = await tryAutoMatchListing(owner, listing, { skipBatchWindow: true });
      if (reply) {
        await sendMatchingReply(owner.whatsapp_phone, reply);
        result.matched += 1;
        continue;
      }

      const negotiationReply = await tryStartReciprocalNegotiation(
        owner,
        listing,
        { skipBatchWindow: true }
      );
      if (negotiationReply) {
        await sendMatchingReply(owner.whatsapp_phone, negotiationReply);
        result.negotiations += 1;
        continue;
      }

      result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      console.error(`[matching] sweep failed for ${listing.listing_code || listing.id}: ${error.message}`);
    }
  }

  return result;
}

async function runSmartMatchingSweep(options = {}) {
  if (smartMatchingSweepTask) return smartMatchingSweepTask;
  smartMatchingSweepTask = performSmartMatchingSweep(options)
    .finally(() => {
      smartMatchingSweepTask = null;
    });
  return smartMatchingSweepTask;
}

async function automaticReminderWasSent(entityType, entityId, userId, eventName, since = "") {
  const rows = await supabaseRequest(
    [
      "audit_events?select=id",
      `entity_type=eq.${entityType}`,
      `entity_id=eq.${filterValue(entityId)}`,
      `actor_user_id=eq.${filterValue(userId)}`,
      `event_name=eq.${eventName}`,
      since ? `created_at=gte.${filterValue(since)}` : "",
      "limit=1",
    ].filter(Boolean).join("&")
  );
  return rows.length > 0;
}

async function recordAutomaticReminder(entityType, entityId, userId, eventName, payload = {}) {
  await supabaseRequest("audit_events", {
    method: "POST",
    body: JSON.stringify({
      actor_user_id: userId,
      actor_type: "system",
      entity_type: entityType,
      entity_id: entityId,
      event_name: eventName,
      event_payload: payload,
    }),
  });
}

function automaticDealReminderReply(deal, role, nowMs) {
  const maker = role === "maker";
  const youSend = maker
    ? { amount: deal.have_amount, currency: deal.have_currency }
    : { amount: deal.want_amount, currency: deal.want_currency };
  const youReceive = maker
    ? { amount: deal.want_amount, currency: deal.want_currency }
    : { amount: deal.have_amount, currency: deal.have_currency };
  const remainingMs = Math.max(0, (dealReservationExpiresAt(deal)?.getTime() || 0) - nowMs);
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
  const body = [
    title("Your matched exchange is waiting"),
    caption("Akara found and locked a compatible reciprocal offer while your listing was live."),
    "",
    labeled("Transaction ref", displayReference(deal.deal_code, "deal")),
    labeled("You send", formatMoney(youSend.amount, youSend.currency)),
    labeled("You receive", formatMoney(youReceive.amount, youReceive.currency)),
    labeled("Time left", `${remainingMinutes} min`),
    "",
    "Open the trade to continue, or cancel before sending money if you no longer want it.",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "trade_status", title: "View trade" },
    { id: "paid", title: "Paid" },
    { id: "cancel", title: "Cancel" },
  ]);
}

function automaticNegotiationReminderReply(listing, offer, targetIsOwner) {
  const body = [
    title("A matched rate is waiting"),
    caption(targetIsOwner
      ? "A compatible peer is waiting for your decision."
      : "The listing owner sent a counter proposal and is waiting for your decision."),
    "",
    labeled("Listing", displayReference(listing.listing_code, "listing")),
    labeled(
      targetIsOwner ? "They send you" : "You send",
      formatMoney(offerWantAmount(listing, offer), listing.want_currency)
    ),
    labeled(
      targetIsOwner ? "You send them" : "You receive",
      formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)
    ),
    "",
    "Accept, suggest another value, or pass so Akara can check the next compatible listing.",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "accept", title: "Accept" },
    { id: "counter", title: "Counter" },
    { id: "decline", title: "Pass" },
  ]);
}

async function performPendingMatchReminderSweep(options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const reminderAfterMs = Number(options.reminderAfterMs) || config.matchingResponseReminderMs;
  const cutoffMs = nowMs - reminderAfterMs;
  const eventLookback = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();
  const result = { scanned: 0, sent: 0, skipped: 0, failed: 0 };

  const [dealMatchEvents, negotiationMatchEvents] = await Promise.all([
    supabaseRequest([
      "audit_events?select=entity_id,created_at",
      "entity_type=eq.deal",
      "event_name=eq.smart_match_cleared",
      `created_at=gte.${filterValue(eventLookback)}`,
      "order=created_at.desc",
      "limit=500",
    ].join("&")),
    supabaseRequest([
      "audit_events?select=entity_id,created_at",
      "entity_type=eq.negotiable_offer",
      "event_name=eq.smart_match_negotiation_suggested",
      `created_at=gte.${filterValue(eventLookback)}`,
      "order=created_at.desc",
      "limit=500",
    ].join("&")),
  ]);

  const dealIds = [...new Set(dealMatchEvents.map((row) => row.entity_id).filter(Boolean))];
  if (dealIds.length) {
    const deals = await supabaseRequest([
      "deals?select=id,deal_code,maker_user_id,taker_user_id,have_currency,want_currency,have_amount,want_amount,status,maker_sent_at,taker_sent_at,maker_received_at,taker_received_at,reservation_expires_at,created_at",
      `id=in.(${dealIds.map(filterValue).join(",")})`,
      "status=in.(reserved,instructions_viewed,maker_sent,taker_sent,partially_confirmed)",
      `limit=${Math.min(500, dealIds.length)}`,
    ].join("&"));

    for (const deal of deals) {
      const createdAt = new Date(deal.created_at || 0).getTime();
      const expiresAt = dealReservationExpiresAt(deal)?.getTime() || 0;
      if (!createdAt || createdAt > cutoffMs || (expiresAt && expiresAt <= nowMs)) {
        result.skipped += 1;
        continue;
      }

      const parties = [
        {
          role: "maker",
          userId: deal.maker_user_id,
          acted: Boolean(deal.maker_sent_at || deal.maker_received_at),
        },
        {
          role: "taker",
          userId: deal.taker_user_id,
          acted: Boolean(deal.taker_sent_at || deal.taker_received_at),
        },
      ];

      for (const party of parties) {
        result.scanned += 1;
        if (party.acted || !party.userId) {
          result.skipped += 1;
          continue;
        }
        try {
          const alreadySent = await automaticReminderWasSent(
            "deal",
            deal.id,
            party.userId,
            "automatic_match_reminder_sent"
          );
          if (alreadySent) {
            result.skipped += 1;
            continue;
          }
          const user = await getUserById(party.userId);
          if (!user?.whatsapp_phone) {
            result.skipped += 1;
            continue;
          }
          await sendWhatsAppButtons(
            user.whatsapp_phone,
            automaticDealReminderReply(deal, party.role, nowMs)
          );
          await recordAutomaticReminder(
            "deal",
            deal.id,
            party.userId,
            "automatic_match_reminder_sent",
            { role: party.role, reminder_after_ms: reminderAfterMs }
          );
          result.sent += 1;
        } catch (error) {
          result.failed += 1;
          console.error(`[matching] automatic reminder failed for ${deal.deal_code}/${party.role}: ${error.message}`);
        }
      }
    }
  }

  const offerIds = [...new Set(negotiationMatchEvents.map((row) => row.entity_id).filter(Boolean))];
  if (offerIds.length) {
    const offers = await supabaseRequest([
      "negotiable_offers?select=id,listing_id,offering_user_id,offered_amount,offered_currency,receive_amount,receive_currency,status,message,created_at,updated_at",
      `id=in.(${offerIds.map(filterValue).join(",")})`,
      "status=in.(pending,countered)",
      `limit=${Math.min(500, offerIds.length)}`,
    ].join("&"));

    for (const offer of offers) {
      result.scanned += 1;
      const waitingSince = new Date(offer.updated_at || offer.created_at || 0).getTime();
      if (!waitingSince || waitingSince > cutoffMs) {
        result.skipped += 1;
        continue;
      }
      try {
        const listing = await getActiveListingById(offer.listing_id);
        if (!listing) {
          result.skipped += 1;
          continue;
        }
        const targetIsOwner = offer.status === "pending";
        const targetUserId = targetIsOwner ? listing.owner_user_id : offer.offering_user_id;
        const alreadySent = await automaticReminderWasSent(
          "negotiable_offer",
          offer.id,
          targetUserId,
          "automatic_negotiation_reminder_sent",
          new Date(waitingSince).toISOString()
        );
        if (alreadySent) {
          result.skipped += 1;
          continue;
        }
        const target = await getUserById(targetUserId);
        if (!target?.whatsapp_phone) {
          result.skipped += 1;
          continue;
        }
        await sendWhatsAppButtons(
          target.whatsapp_phone,
          automaticNegotiationReminderReply(listing, offer, targetIsOwner)
        );
        await recordAutomaticReminder(
          "negotiable_offer",
          offer.id,
          targetUserId,
          "automatic_negotiation_reminder_sent",
          {
            waiting_for: targetIsOwner ? "listing_owner" : "offering_user",
            reminder_after_ms: reminderAfterMs,
          }
        );
        result.sent += 1;
      } catch (error) {
        result.failed += 1;
        console.error(`[matching] automatic negotiation reminder failed for ${offer.id}: ${error.message}`);
      }
    }
  }

  return result;
}

async function runPendingMatchReminderSweep(options = {}) {
  if (pendingMatchReminderSweepTask) return pendingMatchReminderSweepTask;
  pendingMatchReminderSweepTask = performPendingMatchReminderSweep(options)
    .finally(() => {
      pendingMatchReminderSweepTask = null;
    });
  return pendingMatchReminderSweepTask;
}

async function rematchLiveListing(listingId, excludeListingIds = []) {
  const listing = await getActiveListingById(listingId);
  if (!listing) return null;
  const owner = await getUserById(listing.owner_user_id);
  if (!matchingOwnerIsEligible(owner)) return null;

  const options = { excludeListingIds, skipBatchWindow: true };
  const reply = await tryAutoMatchListing(owner, listing, options)
    || await tryStartReciprocalNegotiation(owner, listing, options);
  if (!reply) return null;

  await sendMatchingReply(
    owner.whatsapp_phone,
    prependPromptText(reply, "I moved past the previous proposal and found the next compatible option.")
  );
  return { listing, owner, reply };
}

async function rematchNegotiationPair(sourceListingId, candidateListingId, actorUserId, reason) {
  if (!sourceListingId || !candidateListingId) return [];
  await recordMatchPairExclusion(sourceListingId, candidateListingId, actorUserId, reason);

  const results = [];
  const sourceResult = await rematchLiveListing(sourceListingId, [candidateListingId]);
  if (sourceResult) results.push(sourceResult);
  const candidateResult = await rematchLiveListing(candidateListingId, [sourceListingId]);
  if (candidateResult) results.push(candidateResult);
  return results;
}

async function listingById(listingId) {
  const rows = await supabaseRequest(`listings?id=eq.${filterValue(listingId)}&limit=1`);
  return rows[0] || null;
}

async function performAutoMatchRequeue(deal, actorUserId = null, reason = "trade_cancelled") {
  if (!deal?.id) return [];
  const [matchEvents, requeueEvents] = await Promise.all([
    supabaseRequest(
      [
        "audit_events?select=id,event_payload,created_at",
        "entity_type=eq.deal",
        `entity_id=eq.${filterValue(deal.id)}`,
        "event_name=eq.smart_match_cleared",
        "order=created_at.desc",
        "limit=1",
      ].join("&")
    ),
    supabaseRequest(
      [
        "audit_events?select=id",
        "entity_type=eq.deal",
        `entity_id=eq.${filterValue(deal.id)}`,
        "event_name=eq.smart_match_requeued",
        "limit=1",
      ].join("&")
    ),
  ]);
  if (!matchEvents.length || requeueEvents.length) return [];

  const event = matchEvents[0].event_payload || {};
  const [sourceListing, reciprocalListing] = await Promise.all([
    listingById(event.source_listing_id),
    listingById(event.reciprocal_listing_id),
  ]);
  if (!sourceListing || !reciprocalListing) return [];

  const sourceUnits = positiveMoney(deal.want_amount);
  const sourceReceiveMinimum = positiveMoney(sourceUnits * moneyNumber(event.source_limit_rate));
  const reciprocalHaveMaximum = positiveMoney(sourceUnits * moneyNumber(event.candidate_limit_rate));
  if (!sourceUnits || !sourceReceiveMinimum || !reciprocalHaveMaximum) return [];

  const [sourceOwner, reciprocalOwner] = await Promise.all([
    getUserById(sourceListing.owner_user_id),
    getUserById(reciprocalListing.owner_user_id),
  ]);
  if (!sourceOwner || !reciprocalOwner) return [];

  const sourceReplacement = await createListingRecord(sourceOwner, {
    have_currency: sourceListing.have_currency,
    want_currency: sourceListing.want_currency,
    have_amount: sourceUnits,
    want_amount: sourceReceiveMinimum,
    listing_type: sourceListing.listing_type || "negotiable",
    status: matchingOwnerIsEligible(sourceOwner) ? "active" : "paused",
  });
  const reciprocalReplacement = await createListingRecord(reciprocalOwner, {
    have_currency: reciprocalListing.have_currency,
    want_currency: reciprocalListing.want_currency,
    have_amount: reciprocalHaveMaximum,
    want_amount: sourceUnits,
    listing_type: reciprocalListing.listing_type || "negotiable",
    status: matchingOwnerIsEligible(reciprocalOwner) ? "active" : "paused",
  });

  await supabaseRequest("audit_events", {
    method: "POST",
    body: JSON.stringify({
      actor_user_id: actorUserId,
      actor_type: actorUserId ? "user" : "system",
      entity_type: "deal",
      entity_id: deal.id,
      event_name: "smart_match_requeued",
      event_payload: {
        reason,
        source_replacement_listing_id: sourceReplacement.id,
        reciprocal_replacement_listing_id: reciprocalReplacement.id,
      },
    }),
  });
  await recordMatchPairExclusion(
    sourceReplacement.id,
    reciprocalReplacement.id,
    actorUserId,
    reason
  );

  const results = [];
  const sourceResult = await rematchLiveListing(sourceReplacement.id, [reciprocalReplacement.id]);
  if (sourceResult) results.push(sourceResult);
  const reciprocalResult = await rematchLiveListing(reciprocalReplacement.id, [sourceReplacement.id]);
  if (reciprocalResult) results.push(reciprocalResult);
  return [sourceReplacement, reciprocalReplacement, ...results];
}

async function requeueCancelledAutoMatch(deal, actorUserId = null, reason = "trade_cancelled") {
  if (!deal?.id) return [];
  if (autoMatchRequeueTasks.has(deal.id)) return autoMatchRequeueTasks.get(deal.id);

  const task = performAutoMatchRequeue(deal, actorUserId, reason)
    .finally(() => autoMatchRequeueTasks.delete(deal.id));
  autoMatchRequeueTasks.set(deal.id, task);
  return task;
}

async function tryAutoMatchListing(user, listing, options = {}) {
  if (swapRestrictionBlockForPair(user, listing.have_currency, listing.want_currency)) return null;
  if (!options.skipBatchWindow) await matchingWindowDelay();
  const plan = await findReciprocalPlan(user, listing, "clearing", options);
  if (!plan) return null;
  listing = plan.source;
  const match = plan.candidate;
  const makerReceiveProfile = plan.makerReceiveProfile;
  const takerReceiveProfile = await getDefaultPaymentProfile(user.id, match.have_currency);
  if (!makerReceiveProfile || !takerReceiveProfile) return null;

  const dealWantAmount = plan.source_units;
  const dealHaveAmount = plan.reciprocal_units;
  const improvedForBoth = plan.source_improvement > 0 && plan.candidate_savings > 0;
  let matchResidual = null;
  let listingResidual = null;

  const [sourceOpenTrade, reciprocalOpenTrade] = await Promise.all([
    getBlockingOpenDealForUser(user.id),
    getBlockingOpenDealForUser(match.owner_user_id),
  ]);
  if (sourceOpenTrade || reciprocalOpenTrade) return null;

  const dealCode = await generateReferenceCode("deal");
  const expiresAt = new Date(Date.now() + config.tradePaymentWindowMs).toISOString();
  const claimedMatch = await supabaseRequest(
    `listings?id=eq.${filterValue(match.id)}&status=eq.active`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "reserved" }),
    }
  );
  if (!claimedMatch.length) return null;

  const claimedSource = await supabaseRequest(
    `listings?id=eq.${filterValue(listing.id)}&status=eq.active`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "reserved" }),
    }
  );
  if (!claimedSource.length) {
    await supabaseRequest(`listings?id=eq.${filterValue(match.id)}&status=eq.reserved`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    return null;
  }

  let lockedQuote = null;
  let deal = null;
  try {
    lockedQuote = await createLockedQuote({
      listing: match,
      makerUserId: match.owner_user_id,
      takerUserId: user.id,
      sendAmount: dealWantAmount,
      receiveAmount: dealHaveAmount,
      quoteType: "auto_match",
      expiresAt,
    });
    const deals = await supabaseRequest("deals", {
      method: "POST",
      body: JSON.stringify({
        deal_code: dealCode,
        listing_id: match.id,
        maker_user_id: match.owner_user_id,
        taker_user_id: user.id,
        have_currency: match.have_currency,
        want_currency: match.want_currency,
        have_amount: dealHaveAmount,
        want_amount: dealWantAmount,
        status: "reserved",
        reservation_expires_at: expiresAt,
        ...(lockedQuote?.id ? { locked_quote_id: lockedQuote.id } : {}),
      }),
    });
    deal = deals[0];
    await attachQuoteToDeal(lockedQuote, deal.id);
  } catch (error) {
    await Promise.allSettled([
      cancelLockedQuote(lockedQuote),
      supabaseRequest(`listings?id=eq.${filterValue(match.id)}&status=eq.reserved`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      }),
      supabaseRequest(`listings?id=eq.${filterValue(listing.id)}&status=eq.reserved`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      }),
    ]);
    if (isSingleTradeConstraintError(error)) return null;
    throw error;
  }

  await supabaseRequest("audit_events", {
    method: "POST",
    body: JSON.stringify({
      actor_type: "system",
      entity_type: "deal",
      entity_id: deal.id,
      event_name: "smart_match_cleared",
      event_payload: {
        strategy: "geometric_midpoint_v1",
        source_listing_id: listing.id,
        reciprocal_listing_id: match.id,
        source_limit_rate: plan.source_limit_rate,
        candidate_limit_rate: plan.candidate_limit_rate,
        clearing_rate: plan.clearing_rate,
        source_improvement: plan.source_improvement,
        candidate_savings: plan.candidate_savings,
        source_coverage: plan.source_coverage,
        candidate_coverage: plan.candidate_coverage,
      },
    }),
  });

  if (
    dealHaveAmount < moneyNumber(match.have_amount)
    || dealWantAmount < moneyNumber(match.want_amount)
  ) {
    matchResidual = await createRatePreservingWantResidualListing(match, dealWantAmount);
  }

  if (dealWantAmount < moneyNumber(listing.have_amount)) {
    listingResidual = await createRatePreservingResidualListing(listing, dealWantAmount);
  }

  await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
    deal_id: deal.id,
    deal_code: dealCode,
  });

  const maker = await getUserById(match.owner_user_id);
  if (maker?.whatsapp_phone) {
    await upsertSession(maker, maker.whatsapp_phone, "deal_room", "reserved", {
      deal_id: deal.id,
      deal_code: dealCode,
    });

    const makerNotice = tradeOpenedMessage({
      heading: "Akara Trade opened ✅",
      intro: improvedForBoth ? "" : "A reciprocal offer matched your listing.",
      valueHighlight: improvedForBoth
        ? `Better rate: you keep ${formatMoney(plan.candidate_savings, match.have_currency)}`
        : "",
      dealCode,
      youSend: { amount: dealHaveAmount, currency: match.have_currency },
      youReceive: { amount: dealWantAmount, currency: match.want_currency },
      paymentProfile: takerReceiveProfile,
      expectedProfile: makerReceiveProfile,
      residualLine: matchResidual ? `${formatMoney(matchResidual.have_amount, matchResidual.have_currency)} for ${formatMoney(matchResidual.want_amount, matchResidual.want_currency)}` : "",
      firstInstruction: "Check your account before sending your side.",
    });

    sendTradeOpenedNotice(maker.whatsapp_phone, makerNotice).catch((error) => {
      console.error(`[deal] auto-match notice failed for ${maker.whatsapp_phone}: ${error.message}`);
    });
  }

  return tradeOpenedMessage({
    heading: "Akara Trade opened ✅",
    intro: improvedForBoth ? "" : "A reciprocal offer matched your listing.",
    valueHighlight: improvedForBoth
      ? `Better rate: you get an extra ${formatMoney(plan.source_improvement, listing.want_currency)}`
      : "",
    dealCode,
    youSend: { amount: dealWantAmount, currency: match.want_currency },
    youReceive: { amount: dealHaveAmount, currency: match.have_currency },
    paymentProfile: makerReceiveProfile,
    expectedProfile: takerReceiveProfile,
    residualLine: listingResidual ? `${formatMoney(listingResidual.have_amount, listingResidual.have_currency)} for ${formatMoney(listingResidual.want_amount, listingResidual.want_currency)}` : "",
    firstInstruction: "Confirm the account name before sending.",
  });
}

async function getActiveListingById(listingId) {
  const rows = await supabaseRequest(
    `listings?id=eq.${filterValue(listingId)}&status=eq.active&limit=1`
  );
  return rows[0] || null;
}

async function getNegotiableOfferById(offerId) {
  const rows = await supabaseRequest(
    `negotiable_offers?id=eq.${filterValue(offerId)}&limit=1`
  );
  return rows[0] || null;
}

async function negotiationReminderCooldownRemainingMs(offerId, userId) {
  const since = new Date(Date.now() - NEGOTIATION_REMINDER_COOLDOWN_MS).toISOString();
  const rows = await supabaseRequest(
    [
      "audit_events?select=id,created_at",
      "entity_type=eq.negotiable_offer",
      `entity_id=eq.${filterValue(offerId)}`,
      `actor_user_id=eq.${filterValue(userId)}`,
      "event_name=eq.negotiation_reminder_sent",
      `created_at=gte.${filterValue(since)}`,
      "order=created_at.desc",
      "limit=1",
    ].join("&")
  );

  const latest = rows[0]?.created_at ? new Date(rows[0].created_at).getTime() : 0;
  if (!latest) return 0;
  return Math.max(0, NEGOTIATION_REMINDER_COOLDOWN_MS - (Date.now() - latest));
}

async function recordNegotiationReminderSent(offerId, actorUserId, targetUserId) {
  await supabaseRequest("audit_events", {
    method: "POST",
    body: JSON.stringify({
      actor_user_id: actorUserId,
      actor_type: "user",
      entity_type: "negotiable_offer",
      entity_id: offerId,
      event_name: "negotiation_reminder_sent",
      event_payload: { target_user_id: targetUserId },
    }),
  });
}

async function sendNegotiationReminder({ user, offer, listing, targetUser }) {
  if (!offer?.id || !targetUser?.whatsapp_phone) {
    return [
      title("Reminder not sent"),
      "",
      "I could not find the trader for this proposal.",
    ].join("\n");
  }

  const cooldownMs = await negotiationReminderCooldownRemainingMs(offer.id, user.id);
  if (cooldownMs > 0) {
    return [
      title("Reminder already sent"),
      "",
      `You can send another reminder in ${formatCooldown(cooldownMs)}.`,
    ].join("\n");
  }

  const code = displayReference(listing.listing_code, "listing");
  await sendWhatsAppText(targetUser.whatsapp_phone, [
    title("Negotiation reminder"),
    caption("Your trade partner is waiting on this proposal."),
    "",
    fieldBlock("Listing", code),
    "",
    fieldBlock("Proposal", `${formatMoney(offer.offered_amount, offer.offered_currency)} for ${formatMoney(listing.have_amount, listing.have_currency)}`),
    "",
    `${action("accept")} to open the trade`,
    `${action("counter")} to suggest another value`,
    `${action("decline")} to pass`,
  ].join("\n"));

  await recordNegotiationReminderSent(offer.id, user.id, targetUser.id);

  return [
    title("Reminder sent"),
    "",
    "You can send another reminder in 10 minutes.",
  ].join("\n");
}

function flexibleListingPrompt(listing) {
  const code = displayReference(listing.listing_code, "listing");
  return [
    title("Negotiable listing"),
    caption("You can accept the posted terms or propose what you want to send."),
    "",
    fieldBlock("Reference", code),
    "",
    fieldBlock("You send", formatMoney(listing.want_amount, listing.want_currency)),
    "",
    fieldBlock("You receive", formatMoney(listing.have_amount, listing.have_currency)),
    "",
    title("Actions"),
    `${action("accept terms")} to open the trade now`,
    `${action(`offer ${formatMoney(listing.want_amount, listing.want_currency)}`)} to propose what you send`,
    `${action(`offer ${formatMoney(listing.have_amount, listing.have_currency)}`)} to propose what you receive`,
    `${action("cancel")} to stop`,
  ].join("\n");
}

function negotiationProposalMessage(listing, offer) {
  const code = displayReference(listing.listing_code, "listing");
  return [
    title("New proposal"),
    caption("A verified trader is trying to negotiate on your listing"),
    "",
    fieldBlock("Listing", code),
    "",
    fieldBlock("They send you", formatMoney(offerWantAmount(listing, offer), listing.want_currency)),
    "",
    fieldBlock("You send them", formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)),
    "",
    title("Actions"),
    `${action("accept")} to open this Akara Trade`,
    `${action("remind")} if they are taking too long`,
    `${action("decline")} to pass`,
    `${action(`counter ${formatMoney(offerWantAmount(listing, offer), listing.want_currency)}`)} to change what you receive`,
    `${action(`counter ${formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)}`)} to change what you send`,
  ].join("\n");
}

function negotiationWaitingMessage(listing, offer) {
  return [
    title("Proposal sent"),
    caption("I sent your value to the listing owner."),
    "",
    fieldBlock("You offered", formatMoney(offerWantAmount(listing, offer), listing.want_currency)),
    "",
    fieldBlock("You receive if accepted", formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)),
    "",
    "I will update this chat once they accept, decline, or counter.",
    `${action("remind")} if they are taking too long.`,
  ].join("\n");
}

function negotiationCounterMessage(listing, offer) {
  return [
    title("Counter proposal"),
    caption("The listing owner suggested a new value."),
    "",
    fieldBlock("You send", formatMoney(offerWantAmount(listing, offer), listing.want_currency)),
    "",
    fieldBlock("You receive", formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)),
    "",
    title("Actions"),
    `${action("accept")} to open the trade`,
    `${action("remind")} if they are taking too long`,
    `${action("decline")} to pass`,
    `${action(`counter ${formatMoney(offerWantAmount(listing, offer), listing.want_currency)}`)} to change what you send`,
    `${action(`counter ${formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)}`)} to change what you receive`,
  ].join("\n");
}

// A proposal or counter can adjust either side of the trade: an amount in the
// listing's want currency moves what the taker sends, an amount in the have
// currency moves what the taker receives, and one message can carry both. A
// bare number keeps the historical meaning (the want side). Returns null when
// no amount is found, or { error } when a currency doesn't belong here.
function parseBareNegotiationAmount(text) {
  const withoutReferences = String(text || "")
    .replace(/\bAKR-(?:LIST|TXN)-[A-Z0-9-]+\b/gi, " ")
    .trim();
  const amount = parseAmount(withoutReferences);
  if (!amount) return null;

  const command = compactText(withoutReferences);
  const isOnlyAnAmount = /^\d[\d,.]*(?:\s*(?:k|m|thousand|grand|million))?$/.test(command);
  const hasProposalLanguage = /\b(counter|offer|propose|proposal|want|need|send|receive|get|pay|instead|rather)\b/.test(command);
  return isOnlyAnAmount || hasProposalLanguage ? amount : null;
}

function parseNegotiationProposal(text, listing) {
  const pairs = parseCurrencyAmountPairs(text);
  if (!pairs.length) {
    const amount = parseBareNegotiationAmount(text);
    if (!amount) return null;
    return { want_amount: amount };
  }

  const proposal = {};
  for (const pair of pairs) {
    if (pair.currency === listing.want_currency) {
      proposal.want_amount = pair.amount;
    } else if (pair.currency === listing.have_currency) {
      proposal.have_amount = pair.amount;
    } else {
      return {
        error: `This listing trades ${listing.want_currency} for ${listing.have_currency}, so counter with an amount in ${listing.want_currency}, ${listing.have_currency}, or both.`,
      };
    }
  }
  return proposal;
}

// The negotiated values, falling back to the listing terms for any side the
// offer has not touched.
function offerWantAmount(listing, offer) {
  return moneyNumber(offer?.offered_amount || listing.want_amount);
}

function offerReceiveAmount(listing, offer) {
  return moneyNumber(offer?.receive_amount || listing.have_amount);
}

async function openListingTrade(user, listing, options = {}) {
  if (!isVerified(user)) {
    return "Please verify first so your trade partner knows you are real. Use the Start verification button in Akara to continue.";
  }

  const availabilityBlock = await tradeOpeningBlock(user, listing.owner_user_id);
  if (availabilityBlock) return availabilityBlock;

  const dealHaveAmount = moneyNumber(options.have_amount || listing.have_amount);
  const dealWantAmount = moneyNumber(options.want_amount || listing.want_amount);
  const listingHaveAmount = moneyNumber(listing.have_amount);
  const listingWantAmount = moneyNumber(listing.want_amount);
  const isPartialFill = dealHaveAmount < listingHaveAmount;
  const termsChanged = dealHaveAmount !== listingHaveAmount || dealWantAmount !== listingWantAmount;
  const hasAcceptedNegotiation = Boolean(options.negotiableOfferId);
  let reciprocalSourceListing = null;

  if (options.reciprocalSourceListingId) {
    const sourceRows = await supabaseRequest(
      [
        "listings?select=id,listing_code,owner_user_id,have_currency,want_currency,have_amount,want_amount,listing_type,status",
        `id=eq.${filterValue(options.reciprocalSourceListingId)}`,
        `owner_user_id=eq.${filterValue(user.id)}`,
        "status=eq.active",
        "limit=1",
      ].join("&")
    );
    reciprocalSourceListing = sourceRows[0] || null;
    if (!reciprocalSourceListing) {
      return "Your reciprocal listing is no longer live. Review your listings before accepting these terms.";
    }
    if (
      !hasAcceptedNegotiation
      && !listingHasEnoughForDeal(reciprocalSourceListing, dealWantAmount, dealHaveAmount)
    ) {
      return [
        title("Your listing cannot cover this proposal"),
        "",
        `You have ${formatMoney(reciprocalSourceListing.have_amount, reciprocalSourceListing.have_currency)} available in that listing.`,
        `Counter with ${formatMoney(reciprocalSourceListing.have_amount, reciprocalSourceListing.have_currency)} or less.`,
      ].join("\n");
    }
  }

  if (termsChanged && listing.listing_type !== "negotiable") {
    return "This fixed-rate listing can only open with the posted terms. Ask the owner to edit it, or choose another offer.";
  }

  if (
    !hasAcceptedNegotiation
    && !listingHasEnoughForDeal(listing, dealHaveAmount, dealWantAmount)
  ) {
    return "This offer cannot cover that value. Choose another offer or send a smaller proposal.";
  }

  const shouldCreateResidualListing = listing.listing_type === "negotiable" && isPartialFill;
  const tierBlock = tierLimitBlockForAmount(user, dealWantAmount, listing.want_currency)
    || tierLimitBlockForAmount(user, dealHaveAmount, listing.have_currency);
  if (tierBlock) return tierBlock;

  if (listing.owner_user_id === user.id) {
    return "This is your own offer. Share the link with someone else to start an Akara Trade.";
  }

  const linkedBlock = await linkedAccountBlock(user, listing);
  if (linkedBlock) return linkedBlock;

  const makerReceiveProfile = await getDefaultPaymentProfile(listing.owner_user_id, listing.want_currency);
  if (!makerReceiveProfile) {
    return "This offer is missing payout details from the owner. Ask them to update their payout info, or choose another offer.";
  }

  const takerReceiveProfile = await getDefaultPaymentProfile(user.id, listing.have_currency);
  if (!takerReceiveProfile) {
    const prompt = await startPaymentProfileForCurrency(user, listing.have_currency, {
      return_flow: "reserve_listing",
      pending_listing_id: listing.id,
    });
    return prependPromptText(
      prompt,
      `Before this trade opens, add your ${listing.have_currency} payout detail.`
    );
  }

  const claimedListing = await supabaseRequest(
    `listings?id=eq.${filterValue(listing.id)}&status=eq.active`,
    {
      method: "PATCH",
      body: JSON.stringify({ status: "reserved" }),
    }
  );
  if (!claimedListing.length) {
    return "That offer was just taken or changed. Choose another live offer.";
  }

  if (reciprocalSourceListing) {
    const claimedSource = await supabaseRequest(
      `listings?id=eq.${filterValue(reciprocalSourceListing.id)}&status=eq.active`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: "reserved" }),
      }
    );
    if (!claimedSource.length) {
      await supabaseRequest(`listings?id=eq.${filterValue(listing.id)}&status=eq.reserved`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
      return "Your reciprocal listing was just taken or changed. Review your listings before accepting these terms.";
    }
  }

  const dealCode = await generateReferenceCode("deal");
  const expiresAt = new Date(Date.now() + config.tradePaymentWindowMs).toISOString();
  const quoteType = options.quoteType
    || (options.negotiableOfferId ? "negotiated" : options.routePlanId ? "routed" : "posted");
  let lockedQuote = null;
  let deal = null;
  try {
    lockedQuote = await createLockedQuote({
      listing,
      makerUserId: listing.owner_user_id,
      takerUserId: user.id,
      sendAmount: dealWantAmount,
      receiveAmount: dealHaveAmount,
      quoteType,
      negotiableOfferId: options.negotiableOfferId || null,
      expiresAt,
    });

    const deals = await supabaseRequest("deals", {
      method: "POST",
      body: JSON.stringify({
        deal_code: dealCode,
        listing_id: listing.id,
        maker_user_id: listing.owner_user_id,
        taker_user_id: user.id,
        have_currency: listing.have_currency,
        want_currency: listing.want_currency,
        have_amount: dealHaveAmount,
        want_amount: dealWantAmount,
        status: "reserved",
        reservation_expires_at: expiresAt,
        ...(lockedQuote?.id ? { locked_quote_id: lockedQuote.id } : {}),
        ...(options.routePlanId ? {
          route_plan_id: options.routePlanId,
          route_leg_index: options.routeLegIndex || null,
        } : {}),
      }),
    });
    deal = deals[0];
    await attachQuoteToDeal(lockedQuote, deal.id);
    if (options.negotiableOfferId) {
      await supabaseRequest(
        `negotiable_offers?id=eq.${filterValue(options.negotiableOfferId)}&status=in.(pending,countered)`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "accepted" }),
        }
      );
    }
  } catch (error) {
    await Promise.allSettled([
      deal?.id
        ? supabaseRequest(`deals?id=eq.${filterValue(deal.id)}`, {
            method: "PATCH",
            body: JSON.stringify({
              status: "cancelled",
              cancellation_reason: "Trade opening could not be completed safely.",
            }),
          })
        : Promise.resolve(),
      cancelLockedQuote(lockedQuote),
      supabaseRequest(`listings?id=eq.${filterValue(listing.id)}&status=eq.reserved`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      }),
      reciprocalSourceListing
        ? supabaseRequest(
            `listings?id=eq.${filterValue(reciprocalSourceListing.id)}&status=eq.reserved`,
            {
              method: "PATCH",
              body: JSON.stringify({ status: "active" }),
            }
          )
        : Promise.resolve(),
    ]);
    if (isSingleTradeConstraintError(error)) {
      return await tradeOpeningBlock(user, listing.owner_user_id)
        || "One of you already has an open trade. Finish it before opening another.";
    }
    throw error;
  }
  if (options.routePlanId && options.routeLegIndex) {
    await supabaseRequest(
      [
        "liquidity_route_legs?",
        `route_plan_id=eq.${filterValue(options.routePlanId)}`,
        `&leg_index=eq.${filterValue(options.routeLegIndex)}`,
      ].join(""),
      {
        method: "PATCH",
        body: JSON.stringify({ status: "opened", deal_id: deal.id }),
      }
    );
    await supabaseRequest(`liquidity_route_plans?id=eq.${filterValue(options.routePlanId)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "partially_opened" }),
    });
  }
  const residualListing = shouldCreateResidualListing
    ? await createRatePreservingResidualListing(listing, dealHaveAmount)
    : null;
  const reciprocalResidualListing = reciprocalSourceListing
    && (
      dealWantAmount < moneyNumber(reciprocalSourceListing.have_amount)
      || dealHaveAmount < moneyNumber(reciprocalSourceListing.want_amount)
    )
    ? await createRatePreservingResidualListing(reciprocalSourceListing, dealWantAmount)
    : null;
  const residualLine = residualListing
    ? `${formatMoney(residualListing.have_amount, residualListing.have_currency)} for ${formatMoney(residualListing.want_amount, residualListing.want_currency)}`
    : "";
  const reciprocalResidualLine = reciprocalResidualListing
    ? `${formatMoney(reciprocalResidualListing.have_amount, reciprocalResidualListing.have_currency)} for ${formatMoney(reciprocalResidualListing.want_amount, reciprocalResidualListing.want_currency)}`
    : "";

  await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
    deal_id: deal.id,
    deal_code: dealCode,
  });

  const maker = await getUserById(listing.owner_user_id);

  const makerNotice = tradeOpenedMessage({
    heading: "Akara Trade opened ✅",
    intro: options.makerIntro,
    dealCode,
    youSend: { amount: dealHaveAmount, currency: listing.have_currency },
    youReceive: { amount: dealWantAmount, currency: listing.want_currency },
    paymentProfile: takerReceiveProfile,
    expectedProfile: makerReceiveProfile,
    firstInstruction: "Check your account before sending your side.",
    residualLine,
  });

  const takerNotice = tradeOpenedMessage({
    heading: "Akara Trade opened ✅",
    intro: options.takerIntro,
    dealCode,
    youSend: { amount: dealWantAmount, currency: listing.want_currency },
    youReceive: { amount: dealHaveAmount, currency: listing.have_currency },
    paymentProfile: makerReceiveProfile,
    expectedProfile: takerReceiveProfile,
    firstInstruction: "Confirm the account name before sending.",
    residualLine: reciprocalSourceListing ? reciprocalResidualLine : "",
  });

  if (maker?.whatsapp_phone) {
    await upsertSession(maker, maker.whatsapp_phone, "deal_room", "reserved", {
      deal_id: deal.id,
      deal_code: dealCode,
    });

    const makerShouldReceiveNotice = options.returnRole !== "maker";
    const takerShouldReceiveNotice = options.returnRole === "maker";
    if (makerShouldReceiveNotice) sendTradeOpenedNotice(maker.whatsapp_phone, makerNotice).catch((error) => {
      console.error(`[deal] maker notice failed for ${maker.whatsapp_phone}: ${error.message}`);
    });
    if (takerShouldReceiveNotice && user.whatsapp_phone) sendTradeOpenedNotice(user.whatsapp_phone, takerNotice).catch((error) => {
      console.error(`[deal] taker notice failed for ${user.whatsapp_phone}: ${error.message}`);
    });
  }

  return options.returnRole === "maker" ? makerNotice : takerNotice;
}

async function reserveListing(user, listing, options = {}) {
  const userRestriction = swapRestrictionBlockForPair(
    user,
    listing.want_currency,
    listing.have_currency
  );
  if (userRestriction) return userRestriction;
  const listingOwner = await getUserById(listing.owner_user_id);
  const ownerRestriction = swapRestrictionBlockForPair(
    listingOwner,
    listing.have_currency,
    listing.want_currency
  );
  if (ownerRestriction) return "This offer is temporarily unavailable. Choose another live offer.";

  if (!options.force && listing.listing_type === "negotiable") {
    if (!isVerified(user)) return "Please verify first so your trade partner knows you are real. Use the Start verification button in Akara to continue.";
    if (listing.owner_user_id === user.id) return "This is your own offer. Share the link with someone else to start an Akara Trade.";
    const availabilityBlock = await tradeOpeningBlock(user, listing.owner_user_id);
    if (availabilityBlock) return availabilityBlock;
    const linkedBlock = await linkedAccountBlock(user, listing);
    if (linkedBlock) return linkedBlock;
    await upsertSession(user, user.whatsapp_phone, "negotiation", "taker_review", {
      listing_id: listing.id,
    });
    return flexibleListingPrompt(listing);
  }

  return openListingTrade(user, listing, options);
}

async function reserveListingByCode(user, listingCode) {
  const rows = await supabaseRequest(
    `listings?listing_code=eq.${filterValue(listingCode)}&status=eq.active&limit=1`
  );
  const listing = rows[0];
  if (!listing) return "That offer is no longer available. Type find offers to see live ones.";
  return reserveListing(user, listing);
}

async function reserveListingById(user, listingId) {
  const rows = await supabaseRequest(
    `listings?id=eq.${filterValue(listingId)}&status=eq.active&limit=1`
  );
  const listing = rows[0];
  if (!listing) return "That offer is no longer available. Type find offers to see live ones.";
  return reserveListing(user, listing);
}

async function createNegotiationOffer(user, listing, proposal) {
  const rows = await supabaseRequest("negotiable_offers", {
    method: "POST",
    body: JSON.stringify({
      listing_id: listing.id,
      offering_user_id: user.id,
      offered_amount: proposal.want_amount || moneyNumber(listing.want_amount),
      offered_currency: listing.want_currency,
      receive_amount: proposal.have_amount || null,
      receive_currency: proposal.have_amount ? listing.have_currency : null,
      status: "pending",
      message: proposal.message || null,
    }),
  });
  return rows[0];
}

// Merges a counter into the offer, carrying forward any side the message did
// not mention so a one-sided counter never resets the other side.
function mergedOfferPatch(listing, offer, proposal) {
  const wantAmount = proposal.want_amount || offerWantAmount(listing, offer);
  const receiveAmount = proposal.have_amount || (offer.receive_amount ? moneyNumber(offer.receive_amount) : null);
  return {
    offered_amount: wantAmount,
    offered_currency: listing.want_currency,
    receive_amount: receiveAmount,
    receive_currency: receiveAmount ? listing.have_currency : null,
  };
}

async function handleNegotiation(text, user, session) {
  const context = session.context_json || {};
  const command = compactText(text);
  const messageProposal = parseCurrencyAmountPairs(text).length || parseBareNegotiationAmount(text);

  if (["change proposal", "change_proposal"].includes(command)) {
    const offer = context.offer_id ? await getNegotiableOfferById(context.offer_id) : null;
    const listing = offer ? await getActiveListingById(offer.listing_id) : null;
    if (!offer || !listing) return "That proposal is no longer available.";
    return [
      title("Change proposal"),
      caption("Send one amount or both values in a natural sentence."),
      "",
      `Example: I can send ${formatMoney(offerWantAmount(listing, offer), listing.want_currency)} for ${formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)}.`,
    ].join("\n");
  }

  if (isReminderIntent(command) && context.offer_id) {
    const offer = await getNegotiableOfferById(context.offer_id);
    if (!offer || !["pending", "countered"].includes(offer.status)) {
      await clearSession(user, user.whatsapp_phone);
      return "That proposal is no longer open.";
    }

    const listing = await getActiveListingById(offer.listing_id);
    if (!listing) {
      await clearSession(user, user.whatsapp_phone);
      return "That negotiable listing is no longer live.";
    }

    const targetUserId = listing.owner_user_id === user.id ? offer.offering_user_id : listing.owner_user_id;
    const targetUser = await getUserById(targetUserId);
    return sendNegotiationReminder({ user, offer, listing, targetUser });
  }

  if (!messageProposal && (isCancelIntent(text) || isDeclineIntent(text))) {
    let reciprocalPair = null;
    if (context.offer_id) {
      const offer = await getNegotiableOfferById(context.offer_id);
      const sourceListingId = reciprocalSourceListingId(offer);
      if (offer?.listing_id && sourceListingId) {
        reciprocalPair = { sourceListingId, candidateListingId: offer.listing_id };
      }
      await supabaseRequest(`negotiable_offers?id=eq.${filterValue(context.offer_id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "withdrawn",
          message: "Withdrawn in chat.",
        }),
      }).catch(() => {});
    }
    await clearSession(user, user.whatsapp_phone);
    if (reciprocalPair) {
      await rematchNegotiationPair(
        reciprocalPair.sourceListingId,
        reciprocalPair.candidateListingId,
        user.id,
        "negotiation_withdrawn"
      );
    }
    return [
      title("Negotiation closed"),
      "",
      "No trade was opened. Both listings remain live.",
      "",
      "Akara has moved past this pairing and is checking the next compatible options.",
    ].join("\n");
  }

  if (session.current_step === "taker_review") {
    const listing = await getActiveListingById(context.listing_id);
    if (!listing) {
      await clearSession(user, user.whatsapp_phone);
      return "That negotiable listing is no longer live. Type find offers to browse again.";
    }

    const proposal = parseNegotiationProposal(text, listing);
    if (proposal?.error) return proposal.error;

    if (!proposal && /\b(accept|take|open|deal|start|go ahead|posted|same terms|terms)\b/.test(command)) {
      await clearSession(user, user.whatsapp_phone);
      return reserveListing(user, listing, {
        force: true,
        takerIntro: "You accepted the posted negotiable terms.",
        makerIntro: "The trader accepted your posted negotiable terms.",
      });
    }

    if (!proposal) {
      return [
        title("Send a proposal"),
        caption(`Tell me what you want to send in ${listing.want_currency}, what you want to receive in ${listing.have_currency}, or both.`),
        "",
        `${action(`offer ${formatMoney(listing.want_amount, listing.want_currency)}`)} or ${action(`offer ${formatMoney(listing.have_amount, listing.have_currency)}`)} or ${action("accept terms")}`,
      ].join("\n");
    }
    if (proposal.error) return proposal.error;

    const offer = await createNegotiationOffer(user, listing, {
      ...proposal,
      message: text,
    });
    await upsertSession(user, user.whatsapp_phone, "negotiation", "taker_waiting", {
      offer_id: offer.id,
      listing_id: listing.id,
    });

    const maker = await getUserById(listing.owner_user_id);
    if (maker?.whatsapp_phone) {
      await upsertSession(maker, maker.whatsapp_phone, "negotiation", "owner_review", {
        offer_id: offer.id,
        listing_id: listing.id,
        taker_user_id: user.id,
      });
      sendWhatsAppText(maker.whatsapp_phone, negotiationProposalMessage(listing, offer)).catch((error) => {
        console.error(`[negotiation] owner proposal notice failed: ${error.message}`);
      });
    }

    return negotiationWaitingMessage(listing, offer);
  }

  if (session.current_step === "owner_review") {
    const offer = await getNegotiableOfferById(context.offer_id);
    if (!offer || !["pending", "countered"].includes(offer.status)) {
      await clearSession(user, user.whatsapp_phone);
      return "That proposal is no longer open.";
    }

    const listing = await getActiveListingById(offer.listing_id);
    if (!listing || listing.owner_user_id !== user.id) {
      await clearSession(user, user.whatsapp_phone);
      return "That negotiable listing is no longer available.";
    }

    const taker = await getUserById(offer.offering_user_id);
    if (!taker) {
      await clearSession(user, user.whatsapp_phone);
      return "I could not find the trader who sent that proposal.";
    }

    const proposal = parseNegotiationProposal(text, listing);
    if (proposal?.error) return proposal.error;

    if (!proposal && /\b(accept|approve|agree|yes|deal|open)\b/.test(command)) {
      return openListingTrade(taker, listing, {
        force: true,
        want_amount: offer.offered_amount,
        have_amount: offer.receive_amount,
        reciprocalSourceListingId: reciprocalSourceListingId(offer),
        negotiableOfferId: offer.id,
        quoteType: "negotiated",
        returnRole: "maker",
        takerIntro: "Your proposal was accepted, so I opened the trade room.",
        makerIntro: "You accepted a negotiable proposal, so I opened the trade room.",
      });
    }

    if (!proposal && /\b(decline|reject|pass|no)\b/.test(command)) {
      await supabaseRequest(`negotiable_offers?id=eq.${filterValue(offer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "declined" }),
      });
      await clearSession(user, user.whatsapp_phone);
      if (taker.whatsapp_phone) {
        sendWhatsAppText(
          taker.whatsapp_phone,
          [
            title("Proposal declined"),
            "",
            "The listing owner passed on your proposal.",
            "Your listing remains live while Akara checks the next compatible option.",
          ].join("\n")
        ).catch((error) => console.error(`[negotiation] decline notice failed: ${error.message}`));
      }
      const sourceListingId = reciprocalSourceListingId(offer);
      if (sourceListingId) {
        await rematchNegotiationPair(
          sourceListingId,
          listing.id,
          user.id,
          "proposal_declined"
        );
      }
      return "Proposal declined. No trade was opened. Your listing remains live while Akara checks the next option.";
    }

    if (!proposal) {
      return [
        title("Reply to proposal"),
        "",
        `${action("accept")} to open the trade`,
        `${action("decline")} to pass`,
        `${action(`counter ${formatMoney(offerWantAmount(listing, offer), listing.want_currency)}`)} to change what you receive`,
        `${action(`counter ${formatMoney(offerReceiveAmount(listing, offer), listing.have_currency)}`)} to change what you send`,
      ].join("\n");
    }
    const patch = mergedOfferPatch(listing, offer, proposal);
    const updated = (await supabaseRequest(`negotiable_offers?id=eq.${filterValue(offer.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "countered",
        ...patch,
        message: reciprocalSourceListingId(offer) ? offer.message : text,
      }),
    }))[0] || { ...offer, ...patch };

    await upsertSession(taker, taker.whatsapp_phone, "negotiation", "counter_review", {
      offer_id: offer.id,
      listing_id: listing.id,
    });
    if (taker.whatsapp_phone) {
      sendWhatsAppText(taker.whatsapp_phone, negotiationCounterMessage(listing, updated)).catch((error) => {
        console.error(`[negotiation] counter notice failed: ${error.message}`);
      });
    }

    return [
      title("Counter sent"),
      "",
      fieldBlock("You receive", formatMoney(offerWantAmount(listing, updated), listing.want_currency)),
      "",
      fieldBlock("You send", formatMoney(offerReceiveAmount(listing, updated), listing.have_currency)),
      "",
      "I will update you if they accept or decline.",
    ].join("\n");
  }

  if (session.current_step === "counter_review" || session.current_step === "taker_waiting") {
    const offer = await getNegotiableOfferById(context.offer_id);
    if (!offer) {
      await clearSession(user, user.whatsapp_phone);
      return "That proposal is no longer available.";
    }

    const listing = await getActiveListingById(offer.listing_id);
    if (!listing) {
      await clearSession(user, user.whatsapp_phone);
      return "That negotiable listing is no longer live.";
    }

    const proposal = parseNegotiationProposal(text, listing);
    if (proposal?.error) return proposal.error;

    if (session.current_step === "taker_waiting" && offer.status === "pending" && !proposal) {
      return [
        title("Proposal still pending"),
        "",
        "The listing owner has not replied yet.",
        `${action("cancel")} to withdraw it.`,
      ].join("\n");
    }

    if (!proposal && /\b(accept|approve|agree|yes|deal|open)\b/.test(command)) {
      return reserveListing(user, listing, {
        force: true,
        want_amount: offer.offered_amount,
        have_amount: offer.receive_amount,
        reciprocalSourceListingId: reciprocalSourceListingId(offer),
        negotiableOfferId: offer.id,
        quoteType: "negotiated",
        takerIntro: "You accepted the counter proposal.",
        makerIntro: "The trader accepted your counter proposal.",
      });
    }

    if (!proposal && /\b(decline|reject|pass|no)\b/.test(command)) {
      await supabaseRequest(`negotiable_offers?id=eq.${filterValue(offer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "declined" }),
      });
      await clearSession(user, user.whatsapp_phone);
      const owner = await getUserById(listing.owner_user_id);
      if (owner?.whatsapp_phone) {
        sendWhatsAppText(owner.whatsapp_phone, "The other peer declined your counter. Your listing remains live while Akara checks the next option.").catch(() => {});
      }
      const sourceListingId = reciprocalSourceListingId(offer);
      if (sourceListingId) {
        await rematchNegotiationPair(
          sourceListingId,
          listing.id,
          user.id,
          "counter_declined"
        );
      }
      return "Counter declined. No trade was opened. Akara is checking the next compatible option.";
    }

    if (!proposal) return negotiationCounterMessage(listing, offer);

    const patch = mergedOfferPatch(listing, offer, proposal);
    const updated = (await supabaseRequest(`negotiable_offers?id=eq.${filterValue(offer.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "pending",
        ...patch,
        message: reciprocalSourceListingId(offer) ? offer.message : text,
      }),
    }))[0] || { ...offer, ...patch };
    const owner = await getUserById(listing.owner_user_id);
    if (owner?.whatsapp_phone) {
      await upsertSession(owner, owner.whatsapp_phone, "negotiation", "owner_review", {
        offer_id: offer.id,
        listing_id: listing.id,
        taker_user_id: user.id,
      });
      sendWhatsAppText(owner.whatsapp_phone, negotiationProposalMessage(listing, updated)).catch(() => {});
    }
    await upsertSession(user, user.whatsapp_phone, "negotiation", "taker_waiting", {
      offer_id: offer.id,
      listing_id: listing.id,
    });
    return negotiationWaitingMessage(listing, updated);
  }

  await clearSession(user, user.whatsapp_phone);
  return "I closed that negotiation. Type find offers to browse again.";
}

async function handleCreateListing(text, user, session) {
  const context = session.context_json || {};
  const step = session.current_step;

  if (isDeclineIntent(text) || isCancelIntent(text) || isSearchAgainIntent(text)) {
    if (context.editing_listing_id && context.previous_listing_status) {
      await supabaseRequest(
        `listings?id=eq.${filterValue(context.editing_listing_id)}&owner_user_id=eq.${filterValue(user.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: context.previous_listing_status }),
        }
      );
    }

    await clearSession(user, user.whatsapp_phone);
    return [
      title("No problem"),
      "",
      "I have closed that listing flow.",
      "",
      mainMenu(),
    ].join("\n");
  }

  if (step === "quick") {
    const details = parseListingDetails(text);
    const missing = missingListingFields(details);
    if (!missing.length) return prepareListingPreview(user, details);

    // A bare currency ("GHS") carries no amount, so parseListingDetails finds
    // nothing, accept it as the have side instead of re-asking for it.
    const bareCurrency = !details.have_currency && normalizeCurrency(text);
    if (bareCurrency) {
      details.have_currency = bareCurrency;
      await upsertSession(user, user.whatsapp_phone, "create_listing", "want_currency", details);
      return currencyListReply({
        mode: "want",
        body: "What currency do you want in return?",
        excludeCurrency: bareCurrency,
      });
    }

    await upsertSession(user, user.whatsapp_phone, "create_listing", missing[0], details);
    return missingListingReply(missing, details);
  }

  if (hasDirectionalExchangeText(text) && !["confirm", "listing_type"].includes(step)) {
    const details = mergePresentDetails(context, parseListingDetails(text));
    const missing = missingListingFields(details);
    if (!missing.length) return prepareListingPreview(user, details);

    await upsertSession(user, user.whatsapp_phone, "create_listing", missing[0], details);
    return missingListingReply(missing, details);
  }

  if (step === "have_currency") {
    const currency = normalizeCurrency(text);
    if (!currency) return currencyListReply({ mode: "have", body: "Choose what currency you have." });

    context.have_currency = currency;
    await upsertSession(user, user.whatsapp_phone, "create_listing", "want_currency", context);
    return currencyListReply({
      mode: "want",
      body: "What currency do you want in return?",
      excludeCurrency: currency,
    });
  }

  if (step === "want_currency") {
    const currency = normalizeCurrency(text);
    if (!currency) {
      return currencyListReply({
        mode: "want",
        body: "Choose what currency you want in return.",
        excludeCurrency: context.have_currency || null,
      });
    }
    if (currency === context.have_currency) return "Choose a different currency from the one you have.";

    context.want_currency = currency;
    if (context.have_amount && context.want_amount) {
      return prepareListingPreview(user, context);
    }
    if (context.have_amount) {
      await upsertSession(user, user.whatsapp_phone, "create_listing", "want_amount", context);
      return `How much ${context.want_currency} do you want for ${formatMoney(context.have_amount, context.have_currency)}?`;
    }
    await upsertSession(user, user.whatsapp_phone, "create_listing", "have_amount", context);
    return `How much ${context.have_currency} do you have?`;
  }

  if (step === "have_amount") {
    const amount = parseAmount(text);
    if (!amount) return "Enter a valid amount, like 50000.";

    context.have_amount = amount;
    if (context.want_amount) {
      context.listing_type = context.listing_type || "negotiable";
      await upsertSession(user, user.whatsapp_phone, "create_listing", "confirm", context);
      return listingReviewReply(context, [
        `You previously asked for ${formatMoney(context.want_amount, context.want_currency)}.`,
        "I kept that amount below. Choose Edit if you want to change it.",
      ].join("\n"));
    }
    await upsertSession(user, user.whatsapp_phone, "create_listing", "want_amount", context);
    return `How much ${context.want_currency} do you want for ${formatMoney(amount, context.have_currency)}?`;
  }

  if (step === "want_amount") {
    const amount = parseAmount(text);
    if (!amount) return "Enter a valid amount, like 55000.";

    context.want_amount = amount;
    const currency = normalizeCurrency(text);
    if (currency && currency !== context.have_currency) context.want_currency = currency;
    context.listing_type = context.listing_type || "negotiable";
    await upsertSession(user, user.whatsapp_phone, "create_listing", "confirm", context);
    return listingReviewReply(context);
  }

  if (step === "listing_type") {
    const listingType = text.trim().toLowerCase();
    const normalizedType = listingType.includes("flex") || listingType.includes("nego") || listingType.includes("offer")
      ? "negotiable"
      : listingType.includes("firm") || listingType.includes("fixed")
        ? "fixed"
        : null;
    if (!normalizedType) return `Reply ${action("fixed")} or ${action("negotiable")}.`;

    context.listing_type = normalizedType;
    await upsertSession(user, user.whatsapp_phone, "create_listing", "confirm", context);

    return listingReviewReply(context);
  }

  if (step === "confirm") {
    const command = compactText(text);

    if (isEditIntent(command)) {
      return startListingEdit(user, context);
    }

    if (!isListingPublishIntent(command)) {
      return whatsappButtonsReply([
        title("Ready to publish?"),
        "",
        `Say ${action("publish it")}, ${action("list this")}, or ${action("go ahead")} to make it live.`,
        `Say ${action("edit")} to change it, or ${action("cancel")} to stop.`,
      ].join("\n"), [
        { id: "publish", title: "Publish" },
        { id: "edit", title: "Edit" },
        { id: "cancel", title: "Cancel" },
      ]);
    }

    return publishListing(user, context);
  }

  if (step === "edit_choice") {
    const command = compactText(text);

    if (isListingPublishIntent(command)) return publishListing(user, context);

    const choice = listingEditChoice(command);
    if (choice === "have_amount") {
      await upsertSession(user, user.whatsapp_phone, "create_listing", "edit_have_amount", context);
      return [
        title("Edit send amount"),
        "",
        `Current: ${formatMoney(context.have_amount, context.have_currency)}`,
        "",
        `What should the new ${context.have_currency} amount be?`,
      ].join("\n");
    }

    if (choice === "want_amount") {
      await upsertSession(user, user.whatsapp_phone, "create_listing", "edit_want_amount", context);
      return [
        title("Edit receive amount"),
        "",
        `Current: ${formatMoney(context.want_amount, context.want_currency)}`,
        "",
        `What should the new ${context.want_currency} amount be?`,
      ].join("\n");
    }

    if (choice === "currencies") {
      await upsertSession(user, user.whatsapp_phone, "create_listing", "have_currency", context);
      return currencyListReply({
        mode: "have",
        body: [title("Edit currencies"), "What currency do you have?"].join("\n\n"),
      });
    }

    if (choice === "terms") {
      await upsertSession(user, user.whatsapp_phone, "create_listing", "listing_type", context);
      return [
        title("Edit terms"),
        "",
        `Current: ${listingTypeLabel(context.listing_type || "negotiable")}`,
        "",
        `Choose ${action("fixed")} or ${action("negotiable")}.`,
      ].join("\n");
    }

    return listingEditMenu(context);
  }

  if (step === "edit_have_amount") {
    const amount = parseAmount(text);
    if (!amount) return "Enter the new amount you want to send, like 50000.";

    context.have_amount = amount;
    return prepareListingPreview(user, context);
  }

  if (step === "edit_want_amount") {
    const amount = parseAmount(text);
    if (!amount) return "Enter the new amount you want to receive, like 55000.";

    context.want_amount = amount;
    return prepareListingPreview(user, context);
  }

  await clearSession(user, user.whatsapp_phone);
  return "I reset that listing flow. Tell me what currency you have and which currency you want in one line when you are ready.";
}

module.exports = {
  startListingEdit,
  prepareListingPreview,
  prepareBulkListingPreview,
  publishListing,
  publishBulkListings,
  reserveListing,
  reserveListingByCode,
  reserveListingById,
  handleCreateListing,
  handleBulkListing,
  handleNegotiation,
  requeueCancelledAutoMatch,
  runSmartMatchingSweep,
  runPendingMatchReminderSweep,
};
