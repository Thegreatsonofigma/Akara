const { supabaseRequest, filterValue } = require("../lib/supabase");
const { title, caption, action, labeled, formatMoney } = require("../lib/format");
const { getUserListings, displayReference, listingStatusLabel } = require("../db/listings");
const { userRoleInDeal, dealPartySummary, readableDealStatus } = require("../db/deals");
const { upsertSession } = require("../db/sessions");

function listingPickerReply(listings, body) {
  return {
    type: "whatsapp_list",
    list: {
      body,
      button: "Manage listing",
      sections: [
        {
          title: "Your listings",
          rows: listings.map((listing, index) => ({
            id: `manage_listing_${index + 1}`,
            title: displayReference(listing.listing_code, "listing").slice(0, 24),
            description: [
              `${formatMoney(listing.have_amount, listing.have_currency)} to ${formatMoney(listing.want_amount, listing.want_currency)}`,
              listingStatusLabel(listing.status),
            ].join(" | ").slice(0, 72),
          })),
        },
      ],
    },
    fallbackText: body,
  };
}

async function getMyListingsReply(user) {
  const listings = await getUserListings(user.id, 5);

  if (listings.length === 0) {
    return [
      title("No listings yet"),
      "",
      caption("Make one by typing what you have and what you want."),
      "",
      action("I have 50k naira and want 55k RWF"),
    ].join("\n");
  }

  const listingMap = {};
  listings.forEach((listing, index) => {
    listingMap[String(index + 1)] = listing.id;
  });
  await upsertSession(user, user.whatsapp_phone, "settings", "listing_picker", {
    payout_map: {},
    listing_map: listingMap,
  });

  const body = [
    title("Your listings"),
    caption("Choose one to edit, close, reopen, or share."),
    "",
    listings.map((listing, index) => {
      return [
        title(`${index + 1}. ${displayReference(listing.listing_code, "listing")}`),
        labeled("Send", formatMoney(listing.have_amount, listing.have_currency)),
        labeled("Receive", formatMoney(listing.want_amount, listing.want_currency)),
        labeled("Status", listingStatusLabel(listing.status)),
      ].join("\n");
    }).join("\n\n"),
    "",
    caption("Tap Manage listing, or type an action like: edit listing 1"),
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
    return [
      title("No transaction history yet"),
      "",
      `${action("find offers")} when you are ready.`,
    ].join("\n");
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
