const { title, caption, action, applyInterpretedAnswer } = require("./lib/format");
const { sendWhatsAppList } = require("./lib/whatsapp");
const { normalizeCurrency, currencyHelpLine, parsePaymentCurrency, parseCurrencyAmountPairs } = require("./nlp/currency");
const {
  parseListingDetails,
  parseSearchDetails,
  missingListingFields,
  hasDirectionalExchangeText,
  mergePresentDetails,
} = require("./nlp/exchange");
const {
  inferIntent,
  isGreeting,
  isThanksMessage,
  isSessionClosureMessage,
  isWellbeingQuestion,
  isMenuCommand,
  isHistoryCommand,
  isProfileCommand,
  isPayoutsCommand,
  isMyListingsCommand,
  isBulkListingCancelIntent,
  isBulkPayoutDeleteIntent,
  isConfirmationYes,
  isConfirmationNo,
  isAssistantQuestion,
  isRateQuestion,
  isDemandSeekingQuestion,
  isBrowseAllOffersIntent,
  isListingPublishIntent,
  isEditIntent,
  isDeclineIntent,
  isCancelIntent,
  selectedOptionNumber,
} = require("./nlp/intents");
const { interpretMessage, isFreshRequestAction } = require("./nlp/interpreter");
const { recordMessage, historyTranscript } = require("./nlp/history");
const { isVerified, isOnHold } = require("./db/users");
const { getSession, upsertSession, clearSession } = require("./db/sessions");
const { extractListingCode, extractDealCode } = require("./db/listings");
const { getDealByCodeForUser, getLatestOpenDealForUser } = require("./db/deals");
const { mainMenu, verificationIntro, mainMenuListPayload, thanksReply, wellbeingReply, explainMissingListing, menuOptionLines } = require("./messages/copy");
const { scopedAssistantReply } = require("./messages/assistant");
const { startVerification, handleVerification, verificationStepPrompt } = require("./flows/verification");
const { startPaymentProfileFlow, startPaymentProfileForCurrency, handlePaymentProfile } = require("./flows/payment-profile");
const { prepareListingPreview, reserveListingByCode, handleCreateListing, handleNegotiation } = require("./flows/listing");
const {
  continueSearchOrShowMatches,
  showOfferMatches,
  showBrowseOffers,
  showBrowseOrPairMatches,
  handleFindOffer,
  handleSearchResults,
} = require("./flows/search");
const {
  viewProfileReply,
  viewPayoutsReply,
  profileSettingsReply,
  requestBulkListingCancel,
  requestBulkPayoutDelete,
  handleSettings,
  isSettingsCommand,
  shouldLeaveSettingsForFreshCommand,
} = require("./flows/settings");
const {
  handleDealRoom,
  isDealRoomCommand,
  shouldLeaveDealRoomForFreshCommand,
  isExplicitTradeRecallIntent,
} = require("./flows/deal-room");
const { getMyListingsReply, getMyDealsReply } = require("./flows/history");

function accountOnHoldReply(user) {
  return `Your account is paused until ${new Date(user.hold_until).toLocaleString()}.`;
}

function makeOfferPrompt() {
  return [
      "Tell me what currency you have.",
      "",
      currencyHelpLine(),
      "",
      "Example: I have 50k naira and want 55k RWF",
    ].join("\n");
}

function findOfferPrompt() {
  return [
    "Tell me what currency you need.",
    "",
    "Example:",
    "I have 55k RWF and need naira",
    "or",
    "Show me RWF offers",
  ].join("\n");
}


// Sends the interactive menu list directly and returns null so the caller
// sends nothing more; falls back to returning the text when the list fails.
async function sendMenuList(user, body) {
  try {
    await sendWhatsAppList(user.whatsapp_phone, mainMenuListPayload(body));
    return null;
  } catch (error) {
    console.error(`[router] menu list failed for ${user.whatsapp_phone}: ${error.message}`);
    return body;
  }
}

