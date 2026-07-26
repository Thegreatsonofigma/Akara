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
const {
  getUserListings,
  displayReference,
  listingShareUrl,
  listingStatusDisplay,
} = require("../db/listings");
const { getCompletedTradeCount } = require("../db/deals");
const { getLatestUserReputation } = require("../db/integrity");
const { mainMenu, mainMenuListPayload } = require("../messages/copy");
const { sendListingCard } = require("../lib/listing-card");
const {
  startPaymentProfileFlow,
  paymentEditMenuPrompt,
  paymentContextFromProfile,
} = require("./payment-profile");
const { startListingEdit, prepareListingPreview } = require("./listing");
const { requestSecurityAuthorization } = require("../lib/security");

function parseNumberedAction(text, actionWords, nounWords) {
  const value = compactText(text).replace(/_/g, " ");
  const actionPattern = Array.isArray(actionWords) ? actionWords.join("|") : actionWords;
  const nounPattern = Array.isArray(nounWords) ? nounWords.join("|") : nounWords;
  const match = value.match(new RegExp(`\\b(${actionPattern})\\s+(?:my\\s+)?(${nounPattern})\\s*(\\d+)?\\b|\\b(${actionPattern})\\s*(\\d+)\\b`));
  if (!match) return null;
  const number = Number(match[3] || match[5] || 1);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function whatsappButtonsReply(body, buttons, fallbackText = body) {
  return {
    type: "whatsapp_buttons",
    body,
    buttons,
    fallbackText,
  };
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

function profileActionsReply(body) {
  return {
    type: "whatsapp_list",
    list: {
      body,
      button: "Manage profile",
      sections: [
        {
          title: "Payout details",
          rows: [
            {
              id: "profile_add_payout",
              title: "Add payout",
              description: "I want to add a bank or mobile money account.",
            },
            {
              id: "profile_edit_payout",
              title: "Edit payout",
              description: "I want to update one of my saved accounts.",
            },
            {
              id: "profile_delete_payout",
              title: "Delete payout",
              description: "I want to remove one of my saved accounts.",
            },
            {
              id: "profile_delete_all_payouts",
              title: "Delete all payouts",
              description: "I want to remove every saved payout account.",
            },
          ],
        },
        {
          title: "Listings",
          rows: [
            {
              id: "profile_listings",
              title: "Manage listings",
              description: "I want to view or update a listing I posted.",
            },
            {
              id: "profile_pause_all_listings",
              title: "Pause all listings",
              description: "I want to hide every live listing for now.",
            },
            {
              id: "profile_reopen_all_listings",
              title: "Reopen all listings",
              description: "I want my paused listings to appear again.",
            },
            {
              id: "profile_close_all_listings",
              title: "Close all listings",
              description: "I want to permanently close every open listing.",
            },
          ],
        },
        {
          title: "Records",
          rows: [
            {
              id: "profile_history",
              title: "Transaction history",
              description: "I want to review my current and past exchanges.",
            },
            {
              id: "profile_trust",
              title: "Trust record",
              description: "I want to see my reliability and completion record.",
            },
          ],
        },
      ],
    },
    fallbackText: body,
  };
}

function profileSummaryBody(user, profiles, listings, completedTrades, reputation, intro = "") {
  const liveListings = listings.filter((listing) => ["active", "paused"].includes(listing.status)).length;
  const name = (user.display_name || user.legal_name || "").trim();

  return [
    intro,
    title("Your profile"),
    "",
    name ? labeled("Name", name) : "",
    labeled("WhatsApp", `+${user.whatsapp_phone}`),
    labeled("Status", verificationStatusLabel(user)),
    reputation
      ? labeled(
          "Trust level",
          `${reputation.reputation_band[0].toUpperCase()}${reputation.reputation_band.slice(1)}`
        )
      : "",
    reputation
      ? labeled(
          "Trade record",
          reputation.integrity_status === "verified" ? "Verified" : "Updating"
        )
      : "",
    labeled("Completed trades", String(completedTrades)),
    labeled("Live listings", String(liveListings)),
    labeled("Saved payout details", String(profiles.length)),
  ].filter(Boolean).join("\n");
}

// Scoped view: just who the user is on Akara. Payouts and listings each have
// their own view, so asking for "my profile" never dumps everything.
async function viewProfileReply(user) {
  await clearSession(user, user.whatsapp_phone);

  const [profiles, listings, completedTrades, reputation] = await Promise.all([
    getPaymentProfiles(user.id),
    getUserListings(user.id, 20),
    getCompletedTradeCount(user.id),
    getLatestUserReputation(user.id),
  ]);
  const body = profileSummaryBody(user, profiles, listings, completedTrades, reputation);
  const isVerified = ["verified_auto", "verified_manual"].includes(user.verification_status);
  return isVerified ? profileActionsReply(body) : body;
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

  const body = [
    intro,
    title("Bank & payout details"),
    caption("Where your trade partners send your money."),
    "",
    labeled("Total saved", String(profiles.length)),
    "",
    payoutBlock,
  ].filter(Boolean).join("\n");

  const buttons = [
    { id: "manage_payout_add", title: "Add payout" },
    ...(profiles.length
      ? [
          { id: "manage_payout_edit", title: "Edit payout" },
          { id: "manage_payout_delete", title: "Delete payout" },
        ]
      : []),
  ];

  return whatsappButtonsReply(body, buttons, [
    body,
    "",
    action("add payout"),
    ...(profiles.length ? [action("edit payout"), action("delete payout")] : []),
  ].join("\n"));
}

function payoutActionPickerReply(profiles, operation) {
  const verb = operation === "delete" ? "delete" : "edit";
  const rows = profiles.slice(0, 10).map((profile, index) => {
    const route = profile.method === "bank"
      ? profile.bank_name || "Bank account"
      : profile.momo_network || "Mobile money";
    return {
      id: `${verb}_payout_${index + 1}`,
      title: `${index + 1}. ${profile.currency} ${profile.method === "bank" ? "bank" : "MoMo"}`,
      description: `${route} • ${profile.account_name}`.slice(0, 72),
    };
  });
  const body = `Choose the payout detail you want to ${verb}.`;

  return {
    type: "whatsapp_list",
    list: {
      body,
      button: `Choose payout`,
      sections: [
        {
          title: "Saved payout details",
          rows,
        },
      ],
    },
    fallbackText: [
      body,
      "",
      ...profiles.slice(0, 10).map((profile, index) =>
        `${index + 1}. ${profile.currency} ${profile.method === "bank" ? "bank account" : "mobile money"}`
      ),
      "",
      `Reply ${action(`${verb} payout 1`)}.`,
    ].join("\n"),
  };
}

async function profileSettingsReply(user, intro = "") {
  const [profiles, listings, completedTrades, reputation] = await Promise.all([
    getPaymentProfiles(user.id),
    getUserListings(user.id, 20),
    getCompletedTradeCount(user.id),
    getLatestUserReputation(user.id),
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

  return profileActionsReply(
    profileSummaryBody(user, profiles, listings, completedTrades, reputation, intro)
  );
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
      title("No open listings"),
      "",
      "You do not have any live or paused listings to close.",
    ].join("\n");
  }

  await upsertSession(user, user.whatsapp_phone, "settings", "confirm_bulk_action", {
    bulk_action: "cancel_listings",
    bulk_count: rows.length,
  });

  const body = [
    title("Close all listings?"),
    "",
    `This will close ${rows.length} live or paused listing${rows.length === 1 ? "" : "s"}.`,
    "They will stop appearing in search immediately.",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "confirm", title: "Close all" },
    { id: "keep", title: "Keep live" },
  ], [
    body,
    "",
    `${action("confirm")} to close them`,
    `${action("keep")} to leave them live`,
  ].join("\n"));
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

  const securityReply = await requestSecurityAuthorization(user, {
    purpose: "delete_all_payouts",
    actionLabel: `Delete ${rows.length} payout detail${rows.length === 1 ? "" : "s"}`,
    returnFlow: "settings",
    returnStep: "confirm_bulk_action",
    returnContext: {
      bulk_action: "delete_payouts",
      bulk_count: rows.length,
    },
  });
  if (securityReply) return securityReply;

  await upsertSession(user, user.whatsapp_phone, "settings", "confirm_bulk_action", {
    bulk_action: "delete_payouts",
    bulk_count: rows.length,
  });

  const body = [
    title("Delete all payout details?"),
    "",
    `This will remove ${rows.length} saved payout detail${rows.length === 1 ? "" : "s"}.`,
    "You will need to add payout details again before opening trades for those currencies.",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "confirm", title: "Delete all" },
    { id: "keep", title: "Keep payouts" },
  ], body);
}

