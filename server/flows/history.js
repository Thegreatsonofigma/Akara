const { supabaseRequest, filterValue } = require("../lib/supabase");
const { title, caption, action, labeled, formatMoney } = require("../lib/format");
const {
  getUserListings,
  displayReference,
  listingStatusLabel,
  listingStatusCue,
} = require("../db/listings");
const {
  userRoleInDeal,
  dealPartySummary,
  readableDealStatus,
  getCompletedTradeCount,
  getOpenDealsForUser,
} = require("../db/deals");
const { upsertSession } = require("../db/sessions");
const { mainMenu, mainMenuListPayload } = require("../messages/copy");

function listingPickerRow(listing) {
  return {
    id: `manage_listing_${listing.menu_number}`,
    title: `${listingStatusCue(listing.status)} ${displayReference(listing.listing_code, "listing")}`.slice(0, 24),
    description: [
      listing.status === "cancelled" ? "CLOSED" : listingStatusLabel(listing.status),
      `${formatMoney(listing.have_amount, listing.have_currency)} to ${formatMoney(listing.want_amount, listing.want_currency)}`,
    ].join(" | ").slice(0, 72),
  };
}

function listingPickerReply(listings, body, nextPage = null, remaining = 0) {
  const closedStatuses = new Set(["cancelled", "expired", "completed"]);
  const openListings = listings.filter((listing) => !closedStatuses.has(listing.status));
  const closedListings = listings.filter((listing) => closedStatuses.has(listing.status));
  const sections = [
    openListings.length
      ? {
          title: "Open listings",
          rows: openListings.map(listingPickerRow),
        }
      : null,
    closedListings.length
      ? {
          title: "Closed history",
          rows: closedListings.map(listingPickerRow),
        }
      : null,
    nextPage !== null
      ? {
          title: "More",
          rows: [
            {
              id: `my_listings_page_${nextPage}`,
              title: "See more listings",
              description: `${remaining} more record${remaining === 1 ? "" : "s"}`,
            },
          ],
        }
      : null,
  ].filter(Boolean);

  return {
    type: "whatsapp_list",
    list: {
      body,
      button: "Choose listing",
      sections,
    },
    fallbackText: body,
  };
}

async function getMyListingsReply(user, options = {}) {
  const page = Math.max(0, Number(options.page) || 0);
  const pageSize = 9;
  const statuses = ["active", "reserved", "paused", "cancelled", "expired", "completed", "flagged", "draft"];
  const [allListings, completedTrades] = await Promise.all([
    getUserListings(user.id, 1000, { statuses }),
    getCompletedTradeCount(user.id),
  ]);
  const offset = page * pageSize;
  const listings = allListings.slice(offset, offset + pageSize).map((listing, index) => ({
    ...listing,
    menu_number: offset + index + 1,
  }));
  const remaining = Math.max(0, allListings.length - (offset + listings.length));
  const nextPage = remaining > 0 ? page + 1 : null;

  if (allListings.length === 0) {
    const body = [
      title("No listings yet"),
      "",
      "Your live and closed listings will appear here.",
      "",
      caption("What would you like to do next?"),
    ].join("\n");

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

  const listingMap = {};
  listings.forEach((listing) => {
    listingMap[String(listing.menu_number)] = listing.id;
  });
  await upsertSession(user, user.whatsapp_phone, "settings", "listing_picker", {
    payout_map: {},
    listing_map: listingMap,
    listings_page: page,
  });

  const count = (status) => allListings.filter((listing) => listing.status === status).length;
  const closedCount = count("cancelled") + count("expired");
  const body = [
    title("Your listings"),
    caption(`Showing ${offset + 1}-${offset + listings.length} of ${allListings.length}. Choose one to view or manage it.`),
    "",
    labeled("Total listings", String(allListings.length)),
    labeled("🟢 Live", String(count("active"))),
    labeled("⏸️ Paused", String(count("paused"))),
    labeled("🔒 In trade", String(count("reserved"))),
    labeled("⚫ Closed", String(closedCount)),
    labeled("✅ Completed listings", String(count("completed"))),
    labeled("✅ Completed exchanges", String(completedTrades)),
  ].join("\n");

  return listingPickerReply(listings, body, nextPage, remaining);
}

async function getMyDealsReply(user) {
  const deals = await supabaseRequest(
    [
      "deals?select=id,deal_code,maker_user_id,taker_user_id,have_currency,want_currency,have_amount,want_amount,status,maker_sent_at,taker_sent_at,maker_received_at,taker_received_at,completed_at,cancelled_at,reservation_expires_at,created_at",
      `or=(maker_user_id.eq.${filterValue(user.id)},taker_user_id.eq.${filterValue(user.id)})`,
      "order=created_at.desc",
      "limit=5",
    ].join("&")
  );

  if (deals.length === 0) {
    const body = [
      title("No transaction history yet"),
      "",
      caption("Your completed and active exchanges will appear here."),
      "",
      "Browse live offers whenever you are ready.",
    ].join("\n");

    return {
      type: "whatsapp_buttons",
      body,
      buttons: [
        { id: "find offers", title: "Find offers" },
      ],
      fallbackText: [
        body,
        "",
        `${action("find offers")} to browse the marketplace.`,
      ].join("\n"),
    };
  }

  return [
    title("Transaction history"),
    caption("Recent open, completed, cancelled, and disputed trades."),
    "",
    deals.map((deal) => {
      const role = userRoleInDeal(user, deal);
      if (!role) return `${labeled("Transaction ref", displayReference(deal.deal_code, "deal"))}\n${labeled("Status", "Unavailable")}`;
      const { youSend, youReceive } = dealPartySummary(role, deal);
      return [
        title(displayReference(deal.deal_code, "deal")),
        labeled("You send", formatMoney(youSend.amount, youSend.currency)),
        labeled("You receive", formatMoney(youReceive.amount, youReceive.currency)),
        labeled("Status", readableDealStatus(deal, role)),
      ].join("\n");
    }).join("\n\n"),
  ].join("\n");
}

async function getLiveTradeClosePickerReply(user) {
  const deals = await getOpenDealsForUser(user.id, 10);
  if (!deals.length) {
    return [
      title("No live trades"),
      "",
      "There is no open trade to close right now.",
    ].join("\n");
  }

  const rows = deals.map((deal) => {
    const role = userRoleInDeal(user, deal);
    const { youSend, youReceive } = dealPartySummary(role, deal);
    return {
      id: `close_trade_${deal.deal_code}`,
      title: displayReference(deal.deal_code, "deal").slice(0, 24),
      description: `${formatMoney(youSend.amount, youSend.currency)} → ${formatMoney(youReceive.amount, youReceive.currency)}`.slice(0, 72),
    };
  });
  const body = [
    title("Choose a live trade"),
    caption("Select the trade you want to close. Completed, cancelled, and expired trades are not shown."),
  ].join("\n");

  return {
    type: "whatsapp_list",
    list: {
      body,
      button: "Choose trade",
      sections: [
        {
          title: "Live trades",
          rows,
        },
      ],
    },
    fallbackText: [
      body,
      "",
      deals.map((deal, index) => `${index + 1}. ${displayReference(deal.deal_code, "deal")}`).join("\n"),
    ].join("\n"),
  };
}

module.exports = {
  getMyListingsReply,
  getMyDealsReply,
  getLiveTradeClosePickerReply,
};
