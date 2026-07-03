const { supabaseRequest, filterValue } = require("../lib/supabase");
const { sendWhatsAppText } = require("../lib/whatsapp");
const { title, caption, action, labeled, fieldBlock, formatMoney, moneyNumber } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { normalizeCurrency, parseAmount, currencyHelpLine } = require("../nlp/currency");
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
} = require("../nlp/intents");
const { getUserById, isVerified, tierLimitBlockForAmount, tierLimitBlockForListing } = require("../db/users");
const { upsertSession, clearSession } = require("../db/sessions");
const { getDefaultPaymentProfile, formatPaymentProfile, paymentDestinationTitle, paymentExpectationLine } = require("../db/payments");
const { sendListingCard } = require("../lib/listing-card");
const {
  displayReference,
  generateReferenceCode,
  listingShareUrl,
  listingTypeLabel,
  listingHasEnoughForDeal,
  createResidualListing,
} = require("../db/listings");
const { mainMenu, feeIncludedText, listingShareCopy, explainMissingListing } = require("../messages/copy");
const { startPaymentProfileForCurrency } = require("./payment-profile");

function fundsDisclaimer() {
  return "Akara records the exchange trail and keeps both sides aligned. Funds still move directly through bank or mobile money, so confirm the recipient details before sending.";
}

function listingLiveMessage(heading, listingCode, listing, shareUrl) {
  const code = displayReference(listingCode, "listing");
  return [
    title(heading),
    caption("Your swap card is attached in this chat."),
    "",
    fieldBlock("Reference", code),
    "",
    fieldBlock("You send", formatMoney(listing.have_amount, listing.have_currency)),
    "",
    fieldBlock("You receive", formatMoney(listing.want_amount, listing.want_currency)),
    "",
    fieldBlock("Offer terms", listingTypeLabel(listing.listing_type || "fixed")),
    "",
    fieldBlock("Service fee", feeIncludedText()),
    "",
    title("Share"),
    shareUrl ? shareUrl : action(`open ${code}`),
    caption(listingShareCopy()),
  ].filter(Boolean).join("\n");
}

function tradeOpenedMessage({
  heading,
  intro,
  dealCode,
  youSend,
  youReceive,
  paymentProfile,
  expectedProfile,
  residualLine = "",
  firstInstruction,
}) {
  return [
    title(`${heading} ${dealCode}`),
    intro ? caption(intro) : "",
    "",
    fieldBlock("You send", formatMoney(youSend.amount, youSend.currency)),
    "",
    fieldBlock("You receive", formatMoney(youReceive.amount, youReceive.currency)),
    "",
    fieldBlock("Payment window", "15 minutes"),
    "",
    fieldBlock("Service fee", feeIncludedText()),
    residualLine ? ["", fieldBlock("Still listed", residualLine)].join("\n") : "",
    "",
    title("Send to"),
    caption(paymentDestinationTitle(paymentProfile)),
    formatPaymentProfile(paymentProfile),
    "",
    title("Expect in your account"),
    caption(paymentExpectationLine(youReceive.amount, youReceive.currency, expectedProfile)),
    "",
    title("Actions"),
    `${action("paid")} after you send`,
    `${action("received")} when your money lands`,
    `${action("dispute")} if anything looks wrong`,
    "",
    firstInstruction,
    fundsDisclaimer(),
  ].filter(Boolean).join("\n");
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
    labeled("Terms", listingTypeLabel(context.listing_type)),
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

async function prepareListingPreview(user, details, intro = "") {
  const context = {
    have_currency: details.have_currency,
    want_currency: details.want_currency,
    have_amount: details.have_amount,
    want_amount: details.want_amount,
    listing_type: details.listing_type || "fixed",
    listing_code: details.listing_code || await generateReferenceCode("listing"),
    ...(details.editing_listing_id ? { editing_listing_id: details.editing_listing_id } : {}),
    ...(details.previous_listing_status ? { previous_listing_status: details.previous_listing_status } : {}),
  };

  const receiveProfile = await getDefaultPaymentProfile(user.id, context.want_currency);
  if (!receiveProfile) {
    const prompt = await startPaymentProfileForCurrency(user, context.want_currency, {
      return_flow: "preview_listing",
      pending_listing: context,
    });
    return [
      intro,
      title("Add payout detail"),
      caption(`Before I show the final review, add where you want to receive ${context.want_currency}.`),
      "",
      prompt,
    ].filter(Boolean).join("\n\n");
  }

  await upsertSession(user, user.whatsapp_phone, "create_listing", "confirm", context);
  return [intro, formatListingReview(context)].filter(Boolean).join("\n\n");
}

async function publishListing(user, context) {
  const tierBlock = tierLimitBlockForListing(user, context);
  if (tierBlock) return tierBlock;

  const receiveProfile = await getDefaultPaymentProfile(user.id, context.want_currency);
  if (!receiveProfile) {
    const prompt = await startPaymentProfileForCurrency(user, context.want_currency, {
      return_flow: "publish_listing",
      pending_listing: context,
    });
    return [
      `Before this goes live, add your ${context.want_currency} payout detail.`,
      "",
      prompt,
    ].join("\n");
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
          listing_type: context.listing_type || "fixed",
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

    await clearSession(user, user.whatsapp_phone);
    const shareUrl = listingShareUrl(listing.listing_code || context.listing_code);
    sendListingCard(
      user.whatsapp_phone,
      listing,
      `Listing card for ${displayReference(listing.listing_code || context.listing_code, "listing")}`
    ).catch((error) => {
      console.error(`[listing] card send failed for ${listing.listing_code || context.listing_code}: ${error.message}`);
    });

    return listingLiveMessage("Listing updated ✅", listing.listing_code || context.listing_code, listing, shareUrl);
  }

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
      listing_type: context.listing_type || "fixed",
      status: "active",
    }),
  });
  const listing = createdListings[0];

  const autoMatchReply = await tryAutoMatchListing(user, listing);
  if (autoMatchReply) return autoMatchReply;

  await clearSession(user, user.whatsapp_phone);
  const shareUrl = listingShareUrl(listingCode);
  sendListingCard(
    user.whatsapp_phone,
    listing,
    `Listing card for ${displayReference(listingCode, "listing")}`
  ).catch((error) => {
    console.error(`[listing] card send failed for ${listingCode}: ${error.message}`);
  });

  return listingLiveMessage("Your listing is live ✅", listingCode, listing, shareUrl);
}