function menuCompletionReply(user, body) {
  return {
    type: "whatsapp_list",
    list: mainMenuListPayload(body),
    fallbackText: [
      body,
      "",
      mainMenu(user),
    ].join("\n"),
  };
}

function listingActionReply(user, listing, label) {
  const reference = displayReference(listing.listing_code, "listing");
  const messages = {
    paused: "It is hidden from search until you reopen it.",
    reopened: "It is live again and can appear in offer searches.",
    closed: "It is now off search. People can no longer find it or open a new exchange from it.",
  };

  const body = [
    title(`Listing ${label} ✅`),
    "",
    labeled("Reference", reference),
    "",
    messages[label] || "The listing has been updated.",
    "",
    caption("What would you like to do next?"),
  ].join("\n");

  return menuCompletionReply(user, body);
}

async function requestSingleListingClose(user, context, listing) {
  const reference = displayReference(listing.listing_code, "listing");
  await upsertSession(user, user.whatsapp_phone, "settings", "confirm_listing_action", {
    ...context,
    listing_action: "close",
    pending_listing_id: listing.id,
    pending_listing_code: listing.listing_code,
  });

  const body = [
    title(`Close ${reference}?`),
    "",
    "This removes the listing from search and stops new offers for it.",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "confirm", title: "Confirm" },
    { id: "keep", title: "Keep live" },
  ], [
    body,
    "",
    `${action("confirm")} to close it`,
    `${action("keep")} to leave it live`,
  ].join("\n"));
}

