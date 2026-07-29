const crypto = require("node:crypto");
const { supabaseRequest, filterValue } = require("../lib/supabase");
const { canonicalize } = require("../lib/integrity-crypto");
const { recordIntegrityEvent } = require("./integrity");

function quoteCode() {
  return `AKR-QT-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function quoteTerms({ listing, makerUserId, takerUserId, sendAmount, receiveAmount, quoteType, expiresAt }) {
  return {
    schema: "akara.locked-quote.v1",
    listing_id: listing.id,
    maker_user_id: makerUserId,
    taker_user_id: takerUserId,
    send_currency: listing.want_currency,
    receive_currency: listing.have_currency,
    send_amount: Number(sendAmount).toFixed(2),
    receive_amount: Number(receiveAmount).toFixed(2),
    rate: (Number(receiveAmount) / Number(sendAmount)).toFixed(10),
    quote_type: quoteType,
    expires_at: expiresAt,
  };
}

async function createLockedQuote({
  listing,
  makerUserId,
  takerUserId,
  sendAmount,
  receiveAmount,
  quoteType = "posted",
  negotiableOfferId = null,
  expiresAt,
}) {
  const terms = quoteTerms({
    listing,
    makerUserId,
    takerUserId,
    sendAmount,
    receiveAmount,
    quoteType,
    expiresAt,
  });
  const termsCommitmentHash = crypto
    .createHash("sha256")
    .update(canonicalize(terms))
    .digest("hex");

  try {
    const rows = await supabaseRequest("locked_quotes", {
      method: "POST",
      body: JSON.stringify({
        quote_code: quoteCode(),
        listing_id: listing.id,
        negotiable_offer_id: negotiableOfferId,
        maker_user_id: makerUserId,
        taker_user_id: takerUserId,
        send_currency: listing.want_currency,
        receive_currency: listing.have_currency,
        send_amount: sendAmount,
        receive_amount: receiveAmount,
        rate: Number(receiveAmount) / Number(sendAmount),
        quote_type: quoteType,
        status: "locked",
        terms_commitment_hash: termsCommitmentHash,
        expires_at: expiresAt,
      }),
    });
    const quote = rows[0] || null;
    if (!quote) return null;

    const record = await recordIntegrityEvent({
      eventKey: `quote:${quote.id}:locked:v1`,
      recordType: "locked_quote",
      entityType: "quote",
      entityId: quote.id,
      payload: {
        ...terms,
        subject: crypto.createHash("sha256").update(quote.quote_code).digest("hex"),
        terms_commitment_hash: termsCommitmentHash,
      },
    });
    if (record) {
      await supabaseRequest(`locked_quotes?id=eq.${filterValue(quote.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ integrity_record_id: record.id }),
      });
      quote.integrity_record_id = record.id;
    }
    return quote;
  } catch (error) {
    if (/(locked_quotes|does not exist|relation|42P01)/i.test(error.message)) return null;
    throw error;
  }
}

async function attachQuoteToDeal(quote, dealId) {
  if (!quote?.id || !dealId) return;
  await supabaseRequest(`locked_quotes?id=eq.${filterValue(quote.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "converted_to_deal", deal_id: dealId }),
  });
}

async function cancelLockedQuote(quote) {
  if (!quote?.id) return;
  await supabaseRequest(`locked_quotes?id=eq.${filterValue(quote.id)}&status=eq.locked`, {
    method: "PATCH",
    body: JSON.stringify({ status: "cancelled" }),
  });
}

module.exports = {
  createLockedQuote,
  attachQuoteToDeal,
  cancelLockedQuote,
};