async function findReciprocalListing(user, listing) {
  const rows = await supabaseRequest(
    [
      "listings?select=id,listing_code,owner_user_id,have_currency,want_currency,have_amount,want_amount,rate,listing_type,created_at",
      "status=eq.active",
      `have_currency=eq.${filterValue(listing.want_currency)}`,
      `want_currency=eq.${filterValue(listing.have_currency)}`,
      `owner_user_id=neq.${filterValue(user.id)}`,
      "order=created_at.asc",
      "limit=20",
    ].join("&")
  );

  return rows.find((candidate) => {
    if (candidate.owner_user_id === user.id) return false;
    const candidateCoversListing = listingHasEnoughForDeal(candidate, listing.want_amount, listing.have_amount);
    const listingCoversCandidate = listingHasEnoughForDeal(listing, candidate.want_amount, candidate.have_amount);
    return candidateCoversListing || listingCoversCandidate;
  }) || null;
}

async function tryAutoMatchListing(user, listing) {
  const match = await findReciprocalListing(user, listing);
  if (!match) return null;

  const makerReceiveProfile = await getDefaultPaymentProfile(match.owner_user_id, match.want_currency);
  const takerReceiveProfile = await getDefaultPaymentProfile(user.id, match.have_currency);
  if (!makerReceiveProfile || !takerReceiveProfile) return null;

  const matchCoversListing = listingHasEnoughForDeal(match, listing.want_amount, listing.have_amount);
  const listingCoversMatch = listingHasEnoughForDeal(listing, match.want_amount, match.have_amount);
  if (!matchCoversListing && !listingCoversMatch) return null;

  const dealHaveAmount = matchCoversListing ? moneyNumber(listing.want_amount) : moneyNumber(match.have_amount);
  const dealWantAmount = matchCoversListing ? moneyNumber(listing.have_amount) : moneyNumber(match.want_amount);
  let matchResidual = null;
  let listingResidual = null;

  const dealCode = await generateReferenceCode("deal");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
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
    }),
  });
  const deal = deals[0];

  await supabaseRequest(`listings?id=eq.${filterValue(match.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "reserved" }),
  });

  await supabaseRequest(`listings?id=eq.${filterValue(listing.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "reserved" }),
  });

  if (matchCoversListing) {
    matchResidual = await createResidualListing(match, dealHaveAmount, dealWantAmount);
  }

  if (listingCoversMatch) {
    listingResidual = await createResidualListing(listing, dealWantAmount, dealHaveAmount);
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
      intro: "Akara matched your live listing with a compatible reciprocal listing.",
      dealCode,
      youSend: { amount: dealHaveAmount, currency: match.have_currency },
      youReceive: { amount: dealWantAmount, currency: match.want_currency },
      paymentProfile: takerReceiveProfile,
      expectedProfile: makerReceiveProfile,
      residualLine: matchResidual ? `${formatMoney(matchResidual.have_amount, matchResidual.have_currency)} for ${formatMoney(matchResidual.want_amount, matchResidual.want_currency)}` : "",
      firstInstruction: "Check your bank or MoMo before sending your side.",
    });

    sendWhatsAppText(maker.whatsapp_phone, makerNotice).catch((error) => {
      console.error(`[deal] auto-match notice failed for ${maker.whatsapp_phone}: ${error.message}`);
    });
  }

  return tradeOpenedMessage({
    heading: "Akara Trade opened ✅",
    intro: "Your listing matched a compatible reciprocal listing, so I opened the trade room.",
    dealCode,
    youSend: { amount: dealWantAmount, currency: match.want_currency },
    youReceive: { amount: dealHaveAmount, currency: match.have_currency },
    paymentProfile: makerReceiveProfile,
    expectedProfile: takerReceiveProfile,
    residualLine: listingResidual ? `${formatMoney(listingResidual.have_amount, listingResidual.have_currency)} for ${formatMoney(listingResidual.want_amount, listingResidual.want_currency)}` : "",
    firstInstruction: "Name check: the account name should match the verified person you are trading with.",
  });
}

