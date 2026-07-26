const { supabaseRequest, filterValue } = require("../lib/supabase");
const { title, caption, action, labeled, formatMoney } = require("../lib/format");
const { getUserListings, displayReference, listingStatusLabel } = require("../db/listings");
const { userRoleInDeal, dealPartySummary, readableDealStatus } = require("../db/deals");
const { upsertSession } = require("../db/sessions");
const { mainMenu, mainMenuListPayload } = require("../messages/copy");

function listingStatusMarker(status) {
  return {
    active: "🟢",
    paused: "🟡",
    reserved: "🔒",
    cancelled: "⚫",
  }[status] || "•";
}

function listingPickerRow(listing) {
  return {
    id: `manage_listing_${listing.menu_number}`,
    title: `${listingStatusMarker(listing.status)} ${displayReference(listing.listing_code, "listing")}`.slice(0, 24),
    description: [
      listing.status === "cancelled" ? "CLOSED" : listingStatusLabel(listing.status),
      `${formatMoney(listing.have_amount, listing.have_currency)} to ${formatMoney(listing.want_amount, listing.want_currency)}`,
    ].join(" | ").slice(0, 72),
  };
}

function listingPickerReply(listings, body) {
  const openListings = listings.filter((listing) => listing.status !== "cancelled");
  const closedListings = listings.filter((listing) => listing.status === "cancelled");
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

async function getMyListingsReply(user) {
  const listings = (await getUserListings(user.id, 10, {
    statuses: ["active", "reserved", "paused", "cancelled"],
  })).map((listing, index) => ({
    ...listing,
    menu_number: index + 1,
  }));

  if (listings.length === 0) {
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
  });

  const body = [
    title("Your listings"),
    caption("Choose a listing to view its details and available actions."),
    "",
    `${listingStatusMarker("active")} Live`,
    "",
    `${listingStatusMarker("paused")} Paused`,
    "",
    `${listingStatusMarker("reserved")} In trade`,
    "",
    `${listingStatusMarker("cancelled")} Closed`,
  ].join("\n");

  return listingPickerReply(listings, body);
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

module.exports = {
  getMyListingsReply,
  getMyDealsReply,
};