function listingCodesFromText(text) {
  const codes = [];
  const regex = /(?:^|\n)\*?\s*(\d{1,2})\.\s*(AKR-LIST-\d+)\*?/gi;
  let match;
  while ((match = regex.exec(String(text || "")))) {
    codes[Number(match[1])] = match[2].toUpperCase();
  }
  return codes;
}

function payoutCurrencyFromQuotedOption(quotedText, optionNumber) {
  const lines = String(quotedText || "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(new RegExp(`^\\s*${optionNumber}\\.\\s*(.+)$`));
    if (!match) continue;
    const currency = normalizeCurrency(match[1]);
    if (currency) return currency;
  }
  return null;
}

// Handles a numeric reply that quotes an earlier Akara message (menu, offer
// list, or payout options).
async function resolveQuotedReply(text, user, incoming = {}) {
  const quotedText = incoming.quotedText || "";
  const number = selectedOptionNumber(text);
  if (!quotedText || !number) return null;

  if (/\*?Find offers and trade with more confidence\*?/i.test(quotedText)) {
    if (number === 1) {
      await upsertSession(user, user.whatsapp_phone, "create_listing", "quick", {});
      return makeOfferPrompt();
    }
    if (number === 2) {
      await clearSession(user, user.whatsapp_phone);
      return showBrowseOffers(user);
    }
    if (number === 3) return getMyListingsReply(user);
    if (number === 4) return getMyDealsReply(user);
    if (number === 5) return viewProfileReply(user);
  }

  const listingCode = listingCodesFromText(quotedText)[number];
  if (listingCode) return reserveListingByCode(user, listingCode);

  if (/\*?Payout details\*?/i.test(quotedText)) {
    const currency = payoutCurrencyFromQuotedOption(quotedText, number);
    if (currency) return startPaymentProfileForCurrency(user, currency);
  }

  return null;
}

// Actions whose written answer may be sent to the user as-is. Add
// conversational actions here (e.g. "greeting", "thanks", "wellbeing") to let
// the model speak for them too; functional actions must never be listed.
const ANSWER_ACTIONS = new Set(["question", "unknown"]);

// Actions that do NOT interrupt the named flow: the flow's own handler knows
// how to process them (numbers in a results list, confirmations in settings,
// payment updates in a deal room). Every other fresh action cancels the flow
// and gets served immediately — the user is never asked twice.
const FLOW_COMPATIBLE_ACTIONS = {
  create_listing: new Set(["create_listing"]),
  find_offer: new Set(["find_offer"]),
  search_results: new Set(["reserve_listing", "find_offer"]),
  negotiation: new Set(["flow_reply", "reserve_listing", "trade_action"]),
  settings: new Set(["settings_action", "add_payout"]),
  deal_room: new Set(["trade_action", "reserve_listing"]),
};

function actionInterruptsFlow(interpretedAction, flow) {
  if (!flow || !isFreshRequestAction(interpretedAction)) return false;
  const compatible = FLOW_COMPATIBLE_ACTIONS[flow];
  return !(compatible && compatible.has(interpretedAction));
}