async function reserveListing(user, listing) {
  if (!isVerified(user)) {
    return "Please verify first so your trade partner knows you are real. Type verify.";
  }

  const tierBlock = tierLimitBlockForAmount(user, listing.want_amount, listing.want_currency)
    || tierLimitBlockForAmount(user, listing.have_amount, listing.have_currency);
  if (tierBlock) return tierBlock;

  if (listing.owner_user_id === user.id) {
    return "This is your own offer. Share the link with someone else to start an Akara Trade.";
  }

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
    return [
      `Before this trade opens, add your ${listing.have_currency} payout detail.`,
      "",
      prompt,
    ].join("\n");
  }

  const dealCode = await generateReferenceCode("deal");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const deals = await supabaseRequest("deals", {
    method: "POST",
    body: JSON.stringify({
      deal_code: dealCode,
      listing_id: listing.id,
      maker_user_id: listing.owner_user_id,
      taker_user_id: user.id,
      have_currency: listing.have_currency,
      want_currency: listing.want_currency,
      have_amount: listing.have_amount,
      want_amount: listing.want_amount,
      status: "reserved",
      reservation_expires_at: expiresAt,
    }),
  });

  await supabaseRequest(`listings?id=eq.${filterValue(listing.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "reserved" }),
  });

  const deal = deals[0];

  await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", {
    deal_id: deal.id,
    deal_code: dealCode,
  });

  const maker = await getUserById(listing.owner_user_id);

  if (maker?.whatsapp_phone) {
    await upsertSession(maker, maker.whatsapp_phone, "deal_room", "reserved", {
      deal_id: deal.id,
      deal_code: dealCode,
    });

    const makerNotice = tradeOpenedMessage({
      heading: "Akara Trade opened ✅",
      dealCode,
      youSend: { amount: listing.have_amount, currency: listing.have_currency },
      youReceive: { amount: listing.want_amount, currency: listing.want_currency },
      paymentProfile: takerReceiveProfile,
      expectedProfile: makerReceiveProfile,
      firstInstruction: "When their payment is marked sent, check your bank or MoMo before sending your side.",
    });

    sendWhatsAppText(maker.whatsapp_phone, makerNotice).catch((error) => {
      console.error(`[deal] maker notice failed for ${maker.whatsapp_phone}: ${error.message}`);
    });
  }

  return tradeOpenedMessage({
    heading: "Akara Trade opened ✅",
    dealCode,
    youSend: { amount: listing.want_amount, currency: listing.want_currency },
    youReceive: { amount: listing.have_amount, currency: listing.have_currency },
    paymentProfile: makerReceiveProfile,
    expectedProfile: takerReceiveProfile,
    firstInstruction: "Name check: the account name should match the verified person you are trading with.",
  });
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

    await upsertSession(user, user.whatsapp_phone, "create_listing", missing[0], details);
    return explainMissingListing(missing, details);
  }

  if (hasDirectionalExchangeText(text) && !["confirm", "listing_type"].includes(step)) {
    const details = mergePresentDetails(context, parseListingDetails(text));
    const missing = missingListingFields(details);
    if (!missing.length) return prepareListingPreview(user, details);

    await upsertSession(user, user.whatsapp_phone, "create_listing", missing[0], details);
    return explainMissingListing(missing, details);
  }

  if (step === "have_currency") {
    const currency = normalizeCurrency(text);
    if (!currency) return ["Choose what you have.", currencyHelpLine()].join("\n\n");

    context.have_currency = currency;
    await upsertSession(user, user.whatsapp_phone, "create_listing", "want_currency", context);
    return [
      "What do you want in return?",
      "",
      currencyHelpLine(currency),
    ].join("\n");
  }

  if (step === "want_currency") {
    const currency = normalizeCurrency(text);
    if (!currency) return ["Choose what you want in return.", currencyHelpLine(context.have_currency)].join("\n\n");
    if (currency === context.have_currency) return "Choose a different currency from the one you have.";

    context.want_currency = currency;
    await upsertSession(user, user.whatsapp_phone, "create_listing", "have_amount", context);
    return `How much ${context.have_currency} do you have?`;
  }

  if (step === "have_amount") {
    const amount = parseAmount(text);
    if (!amount) return "Enter a valid amount, like 50000.";

    context.have_amount = amount;
    await upsertSession(user, user.whatsapp_phone, "create_listing", "want_amount", context);
    return `How much ${context.want_currency} do you want for ${formatMoney(amount, context.have_currency)}?`;
  }

  if (step === "want_amount") {
    const amount = parseAmount(text);
    if (!amount) return "Enter a valid amount, like 55000.";

    context.want_amount = amount;
    const currency = normalizeCurrency(text);
    if (currency && currency !== context.have_currency) context.want_currency = currency;
    await upsertSession(user, user.whatsapp_phone, "create_listing", "listing_type", context);
    return "Should this rate be fixed or flexible?";
  }

  if (step === "listing_type") {
    const listingType = text.trim().toLowerCase();
    const normalizedType = listingType.includes("flex") || listingType.includes("nego") || listingType.includes("offer")
      ? "negotiable"
      : listingType.includes("firm") || listingType.includes("fixed")
        ? "fixed"
        : null;
    if (!normalizedType) return "Reply fixed or flexible.";

    context.listing_type = normalizedType;
    await upsertSession(user, user.whatsapp_phone, "create_listing", "confirm", context);

    return formatListingReview(context);
  }

  if (step === "confirm") {
    const command = compactText(text);

    if (isEditIntent(command)) {
      const editContext = {
        ...(context.editing_listing_id ? { editing_listing_id: context.editing_listing_id } : {}),
        ...(context.listing_code ? { listing_code: context.listing_code } : {}),
        ...(context.previous_listing_status ? { previous_listing_status: context.previous_listing_status } : {}),
      };
      await upsertSession(user, user.whatsapp_phone, "create_listing", "have_currency", editContext);
      return "No problem. What currency do you have?";
    }

    if (!isListingPublishIntent(command)) {
      return [
        title("Ready to publish?"),
        "",
        `Say ${action("publish it")}, ${action("list this")}, or ${action("go ahead")} to make it live.`,
        `Say ${action("edit")} to change it, or ${action("cancel")} to stop.`,
      ].join("\n");
    }

    return publishListing(user, context);
  }

  await clearSession(user, user.whatsapp_phone);
  return "I reset that listing flow. Tell me what you have and what you want in one line when you are ready.";
}

module.exports = {
  prepareListingPreview,
  publishListing,
  reserveListing,
  reserveListingByCode,
  reserveListingById,
  handleCreateListing,
};
