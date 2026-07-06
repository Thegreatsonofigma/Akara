const { supabaseRequest, filterValue } = require("../lib/supabase");
const { sendWhatsAppText } = require("../lib/whatsapp");
const { config } = require("../config");
const { title, caption, action, labeled, fieldBlock, formatMoney, moneyNumber, formatCooldown } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { normalizeCurrency, parseAmount, parseCurrencyAmountPairs, currencyHelpLine } = require("../nlp/currency");
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

const NEGOTIATION_REMINDER_COOLDOWN_MS = 10 * 60 * 1000;

function fundsDisclaimer() {
  return "Akara records the exchange trail and keeps both sides aligned. Funds still move directly through bank or mobile money, so confirm the recipient details before sending.";
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
  ].filter(Boolean).join("\n\n");
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
  return [
    title("Listing already live"),
    "You already have this exact offer open on Akara.",
    "",
    labeled("Reference", displayReference(listing.listing_code, "listing")),
    labeled("Status", listing.status === "active" ? "Live" : listing.status),
    "",
    `${action("my listings")} to manage it`,
    `${action("find offers")} to browse the marketplace`,
  ].join("\n");
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
    return [
      intro,
      "",
      "What currency do you have?",
      "",
      currencyHelpLine(),
    ].join("\n");
  }

  await upsertSession(user, user.whatsapp_phone, "create_listing", "edit_choice", context);
  return listingEditMenu(context);
}

function listingEditMenu(context, intro = title("What do you want to edit?")) {
  return [
    intro,
    caption("Choose only the part you want to change."),
    "",
    `1. ${action("send amount")} ${formatMoney(context.have_amount, context.have_currency)}`,
    `2. ${action("receive amount")} ${formatMoney(context.want_amount, context.want_currency)}`,
    `3. ${action("terms")} ${listingTypeLabel(context.listing_type || "negotiable")}`,
    `4. ${action("currencies")}`,
    "",
    `${action("publish")} to continue with publication`,
    `${action("cancel")} to stop`,
  ].join("\n");
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

    await clearSession(user, user.whatsapp_phone);
    const shareUrl = listingShareUrl(listing);
    const liveMessage = listingLiveMessage("Listing updated ✅", listing.listing_code || context.listing_code, listing, shareUrl);
    return deliverListingLive(user, listing, listing.listing_code || context.listing_code, liveMessage);
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
      listing_type: context.listing_type || "negotiable",
      status: "active",
    }),
  });
  const listing = createdListings[0];

  const autoMatchReply = await tryAutoMatchListing(user, listing);
  if (autoMatchReply) return autoMatchReply;

  await clearSession(user, user.whatsapp_phone);
  const shareUrl = listingShareUrl(listing);
  const liveMessage = listingLiveMessage("Your listing is live ✅", listingCode, listing, shareUrl);
  return deliverListingLive(user, listing, listingCode, liveMessage);
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
function parseNegotiationProposal(text, listing) {
  const pairs = parseCurrencyAmountPairs(text);
  if (!pairs.length) {
    const amount = parseAmount(text);
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
    return "Please verify first so your trade partner knows you are real. Type verify.";
  }

  const dealHaveAmount = moneyNumber(options.have_amount || listing.have_amount);
  const dealWantAmount = moneyNumber(options.want_amount || listing.want_amount);
  const tierBlock = tierLimitBlockForAmount(user, dealWantAmount, listing.want_currency)
    || tierLimitBlockForAmount(user, dealHaveAmount, listing.have_currency);
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
      have_amount: dealHaveAmount,
      want_amount: dealWantAmount,
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

  const makerNotice = tradeOpenedMessage({
    heading: "Akara Trade opened ✅",
    intro: options.makerIntro,
    dealCode,
    youSend: { amount: dealHaveAmount, currency: listing.have_currency },
    youReceive: { amount: dealWantAmount, currency: listing.want_currency },
    paymentProfile: takerReceiveProfile,
    expectedProfile: makerReceiveProfile,
    firstInstruction: "When their payment is marked sent, check your bank or MoMo before sending your side.",
  });

  const takerNotice = tradeOpenedMessage({
    heading: "Akara Trade opened ✅",
    intro: options.takerIntro,
    dealCode,
    youSend: { amount: dealWantAmount, currency: listing.want_currency },
    youReceive: { amount: dealHaveAmount, currency: listing.have_currency },
    paymentProfile: makerReceiveProfile,
    expectedProfile: takerReceiveProfile,
    firstInstruction: "Name check: the account name should match the verified person you are trading with.",
  });

  if (maker?.whatsapp_phone) {
    await upsertSession(maker, maker.whatsapp_phone, "deal_room", "reserved", {
      deal_id: deal.id,
      deal_code: dealCode,
    });

    const makerShouldReceiveNotice = options.returnRole !== "maker";
    const takerShouldReceiveNotice = options.returnRole === "maker";
    if (makerShouldReceiveNotice) sendWhatsAppText(maker.whatsapp_phone, makerNotice).catch((error) => {
      console.error(`[deal] maker notice failed for ${maker.whatsapp_phone}: ${error.message}`);
    });
    if (takerShouldReceiveNotice && user.whatsapp_phone) sendWhatsAppText(user.whatsapp_phone, takerNotice).catch((error) => {
      console.error(`[deal] taker notice failed for ${user.whatsapp_phone}: ${error.message}`);
    });
  }

  return options.returnRole === "maker" ? makerNotice : takerNotice;
}