// Single routing brain. Takes the model interpretation of the message and
// performs the matching action; every branch also keeps its deterministic
// check (exact commands, codes, session flows), so routing still works when
// the interpretation arrives as "unknown" (OpenAI off or failed).
async function dispatchInterpretedAction(interpreted, text, user, session, incoming = {}) {
  const command = text.trim().toLowerCase();
  const interpretedAction = interpreted?.action || "unknown";
  const details = interpreted?.details || {};
  const answer = typeof interpreted?.answer === "string" ? interpreted.answer.trim() : "";

  // The model's written answer is only the reply for conversational
  // classifications. Functional actions (flows, listings, trades, settings,
  // confirmations) always route through their handlers below, so an answer
  // the model wrote anyway can never swallow flow state. Questions are
  // answered without cancelling whatever flow is active.
  if (answer && ANSWER_ACTIONS.has(interpretedAction)) return answer;

  if (!isVerified(user)) {
    if (interpretedAction === "view_profile" || isProfileCommand(text)) {
      return viewProfileReply(user);
    }

    // "verify" must always be able to start or resume the flow — checked
    // before the status intros so a user who cancelled mid-verification is
    // never trapped on the "reply with the next detail" screen. Submitted
    // (pending_review) and suspended profiles keep their intro instead.
    const wantsVerify = interpretedAction === "verify" || command === "verify" || command === "verify me"
      || command === "1" || inferIntent(text) === "verify";
    if (wantsVerify && !["pending_review", "suspended"].includes(user.verification_status)) {
      return startVerification(user);
    }

    if (["pending_input", "pending_review", "rejected", "suspended"].includes(user.verification_status)) {
      if (interpretedAction === "question" || isAssistantQuestion(text)) return scopedAssistantReply(text, user);
      return verificationIntro(user);
    }

    if (interpretedAction === "greeting" || isGreeting(text)) {
      return verificationIntro(user);
    }

    if (interpretedAction === "question" || isAssistantQuestion(text)) {
      return scopedAssistantReply(text, user);
    }

    return [
      "Verification comes first 🔐",
      "",
      "Akara only lets verified people make offers or start exchanges. It keeps the trade trail cleaner for everyone.",
      "",
      "Type verify to start.",
    ].join("\n");
  }

  // Settings confirmations are destructive yes/no questions, so they are
  // resolved deterministically before anything else can hijack the reply.
  if (session?.current_flow === "settings" && ["confirm_bulk_action", "confirm_delete_payout"].includes(session.current_step)) {
    if (isConfirmationYes(text) || isConfirmationNo(text) || interpretedAction === "flow_reply") {
      return handleSettings(text, user, session);
    }
  }

  // Scoped views and global commands work from anywhere and cancel whatever
  // flow was active: asking for something outside the flow serves it at once.
  if (interpretedAction === "menu" || isMenuCommand(text)) {
    await clearSession(user, user.whatsapp_phone);
    return sendMenuList(user, mainMenu());
  }

  if (interpretedAction === "bulk_cancel_listings" || isBulkListingCancelIntent(text)) return requestBulkListingCancel(user);
  if (interpretedAction === "bulk_delete_payouts" || isBulkPayoutDeleteIntent(text)) return requestBulkPayoutDelete(user);

  if (interpretedAction === "my_deals" || isHistoryCommand(text)) {
    await clearSession(user, user.whatsapp_phone);
    return getMyDealsReply(user);
  }

  if (interpretedAction === "view_profile" || isProfileCommand(text)) {
    await clearSession(user, user.whatsapp_phone);
    return viewProfileReply(user);
  }

  if (interpretedAction === "view_payouts" || isPayoutsCommand(text)) {
    await clearSession(user, user.whatsapp_phone);
    return viewPayoutsReply(user);
  }

  if (interpretedAction === "my_listings" || isMyListingsCommand(text)) {
    await clearSession(user, user.whatsapp_phone);
    return getMyListingsReply(user);
  }

  if (!session?.current_flow && (interpretedAction === "thanks" || isSessionClosureMessage(text))) {
    await clearSession(user, user.whatsapp_phone);
    return [
      title("Done"),
      caption("That session is closed."),
      "",
      mainMenu(),
    ].join("\n");
  }

  // Thanks is unambiguous, so it gets a warm reply even mid-flow without
  // losing the flow. Wellbeing stays later: "how far" doubles as a status
  // check inside a deal room.
  if (interpretedAction === "thanks" || isThanksMessage(text)) return thanksReply(user);

  const quotedReply = await resolveQuotedReply(text, user, incoming);
  if (quotedReply) return quotedReply;

  if (session?.current_flow === "negotiation") {
    return handleNegotiation(text, user, session);
  }

  if (["post", "make offer", "create listing", "create offer", "list offer"].includes(command)) {
    if (isOnHold(user)) return accountOnHoldReply(user);
    await clearSession(user, user.whatsapp_phone);
    await upsertSession(user, user.whatsapp_phone, "create_listing", "quick", {});
    return makeOfferPrompt();
  }

  const listingCode = extractListingCode(text);
  if (listingCode && (interpretedAction === "reserve_listing" || /\b(reserve|take|accept|open)\b/i.test(text))) {
    return reserveListingByCode(user, listingCode);
  }

  const requestedDealCode = extractDealCode(text);
  if (requestedDealCode && (interpretedAction === "trade_action" || isExplicitTradeRecallIntent(text, incoming) || isDealRoomCommand(text, incoming))) {
    const requestedDeal = await getDealByCodeForUser(user, requestedDealCode);
    if (!requestedDeal) {
      return [
        title("Transaction not found"),
        "",
        `I could not find ${requestedDealCode} on this WhatsApp account.`,
        `${action("history")} to see your transaction records.`,
      ].join("\n");
    }

    const restoredSession = {
      current_flow: "deal_room",
      current_step: "reserved",
      context_json: {
        deal_id: requestedDeal.id,
        deal_code: requestedDeal.deal_code,
      },
    };
    await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", restoredSession.context_json);
    return handleDealRoom(text, user, restoredSession, incoming);
  }

  // The browse regex is loose ("open the offer" reads as browsing because of
  // "open"), so it only decides when the model did not classify the message.
  const browseFallback = ["unknown", "flow_reply"].includes(interpretedAction) && isBrowseAllOffersIntent(text);
  if (interpretedAction === "browse_offers" || browseFallback) {
    await clearSession(user, user.whatsapp_phone);
    // "I have 2k naira and want rwf, show me available deals" carries a full
    // pair, so show matched offers for it instead of a generic browse.
    return showBrowseOrPairMatches(user, text);
  }

  // The model's extraction leads — it reads pidgin and context the regex
  // gets wrong ("i wan move 50k naira" is money the user HAS). The regex
  // parse fills whatever slots the model left empty, and carries the whole
  // load when OpenAI is off.
  const interpretedExchangeDetails = {
    have_currency: details.have_currency || null,
    want_currency: details.want_currency || null,
    have_amount: details.have_amount || null,
    want_amount: details.want_amount || null,
  };
  const freshListingDetails = mergePresentDetails(parseListingDetails(text), interpretedExchangeDetails);
  if (freshListingDetails.have_currency && freshListingDetails.have_currency === freshListingDetails.want_currency) {
    freshListingDetails.want_currency = null;
    freshListingDetails.want_amount = null;
  }
  const hasFreshCompleteListing = missingListingFields(freshListingDetails).length === 0;
  const freshDirectional = hasDirectionalExchangeText(text)
    || interpretedAction === "create_listing"
    || interpretedAction === "find_offer";

  // "publish it" / "go ahead" at the review step must reach the flow handler
  // and publish — even when the model re-extracted the draft's details from
  // the transcript and labelled the message create_listing.
  const confirmingDraft = session?.current_flow === "create_listing"
    && session.current_step === "confirm"
    && isListingPublishIntent(text);

  // "Who needs naira? 50k for 54k rwf" hunts for a counterparty for money the
  // user already holds. It reads like a listing (and the model sometimes
  // labels it create_listing), but it is a search: show live matches first,
  // and let the no-match path offer to create the listing instead of opening
  // the create flow straight away.
  if (isDemandSeekingQuestion(text) && freshDirectional && !confirmingDraft) {
    if (isOnHold(user)) return accountOnHoldReply(user);
    await clearSession(user, user.whatsapp_phone);
    return continueSearchOrShowMatches(user, freshListingDetails);
  }

  if (session?.current_flow === "create_listing" && hasFreshCompleteListing && freshDirectional && !confirmingDraft) {
    if (isOnHold(user)) return accountOnHoldReply(user);
    await clearSession(user, user.whatsapp_phone);
    return prepareListingPreview(user, freshListingDetails);
  }

  // Draft revisions at the review step: "make it 60k", "use kes instead",
  // "make it negotiable" update the draft and re-show the review, instead of
  // re-asking "ready to publish?".
  if (session?.current_flow === "create_listing" && session.current_step === "confirm"
      && !isListingPublishIntent(text) && !isDeclineIntent(text) && !isCancelIntent(text)) {
    const flowContext = session.context_json || {};
    const typeChange = /\b(flex\w*|nego\w*|fixed|firm)\b/i.test(text);
    const updates = { ...freshListingDetails };
    if (typeChange) {
      updates.listing_type = /\b(flex\w*|nego\w*)\b/i.test(text) ? "negotiable" : "fixed";
    } else {
      delete updates.listing_type;
    }
    const hasUpdates = typeChange
      || ["have_currency", "want_currency", "have_amount", "want_amount"].some((field) => updates[field]);

    if (hasUpdates) {
      const revisedDraft = mergePresentDetails({
        have_currency: flowContext.have_currency || null,
        want_currency: flowContext.want_currency || null,
        have_amount: flowContext.have_amount || null,
        want_amount: flowContext.want_amount || null,
        listing_type: flowContext.listing_type || "negotiable",
        ...(flowContext.listing_code ? { listing_code: flowContext.listing_code } : {}),
        ...(flowContext.editing_listing_id ? { editing_listing_id: flowContext.editing_listing_id } : {}),
        ...(flowContext.previous_listing_status ? { previous_listing_status: flowContext.previous_listing_status } : {}),
      }, updates);

      if (!missingListingFields(revisedDraft).length && revisedDraft.have_currency !== revisedDraft.want_currency) {
        if (isOnHold(user)) return accountOnHoldReply(user);
        return prepareListingPreview(user, revisedDraft);
      }
    }
  }

  if (session?.current_flow === "create_listing" && session.current_step === "confirm" && isEditIntent(text)) {
    return handleCreateListing(text, user, session);
  }

  if (session?.current_flow === "find_offer" && hasFreshCompleteListing && freshDirectional) {
    if (isOnHold(user)) return accountOnHoldReply(user);
    await clearSession(user, user.whatsapp_phone);
    return continueSearchOrShowMatches(user, freshListingDetails);
  }

  // Universal flow interrupt: a fresh request that the active flow cannot
  // handle cancels the flow, and the request is served below on this same
  // turn — the user is never re-prompted by a flow they already left.
  if (session?.current_flow && actionInterruptsFlow(interpretedAction, session.current_flow)) {
    await clearSession(user, user.whatsapp_phone);
    session = null;
  }

  // Greetings also release any flow: "hi" mid-flow reads as starting over,
  // unless the greeting carries an actual exchange request.
  const bareGreeting = (interpretedAction === "greeting" || isGreeting(text))
    && !freshDirectional
    && !parseCurrencyAmountPairs(text).length;
  if (session?.current_flow && bareGreeting) {
    await clearSession(user, user.whatsapp_phone);
    session = null;
  }

  if (session?.current_flow === "create_listing") {
    return handleCreateListing(text, user, session);
  }

  if (session?.current_flow === "find_offer") {
    return handleFindOffer(text, user, session);
  }

  if (session?.current_flow === "search_results") {
    return handleSearchResults(text, user, session);
  }

  if (session?.current_flow === "negotiation") {
    return handleNegotiation(text, user, session);
  }

  if (session?.current_flow === "settings") {
    if (interpretedAction === "unknown" && shouldLeaveSettingsForFreshCommand(text)) {
      await clearSession(user, user.whatsapp_phone);
      session = null;
    } else if (isSettingsCommand(text) || ["settings_action", "add_payout", "flow_reply"].includes(interpretedAction)) {
      return handleSettings(text, user, session);
    } else {
      await clearSession(user, user.whatsapp_phone);
      session = null;
    }
  }

  if (session?.current_flow === "deal_room") {
    // The deterministic leave check only decides when the model gave nothing;
    // a model classification of trade_action or flow_reply keeps the room.
    if (interpretedAction === "unknown" && shouldLeaveDealRoomForFreshCommand(text, incoming)) {
      await clearSession(user, user.whatsapp_phone);
      session = null;
    } else {
      return handleDealRoom(text, user, session, incoming);
    }
  }

  if (interpretedAction === "trade_action" || isExplicitTradeRecallIntent(text, incoming)) {
    const latestDeal = await getLatestOpenDealForUser(user.id);
    if (latestDeal) {
      const restoredSession = {
        current_flow: "deal_room",
        current_step: "reserved",
        context_json: {
          deal_id: latestDeal.id,
          deal_code: latestDeal.deal_code,
        },
      };
      await upsertSession(user, user.whatsapp_phone, "deal_room", "reserved", restoredSession.context_json);
      return handleDealRoom(text, user, restoredSession, incoming);
    }
  }

  if (interpretedAction === "wellbeing" || isWellbeingQuestion(text)){
    return sendMenuList(user, wellbeingReply(user));
  }

  if (bareGreeting) {
    await clearSession(user, user.whatsapp_phone);
    return sendMenuList(user, mainMenu());
  }

  if (command === "verify" || command === "verify me" || interpretedAction === "verify") {
    return sendMenuList(user, "You are already verified ✅\n\n" + mainMenu());
  }

  const paymentSetupCurrency = parsePaymentCurrency(text) || details.payment_currency || null;
  const wantsPaymentSetup = interpretedAction === "add_payout"
    || /\b(add|set up|setup|save|register|enter)\b.*\b(payout|payment|bank|momo|mobile money|account|wallet|details?)\b/.test(command);

  if (wantsPaymentSetup) {
    return startPaymentProfileFlow(user, paymentSetupCurrency ? { payment_currency: paymentSetupCurrency } : {});
  }

  if (command === "add payment" || command === "add payout") {
    return startPaymentProfileFlow(user);
  }

  // The model's classification leads; the loose keyword intent regex only
  // weighs in when the interpretation came back empty-handed.
  const intent = ["unknown", "flow_reply"].includes(interpretedAction) ? inferIntent(text) : null;
  const listingDetails = freshListingDetails;
  const hasCompleteListing = hasFreshCompleteListing;
  const settingsAction = interpretedAction === "settings_action"
    || /\b(edit|update|change|delete|remove|pause|reopen|resume|activate|close)\b.*\b(payout|payment|bank|momo|details?|offer|listing)\b/.test(command);

  if (hasCompleteListing && (
    interpretedAction === "create_listing"
    || interpretedAction === "find_offer"
    || intent === "create_listing"
    || /\b(for|to|want|need|convert|change|swap|around|within|rate)\b/i.test(text)
  )) {
    if (isOnHold(user)) return accountOnHoldReply(user);
    const explicitSearch = interpretedAction === "find_offer"
      || /\b(find|search|show|browse|available|offers?|deals?|trades?|matches|around|within|rate)\b/.test(command)
      || isRateQuestion(text);

    return explicitSearch
      ? showOfferMatches(user, listingDetails)
      : prepareListingPreview(user, listingDetails);
  }

  if (settingsAction) {
    await profileSettingsReply(user);
    const settingsSession = await getSession(user.whatsapp_phone);
    return handleSettings(text, user, settingsSession);
  }

  if (command === "5" || intent === "settings") {
    return viewProfileReply(user);
  }

  if (isRateQuestion(text)) {
    return scopedAssistantReply(text, user);
  }

  // Loose intent words like "trades" and "get" appear in ordinary questions,
  // so a question-shaped message is answered before the intent fallbacks can
  // hijack it into a flow prompt.
  if (["question", "unknown", "flow_reply"].includes(interpretedAction) && isAssistantQuestion(text)
      && !isDemandSeekingQuestion(text)) {
    return scopedAssistantReply(text, user);
  }

  if (command === "post" || command === "make offer" || command === "create listing" || command === "create offer" || command === "list offer" || command === "1" || interpretedAction === "create_listing" || intent === "create_listing") {
    if (isOnHold(user)) return accountOnHoldReply(user);

    const hasAnyExchangeDetail = ["have_currency", "want_currency", "have_amount", "want_amount"]
      .some((field) => listingDetails[field]);
    if (hasAnyExchangeDetail) {
      const missing = missingListingFields(listingDetails);
      if ((listingDetails.want_currency && listingDetails.want_amount && !listingDetails.have_currency)
          || (listingDetails.have_currency && listingDetails.have_amount && !listingDetails.want_currency)) {
        return continueSearchOrShowMatches(user, listingDetails);
      }

      if (!missing.length) {
        return showOfferMatches(user, listingDetails);
      }

      await upsertSession(user, user.whatsapp_phone, "create_listing", missing[0], listingDetails);
      return explainMissingListing(missing, listingDetails);
    }

    await upsertSession(user, user.whatsapp_phone, "create_listing", "quick", {});
    return makeOfferPrompt();
  }

  if (command === "3" || intent === "my_listings") {
    return getMyListingsReply(user);
  }

  if (command === "find match" || command === "find offer" || command === "find offers" || command === "find money" || command === "2" || interpretedAction === "find_offer" || intent === "find_offer") {
    if (isOnHold(user)) return accountOnHoldReply(user);

    if (command === "find offers" || command === "2") {
      await clearSession(user, user.whatsapp_phone);
      return showBrowseOffers(user);
    }

    const searchDetails = mergePresentDetails(parseSearchDetails(text), interpretedExchangeDetails);
    if ((searchDetails.have_currency && searchDetails.want_currency)
        || (searchDetails.want_currency && (searchDetails.want_amount || searchDetails.amount))
        || (searchDetails.have_currency && (searchDetails.have_amount || searchDetails.amount))) {
      return continueSearchOrShowMatches(user, searchDetails);
    }

    await upsertSession(user, user.whatsapp_phone, "find_offer", "quick", searchDetails);
    return findOfferPrompt();
  }

  if (command === "4" || intent === "my_deals") {
    return getMyDealsReply(user);
  }

  // A reserve request without a code or visible list: ask which offer,
  // instead of dropping to the generic assistant.
  if (interpretedAction === "reserve_listing") {
    return [
      title("Which offer?"),
      "",
      "Send the offer code (like AKR-LIST-104), or ask to see offers first:",
      "",
      action("find offers"),
    ].join("\n");
  }

  return scopedAssistantReply(text, user);
}