async function getMappedListing(user, context, number) {
  const listingId = context.listing_map?.[String(number)];
  if (!listingId) return null;
  const rows = await supabaseRequest(
    `listings?id=eq.${filterValue(listingId)}&owner_user_id=eq.${filterValue(user.id)}&limit=1`
  );
  return rows[0] || null;
}

function listingActivityDate(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

async function closedListingActivityReply(listing, number) {
  const [offers, deals] = await Promise.all([
    supabaseRequest([
      "negotiable_offers?select=id,status,created_at,updated_at",
      `listing_id=eq.${filterValue(listing.id)}`,
      "order=created_at.desc",
      "limit=50",
    ].join("&")),
    supabaseRequest([
      "deals?select=id,status,completed_at,cancelled_at,created_at",
      `listing_id=eq.${filterValue(listing.id)}`,
      "order=created_at.desc",
      "limit=50",
    ].join("&")),
  ]);

  const completedDeals = deals.filter((deal) => deal.completed_at || deal.status === "completed").length;
  const endedDeals = deals.filter((deal) => deal.cancelled_at || ["cancelled", "expired"].includes(deal.status)).length;
  const activityLines = [];
  if (offers.length) activityLines.push(labeled("Negotiations received", String(offers.length)));
  if (deals.length) activityLines.push(labeled("Exchanges opened", String(deals.length)));
  if (completedDeals) activityLines.push(labeled("Completed exchanges", String(completedDeals)));
  if (endedDeals) activityLines.push(labeled("Cancelled or expired", String(endedDeals)));

  const body = [
    title("⚫ Closed listing"),
    caption("This listing is off search and its original record is read-only."),
    "",
    labeled("Reference", displayReference(listing.listing_code, "listing")),
    "",
    labeled("You offered", formatMoney(listing.have_amount, listing.have_currency)),
    labeled("You requested", formatMoney(listing.want_amount, listing.want_currency)),
    "",
    title("Activity"),
    activityLines.length
      ? activityLines.join("\n")
      : "No negotiations or exchanges were opened before this listing closed.",
    "",
    labeled("Created", listingActivityDate(listing.created_at)),
    labeled("Closed", listingActivityDate(listing.updated_at || listing.created_at)),
    "",
    caption("Republish opens a new draft with the same terms and a new reference."),
  ].join("\n");

  return whatsappButtonsReply(body, [
    { id: `republish_listing_${number}`, title: "Republish" },
    { id: "menu", title: "Main menu" },
  ], [
    body,
    "",
    action(`republish listing ${number}`),
    action("menu"),
  ].join("\n"));
}

async function listingManagementReply(listing, number) {
  const reference = displayReference(listing.listing_code, "listing");
  const body = [
    title(reference),
    "",
    labeled("Send", formatMoney(listing.have_amount, listing.have_currency)),
    labeled("Receive", formatMoney(listing.want_amount, listing.want_currency)),
    labeled("Status", listingStatusDisplay(listing.status)),
  ].join("\n");

  if (listing.status === "active") {
    return whatsappButtonsReply(body, [
      { id: `edit_listing_${number}`, title: "Edit" },
      { id: `close_listing_${number}`, title: "Close" },
    ], [
      body,
      "",
      action(`edit listing ${number}`),
      action(`close listing ${number}`),
    ].join("\n"));
  }

  if (listing.status === "paused") {
    return whatsappButtonsReply(body, [
      { id: `edit_listing_${number}`, title: "Edit" },
      { id: `reopen_listing_${number}`, title: "Reopen" },
      { id: `close_listing_${number}`, title: "Close" },
    ], [
      body,
      "",
      action(`edit listing ${number}`),
      action(`reopen listing ${number}`),
      action(`close listing ${number}`),
    ].join("\n"));
  }

  if (listing.status === "cancelled") {
    return closedListingActivityReply(listing, number);
  }

  return [
    body,
    "",
    caption("This listing already has trade activity or is no longer live, so its details are locked."),
  ].join("\n");
}

async function selectedListingReply(user, listing, number) {
  const reference = displayReference(listing.listing_code, "listing");
  const shareUrl = listing.status === "active" ? listingShareUrl(listing) : "";
  const cardCaption = [
    title(reference),
    shareUrl ? title("Listing link") : "",
    shareUrl,
    shareUrl
      ? caption("Share this link to open the listing in Akara.")
      : caption(`Status: ${listingStatusDisplay(listing.status)}`),
  ].filter(Boolean).join("\n\n");

  try {
    await sendListingCard(user.whatsapp_phone, listing, cardCaption);
  } catch (error) {
    console.error(`[settings] listing card send failed for ${reference}: ${error.message}`);
  }

  return listingManagementReply(listing, number);
}

function shareListingReply(listing) {
  const shareUrl = listingShareUrl(listing);
  return [
    title("Share listing"),
    "",
    labeled("Reference", displayReference(listing.listing_code, "listing")),
    "",
    shareUrl,
    "",
    caption("Share this link. It previews the swap card and opens the listing in Akara on WhatsApp."),
  ].join("\n");
}

async function completeListingAction(user, context = {}) {
  if (context.listing_action !== "close" || !context.pending_listing_id) {
    await clearSession(user, user.whatsapp_phone);
    return "That confirmation has expired. Tell Akara what you want to do next.";
  }

  const rows = await supabaseRequest(
    [
      `listings?id=eq.${filterValue(context.pending_listing_id)}`,
      `owner_user_id=eq.${filterValue(user.id)}`,
      "status=in.(active,paused)",
    ].join("&"),
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      }),
    }
  );

  await clearSession(user, user.whatsapp_phone);
  if (!rows[0]) {
    return [
      title("Listing not closed"),
      "",
      "I could not close that listing. It may already be closed or in an active trade.",
    ].join("\n");
  }

  return listingActionReply(user, rows[0], "closed");
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
        body: JSON.stringify({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        }),
      }
    );

    await clearSession(user, user.whatsapp_phone);
    const body = [
      title("Listings closed ✅"),
      "",
      `${rows.length} listing${rows.length === 1 ? "" : "s"} closed successfully.`,
      "",
      "They are now off search and cannot receive new offers.",
      "",
      caption("What would you like to do next?"),
    ].join("\n");
    return menuCompletionReply(user, body);
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

