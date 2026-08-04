const { config } = require("../config");
const { title, caption, action, labeled, formatMoney } = require("../lib/format");
const { requestInstantQuotes } = require("../lib/instant-liquidity");
const {
  saveInstantQuotes,
  chooseInstantQuote,
  releaseInstantQuote,
} = require("../db/instant-fulfillment");
const { upsertSession, clearSession } = require("../db/sessions");

function whatsappButtonsReply(body, buttons, fallbackText = body) {
  return { type: "whatsapp_buttons", body, buttons, fallbackText };
}

function settlementLabel(seconds) {
  if (!seconds) return "Partner estimate shown at checkout";
  if (seconds < 60) return `About ${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return `About ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function partnerCostLabel(quote) {
  if (!Number(quote.partner_fee_amount)) return "Included in partner quote";
  return formatMoney(quote.partner_fee_amount, quote.partner_fee_currency);
}

function instantQuoteReply(quote) {
  const body = [
    title("Instant fulfilment available ⚡"),
    caption(`${quote.provider_name} can take the other side now. The quote is firm until it expires.`),
    "",
    labeled("You send", formatMoney(quote.send_amount, quote.send_currency)),
    labeled("You receive", formatMoney(quote.receive_amount, quote.receive_currency)),
    labeled("Estimated settlement", settlementLabel(quote.settlement_eta_seconds)),
    labeled("Partner cost", partnerCostLabel(quote)),
    labeled("Akara fee", formatMoney(0, quote.send_currency)),
    "",
    "The licensed partner handles the payment and payout. Akara does not hold your funds.",
  ].join("\n");
  return whatsappButtonsReply(body, [
    { id: "fulfil_instantly", title: "Fulfil now" },
    { id: "keep_listing_live", title: "Keep waiting" },
  ], [
    body,
    "",
    `${action("fulfil now")} to use this quote`,
    `${action("keep waiting")} to leave your listing open for peers`,
  ].join("\n"));
}

async function offerInstantFulfillment(user, listing) {
  if (!config.instantLiquidityEnabled) return null;
  try {
    const quotes = (await requestInstantQuotes(listing, user.id))
      .filter((quote) => quote.checkout_url);
    if (!quotes.length) return null;
    const saved = await saveInstantQuotes(user.id, listing.id, quotes);
    const best = saved[0];
    if (!best) return null;
    await upsertSession(user, user.whatsapp_phone, "instant_fulfillment", "choose", {
      listing_id: listing.id,
      quote_id: best.id,
    });
    return instantQuoteReply(best);
  } catch (error) {
    console.error(`[instant-liquidity] quote lookup failed for ${listing.listing_code}: ${error.message}`);
    return null;
  }
}

function wantsInstant(text) {
  return /^(fulfil instantly|fulfill instantly|fulfil now|fulfill now|instant|now|1)$/i
    .test(String(text || "").trim());
}

function wantsToWait(text) {
  return /^(keep waiting|wait|leave it live|cancel instant|2|cancel|back)$/i
    .test(String(text || "").trim());
}

async function handleInstantFulfillment(text, user, session) {
  const context = session.context_json || {};
  if (wantsToWait(text)) {
    if (session.current_step === "selected") {
      await releaseInstantQuote(context.quote_id, user.id);
    }
    await clearSession(user, user.whatsapp_phone);
    return [
      title("Your listing is still live"),
      "I will keep looking for peer matches and new partner liquidity.",
    ].join("\n\n");
  }

  if (!wantsInstant(text)) {
    return [
      title("Choose how to fulfil this offer"),
      `${action("fulfil now")} to use the partner quote`,
      `${action("keep waiting")} to wait for peer offers`,
    ].join("\n\n");
  }

  const result = await chooseInstantQuote(context.quote_id, user.id);
  if (result.error) {
    await clearSession(user, user.whatsapp_phone);
    return [
      title("That instant quote is no longer available"),
      "Your peer listing remains live. I will check again when a new firm quote is available.",
    ].join("\n\n");
  }

  const quote = result.quote;
  await upsertSession(user, user.whatsapp_phone, "instant_fulfillment", "selected", {
    ...context,
    quote_id: quote.id,
  });
  return [
    title("Instant fulfilment reserved ⚡"),
    caption(`${quote.provider_name} will handle the payment and payout under its own regulated service.`),
    "",
    labeled("You send", formatMoney(quote.send_amount, quote.send_currency)),
    labeled("You receive", formatMoney(quote.receive_amount, quote.receive_currency)),
    labeled("Akara fee", formatMoney(0, quote.send_currency)),
    "",
    quote.checkout_url,
    "",
    `Complete the partner checkout before the quote expires. ${action("cancel instant")} reopens your peer listing.`,
  ].join("\n");
}

module.exports = {
  offerInstantFulfillment,
  handleInstantFulfillment,
  instantQuoteReply,
};
