const { supabaseRequest, filterValue } = require("../lib/supabase");
const { title, caption, action, labeled, formatMoney } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { parsePaymentCurrency, parseCurrencyAmountPairs } = require("../nlp/currency");
const { hasDirectionalExchangeText } = require("../nlp/exchange");
const {
  inferIntent,
  isMenuCommand,
  isHistoryCommand,
  isBrowseAllOffersIntent,
  isBulkListingCancelIntent,
  isBulkPayoutDeleteIntent,
  isConfirmationYes,
  isConfirmationNo,
} = require("../nlp/intents");
const { upsertSession, clearSession } = require("../db/sessions");
const { getPaymentProfiles, formatPaymentProfileCompact } = require("../db/payments");
const { getUserListings, displayReference, listingStatusLabel } = require("../db/listings");
const { mainMenu, referralPitch } = require("../messages/copy");
const {
  startPaymentProfileFlow,
  paymentEditMenuPrompt,
  paymentContextFromProfile,
} = require("./payment-profile");
const { startListingEdit } = require("./listing");

function parseNumberedAction(text, actionWords, nounWords) {
  const value = compactText(text);
  const actionPattern = Array.isArray(actionWords) ? actionWords.join("|") : actionWords;
  const nounPattern = Array.isArray(nounWords) ? nounWords.join("|") : nounWords;
  const match = value.match(new RegExp(`\\b(${actionPattern})\\s+(?:my\\s+)?(${nounPattern})\\s*(\\d+)?\\b|\\b(${actionPattern})\\s*(\\d+)\\b`));
  if (!match) return null;
  const number = Number(match[3] || match[5] || 1);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function verificationStatusLabel(user) {
  const labels = {
    verified_auto: "Verified ✅ (Tier 1)",
    verified_manual: "Verified ✅",
    pending_review: "In review 🕒",
    pending_input: "Verification incomplete",
    rejected: "Not approved",
    suspended: "Suspended",
  };
  return labels[user.verification_status] || "Not verified";
}

// Scoped view: just who the user is on Akara. Payouts and listings each have
// their own view, so asking for "my profile" never dumps everything.
async function viewProfileReply(user) {
  await clearSession(user, user.whatsapp_phone);

  const [profiles, listings] = await Promise.all([
    getPaymentProfiles(user.id),
    getUserListings(user.id, 20),
  ]);
  const liveListings = listings.filter((listing) => ["active", "paused"].includes(listing.status)).length;
  const name = (user.display_name || user.legal_name || "").trim();

  return [
    title("Your profile"),
    "",
    name ? labeled("Name", name) : "",
    labeled("WhatsApp", `+${user.whatsapp_phone}`),
    labeled("Status", verificationStatusLabel(user)),
    labeled("Completed trades", String(user.completed_deals_count || 0)),
    labeled("Live listings", String(liveListings)),
    labeled("Saved payout details", String(profiles.length)),
    "",
    referralPitch(),
    "",
    title("See more"),
    `${action("bank details")} for your payout information`,
    `${action("my listings")} for your posted offers`,
    `${action("history")} for your transactions`,
  ].filter(Boolean).join("\n\n");
}

// Scoped view: only the saved bank / mobile money details, with the numbered
// session map primed so "edit payout 1" or "delete payout 2" works right away.
async function viewPayoutsReply(user, intro = "") {
  const profiles = await getPaymentProfiles(user.id);

  const payoutMap = {};
  profiles.forEach((profile, index) => {
    payoutMap[String(index + 1)] = profile.id;
  });

  await upsertSession(user, user.whatsapp_phone, "settings", "menu", {
    payout_map: payoutMap,
    listing_map: {},
  });

  const payoutBlock = profiles.length
    ? profiles.map((profile, index) => formatPaymentProfileCompact(profile, index + 1)).join("\n\n")
    : "No payout details saved yet.";

  return [
    intro,
    title("Bank & payout details"),
    caption("Where your trade partners send your money."),
    "",
    payoutBlock,
    "",
    title("Actions"),
    action("add payout"),
    ...(profiles.length ? [action("edit payout 1"), action("delete payout 1"), action("delete all payouts")] : []),
  ].filter(Boolean).join("\n");
}

async function profileSettingsReply(user, intro = "") {
  const [profiles, listings] = await Promise.all([
    getPaymentProfiles(user.id),
    getUserListings(user.id, 5),
  ]);

  const payoutMap = {};
  profiles.forEach((profile, index) => {
    payoutMap[String(index + 1)] = profile.id;
  });

  const listingMap = {};
  listings.forEach((listing, index) => {
    listingMap[String(index + 1)] = listing.id;
  });

  await upsertSession(user, user.whatsapp_phone, "settings", "menu", {
    payout_map: payoutMap,
    listing_map: listingMap,
  });

  const payoutBlock = profiles.length
    ? profiles.map((profile, index) => formatPaymentProfileCompact(profile, index + 1)).join("\n\n")
    : ["No payout details saved yet.", "Reply add payout to add one."].join("\n");

  const listingLines = listings.length
    ? listings.map((listing, index) => [
        `${index + 1}. ${displayReference(listing.listing_code, "listing")}`,
        `${formatMoney(listing.have_amount, listing.have_currency)} for ${formatMoney(listing.want_amount, listing.want_currency)}`,
        `Status: ${listingStatusLabel(listing.status)}`,
      ].join("\n"))
    : [caption("No listings yet.")];

  return [
    intro,
    title("Profile"),
    caption("Manage payout details and your live listings."),
    "",
    title("Payouts"),
    payoutBlock,
    "",
    title("Listings"),
    ...listingLines,
    "",
    title("Actions"),
    action("add payout"),
    action("edit payout 1"),
    action("delete payout 1"),
    action("edit listing 1"),
    action("pause listing 1"),
    action("reopen listing 1"),
    action("close listing 1"),
    action("cancel all listings"),
    action("delete all payouts"),
  ].filter(Boolean).join("\n");
}

async function requestBulkListingCancel(user) {
  const rows = await supabaseRequest(
    [
      "listings?select=id,status",
      `owner_user_id=eq.${filterValue(user.id)}`,
      "status=in.(active,paused)",
      "limit=100",
    ].join("&")
  );

  if (!rows.length) {
    await clearSession(user, user.whatsapp_phone);
    return [
      title("No live listings"),
      "",
      "You do not have any live or paused listings to cancel.",
    ].join("\n");
  }

  await upsertSession(user, user.whatsapp_phone, "settings", "confirm_bulk_action", {
    bulk_action: "cancel_listings",
    bulk_count: rows.length,
  });

  return [
    title("Cancel all listings?"),
    "",
    `This will close ${rows.length} live or paused listing${rows.length === 1 ? "" : "s"}.`,
    "They will stop appearing in search immediately.",
    "",
    `${action("confirm")} to cancel them`,
    `${action("keep")} to leave them as they are`,
  ].join("\n");
}

async function requestBulkPayoutDelete(user) {
  const rows = await getPaymentProfiles(user.id);
  if (!rows.length) {
    await clearSession(user, user.whatsapp_phone);
    return [
      title("No payout details"),
      "",
      "You do not have any saved payout details to delete.",
    ].join("\n");
  }

  await upsertSession(user, user.whatsapp_phone, "settings", "confirm_bulk_action", {
    bulk_action: "delete_payouts",
    bulk_count: rows.length,
  });

  return [
    title("Delete all payout details?"),
    "",
    `This will remove ${rows.length} saved payout detail${rows.length === 1 ? "" : "s"}.`,
    "You will need to add payout details again before opening trades for those currencies.",
    "",
    `${action("confirm")} to delete them`,
    `${action("keep")} to leave them saved`,
  ].join("\n");
}

async function completeBulkAction(user, context = {}) {
  if (context.bulk_action === "cancel_listings") {
    const rows = await supabaseRequest(
      [
        `listings?owner_user_id=eq.${filterValue(user.id)}`,
        "status=in.(active,paused)",
      ].join("&"),
      {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      }
    );

    await clearSession(user, user.whatsapp_phone);
    return [
      title("Listings cancelled"),
      "",
      `${rows.length} listing${rows.length === 1 ? "" : "s"} closed successfully.`,
      "",
      action("profile"),
    ].join("\n");
  }

  if (context.bulk_action === "delete_payouts") {
    const rows = await supabaseRequest(
      `payment_profiles?user_id=eq.${filterValue(user.id)}`,
      { method: "DELETE" }
    );

    await clearSession(user, user.whatsapp_phone);
    return [
      title("Payout details deleted"),
      "",
      `${rows.length} payout detail${rows.length === 1 ? "" : "s"} removed successfully.`,
      "",
      action("add payout"),
    ].join("\n");
  }

  await clearSession(user, user.whatsapp_phone);
  return "That confirmation has expired. Tell Akara what you want to do next.";
}

async function handleSettings(text, user, session) {
  const command = compactText(text);
  const context = session.context_json || {};

  if (session.current_step === "confirm_bulk_action") {
    if (isConfirmationYes(text)) return completeBulkAction(user, context);
    if (isConfirmationNo(text)) {
      await clearSession(user, user.whatsapp_phone);
      return [
        title("Kept unchanged"),
        "",
        "No records were changed.",
      ].join("\n");
    }

    return [
      title("Please confirm"),
      "",
      context.bulk_action === "delete_payouts"
        ? "Reply confirm to delete all payout details, or keep to leave them saved."
        : "Reply confirm to cancel all live listings, or keep to leave them active.",
    ].join("\n");
  }

  if (session.current_step === "confirm_delete_payout") {
    if (/\b(yes|delete|remove|confirm)\b/.test(command)) {
      await supabaseRequest(
        `payment_profiles?id=eq.${filterValue(context.pending_payout_id)}&user_id=eq.${filterValue(user.id)}`,
        { method: "DELETE" }
      );
      return profileSettingsReply(user, "Payout detail deleted ✅");
    }

    await upsertSession(user, user.whatsapp_phone, "settings", "menu", {
      payout_map: context.payout_map || {},
      listing_map: context.listing_map || {},
    });
    return profileSettingsReply(user, "No changes made.");
  }

  if (!command || /\b(profile|settings|account|menu|show|view)\b/.test(command)) {
    return profileSettingsReply(user);
  }

  if (/\b(done|close|back|exit)\b/.test(command) && !/\b(offer|listing)\b/.test(command)) {
    await clearSession(user, user.whatsapp_phone);
    return mainMenu();
  }

  if (isBulkListingCancelIntent(text)) return requestBulkListingCancel(user);
  if (isBulkPayoutDeleteIntent(text)) return requestBulkPayoutDelete(user);

  if (/\b(add|new)\b/.test(command) && /\b(payout|payment|bank|momo|details?)\b/.test(command)) {
    const currency = parsePaymentCurrency(command);
    return startPaymentProfileFlow(user, {
      return_flow: "settings",
      ...(currency ? { payment_currency: currency } : {}),
    });
  }

  const editPayoutNumber = parseNumberedAction(command, ["edit", "update", "change"], ["payout", "payment", "bank", "momo", "details?"]);
  if (editPayoutNumber) {
    const payoutId = context.payout_map?.[String(editPayoutNumber)];
    if (!payoutId) return profileSettingsReply(user, "Choose a valid payout number.");

    const rows = await supabaseRequest(
      `payment_profiles?id=eq.${filterValue(payoutId)}&user_id=eq.${filterValue(user.id)}&limit=1`
    );
    const profile = rows[0];
    if (!profile) return profileSettingsReply(user, "That payout detail was not found.");

    const editContext = paymentContextFromProfile(profile, {
      return_flow: "settings",
    });
    await upsertSession(user, user.whatsapp_phone, "payment_profile", "payment_edit_menu", editContext);
    return paymentEditMenuPrompt(editContext);
  }

  const deletePayoutNumber = parseNumberedAction(command, ["delete", "remove"], ["payout", "payment", "bank", "momo", "details?"]);
  if (deletePayoutNumber) {
    const payoutId = context.payout_map?.[String(deletePayoutNumber)];
    if (!payoutId) return profileSettingsReply(user, "Choose a valid payout number.");

    await upsertSession(user, user.whatsapp_phone, "settings", "confirm_delete_payout", {
      ...context,
      pending_payout_id: payoutId,
    });
    return [
      "Delete this payout detail?",
      "",
      "Reply yes to delete it, or no to keep it.",
    ].join("\n");
  }

  const editListingNumber = parseNumberedAction(command, ["edit", "update", "change"], ["offer", "listing"]);
  if (editListingNumber) {
    const listingId = context.listing_map?.[String(editListingNumber)];
    if (!listingId) return profileSettingsReply(user, "Choose a valid listing number.");

    const existingRows = await supabaseRequest(
      `listings?id=eq.${filterValue(listingId)}&owner_user_id=eq.${filterValue(user.id)}&limit=1`
    );
    const existing = existingRows[0];
    if (!existing) return profileSettingsReply(user, "That listing was not found.");
    if (!["active", "paused"].includes(existing.status)) {
      return profileSettingsReply(user, "That listing already has trade activity, so it cannot be edited.");
    }

    await supabaseRequest(`listings?id=eq.${filterValue(listingId)}&owner_user_id=eq.${filterValue(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "paused" }),
    });

    // Straight to the edit conversation: the user already asked to edit, so
    // the pre-publish review screen ("edit to change it") would be a detour.
    return startListingEdit(user, {
      listing_code: existing.listing_code,
      editing_listing_id: existing.id,
      previous_listing_status: existing.status,
    }, [
      title("Edit listing"),
      caption("I paused it while you edit, so it will not appear in search."),
    ].join("\n"));
  }

  const listingActions = [
    { status: "paused", label: "paused", number: parseNumberedAction(command, ["pause"], ["offer", "listing"]) },
    { status: "active", label: "reopened", number: parseNumberedAction(command, ["reopen", "resume", "activate"], ["offer", "listing"]) },
    { status: "cancelled", label: "closed", number: parseNumberedAction(command, ["close", "delete", "remove", "cancel"], ["offer", "listing"]) },
  ];
  const listingAction = listingActions.find((entry) => entry.number);
  if (listingAction) {
    const listingId = context.listing_map?.[String(listingAction.number)];
    if (!listingId) return profileSettingsReply(user, "Choose a valid listing number.");

    const existingRows = await supabaseRequest(
      `listings?id=eq.${filterValue(listingId)}&owner_user_id=eq.${filterValue(user.id)}&limit=1`
    );
    const existing = existingRows[0];
    if (!existing) return profileSettingsReply(user, "That listing was not found.");
    if (["reserved", "completed"].includes(existing.status)) {
      return profileSettingsReply(user, "That listing already has trade activity, so I kept it unchanged.");
    }

    const rows = await supabaseRequest(`listings?id=eq.${filterValue(listingId)}&owner_user_id=eq.${filterValue(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: listingAction.status }),
    });

    if (!rows[0]) return profileSettingsReply(user, "That listing was not found.");
    return profileSettingsReply(user, `Listing ${listingAction.label} ✅`);
  }

  return [
    "Profile actions I understand:",
    "",
    "add payout",
    "edit payout 1",
    "delete payout 1",
    "edit listing 1",
    "pause listing 1",
    "reopen listing 1",
    "close listing 1",
  ].join("\n");
}

