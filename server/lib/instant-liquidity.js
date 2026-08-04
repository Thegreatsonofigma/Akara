const crypto = require("node:crypto");
const { config } = require("../config");
const { moneyNumber } = require("./format");

function partnerCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,31}$/.test(code) ? code : "";
}

function validHttpsUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch (_) {
    return "";
  }
}

function normalizedPartners(partners = config.liquidityPartners) {
  return partners
    .map((partner) => ({
      code: partnerCode(partner.code),
      name: String(partner.name || partner.code || "Liquidity partner").trim(),
      quoteUrl: validHttpsUrl(partner.quoteUrl),
      apiKeyEnv: String(partner.apiKeyEnv || "").trim(),
      corridors: Array.isArray(partner.corridors)
        ? partner.corridors.map((item) => String(item).toUpperCase())
        : [],
      priority: Number.isFinite(Number(partner.priority)) ? Number(partner.priority) : 100,
    }))
    .filter((partner) => partner.code && partner.quoteUrl);
}

function corridorFor(listing) {
  return `${String(listing.have_currency || "").toUpperCase()}:${String(listing.want_currency || "").toUpperCase()}`;
}

function partnerSupportsListing(partner, listing) {
  return !partner.corridors.length || partner.corridors.includes(corridorFor(listing));
}

function customerReference(userId) {
  return crypto.createHash("sha256").update(String(userId || "")).digest("hex");
}

function quoteRequestBody(listing, userId) {
  return {
    schema: "akara.instant-rfq.v1",
    request_id: listing.id,
    customer_reference: customerReference(userId),
    quote_type: "firm",
    send: {
      currency: listing.have_currency,
      maximum_amount: moneyNumber(listing.have_amount),
    },
    receive: {
      currency: listing.want_currency,
      minimum_amount: moneyNumber(listing.want_amount),
    },
    akara_fee: { amount: 0, currency: listing.have_currency },
  };
}

function normalizePartnerQuote(partner, payload, listing, now = Date.now()) {
  const source = payload?.quote || payload;
  const providerQuoteId = String(source?.quote_id || source?.id || "").trim();
  const sendCurrency = String(source?.send_currency || source?.send?.currency || "").toUpperCase();
  const receiveCurrency = String(source?.receive_currency || source?.receive?.currency || "").toUpperCase();
  const sendAmount = moneyNumber(source?.send_amount ?? source?.send?.amount);
  const receiveAmount = moneyNumber(source?.receive_amount ?? source?.receive?.amount);
  const expiresAt = new Date(source?.expires_at || 0);
  const checkoutUrl = validHttpsUrl(source?.checkout_url || source?.execution_url);
  const partnerFeeAmount = Math.max(0, moneyNumber(source?.partner_fee?.amount || 0));
  const partnerFeeCurrency = String(
    source?.partner_fee?.currency || listing.have_currency
  ).toUpperCase();
  const settlementEtaSeconds = Math.max(
    0,
    Math.round(Number(source?.settlement_eta_seconds || 0))
  );

  if (!providerQuoteId || !sendAmount || !receiveAmount || Number.isNaN(expiresAt.getTime())) return null;
  if (sendCurrency !== listing.have_currency || receiveCurrency !== listing.want_currency) return null;
  if (expiresAt.getTime() <= now + config.instantLiquidityMinimumValidityMs) return null;
  if (sendAmount > moneyNumber(listing.have_amount) || receiveAmount < moneyNumber(listing.want_amount)) return null;

  return {
    provider_code: partner.code,
    provider_name: partner.name,
    provider_quote_id: providerQuoteId,
    send_currency: sendCurrency,
    send_amount: sendAmount,
    receive_currency: receiveCurrency,
    receive_amount: receiveAmount,
    rate: receiveAmount / sendAmount,
    partner_fee_amount: partnerFeeAmount,
    partner_fee_currency: partnerFeeCurrency,
    akara_fee_amount: 0,
    settlement_eta_seconds: settlementEtaSeconds,
    checkout_url: checkoutUrl || null,
    expires_at: expiresAt.toISOString(),
    provider_priority: partner.priority,
  };
}

function compareInstantQuotes(left, right) {
  return (
    left.send_amount - right.send_amount
    || right.receive_amount - left.receive_amount
    || left.partner_fee_amount - right.partner_fee_amount
    || left.settlement_eta_seconds - right.settlement_eta_seconds
    || left.provider_priority - right.provider_priority
  );
}

async function requestPartnerQuote(partner, listing, userId, options = {}) {
  const apiKey = partner.apiKeyEnv ? process.env[partner.apiKeyEnv] : "";
  if (partner.apiKeyEnv && !apiKey) {
    throw new Error(`${partner.code} is missing ${partner.apiKeyEnv}`);
  }

  const timeoutMs = options.timeoutMs || config.instantLiquidityQuoteTimeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await (options.fetchImpl || fetch)(partner.quoteUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": listing.id,
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(quoteRequestBody(listing, userId)),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${partner.code} RFQ returned ${response.status}`);
    return normalizePartnerQuote(partner, payload, listing, options.now || Date.now());
  } finally {
    clearTimeout(timer);
  }
}

async function requestInstantQuotes(listing, userId, options = {}) {
  if (!config.instantLiquidityEnabled && !options.force) return [];
  const partners = normalizedPartners(options.partners)
    .filter((partner) => partnerSupportsListing(partner, listing));
  const settled = await Promise.allSettled(
    partners.map((partner) => requestPartnerQuote(partner, listing, userId, options))
  );
  return settled
    .flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
    .sort(compareInstantQuotes);
}

module.exports = {
  normalizedPartners,
  quoteRequestBody,
  normalizePartnerQuote,
  compareInstantQuotes,
  requestPartnerQuote,
  requestInstantQuotes,
};