// Fresh actions that may interrupt payout collection. Deliberately narrower
// than FRESH_ACTIONS: add_payout and settings_action stay in the flow, and a
// name, bank, or number reply always classifies as flow_reply.
function paymentProfileInterrupt(interpretedAction) {
  return isFreshRequestAction(interpretedAction)
    && !["add_payout", "settings_action"].includes(interpretedAction);
}

async function routeMessage(text, user, session, incoming = {}) {
  const command = text.trim().toLowerCase();

  if (!command && session?.current_flow === "verification") {
    return handleVerification(text, user, session, incoming);
  }

  // Media can mean a payment receipt, verification upload, or dispute proof.
  // When the active saved state is waiting for dispute proof, that evidence
  // must never fall through into the normal "payment already noted" receipt
  // guard.
  if (incoming.media?.id) {
    const liveSession = session?.current_flow ? session : await getSession(user.whatsapp_phone);
    if (liveSession?.current_flow === "deal_room" && liveSession.current_step === "awaiting_dispute_proof") {
      return handleDealRoom(text, user, liveSession, incoming);
    }
  }

  if (command === "cancel" || command === "stop") {
    if (session?.current_flow === "deal_room") {
      return handleDealRoom("cancel trade", user, session, incoming);
    }

    await clearSession(user, user.whatsapp_phone);
    return isVerified(user)
      ? [
          title("Stopped"),
          caption("That flow is closed."),
          "",
          mainMenu(),
        ].join("\n")
      : "No problem. Verification paused. Type verify when you are ready.";
  }

  if (command === "demo approve") {
    await clearSession(user, user.whatsapp_phone);
    return "Demo approval is now disabled. Type verify to submit a real verification request.";
  }

  if (isVerified(user) && ["post", "make offer", "create listing", "create offer", "list offer"].includes(command)) {
    if (isOnHold(user)) return accountOnHoldReply(user);
    await clearSession(user, user.whatsapp_phone);
    await upsertSession(user, user.whatsapp_phone, "create_listing", "quick", {});
    return makeOfferPrompt();
  }

  // One interpretation pass for everything else: the model sees the active
  // flow, the recent conversation, and the newest message. When OpenAI is off
  // or fails, dispatch runs with action "unknown" and the deterministic
  // checks carry the routing.
  const interpreted = (incoming.media?.id && !command)
    ? { action: "unknown", details: {}, answer: "" }
    : (await interpretMessage(text, {
        flow: session?.current_flow || null,
        step: session?.current_step || null,
        verified: isVerified(user),
        transcript: historyTranscript(user.whatsapp_phone),
      })) || { action: "unknown", details: {}, answer: "" };
  console.log({ interpreted });

  const reply = await routeInterpreted(interpreted, text, user, session, incoming);

  // The interpreter writes a short answer describing what the user asked for;
  // it becomes the reply's caption (or head text) so every message opens with
  // language fitted to the conversation. Question/unknown answers are already
  // full replies on their own, so they are never woven into another reply.
  // Unverified users and the verification flow only ever get predetermined
  // copy — never a model-written caption or heading.
  const skipAnswer = ANSWER_ACTIONS.has(interpreted.action)
    || interpreted.action === "flow_reply"
    || interpreted.action === "add_payout"
    || interpreted.action === "greeting"
    || interpreted.action === "wellbeing"
    || !isVerified(user)
    || session?.current_flow === "verification"
    || session?.current_flow === "payment_profile";
  return skipAnswer ? reply : applyInterpretedAnswer(reply, interpreted.answer);
}