async function completeBulkListingStatus(user, mode) {
  const isPause = mode === "pause";
  const sourceStatus = isPause ? "active" : "paused";
  const targetStatus = isPause ? "paused" : "active";
  const rows = await supabaseRequest(
    [
      `listings?owner_user_id=eq.${filterValue(user.id)}`,
      `status=eq.${sourceStatus}`,
    ].join("&"),
    {
      method: "PATCH",
      body: JSON.stringify({
        status: targetStatus,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  await clearSession(user, user.whatsapp_phone);
  if (!rows.length) {
    return profileSettingsReply(
      user,
      isPause
        ? "You do not have any live listings to pause."
        : "You do not have any paused listings to reopen."
    );
  }

  const body = [
    title(isPause ? "Listings paused" : "Listings reopened"),
    "",
    isPause
      ? `${rows.length} listing${rows.length === 1 ? "" : "s"} removed from search. You can reopen them anytime.`
      : `${rows.length} listing${rows.length === 1 ? "" : "s"} returned to search and can receive new offers.`,
    "",
    caption("What would you like to do next?"),
  ].join("\n");
  return menuCompletionReply(user, body);
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
        : "Reply confirm to close all open listings, or keep to leave them unchanged.",
    ].join("\n");
  }

  if (session.current_step === "confirm_listing_action") {
    if (isConfirmationYes(text)) return completeListingAction(user, context);
    if (isConfirmationNo(text)) {
      await clearSession(user, user.whatsapp_phone);
      return [
        title("Kept unchanged"),
        "",
        "No changes were made to that listing.",
      ].join("\n");
    }

    const body = [
      title("Please confirm"),
      "",
      "Close this listing and remove it from search?",
    ].join("\n");
    return whatsappButtonsReply(body, [
      { id: "confirm", title: "Confirm" },
      { id: "keep", title: "Keep live" },
    ], [
      body,
      "",
      `${action("confirm")} to close it`,
      `${action("keep")} to leave it live`,
    ].join("\n"));
  }

  if (session.current_step === "confirm_delete_payout") {
    if (/\b(yes|delete|remove|confirm)\b/.test(command)) {
      await supabaseRequest(
        `payment_profiles?id=eq.${filterValue(context.pending_payout_id)}&user_id=eq.${filterValue(user.id)}`,
        { method: "DELETE" }
      );
      return viewPayoutsReply(user, "Payout detail deleted ✅");
    }

    await upsertSession(user, user.whatsapp_phone, "settings", "menu", {
      payout_map: context.payout_map || {},
      listing_map: context.listing_map || {},
    });
    return viewPayoutsReply(user, "No changes made.");
  }

  const normalizedCommand = command.replace(/_/g, " ");

  if (session.current_step === "listing_picker") {
    const selected = normalizedCommand.match(/^(?:manage listing )?(\d+)$/);
    if (selected) {
      const number = Number(selected[1]);
      const listing = await getMappedListing(user, context, number);
      if (!listing) return profileSettingsReply(user, "Choose a valid listing.");
      await upsertSession(user, user.whatsapp_phone, "settings", "listing_actions", {
        ...context,
        selected_listing_number: number,
      });
      return selectedListingReply(user, listing, number);
    }
  }

  if (!normalizedCommand || /\b(profile|settings|account|menu|show|view)\b/.test(normalizedCommand)) {
    return profileSettingsReply(user);
  }

  if (/\b(done|close|back|exit)\b/.test(normalizedCommand) && !/\b(offer|listing)\b/.test(normalizedCommand)) {
    await clearSession(user, user.whatsapp_phone);
    return mainMenu();
  }

  if (isBulkListingCancelIntent(text)) return requestBulkListingCancel(user);
  if (isBulkPayoutDeleteIntent(text)) return requestBulkPayoutDelete(user);
  if (/\b(pause|hide|take off search)\b.*\b(all|every)\b.*\b(listing|offer)s?\b/.test(normalizedCommand)) {
    return completeBulkListingStatus(user, "pause");
  }
  if (/\b(reopen|resume|activate|restore)\b.*\b(all|every)\b.*\b(listing|offer)s?\b/.test(normalizedCommand)) {
    return completeBulkListingStatus(user, "reopen");
  }

  if (/\b(add|new)\b/.test(normalizedCommand) && /\b(payout|payment|bank|momo|details?)\b/.test(normalizedCommand)) {
    const currency = parsePaymentCurrency(normalizedCommand);
    return startPaymentProfileFlow(user, {
      return_flow: "settings",
      ...(currency ? { payment_currency: currency } : {}),
    });
  }

  const republishListingNumber = parseNumberedAction(
    normalizedCommand,
    ["republish", "relist", "repost"],
    ["offer", "listing"]
  ) || (
    /\b(republish|relist|repost|publish again|list again|use this again|make a new listing)\b/.test(normalizedCommand)
      ? Number(context.selected_listing_number || 0)
      : null
  );
  if (republishListingNumber) {
    const listing = await getMappedListing(user, context, republishListingNumber);
    if (!listing) {
      return [
        title("Listing not found"),
        "",
        "Open My Listings and choose the closed listing again.",
      ].join("\n");
    }
    if (listing.status !== "cancelled") {
      return [
        title("Listing is still open"),
        "",
        "Only a closed listing needs to be republished. You can manage this one instead.",
      ].join("\n");
    }

    return prepareListingPreview(user, {
      have_currency: listing.have_currency,
      want_currency: listing.want_currency,
      have_amount: listing.have_amount,
      want_amount: listing.want_amount,
      listing_type: listing.listing_type || "negotiable",
      republished_from_listing_id: listing.id,
    }, [
      title("Republish listing"),
      caption("I copied the old terms into a new listing with a fresh reference."),
    ].join("\n"));
  }

  if (/^(edit|update|change) payout$/.test(normalizedCommand)) {
    const profiles = await getPaymentProfiles(user.id);
    if (!profiles.length) return viewPayoutsReply(user, "You do not have a payout detail to edit.");
    if (profiles.length > 1) return payoutActionPickerReply(profiles, "edit");
    return handleSettings("edit payout 1", user, {
      ...session,
      context_json: {
        ...context,
        payout_map: { "1": profiles[0].id },
      },
    });
  }

  if (/^(delete|remove) payout$/.test(normalizedCommand)) {
    const profiles = await getPaymentProfiles(user.id);
    if (!profiles.length) return viewPayoutsReply(user, "You do not have a payout detail to delete.");
    if (profiles.length > 1) return payoutActionPickerReply(profiles, "delete");
    return handleSettings("delete payout 1", user, {
      ...session,
      context_json: {
        ...context,
        payout_map: { "1": profiles[0].id },
      },
    });
  }

  const editPayoutNumber = parseNumberedAction(normalizedCommand, ["edit", "update", "change"], ["payout", "payment", "bank", "momo", "details?"]);
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

    const securityReply = await requestSecurityAuthorization(user, {
      purpose: "edit_payout",
      actionLabel: `Edit ${profile.currency} payout detail`,
      returnFlow: "payment_profile",
      returnStep: "payment_edit_menu",
      returnContext: editContext,
    });
    if (securityReply) return securityReply;

    await upsertSession(user, user.whatsapp_phone, "payment_profile", "payment_edit_menu", editContext);
    return paymentEditMenuPrompt(editContext);
  }

  const deletePayoutNumber = parseNumberedAction(normalizedCommand, ["delete", "remove"], ["payout", "payment", "bank", "momo", "details?"]);
  if (deletePayoutNumber) {
    const payoutId = context.payout_map?.[String(deletePayoutNumber)];
    if (!payoutId) return profileSettingsReply(user, "Choose a valid payout number.");

    const securityReply = await requestSecurityAuthorization(user, {
      purpose: "delete_payout",
      actionLabel: "Delete payout detail",
      returnFlow: "settings",
      returnStep: "confirm_delete_payout",
      returnContext: {
        ...context,
        pending_payout_id: payoutId,
      },
    });
    if (securityReply) return securityReply;

    await upsertSession(user, user.whatsapp_phone, "settings", "confirm_delete_payout", {
      ...context,
      pending_payout_id: payoutId,
    });
    const body = [
      title("Delete payout detail?"),
      "",
      "This account will no longer be available for new trades.",
    ].join("\n");
    return whatsappButtonsReply(body, [
      { id: "yes", title: "Delete payout" },
      { id: "no", title: "Keep payout" },
    ], [
      body,
      "",
      `${action("yes")} to delete it`,
      `${action("no")} to keep it`,
    ].join("\n"));
  }

  const editListingNumber = parseNumberedAction(normalizedCommand, ["edit", "modify", "update", "change"], ["offer", "listing"]);
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
    const previousListingStatus = existing.status;

    await supabaseRequest(`listings?id=eq.${filterValue(listingId)}&owner_user_id=eq.${filterValue(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "paused" }),
    });

    // Straight to the edit conversation: the user already asked to edit, so
    // the pre-publish review screen ("edit to change it") would be a detour.
    return startListingEdit(user, {
      listing_code: existing.listing_code,
      editing_listing_id: existing.id,
      previous_listing_status: previousListingStatus,
      have_currency: existing.have_currency,
      want_currency: existing.want_currency,
      have_amount: existing.have_amount,
      want_amount: existing.want_amount,
      listing_type: existing.listing_type || "negotiable",
    }, [
      title("Edit listing"),
      caption("I paused it while you edit, so it will not appear in search."),
    ].join("\n"));
  }

  const shareListingNumber = parseNumberedAction(normalizedCommand, ["share", "copy"], ["offer", "listing", "link"]);
  if (shareListingNumber) {
    const listing = await getMappedListing(user, context, shareListingNumber);
    if (!listing) return profileSettingsReply(user, "Choose a valid listing number.");
    if (listing.status !== "active") {
      return [
        title("Share link unavailable"),
        "",
        "Only live listings can be shared. Reopen this listing first.",
      ].join("\n");
    }
    return shareListingReply(listing);
  }

  const listingActions = [
    { status: "paused", label: "paused", number: parseNumberedAction(normalizedCommand, ["pause"], ["offer", "listing"]) },
    { status: "active", label: "reopened", number: parseNumberedAction(normalizedCommand, ["reopen", "resume", "activate"], ["offer", "listing"]) },
    { status: "cancelled", label: "closed", number: parseNumberedAction(normalizedCommand, ["close", "delete", "remove", "cancel"], ["offer", "listing"]) },
  ];
  const listingAction = listingActions.find((entry) => entry.number);
  if (listingAction) {
    const listingId = context.listing_map?.[String(listingAction.number)];
    if (!listingId) {
      return [
        title("Choose a valid listing"),
        "",
        `${action("my listings")} to see your current listings`,
      ].join("\n");
    }

    const existingRows = await supabaseRequest(
      `listings?id=eq.${filterValue(listingId)}&owner_user_id=eq.${filterValue(user.id)}&limit=1`
    );
    const existing = existingRows[0];
    if (!existing) {
      return [
        title("Listing not found"),
        "",
        "I could not find that listing on your account.",
      ].join("\n");
    }
    if (["reserved", "completed"].includes(existing.status)) {
      return [
        title("Cannot close this listing"),
        "",
        labeled("Reference", displayReference(existing.listing_code, "listing")),
        "",
        "It already has trade activity. Raise a dispute if something is wrong with the trade.",
        "",
        action("raise dispute"),
      ].join("\n");
    }

    if (listingAction.status === "cancelled") {
      if (!["active", "paused"].includes(existing.status)) {
        return [
          title("Already closed"),
          "",
          labeled("Reference", displayReference(existing.listing_code, "listing")),
          "",
          "It is already off search.",
        ].join("\n");
      }

      return requestSingleListingClose(user, context, existing);
    }

    const rows = await supabaseRequest(`listings?id=eq.${filterValue(listingId)}&owner_user_id=eq.${filterValue(user.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: listingAction.status,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!rows[0]) {
      return [
        title("Listing not found"),
        "",
        "I could not find that listing on your account.",
      ].join("\n");
    }
    await clearSession(user, user.whatsapp_phone);
    return listingActionReply(user, rows[0], listingAction.label);
  }

  return [
    title("Choose an account action"),
    "",
    "Open Manage profile to choose what you want to update.",
  ].join("\n");
}

function isSettingsCommand(text) {
  const command = compactText(text).replace(/_/g, " ");
  if (!command) return true;
  if (/^(manage|edit|modify|close|delete|remove|pause|reopen|resume|activate|share|copy|republish|relist|repost) listing \d+$/.test(command)) return true;
  if (/\b(profile|settings|account|menu|show profile|view profile|payouts)\b/.test(command)) return true;
  if (/\b(done|close|back|exit)\b/.test(command) && !/\b(offer|listing)\b/.test(command)) return true;
  if (/\b(add|new|edit|update|change|delete|remove)\b.*\b(payout|payment|bank|momo|details?)\b/.test(command)) return true;
  if (/\b(pause|hide|reopen|resume|activate|restore)\b.*\b(all|every)\b.*\b(offer|listing)s?\b/.test(command)) return true;
  if (/\b(edit|modify|update|change|pause|reopen|resume|activate|close|delete|remove|cancel)\b.*\b(offer|listing)\b/.test(command)) return true;
  if (/\b(republish|relist|repost|publish again|list again|use this again|make a new listing)\b/.test(command)) return true;
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