async function reserveListing(user, listing, options = {}) {
  if (!options.force && listing.listing_type === "negotiable") {
    if (!isVerified(user)) return "Please verify first so your trade partner knows you are real. Type verify.";
    if (listing.owner_user_id === user.id) return "This is your own offer. Share the link with someone else to start an Akara Trade.";
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

  if (isCancelIntent(text) || isDeclineIntent(text)) {
    if (context.offer_id) {
      await supabaseRequest(`negotiable_offers?id=eq.${filterValue(context.offer_id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "withdrawn",
          message: "Withdrawn in chat.",
        }),
      }).catch(() => {});
    }
    await clearSession(user, user.whatsapp_phone);
    return [
      title("Negotiation closed"),
      "",
      "No trade was opened.",
      `${action("find offers")} to browse again.`,
    ].join("\n");
  }

  if (session.current_step === "taker_review") {
    const listing = await getActiveListingById(context.listing_id);
    if (!listing) {
      await clearSession(user, user.whatsapp_phone);
      return "That negotiable listing is no longer live. Type find offers to browse again.";
    }

    if (/\b(accept|take|open|deal|start|go ahead|posted|same terms|terms)\b/.test(command)) {
      await clearSession(user, user.whatsapp_phone);
      return reserveListing(user, listing, {
        force: true,
        takerIntro: "You accepted the posted negotiable terms.",
        makerIntro: "The trader accepted your posted negotiable terms.",
      });
    }

    const proposal = parseNegotiationProposal(text, listing);
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

    if (/\b(accept|approve|agree|yes|deal|open)\b/.test(command)) {
      await supabaseRequest(`negotiable_offers?id=eq.${filterValue(offer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "accepted" }),
      });
      await clearSession(user, user.whatsapp_phone);
      return openListingTrade(taker, listing, {
        force: true,
        want_amount: offer.offered_amount,
        have_amount: offer.receive_amount,
        returnRole: "maker",
        takerIntro: "Your proposal was accepted, so I opened the trade room.",
        makerIntro: "You accepted a negotiable proposal, so I opened the trade room.",
      });
    }

    if (/\b(decline|reject|pass|no)\b/.test(command)) {
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
            `${action("find offers")} to browse another one.`,
          ].join("\n")
        ).catch((error) => console.error(`[negotiation] decline notice failed: ${error.message}`));
      }
      return "Proposal declined. No trade was opened.";
    }

    const proposal = parseNegotiationProposal(text, listing);
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
    if (proposal.error) return proposal.error;

    const patch = mergedOfferPatch(listing, offer, proposal);
    const updated = (await supabaseRequest(`negotiable_offers?id=eq.${filterValue(offer.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "countered",
        ...patch,
        message: text,
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

    if (session.current_step === "taker_waiting" && offer.status === "pending") {
      return [
        title("Proposal still pending"),
        "",
        "The listing owner has not replied yet.",
        `${action("cancel")} to withdraw it.`,
      ].join("\n");
    }

    if (/\b(accept|approve|agree|yes|deal|open)\b/.test(command)) {
      await supabaseRequest(`negotiable_offers?id=eq.${filterValue(offer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "accepted" }),
      });
      await clearSession(user, user.whatsapp_phone);
      return reserveListing(user, listing, {
        force: true,
        want_amount: offer.offered_amount,
        have_amount: offer.receive_amount,
        takerIntro: "You accepted the counter proposal.",
        makerIntro: "The trader accepted your counter proposal.",
      });
    }

    if (/\b(decline|reject|pass|no)\b/.test(command)) {
      await supabaseRequest(`negotiable_offers?id=eq.${filterValue(offer.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "declined" }),
      });
      await clearSession(user, user.whatsapp_phone);
      const owner = await getUserById(listing.owner_user_id);
      if (owner?.whatsapp_phone) {
        sendWhatsAppText(owner.whatsapp_phone, "The trader declined your counter proposal. No trade was opened.").catch(() => {});
      }
      return "Counter declined. No trade was opened.";
    }

    const proposal = parseNegotiationProposal(text, listing);
    if (!proposal) return negotiationCounterMessage(listing, offer);
    if (proposal.error) return proposal.error;

    const patch = mergedOfferPatch(listing, offer, proposal);
    const updated = (await supabaseRequest(`negotiable_offers?id=eq.${filterValue(offer.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "pending",
        ...patch,
        message: text,
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
      return [
        "What currency do you want in return?",
        "",
        currencyHelpLine(bareCurrency),
      ].join("\n");
    }

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
    if (!currency) return ["Choose what currency you have.", currencyHelpLine()].join("\n\n");

    context.have_currency = currency;
    await upsertSession(user, user.whatsapp_phone, "create_listing", "want_currency", context);
    return [
      "What currency do you want in return?",
      "",
      currencyHelpLine(currency),
    ].join("\n");
  }

  if (step === "want_currency") {
    const currency = normalizeCurrency(text);
    if (!currency) return ["Choose what currency you want in return.", currencyHelpLine(context.have_currency)].join("\n\n");
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
    context.listing_type = context.listing_type || "negotiable";
    await upsertSession(user, user.whatsapp_phone, "create_listing", "confirm", context);
    return formatListingReview(context);
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

    return formatListingReview(context);
  }

  if (step === "confirm") {
    const command = compactText(text);

    if (isEditIntent(command)) {
      return startListingEdit(user, context);
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
      return [
        title("Edit currencies"),
        "",
        "What currency do you have?",
        "",
        currencyHelpLine(),
      ].join("\n");
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
  publishListing,
  reserveListing,
  reserveListingByCode,
  reserveListingById,
  handleCreateListing,
  handleNegotiation,
};
