const { title, caption, action, applyInterpretedAnswer } = require("./lib/format");
const { sendWhatsAppList, sendWhatsAppButtons } = require("./lib/whatsapp");
const { normalizeCurrency, parsePaymentCurrency, parseCurrencyAmountPairs } = require("./nlp/currency");
const {
  parseListingDetails,
  parseBulkListingDetails,
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
  isTrustRecordCommand,
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
const { getSession, upsertSession, clearSession, clearFailedMessage } = require("./db/sessions");
const { extractListingCode, extractDealCode } = require("./db/listings");
const { getDealByCodeForUser, getLatestOpenDealForUser } = require("./db/deals");
const {
  mainMenu,
  verificationIntro,
  mainMenuListPayload,
  verificationStartButtonPayload,
  explainMissingListing,
  menuOptionLines,
  currencyListReply,
} = require("./messages/copy");
const { scopedAssistantReply, reputationAssistantReply } = require("./messages/assistant");
const { startVerification, handleVerification, verificationStepPrompt } = require("./flows/verification");
const { startPaymentProfileFlow, startPaymentProfileForCurrency, handlePaymentProfile } = require("./flows/payment-profile");
const {
  prepareListingPreview,
  prepareBulkListingPreview,
  reserveListingByCode,
  handleCreateListing,
  handleBulkListing,
  handleNegotiation,
} = require("./flows/listing");
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
  accountOverviewQuestionReply,
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
const {
  supportOptionsReply,
  supportEmailReply,
  disputeSupportReply,
  startSupportRequest,
  submitSupportRequest,
  handleSupport,
} = require("./flows/support");

function accountOnHoldReply(user) {
  if (user.dispute_hold) {
    return [
      title("Account temporarily paused"),
      "",
      "An open dispute is being reviewed. Your listings are hidden and you cannot open another exchange until it is resolved.",
      "",
      "You can still open the disputed transaction to add evidence or check its status.",
    ].join("\n");
  }
  return `Your account is paused until ${new Date(user.hold_until).toLocaleString()}.`;
}

function makeOfferPrompt() {
  return currencyListReply({
    mode: "have",
    body: [
      "Tell me what currency you have.",
      "",
      "Example: I have 50k naira and want 55k RWF",
    ].join("\n"),
  });
}

function isBulkOfferStartRequest(text) {
  const value = String(text || "").trim().toLowerCase();
  const bulkLanguage = /\b(bulk|multiple|several|many|more than one|different (?:currency|currencies|pairs?))\b/.test(value);
  const listingLanguage = /\b(offers?|listings?|rates?)\b/.test(value);
  const creationLanguage = /\b(create|make|post|publish|list|add|set up|want|need)\b/.test(value);
  return bulkLanguage && listingLanguage && creationLanguage;
}

function bulkOfferPrompt() {
  return [
    title("Create listings in bulk"),
    "",
    "Send 2 to 10 complete listings in one message. They can use different currency pairs.",
    "",
    caption("Example"),
    "`50k NGN for 55k RWF; 30k KES for 4.2m RWF; 20k GHS for 300k XAF`",
    "",
    "I will prepare one review before anything goes live.",
  ].join("\n");
}

function findOfferPrompt() {
  return currencyListReply({
    mode: "want",
    body: [
      "Tell me what currency you want to receive.",
      "",
      "Example: Show me RWF offers",
    ].join("\n"),
  });
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

async function sendVerificationStartList(user, body) {
  try {
    await sendWhatsAppButtons(user.whatsapp_phone, verificationStartButtonPayload(body));
    return null;
  } catch (error) {
    console.error(`[router] verification button failed for ${user.whatsapp_phone}: ${error.message}`);
    return [
      body,
      "",
      `Reply ${action("verify")} to start.`,
    ].join("\n");
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

function isSupportCommand(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return false;
  return /^(6|get support|support|contact support|email support|customer support|help desk|complaints?|complaint support)$/i.test(value)
    || /\b(contact|email|reach|message|talk to|get)\b.*\bsupport\b/i.test(value)
    || /\bsupport@tryakara\.com\b/i.test(value);
}

function isHumanSupportRequest(text, session = null) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return false;
  const namesSupportRole = /\b(human agent|human support|admin|customer care|customer service|support agent|support team)\b/.test(value);
  const asksToReachSomeone = (
    /\b(speak|talk|contact|connect|reach|escalate)\b.*\b(human|person|someone|somebody|admin|agent|team)\b/.test(value)
    || /\b(need|want)\b.*\b(person|someone|somebody)\b.*\b(resolve|review|investigate|fix|support)\b/.test(value)
  );
  const namesSeriousIssue = /\b(dispute|complaint|conflict|scam|fraud|not received|no alert)\b/.test(value);
  const reportsProblem = /\b(issue|problem|complaint|conflict|dispute|wrong|stuck|failed|not working|cannot|can'?t)\b/.test(value);
  const asksForReview = /\b(resolve|review|look into|check|investigate|help|assist|respond|reply|fix|sort out)\b/.test(value);
  const activeTrade = session?.current_flow === "deal_room" || Boolean(extractDealCode(text));

  if (activeTrade) return false;
  if (namesSupportRole || asksToReachSomeone || namesSeriousIssue) return true;
  return reportsProblem && asksForReview;
}

function bulkListingRequest(text, interpretedAction, session = null) {
  const pairs = parseCurrencyAmountPairs(text);
  const listings = parseBulkListingDetails(text);
  const hasCompleteBatch = listings.length >= 2;
  const explicitlyBrowsesOffers = (
    /\b(find|search|show|browse|view|check)\b.{0,45}\b(offers?|listings?|matches?|marketplace|deals?)\b/i.test(text)
    || /\b(offers?|listings?|matches?|marketplace|deals?)\b.{0,30}\b(find|search|show|browse|view|check)\b/i.test(text)
  );
  const looksLikeSearch = explicitlyBrowsesOffers
    || (!hasCompleteBatch && (
      interpretedAction === "find_offer"
      || interpretedAction === "browse_offers"
      || /\b(find|search|show|browse|available|who\s+(?:has|gets?|needs?|wants?))\b/i.test(text)
    ));
  const protectedFlow = ["deal_room", "negotiation"].includes(session?.current_flow);
  const explicitSupportContext = /\b(dispute|complaint|conflict|scam|fraud|support ticket|customer care|customer service|admin review)\b/i.test(text);

  return {
    pairs,
    listings,
    eligible: (pairs.length >= 4 || listings.length >= 2)
      && !looksLikeSearch
      && !protectedFlow
      && !explicitSupportContext,
  };
}

function supportCategory(text) {
  const value = String(text || "").toLowerCase();
  if (/\b(move|migrate|transfer|change)\b.*\b(akara account|phone|device|whatsapp number)\b/.test(value)) return "account_migration";
  if (/\b(dispute|conflict|scam|fraud|payment|receipt|not received|no alert)\b/.test(value)) return "trade";
  if (/\b(verify|verification|kyc|id|selfie)\b/.test(value)) return "verification";
  if (/\b(payout|bank|momo|account)\b/.test(value)) return "payout";
  if (/\b(listing|offer)\b/.test(value)) return "listing";
  return "general";
}

function isAccountMigrationQuestion(text) {
  const value = String(text || "").trim().toLowerCase();
  return /\b(new|another|change|changing|move|moving|migrate|migration|transfer)\b.*\b(phone|device|whatsapp number)\b/.test(value)
    || /\b(move|moving|migrate|migration|transfer)\b.*\b(akara account|my account)\b/.test(value)
    || /\b(phone|device|whatsapp number)\b.*\b(change|move|migrate|transfer)\b/.test(value);
}

function isAccountMigrationAction(text) {
  const value = String(text || "").trim().toLowerCase();
  if (/^(how|what|will|would|can|could|do i)\b/.test(value)) return false;
  return /\b(move|migrate|transfer|change)\b.*\b(my\s+)?(?:akara account|whatsapp number|phone number)\b/.test(value);
}

function isExplicitMarketplaceBrowse(text) {
  const value = String(text || "").trim().toLowerCase();
  return /^(?:please\s+)?(?:show|see|view|browse|find|list)(?:\s+me)?\s+(?:all|available|live|current)\s+(?:(?:ngn|naira|rwf|rwandan francs?|xaf|cfa|kes|kenyan shillings?|ghs|ghanaian? cedis?)\s+)?(?:offers?|listings?|deals?)$/.test(value);
}

function isCapabilitiesQuestion(text) {
  const value = String(text || "").trim().toLowerCase();
  return /\bwhat can (?:i|you|akara) do(?:\s+(?:on|with)\s+akara)?\b/.test(value)
    || /\bhow can akara help(?: me)?\b/.test(value)
    || /\bwhat (?:are|is) (?:my|the) (?:options|things i can do)(?:\s+on akara)?\b/.test(value);
}

// Handles a numeric reply that quotes an earlier Akara message (menu, offer
// list, or payout options).
async function resolveQuotedReply(text, user, incoming = {}) {
  const quotedText = incoming.quotedText || "";
  const number = selectedOptionNumber(text);
  if (!quotedText || !number) return null;

  if (/\*?(Find offers and trade with more confidence|choose your next move|choose what you want to do next|make offer)\*?/i.test(quotedText)) {
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
    if (number === 6) return supportOptionsReply();
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
const ANSWER_ACTIONS = new Set(["question", "unknown", "greeting", "thanks", "wellbeing"]);

// Actions that do NOT interrupt the named flow: the flow's own handler knows
// how to process them (numbers in a results list, confirmations in settings,
// payment updates in a deal room). Every other fresh action cancels the flow
// and gets served immediately — the user is never asked twice.
const FLOW_COMPATIBLE_ACTIONS = {
  create_listing: new Set(["create_listing"]),
  bulk_listing: new Set(["create_listing", "flow_reply"]),
  find_offer: new Set(["find_offer"]),
  search_results: new Set(["reserve_listing", "find_offer"]),
  negotiation: new Set(["flow_reply", "reserve_listing", "trade_action"]),
  settings: new Set(["settings_action", "add_payout"]),
  deal_room: new Set(["trade_action", "reserve_listing"]),
  support: new Set(["flow_reply", "get_support"]),
};

function actionInterruptsFlow(interpretedAction, flow) {
  if (!flow || !isFreshRequestAction(interpretedAction)) return false;
  const compatible = FLOW_COMPATIBLE_ACTIONS[flow];
  return !(compatible && compatible.has(interpretedAction));
}

async function conversationalReply(interpreted, text, user, session, options = {}) {
  const reply = await scopedAssistantReply(text, user, {
    modelAnswer: interpreted?.answer || "",
    interpretedAction: interpreted?.action || "unknown",
    activeFlow: session?.current_flow || "",
    ...options,
  });

  if (isVerified(user) && !session?.current_flow && !options.suppressNudge) {
    return {
      type: "whatsapp_list",
      list: mainMenuListPayload(reply),
      fallbackText: [
        reply,
        "",
        mainMenu(user),
      ].join("\n"),
    };
  }

  return reply;
}

function isConversationalInterpretation(interpreted) {
  const actionName = interpreted?.action || "unknown";
  if (["greeting", "thanks", "wellbeing", "question"].includes(actionName)) return true;
  return actionName === "unknown" && Boolean(String(interpreted?.answer || "").trim());
}

function interpretedSettingsCommand(interpreted, text, session) {
  if (interpreted?.action !== "settings_action") return text;
  const details = interpreted.details || {};
  const target = details.settings_target;
  const operation = details.settings_operation;
  if (!operation || target !== "listing") return text;

  const selectedNumber = Number(
    details.settings_item_number
    || session?.context_json?.selected_listing_number
    || 1
  );
  const number = Number.isInteger(selectedNumber) && selectedNumber > 0 ? selectedNumber : 1;
  const normalizedOperation = operation === "delete" ? "close" : operation;
  return `${normalizedOperation} listing ${number}`;
}

// Single routing brain. Takes the model interpretation of the message and
// performs the matching action; every branch also keeps its deterministic
// check (exact commands, codes, session flows), so routing still works when
// the interpretation arrives as "unknown" (OpenAI off or failed).
async function dispatchInterpretedAction(interpreted, text, user, session, incoming = {}) {
  const command = normalizeInteractiveCommand(text.trim().toLowerCase());
  const interpretedAction = interpreted?.action || "unknown";
  const details = interpreted?.details || {};
  const bulkRequest = bulkListingRequest(text, interpretedAction, session);
  const bulkStartRequest = isBulkOfferStartRequest(text);

  if (isVerified(user) && !session?.current_flow && /^[1-6]$/.test(command)) {
    await clearSession(user, user.whatsapp_phone);
    if (command === "1") {
      await upsertSession(user, user.whatsapp_phone, "create_listing", "quick", {});
      return makeOfferPrompt();
    }
    if (command === "2") return showBrowseOffers(user);
    if (command === "3") return getMyListingsReply(user);
    if (command === "4") return getMyDealsReply(user);
    if (command === "5") return viewProfileReply(user);
    if (command === "6") return supportOptionsReply();
  }

  if (command === "email support") {
    await clearSession(user, user.whatsapp_phone);
    return supportEmailReply();
  }

  if (command === "report issue") {
    await clearSession(user, user.whatsapp_phone);
    return startSupportRequest(user);
  }

  if (command === "dispute help") {
    await clearSession(user, user.whatsapp_phone);
    return disputeSupportReply();
  }

  if (session?.current_flow === "support"
      && session.current_step === "awaiting_issue"
      && !bulkRequest.eligible
      && !bulkStartRequest
      && !isSupportCommand(command)
      && !isMenuCommand(text)) {
    return handleSupport(text, user, session);
  }

  if ((interpretedAction === "get_support" && !bulkRequest.eligible && !bulkStartRequest) || isSupportCommand(command)) {
    await clearSession(user, user.whatsapp_phone);
    return supportOptionsReply();
  }

  if (!bulkRequest.eligible && !bulkStartRequest && isHumanSupportRequest(text, session)) {
    const dealCode = extractDealCode(text);
    return submitSupportRequest(user, text, {
      category: supportCategory(text),
      source: "whatsapp_natural_request",
      dealCode,
    });
  }

  if (!isVerified(user)) {
    if (interpretedAction === "view_profile" || isProfileCommand(text)) {
      return viewProfileReply(user);
    }

    // "verify" must always be able to start or resume the flow — checked
    // before the status intros so a user who cancelled mid-verification is
    // never trapped on the "reply with the next detail" screen. Submitted
    // (pending_review) and suspended profiles keep their intro instead.
    const wantsVerify = interpretedAction === "verify" || command === "verify" || command === "verify me"
      || command === "start verification" || command === "start_verification"
      || /\b(start|begin|resume|continue)\s+(my\s+)?verif/i.test(command)
      || command === "1" || inferIntent(text) === "verify";
    if (wantsVerify && !["pending_review", "suspended"].includes(user.verification_status)) {
      return startVerification(user);
    }

    if (["pending_input", "pending_review", "rejected", "suspended"].includes(user.verification_status)) {
      if (isConversationalInterpretation(interpreted) || isAssistantQuestion(text)) {
        if (["pending_input", "rejected"].includes(user.verification_status)) {
          const answer = await conversationalReply(interpreted, text, user, session, {
            suppressNudge: true,
          });
          return sendVerificationStartList(user, [
            answer,
            "",
            caption("Complete verification to start exchanging with Akara."),
          ].join("\n"));
        }
        return conversationalReply(interpreted, text, user, session);
      }
      if (user.verification_status === "rejected") {
        return sendVerificationStartList(user, verificationIntro(user));
      }
      return verificationIntro(user);
    }

    if (isConversationalInterpretation(interpreted)
        || isGreeting(text)
        || isThanksMessage(text)
        || isWellbeingQuestion(text)
        || isAssistantQuestion(text)) {
      const answer = await conversationalReply(interpreted, text, user, session, {
        suppressNudge: true,
      });
      return sendVerificationStartList(user, [
        answer,
        "",
        caption("Complete verification to start exchanging with Akara."),
      ].join("\n"));
    }

    return sendVerificationStartList(user, [
      "Verification comes first 🔐",
      "",
      "Akara only lets verified people make offers or start exchanges. It keeps the trade trail cleaner for everyone.",
      "",
      "Use the button below to start.",
    ].join("\n"));
  }

  if (bulkStartRequest) {
    if (isOnHold(user)) return accountOnHoldReply(user);
    await clearSession(user, user.whatsapp_phone);
    await upsertSession(user, user.whatsapp_phone, "create_listing", "quick", {
      bulk_guidance: true,
    });
    return bulkOfferPrompt();
  }

  if (bulkRequest.eligible) {
    if (!bulkRequest.listings.length) {
      return [
        title("Check the listing pairs"),
        "",
        "I found several values, but I could not match every send amount with one receive amount.",
        "",
        "Separate each listing with a comma, semicolon, or new line.",
        "",
        "Example:",
        "50k NGN for 55k RWF; 20k GHS for 990k XAF",
      ].join("\n");
    }
    if (isOnHold(user)) return accountOnHoldReply(user);
    await clearSession(user, user.whatsapp_phone);
    return prepareBulkListingPreview(user, bulkRequest.listings);
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
    return sendMenuList(user, mainMenu(user));
  }

  if (isCapabilitiesQuestion(text)) {
    await clearSession(user, user.whatsapp_phone);
    return conversationalReply(
      { ...interpreted, action: "question" },
      text,
      user,
      null
    );
  }

  if ((interpretedAction === "get_support" && !bulkRequest.eligible) || isSupportCommand(command)) {
    await clearSession(user, user.whatsapp_phone);
    return supportOptionsReply();
  }

  if (interpretedAction === "bulk_cancel_listings" || isBulkListingCancelIntent(command)) return requestBulkListingCancel(user);
  if (interpretedAction === "bulk_delete_payouts" || isBulkPayoutDeleteIntent(command)) return requestBulkPayoutDelete(user);

  if (isAccountMigrationAction(text)) {
    return submitSupportRequest(user, text, {
      category: "account_migration",
      source: "whatsapp_account_migration",
    });
  }

  if (isExplicitMarketplaceBrowse(text) && !isMyListingsCommand(command)) {
    await clearSession(user, user.whatsapp_phone);
    return showBrowseOrPairMatches(user, text);
  }

  if (isAccountMigrationQuestion(text)) {
    await clearSession(user, user.whatsapp_phone);
    return scopedAssistantReply(text, user);
  }

  const accountOverview = await accountOverviewQuestionReply(user, text);
  if (accountOverview) {
    await clearSession(user, user.whatsapp_phone);
    return accountOverview;
  }

  if (interpretedAction === "view_trust_record" || isTrustRecordCommand(command)) {
    await clearSession(user, user.whatsapp_phone);
    return reputationAssistantReply(text, user);
  }

  if (interpretedAction === "my_deals" || isHistoryCommand(command)) {
    await clearSession(user, user.whatsapp_phone);
    return getMyDealsReply(user);
  }

  if (interpretedAction === "view_profile" || isProfileCommand(command)) {
    await clearSession(user, user.whatsapp_phone);
    return viewProfileReply(user);
  }

  if (interpretedAction === "view_payouts" || isPayoutsCommand(command)) {
    await clearSession(user, user.whatsapp_phone);
    return viewPayoutsReply(user);
  }

  const listingsPageMatch = command.match(/^my listings page (\d+)$/);
  if (listingsPageMatch) {
    await clearSession(user, user.whatsapp_phone);
    return getMyListingsReply(user, { page: Number(listingsPageMatch[1]) });
  }

  if (
    isMyListingsCommand(command)
    || (interpretedAction === "my_listings" && !isBrowseAllOffersIntent(text))
  ) {
    await clearSession(user, user.whatsapp_phone);
    return getMyListingsReply(user);
  }

  if (!session?.current_flow && isSessionClosureMessage(text)) {
    return conversationalReply(
      { ...interpreted, action: "thanks" },
      text,
      user,
      session
    );
  }

  const quotedReply = await resolveQuotedReply(text, user, incoming);
  if (quotedReply) return quotedReply;

  if (session?.current_flow === "negotiation"
      && !["greeting", "thanks", "wellbeing", "question"].includes(interpretedAction)
      && !isGreeting(text)
      && !isThanksMessage(text)
      && !isWellbeingQuestion(text)) {
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
  const freshSearchDetails = mergePresentDetails(parseSearchDetails(text), interpretedExchangeDetails);
  if (freshListingDetails.have_currency && freshListingDetails.have_currency === freshListingDetails.want_currency) {
    freshListingDetails.want_currency = null;
    freshListingDetails.want_amount = null;
  }
  const hasFreshCompleteListing = missingListingFields(freshListingDetails).length === 0;
  const deterministicSearchEligible = [
    "unknown",
    "greeting",
    "question",
    "wellbeing",
    "find_offer",
    "browse_offers",
  ].includes(interpretedAction);
  const impliedSearchRequest = deterministicSearchEligible
    && inferIntent(text) === "find_offer"
    && Boolean(freshSearchDetails.have_currency || freshSearchDetails.want_currency);
  const freshDirectional = hasDirectionalExchangeText(text)
    || interpretedAction === "create_listing"
    || interpretedAction === "find_offer"
    || impliedSearchRequest;

  // "publish it" / "go ahead" at the review step must reach the flow handler
  // and publish — even when the model re-extracted the draft's details from
  // the transcript and labelled the message create_listing.
  const confirmingDraft = session?.current_flow === "create_listing"
    && session.current_step === "confirm"
    && isListingPublishIntent(text);

  // A currency and a demand statement are already enough context to search.
  // This deterministic path takes priority when a greeting prefix makes the
  // model classify "good morning, I also need naira" as casual conversation.
  if (impliedSearchRequest && !confirmingDraft) {
    if (isOnHold(user)) return accountOnHoldReply(user);
    await clearSession(user, user.whatsapp_phone);
    return continueSearchOrShowMatches(user, freshSearchDetails);
  }

  // "Who needs naira? 50k for 54k rwf" hunts for a counterparty for money the
  // user already holds. It reads like a listing (and the model sometimes
  // labels it create_listing), but it is a search: show live matches first,
  // and let the no-match path offer to create the listing instead of opening
  // the create flow straight away.
  if (isDemandSeekingQuestion(text) && freshDirectional && !confirmingDraft) {
    if (isOnHold(user)) return accountOnHoldReply(user);
    await clearSession(user, user.whatsapp_phone);
    return continueSearchOrShowMatches(user, freshSearchDetails);
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
        ...(flowContext.republished_from_listing_id
          ? { republished_from_listing_id: flowContext.republished_from_listing_id }
          : {}),
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

  // A contextual approval such as "make this one live" can be classified as
  // create_listing with amounts recovered from the transcript. Keep it in the
  // existing no-match decision so it opens the prepared review instead of
  // accidentally starting the same search again.
  if (session?.current_flow === "find_offer"
      && session.current_step === "suggest_listing"
      && isListingPublishIntent(text)) {
    return handleFindOffer(text, user, session);
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

  const bareGreeting = (
    interpretedAction === "greeting"
    || (interpretedAction === "unknown" && isGreeting(text))
  )
    && !freshDirectional
    && !parseCurrencyAmountPairs(text).length;

  // Conversation can happen around an active task. Answer it without
  // consuming the message as a currency, amount, account number, or other
  // flow input, and remind the user where they paused in one short line.
  if (["greeting", "thanks", "wellbeing", "question"].includes(interpretedAction)
      || bareGreeting
      || isThanksMessage(text)
      || isWellbeingQuestion(text)) {
    return conversationalReply(interpreted, text, user, session);
  }

  if (session?.current_flow === "create_listing") {
    return handleCreateListing(text, user, session);
  }

  if (session?.current_flow === "bulk_listing") {
    return handleBulkListing(text, user, session);
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
    const settingsText = interpretedSettingsCommand(interpreted, command, session);
    if (isSettingsCommand(settingsText) || ["settings_action", "add_payout", "flow_reply"].includes(interpretedAction)) {
      return handleSettings(settingsText, user, session);
    } else if (interpretedAction === "unknown" && shouldLeaveSettingsForFreshCommand(settingsText)) {
      await clearSession(user, user.whatsapp_phone);
      session = null;
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

  if (command === "verify" || command === "verify me" || interpretedAction === "verify") {
    return sendMenuList(user, [
      "You are already verified ✅",
      "",
      mainMenu(user),
    ].join("\n"));
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
    || /\b(edit|modify|update|change|delete|remove|pause|reopen|resume|activate|close|cancel|share|copy)\b.*\b(payout|payment|bank|momo|details?|offers?|listings?)\b/.test(command);

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
    return handleSettings(
      interpretedSettingsCommand(interpreted, command, settingsSession),
      user,
      settingsSession
    );
  }

  if (command === "5" || intent === "settings") {
    return viewProfileReply(user);
  }

  if (command === "6" || isSupportCommand(command)) {
    return supportOptionsReply();
  }

  if (isRateQuestion(text)) {
    return conversationalReply(interpreted, text, user, session);
  }

  // Loose intent words like "trades" and "get" appear in ordinary questions,
  // so a question-shaped message is answered before the intent fallbacks can
  // hijack it into a flow prompt.
  if (["question", "unknown", "flow_reply"].includes(interpretedAction) && isAssistantQuestion(text)
      && !isDemandSeekingQuestion(text)) {
    return conversationalReply(interpreted, text, user, session);
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

    const searchDetails = freshSearchDetails;
    if (searchDetails.have_currency || searchDetails.want_currency) {
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

  return conversationalReply(interpreted, text, user, session);
}

// Fresh actions that may interrupt payout collection. Deliberately narrower
// than FRESH_ACTIONS: add_payout and settings_action stay in the flow, and a
// name, bank, or number reply always classifies as flow_reply.
function paymentProfileInterrupt(interpretedAction) {
  return isFreshRequestAction(interpretedAction)
    && !["add_payout", "settings_action"].includes(interpretedAction);
}

async function routeMessage(text, user, session, incoming = {}) {
  const command = normalizeInteractiveCommand(text.trim().toLowerCase());
  const retryCommands = ["retry", "try again", "retry_last_message"];

  if (retryCommands.includes(command)) {
    if (Number(incoming.retryDepth || 0) >= 1) {
      await clearFailedMessage(user, user.whatsapp_phone);
      return [
        title("Nothing waiting to retry"),
        "",
        "That saved retry was stale. Send your request again and I will handle it as a new message.",
      ].join("\n");
    }

    const savedIncoming = session?.context_json?.pending_retry?.incoming;
    if (!savedIncoming) {
      return [
        title("Nothing waiting to retry"),
        "",
        "Your last action is already complete. Choose what you would like to do next.",
      ].join("\n");
    }

    const savedCommand = normalizeInteractiveCommand(
      String(savedIncoming.text || "").trim().toLowerCase()
    );
    if (retryCommands.includes(savedCommand)) {
      await clearFailedMessage(user, user.whatsapp_phone);
      return [
        title("Nothing waiting to retry"),
        "",
        "That saved retry was stale. Send your request again and I will handle it as a new message.",
      ].join("\n");
    }

    const retryContext = { ...(session?.context_json || {}) };
    delete retryContext.pending_retry;
    const retrySession = session
      ? { ...session, context_json: retryContext }
      : session;
    const reply = await routeMessage(
      savedIncoming.text || "",
      user,
      retrySession,
      {
        ...savedIncoming,
        from: user.whatsapp_phone,
        retryDepth: Number(incoming.retryDepth || 0) + 1,
      }
    );
    await clearFailedMessage(user, user.whatsapp_phone);
    return reply;
  }

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
    if (session?.current_flow === "create_listing") {
      return handleCreateListing("cancel", user, session);
    }
    if (session?.current_flow === "bulk_listing") {
      return handleBulkListing("cancel", user, session);
    }

    await clearSession(user, user.whatsapp_phone);
    return isVerified(user)
      ? sendMenuList(user)
      : sendVerificationStartList(user, [
          "No problem. Verification paused.",
          "",
          "Use the button below when you are ready to continue.",
        ].join("\n"));
  }

  if (command === "demo approve") {
    await clearSession(user, user.whatsapp_phone);
    return sendVerificationStartList(user, "Demo approval is disabled. Use the button below to submit a real verification request.");
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
    || interpreted.action === "create_listing"
    || interpreted.action === "find_offer"
    || interpreted.action === "browse_offers"
    || interpreted.action === "reserve_listing"
    || interpreted.action === "trade_action"
    || interpreted.action === "settings_action"
    || interpreted.action === "view_profile"
    || interpreted.action === "view_trust_record"
    || interpreted.action === "my_listings"
    || interpreted.action === "my_deals"
    || interpreted.action === "get_support"
    || interpreted.action === "menu"
    || interpreted.action === "greeting"
    || interpreted.action === "wellbeing"
    || !isVerified(user)
    || session?.current_flow === "verification"
    || session?.current_flow === "payment_profile";
  return skipAnswer ? reply : applyInterpretedAnswer(reply, interpreted.answer);
}

function normalizeInteractiveCommand(command) {
  const map = {
    make_offer: "make offer",
    find_offers: "find offers",
    my_listings: "my listings",
    view_history: "history",
    view_profile: "profile",
    view_payouts: "payouts",
    main_menu: "menu",
    get_support: "get support",
    support_email: "email support",
    support_report: "report issue",
    support_dispute: "dispute help",
    trust_record: "my trust record",
    manage_payout_add: "add payout",
    manage_payout_edit: "edit payout",
    manage_payout_delete: "delete payout",
    profile_add_payout: "add payout",
    profile_edit_payout: "edit payout",
    profile_delete_payout: "delete payout",
    profile_delete_all_payouts: "delete all my payouts",
    profile_listings: "my listings",
    profile_pause_all_listings: "pause all my listings",
    profile_reopen_all_listings: "reopen all my listings",
    profile_close_all_listings: "close all my listings",
    profile_history: "history",
    profile_trust: "my trust record",
    add_payout: "add payout",
    publish_bulk: "publish all",
    verify: "verify",
  };
  if (map[command]) return map[command];
  const payoutAction = String(command || "").match(/^(edit|delete)_payout_(\d+)$/);
  if (payoutAction) return `${payoutAction[1]} payout ${payoutAction[2]}`;
  const listingsPage = String(command || "").match(/^my_listings_page_(\d+)$/);
  if (listingsPage) return `my listings page ${listingsPage[1]}`;
  return command;
}

async function routeInterpreted(interpreted, text, user, session, incoming = {}) {
  // Verification fields remain scripted, but conversation can happen around
  // them. A question or greeting is answered without being saved as KYC data,
  // then the exact pending verification prompt is restored.
  if (session?.current_flow === "verification") {
    const stepPrompt = verificationStepPrompt(session.current_step, session.context_json || {});
    if (!incoming.media?.id && (
      ["question", "greeting", "thanks", "wellbeing"].includes(interpreted.action)
      || isGreeting(text)
      || isThanksMessage(text)
      || isWellbeingQuestion(text)
    )) {
      const answer = await conversationalReply(interpreted, text, user, session, {
        suppressNudge: true,
      });
      return [
        answer,
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
    if (["question", "greeting", "thanks", "wellbeing"].includes(interpreted.action)
        || isGreeting(text)
        || isThanksMessage(text)
        || isWellbeingQuestion(text)) {
      return conversationalReply(interpreted, text, user, session);
    }
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

function describeOutgoingForHistory(reply) {
  if (!reply) return "";
  if (typeof reply === "string") return reply;
  if (reply.type === "whatsapp_list") {
    return reply.fallbackText || reply.list?.body || "[sent interactive options]";
  }
  if (reply.type === "whatsapp_buttons") {
    return reply.fallbackText || reply.body || "[sent reply buttons]";
  }
  if (reply.type === "whatsapp_flow") {
    return reply.fallbackText || reply.flow?.body || "[sent WhatsApp Flow]";
  }
  if (reply.type === "media") {
    return reply.caption || reply.fallbackText || "[sent media]";
  }
  return String(reply);
}

async function buildReply(text, user, session, incoming = {}) {
  const reply = await routeMessage(text, user, session, incoming);

  // Recorded after routing so the interpreter's transcript never contains the
  // message it is currently classifying.
  recordMessage(user.whatsapp_phone, "user", describeIncomingForHistory(text, incoming));
  recordMessage(user.whatsapp_phone, "assistant", describeOutgoingForHistory(reply));

  return reply;
}

module.exports = {
  buildReply,
  dispatchInterpretedAction,
};
