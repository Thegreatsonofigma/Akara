const crypto = require("node:crypto");
const { supabaseRequest, filterValue } = require("../lib/supabase");

function quoteCode() {
  return `AKR-INST-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function saveInstantQuotes(userId, listingId, quotes) {
  if (!quotes.length) return [];
  return supabaseRequest("instant_fulfillment_quotes", {
    method: "POST",
    body: JSON.stringify(quotes.map((quote) => ({
      quote_code: quoteCode(),
      listing_id: listingId,
      requester_user_id: userId,
      provider_code: quote.provider_code,
      provider_name: quote.provider_name,
      provider_quote_id: quote.provider_quote_id,
      send_currency: quote.send_currency,
      send_amount: quote.send_amount,
      receive_currency: quote.receive_currency,
      receive_amount: quote.receive_amount,
      rate: quote.rate,
      partner_fee_amount: quote.partner_fee_amount,
      partner_fee_currency: quote.partner_fee_currency,
      akara_fee_amount: 0,
      settlement_eta_seconds: quote.settlement_eta_seconds,
      checkout_url: quote.checkout_url,
      status: "available",
      expires_at: quote.expires_at,
    }))),
  });
}

async function getInstantQuoteForUser(quoteId, userId) {
  const rows = await supabaseRequest(
    [
      "instant_fulfillment_quotes?",
      `id=eq.${filterValue(quoteId)}`,
      `&requester_user_id=eq.${filterValue(userId)}`,
      "&limit=1",
    ].join("")
  );
  return rows[0] || null;
}

async function chooseInstantQuote(quoteId, userId) {
  const quote = await getInstantQuoteForUser(quoteId, userId);
  if (!quote || quote.status !== "available") return { error: "unavailable" };
  if (new Date(quote.expires_at).getTime() <= Date.now()) {
    await supabaseRequest(`instant_fulfillment_quotes?id=eq.${filterValue(quote.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "expired" }),
    });
    return { error: "expired" };
  }

  const listingRows = await supabaseRequest(
    `listings?id=eq.${filterValue(quote.listing_id)}&owner_user_id=eq.${filterValue(userId)}&status=eq.active`,
    { method: "PATCH", body: JSON.stringify({ status: "reserved" }) }
  );
  if (!listingRows.length) return { error: "listing_unavailable" };

  const selected = await supabaseRequest(
    `instant_fulfillment_quotes?id=eq.${filterValue(quote.id)}&status=eq.available`,
    { method: "PATCH", body: JSON.stringify({ status: "selected", selected_at: new Date().toISOString() }) }
  );
  if (!selected.length) {
    await supabaseRequest(`listings?id=eq.${filterValue(quote.listing_id)}&status=eq.reserved`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
    return { error: "unavailable" };
  }

  await supabaseRequest(
    `instant_fulfillment_quotes?listing_id=eq.${filterValue(quote.listing_id)}&status=eq.available`,
    { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }
  );
  return { quote: selected[0], listing: listingRows[0] };
}

async function releaseInstantQuote(quoteId, userId) {
  const quote = await getInstantQuoteForUser(quoteId, userId);
  if (!quote || quote.status !== "selected") return null;
  await supabaseRequest(`instant_fulfillment_quotes?id=eq.${filterValue(quote.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelled" }),
  });
  await supabaseRequest(`listings?id=eq.${filterValue(quote.listing_id)}&owner_user_id=eq.${filterValue(userId)}&status=eq.reserved`, {
    method: "PATCH",
    body: JSON.stringify({ status: "active" }),
  });
  return quote;
}

async function releaseExpiredInstantReservations(now = new Date()) {
  const expired = await supabaseRequest(
    `instant_fulfillment_quotes?status=eq.selected&expires_at=lt.${filterValue(now.toISOString())}`
  );
  for (const quote of expired) {
    await supabaseRequest(`instant_fulfillment_quotes?id=eq.${filterValue(quote.id)}&status=eq.selected`, {
      method: "PATCH",
      body: JSON.stringify({ status: "expired" }),
    });
    await supabaseRequest(`listings?id=eq.${filterValue(quote.listing_id)}&status=eq.reserved`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active" }),
    });
  }
  return expired.length;
}

module.exports = {
  saveInstantQuotes,
  getInstantQuoteForUser,
  chooseInstantQuote,
  releaseInstantQuote,
  releaseExpiredInstantReservations,
};
