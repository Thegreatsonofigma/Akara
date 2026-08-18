const { FincraClient } = require("./fincra");

function currencyCode(value, label) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{3,5}$/.test(normalized)) {
    throw new TypeError(`${label} must be a valid currency code`);
  }
  return normalized;
}

function corridorKey(sourceCurrency, destinationCurrency) {
  return `${currencyCode(sourceCurrency, "source currency")}-${currencyCode(
    destinationCurrency,
    "destination currency"
  )}`;
}

function supportsFincraCorridor(config, sourceCurrency, destinationCurrency) {
  const configured = Array.isArray(config?.fincraCorridors)
    ? config.fincraCorridors.map((value) => String(value).trim().toUpperCase())
    : [];
  return Boolean(config?.fincraEnabled) && configured.includes(
    corridorKey(sourceCurrency, destinationCurrency)
  );
}

function createFincraClient(config, dependencies = {}) {
  if (!config?.fincraEnabled) return null;
  return new FincraClient({
    environment: config.fincraEnvironment,
    apiKey: config.fincraApiKey,
    businessId: config.fincraBusinessId,
    allowMutations: config.fincraAllowMutations,
    liveAcknowledged: config.fincraLiveAcknowledged,
    timeoutMs: config.fincraTimeoutMs,
    fetchImpl: dependencies.fetchImpl,
    now: dependencies.now,
  });
}

function partnerQuoteOption(quote) {
  return Object.freeze({
    kind: "partner_quote",
    providerCode: "fincra",
    providerName: "Fincra",
    isPeerOffer: false,
    reference: quote.reference,
    sourceCurrency: quote.sourceCurrency,
    destinationCurrency: quote.destinationCurrency,
    sourceAmount: quote.sourceAmount,
    destinationAmount: quote.destinationAmount,
    rate: quote.rate,
    providerFee: quote.fee,
    providerFeeCurrency: quote.feeCurrency,
    expiresAt: quote.expiresAt,
    transactionType: quote.transactionType,
    executionReady: false,
  });
}

async function getFincraPartnerQuote(config, input, dependencies = {}) {
  if (!supportsFincraCorridor(config, input.sourceCurrency, input.destinationCurrency)) {
    return null;
  }
  const client = createFincraClient(config, dependencies);
  const quote = await client.generateQuote({
    sourceCurrency: input.sourceCurrency,
    destinationCurrency: input.destinationCurrency,
    amount: input.amount,
    action: input.action || "send",
    transactionType: input.transactionType || "conversion",
    paymentDestination: input.paymentDestination,
    paymentScheme: input.paymentScheme,
    beneficiaryType: input.beneficiaryType,
  });
  return partnerQuoteOption(quote);
}

module.exports = {
  corridorKey,
  supportsFincraCorridor,
  createFincraClient,
  partnerQuoteOption,
  getFincraPartnerQuote,
};