function isSettingsCommand(text) {
  const command = compactText(text);
  if (!command) return true;
  if (/\b(profile|settings|account|menu|show profile|view profile|payouts)\b/.test(command)) return true;
  if (/\b(done|close|back|exit)\b/.test(command) && !/\b(offer|listing)\b/.test(command)) return true;
  if (/\b(add|new|edit|update|change|delete|remove)\b.*\b(payout|payment|bank|momo|details?)\b/.test(command)) return true;
  if (/\b(edit|update|change|pause|reopen|resume|activate|close|delete|remove|cancel)\b.*\b(offer|listing)\b/.test(command)) return true;
  if (/^(yes|no|confirm|delete|remove)$/.test(command)) return true;
  return false;
}

function shouldLeaveSettingsForFreshCommand(text) {
  if (isBulkListingCancelIntent(text) || isBulkPayoutDeleteIntent(text)) return false;
  if (isMenuCommand(text) || isHistoryCommand(text) || isBrowseAllOffersIntent(text)) return true;
  if (hasDirectionalExchangeText(text) || parseCurrencyAmountPairs(text).length) return true;
  const intent = inferIntent(text);
  return ["find_offer", "create_listing", "my_deals", "my_listings"].includes(intent);
}

module.exports = {
  viewProfileReply,
  viewPayoutsReply,
  profileSettingsReply,
  requestBulkListingCancel,
  requestBulkPayoutDelete,
  handleSettings,
  isSettingsCommand,
  shouldLeaveSettingsForFreshCommand,
};