async function routeInterpreted(interpreted, text, user, session, incoming = {}) {
  // Verification is fully scripted: the model only classifies messages here,
  // and nothing it writes is ever sent. Questions and outside requests get
  // predetermined walls that repeat the current step's prompt, so "find
  // offers" is never saved as someone's nationality and no AI-written answer
  // can replace or decorate a verification reply.
  if (session?.current_flow === "verification") {
    const stepPrompt = verificationStepPrompt(session.current_step, session.context_json || {});
    if (!incoming.media?.id && interpreted.action === "question") {
      return [
        "Verification first 🔐",
        "",
        "I will answer questions properly once your verification is done. For now:",
        "",
        stepPrompt,
        "",
        `Type ${action("cancel")} to pause.`,
      ].join("\n");
    }
    if (!incoming.media?.id && isFreshRequestAction(interpreted.action) && interpreted.action !== "verify") {
      return [
        "Verification comes first 🔐",
        "",
        "I can do that as soon as your verification is complete.",
        "",
        stepPrompt,
        "",
        `Type ${action("cancel")} to pause.`,
      ].join("\n");
    }
    return handleVerification(text, user, session, incoming);
  }

  // Payment profile also collects prompted answers, but verified users can
  // walk away mid-setup: a clear outside request cancels the setup and is
  // served immediately. Questions are answered without losing progress.
  // Only real questions short-circuit: an "unknown" mid-flow message is most
  // likely the requested detail (a name, a number), so it must reach the flow
  // handler — a model-written answer here would claim progress that never
  // happened and the detail would never be saved.
  if (session?.current_flow === "payment_profile") {
    if (interpreted.answer && interpreted.action === "question") return interpreted.answer;
    if (!incoming.media?.id && paymentProfileInterrupt(interpreted.action)) {
      await clearSession(user, user.whatsapp_phone);
      return dispatchInterpretedAction(interpreted, text, user, null, incoming);
    }
    return handlePaymentProfile(text, user, session);
  }

  return dispatchInterpretedAction(interpreted, text, user, session, incoming);
}

function describeIncomingForHistory(text, incoming = {}) {
  const value = String(text || "").trim();
  if (incoming.media?.id) {
    return value ? `[sent an attachment] ${value}` : "[sent an attachment]";
  }
  return value;
}

async function buildReply(text, user, session, incoming = {}) {
  const reply = await routeMessage(text, user, session, incoming);

  // Recorded after routing so the interpreter's transcript never contains the
  // message it is currently classifying.
  recordMessage(user.whatsapp_phone, "user", describeIncomingForHistory(text, incoming));
  recordMessage(user.whatsapp_phone, "assistant", reply);

  return reply;
}

module.exports = {
  buildReply,
  dispatchInterpretedAction,
};
