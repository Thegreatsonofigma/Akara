const { compactText } = require("./slang");
const { currencyMentions } = require("./currency");

function isGreeting(text) {
  const value = compactText(text);
  if (!value) return true;
  return /^(hi|hello|hey|heyy|yo|good morning|good afternoon|good evening|good day|what'?s up|wassup|sup|how far|how you dey|hey akara|hi akara|hello akara|what are you|who are you|start|help)\b/.test(value);
}

function isThanksMessage(text) {
  const value = compactText(text);
  return /^(thanks|thank you|thank akara|nice one|well done|weldone|daalu|appreciated?|cheers|god bless)\b/.test(value)
    && value.length <= 40;
}

function isWellbeingQuestion(text) {
  const value = compactText(text).replace(/[?!.]+$/, "").trim();
  return /^(how are you|how you dey|how far|how'?s it going|how is it going|you good|you dey|hope you good)$/.test(value);
}

function isMenuCommand(text) {
  const value = compactText(text);
  return /^(menu|options|option|help|home|main menu|show menu|start over|restart|back to menu)$/.test(value);
}

function isHistoryCommand(text) {
  const value = compactText(text);
  return /^(?:show |see |view |check |open |my )*(history|transaction history|trade history|deal history|transactions?|records?|statements?|trades|deals)$/.test(value);
}

// Scoped view commands: profile means profile only, bank details means bank
// details only, listings means the user's own listings only.
function isProfileCommand(text) {
  const value = compactText(text);
  return /^(?:show |see |view |check |open )*(?:my |me my )?(profile|account|account info(?:rmation)?|account details?|settings|info(?:rmation)?)$/.test(value);
}

function isPayoutsCommand(text) {
  const value = compactText(text);
  return /^(?:show |see |view |check |open )*(?:my |me my )?(payouts?|payout details?|payout info(?:rmation)?|bank|banks|bank details?|bank info(?:rmation)?|bank accounts?|payment details?|payment info(?:rmation)?|account number|momo|momo details?|mobile money|mobile money details?|wallet|wallets?)$/.test(value);
}

function isMyListingsCommand(text) {
  const value = compactText(text);
  return /^(?:show |see |view |check |open )*(?:my |me my )(listings?|offers?|ads?|posts?|deals? i posted)$/.test(value)
    || /^(listings|offers|my listings|my offers|my listing|my offer)$/.test(value)
    || /\b(offers?|listings?|ads?|posts?)\s+i\s+(posted|created|made|listed)\b/.test(value);
}

function inferIntent(text) {
  const value = compactText(text);
  if (/\b(verify|verification|kyc|confirm me|approve me)\b/.test(value)) return "verify";
  if (/\b(profile|settings|account|payout|payouts|payment details|bank details|momo details|wallet|manage)\b/.test(value)) return "settings";
  if (/\b(my offers|my listings|offers i posted|listings i posted|what i posted)\b/.test(value)) return "my_listings";
  if (/\b(my deals|my trades|reserved deals|transactions|transaction history|deal history|history|statement|records)\b/.test(value)) return "my_deals";
  if (/\b(find|search|need|wan|want to see|show me|see|looking for|dey find|find who|who go help|change am|convert am|swap am|available|offers|deals|trades|matches|rates|who has|who get|reserve|take|find|show|check rate)\b/.test(value)) return "find_offer";
  if (/\b(post|create|list|listing|offer|make offer|i have|i get|i dey with|get|i want to exchange|i wan exchange|i want to sell|i can give|i fit give)\b/.test(value)) return "create_listing";
  return null;
}

function isBulkListingCancelIntent(text) {
  const value = compactText(text);
  const destructive = /\b(cancel|close|delete|remove|clear|wipe|take down|deactivate)\b/.test(value);
  const all = /\b(all|everything|every)\b/.test(value);
  const listings = /\b(listing|listings|offer|offers)\b/.test(value);
  const mine = /\b(my|mine|i created|i posted)\b/.test(value);
  return destructive && all && listings && mine;
}

function isBulkPayoutDeleteIntent(text) {
  const value = compactText(text);
  const destructive = /\b(delete|remove|clear|wipe|erase)\b/.test(value);
  const all = /\b(all|everything|every)\b/.test(value);
  const payouts = /\b(payout|payouts|payment details|bank|banks|bank information|bank info|momo|mobile money|wallet|account details)\b/.test(value);
  const mine = /\b(my|mine)\b/.test(value);
  return destructive && all && payouts && mine;
}

function isConfirmationYes(text) {
  const value = compactText(text).replace(/[?!.]+$/, "").trim();
  if (value.length > 40) return false;
  // "yes but keep them" must not confirm a destructive action.
  if (/\b(no|not|don'?t|dont|stop|keep|wait|hold)\b/.test(value)) return false;
  return /^(yes|yeah|yep|ok|okay|sure|confirm|confirmed|go ahead|proceed|do it|continue|oya)\b/.test(value);
}

function isConfirmationNo(text) {
  return /^(no|cancel|stop|keep|keep them|never mind|nevermind|do not|dont|don't)$/i.test(compactText(text));
}

function isAssistantQuestion(text) {
  const value = compactText(text);
  if (!value) return false;
  if (value.endsWith("?")) return true;
  return /\b(what is|what are|who are|how does|how do|why|can akara|can i|do you|does akara|explain|tell me|help me understand|is it safe|safe|fee|fees|rate|rates|exchange rate|market rate|live rate|price|charges|verification|kyc|payout|receipt|reminder|dispute|escrow|wallet|hold funds|custody|limit|tier)\b/.test(value);
}

function isRateQuestion(text) {
  const value = compactText(text);
  return /\b(rate|rates|exchange rate|market rate|live rate|price|pricing|how much is|convert|conversion|worth)\b/.test(value)
    && currencyMentions(text).length > 0;
}

function isCurrencyOfferBrowsePhrase(text) {
  const value = compactText(text);
  if (!value) return false;
  const hasCurrency = currencyMentions(text).length > 0;
  const offerLanguage = /\b(offer|offers|listing|listings|deal|deals|trade|trades|pair|pairs|available|availability|live|current|open|active|option|options)\b/.test(value);
  const asksAvailability = /\b(any|available|availability|do you have|is there|are there|who has|who get|who dey with)\b/.test(value);
  const personalScope = /\b(my|mine|i posted|i created|owned by me|my own)\b/.test(value);
  return hasCurrency && !personalScope && (offerLanguage || asksAvailability);
}

function isBrowseAllOffersIntent(text) {
  const value = compactText(text);
  if (!value) return false;

  const mentions = currencyMentions(text);
  const hasCurrency = mentions.length > 0;
  const offerNoun = /\b(offer|offers|listing|listings|deal|deals|pair|pairs|trade|trades|option|options|available ones|details)\b/.test(value);
  const browseVerb = /\b(show|see|view|browse|list|find|display|check|give|send|pull up|bring|look for|search)\b/.test(value);
  const availabilityWord = /\b(available|availability|live|current|open|active|any|nearby|around|existing)\b/.test(value);
  const possessionQuestion = /\b(do you have|you have|is there|are there|who has|anyone has|anybody has|who get|who dey with)\b/.test(value);
  const personalScope = /\b(my|mine|i posted|i created|owned by me|my own)\b/.test(value);

  const wantsOffers = browseVerb
    && /\b(all|everything|every|available|live)\b/.test(value)
    && /\b(offer|offers|listing|listings|deals|pairs|trades|details)\b/.test(value);
  const currencyOffers = hasCurrency && offerNoun && !personalScope;
  const availableCurrency = hasCurrency && availabilityWord && !personalScope;
  const asksIfCurrencyExists = hasCurrency && possessionQuestion && !personalScope;
  const generalAvailableOffers = offerNoun && availabilityWord && !personalScope;
  const allOffers = /^(show|see|view|browse|list|find|display|check)\s+(me\s+)?all\s+(offers|listings|deals|pairs|trades|details)$/.test(value);
  const everything = /\b(i want to|i want|show me|let me)\b.*\b(everything|all available pairs|all pairs|all offers)\b/.test(value);
  return isCurrencyOfferBrowsePhrase(text) || wantsOffers || currencyOffers || availableCurrency || asksIfCurrencyExists || generalAvailableOffers || allOffers || everything;
}

function isMoreResultsIntent(text) {
  const value = compactText(text);
  return /^(more|next|next page|see more|show more|view more|load more|more offers|more listings)$/.test(value);
}

function isSentIntent(text) {
  return /\b(sent|paid|payment made|i paid|i have paid|done|transferred|receipt uploaded|uploaded receipt|i don pay|don pay|i don send|don send|sent am|send am|i don transfer|don transfer|i don run am|run am|i don do am|done am|payment don go|money don go|i don credit am)\b/i.test(text);
}

function isReceivedIntent(text) {
  return /\b(received|got it|i got it|money arrived|it entered|confirmed|confirm receipt|seen payment|i don receive|don receive|i don see am|see am|seen am|alert don enter|money don enter|e don enter|it don enter|funds don land|money don land|don land|i don get am|gotten am)\b/i.test(text);
}

function isReminderIntent(text) {
  return /\b(remind|nudge|waiting|delay|delayed|not received|still waiting|abeg remind|please remind|e never enter|money never enter|alert never enter|i never see am|never see am|no alert|no show|still dey wait|still waiting)\b/i.test(text);
}

function isDisputeIntent(text) {
  return /\b(dispute|problem|issue|wrong|scam|fraud|not paid|payment not real|wahala|palava|kasala|fake alert|fake receipt|no be true|something wrong|this thing no clear)\b/i.test(text);
}

function isBareDisputeIntent(text) {
  const value = compactText(text).replace(/\b(please|abeg|pls)\b/g, "").trim();
  return /^(dispute|open dispute|raise dispute|report|report issue|problem|wahala|palava|kasala)$/.test(value);
}

function isStatusIntent(text) {
  return /\b(status|what next|next|what do i do|help|where are we|update|wetin next|wetin remain|how far|howfa|where we dey|shey|oya|what'?s next)\b/i.test(text);
}

function isSearchAgainIntent(text) {
  const value = compactText(text);
  if (!value) return false;
  return /\b(search again|try again|try another|find another|find more|new search|change search|look again|not this|not these|no thanks|no|nah|don'?t list|do not list)\b/.test(value);
}

function isDeclineIntent(text) {
  const value = compactText(text);
  if (!value) return false;
  return /\b(not interested|i'?m not interested|no interest|not for me|skip|pass|leave it|ignore it|no thanks|nah|not now|don'?t want|do not want|don'?t list|do not list|not listing|not list mine|don'?t create|do not create|don'?t publish|do not publish|later)\b/.test(value);
}

function isEditIntent(text) {
  const value = compactText(text);
  return /\b(edit|change|correct|modify|fix|update)\b/.test(value);
}

function isCancelIntent(text) {
  const value = compactText(text);
  return /\b(cancel|stop|leave it|forget it|never mind|nevermind)\b/.test(value);
}

function isCancelTradeIntent(text) {
  const value = compactText(text);
  if (!value) return false;
  if (/^(cancel|close|stop|end|abort)$/.test(value)) return true;
  return /\b(cancel|close|stop|end|abort|drop|leave)\b.*\b(this|deal|trade|transaction|exchange)\b/.test(value)
    || /\b(this|deal|trade|transaction|exchange)\b.*\b(cancel|close|stop|end|abort|drop)\b/.test(value);
}

function isListingPublishIntent(text) {
  const value = compactText(text);
  if (!value || isDeclineIntent(value) || isSearchAgainIntent(value) || isEditIntent(value) || isCancelIntent(value)) return false;

  // "make it 60k" or "make it flexible" revise the draft — a publish phrase
  // never carries new amounts or rate terms.
  if (/\d/.test(value) || /\b(flex\w*|nego\w*|fixed|firm)\b/.test(value)) return false;

  if (/^(yes|yeah|yep|sure|ok|okay|alright|continue|proceed)$/.test(value)) return true;
  if (/\b(go ahead|do it|run it|looks good|that works|this works|this is fine|use this|make it live|put it up|take it live)\b/.test(value)) return true;
  if (/\b(publish|post|list|create|make)\b.*\b(it|this|that|am|list|listing|offer|live)\b/.test(value)) return true;
  if (/\b(i want|i need|please|can you|help me)\b.*\b(publish|post|list|create)\b/.test(value)) return true;
  if (/\b(listed|published|posted)\b/.test(value) && /\b(this|it|offer|listing|list)\b/.test(value)) return true;
  if (/^(publish|post|list it|list this|list|create listing|make listing|create it|create this|post it|post this|publish it|publish this)$/.test(value)) return true;

  return false;
}

function selectedOptionNumber(text) {
  const value = compactText(text);
  const match = value.match(/^(?:open|choose|select|pick|take|reserve)?\s*(\d{1,2})$/);
  return match ? Number(match[1]) : null;
}

module.exports = {
  isGreeting,
  isThanksMessage,
  isWellbeingQuestion,
  isMenuCommand,
  isHistoryCommand,
  isProfileCommand,
  isPayoutsCommand,
  isMyListingsCommand,
  inferIntent,
  isBulkListingCancelIntent,
  isBulkPayoutDeleteIntent,
  isConfirmationYes,
  isConfirmationNo,
  isAssistantQuestion,
  isRateQuestion,
  isCurrencyOfferBrowsePhrase,
  isBrowseAllOffersIntent,
  isMoreResultsIntent,
  isSentIntent,
  isReceivedIntent,
  isReminderIntent,
  isDisputeIntent,
  isBareDisputeIntent,
  isStatusIntent,
  isSearchAgainIntent,
  isDeclineIntent,
  isEditIntent,
  isCancelIntent,
  isCancelTradeIntent,
  isListingPublishIntent,
  selectedOptionNumber,
};
