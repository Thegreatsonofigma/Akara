const crypto = require("node:crypto");

const FINCRA_BASE_URLS = Object.freeze({
  sandbox: "https://sandboxapi.fincra.com",
  live: "https://api.fincra.com",
});

const RATE_FILTERS = new Set([
  "currencyPair",
  "currency",
  "side",
  "baseCurrency",
  "quoteCurrency",
  "page",
  "perPage",
]);

class FincraError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "FincraError";
    this.statusCode = options.statusCode || null;
    this.errorType = options.errorType || null;
    this.retriable = Boolean(options.retriable);
    this.details = options.details || null;
  }
}

function requiredText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}

function currencyCode(value, label) {
  const normalized = requiredText(value, label).toUpperCase();
  if (!/^[A-Z0-9]{3,5}$/.test(normalized)) {
    throw new TypeError(`${label} must be a valid currency code`);
  }
  return normalized;
}

function decimalAmount(value) {
  const normalized = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized) || Number(normalized) <= 0) {
    throw new TypeError("amount must be a positive decimal value");
  }
  return normalized;
}

function referencePath(value, label) {
  const normalized = requiredText(value, label);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new TypeError(`${label} contains unsupported characters`);
  }
  return normalized;
}

function responseMessage(payload, fallback) {
  return String(
    payload?.message
      || payload?.error
      || payload?.errors
      || fallback
  ).slice(0, 500);
}

function normalizeQuote(payload, now = Date.now()) {
  const data = payload?.data;
  if (!data || payload.success !== true) {
    throw new FincraError(responseMessage(payload, "Fincra did not return a quote"), {
      errorType: payload?.errorType || "INVALID_RESPONSE",
      details: payload,
    });
  }

  const expiresAt = new Date(data.expireAt || data.expiresAt || "");
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new FincraError("Fincra quote is missing a valid expiry", {
      errorType: "INVALID_RESPONSE",
      details: payload,
    });
  }
  if (expiresAt.getTime() <= now) {
    throw new FincraError("Fincra quote expired before it could be used", {
      errorType: "QUOTE_EXPIRED",
      details: payload,
    });
  }

  const sourceAmount = Number(data.amountToCharge ?? data.sourceAmount);
  const destinationAmount = Number(data.amountToReceive ?? data.destinationAmount);
  const rate = Number(data.rate);
  if (
    !Number.isFinite(sourceAmount)
    || sourceAmount <= 0
    || !Number.isFinite(destinationAmount)
    || destinationAmount <= 0
    || !Number.isFinite(rate)
    || rate <= 0
  ) {
    throw new FincraError("Fincra quote contains invalid financial terms", {
      errorType: "INVALID_RESPONSE",
      details: payload,
    });
  }

  return {
    reference: requiredText(data.reference, "quote reference"),
    sourceCurrency: currencyCode(data.sourceCurrency, "source currency"),
    destinationCurrency: currencyCode(data.destinationCurrency, "destination currency"),
    sourceAmount,
    destinationAmount,
    rate,
    fee: Number(data.fee || 0),
    feeCurrency: data.feeCurrency ? currencyCode(data.feeCurrency, "fee currency") : null,
    action: data.action || null,
    transactionType: data.transactionType || null,
    expiresAt: expiresAt.toISOString(),
    settlementDate: data.settlementDate || null,
    raw: data,
  };
}

function verifyFincraWebhookSignature(rawBody, signature, webhookSecret) {
  const secret = requiredText(webhookSecret, "webhook secret");
  const received = String(signature || "").trim().toLowerCase();
  if (!/^[a-f0-9]{128}$/.test(received)) return false;

  const body = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(String(rawBody || ""), "utf8");
  const expected = crypto.createHmac("sha512", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
}

class FincraClient {
  constructor(options = {}) {
    this.environment = String(options.environment || "sandbox").toLowerCase();
    this.baseUrl = FINCRA_BASE_URLS[this.environment];
    if (!this.baseUrl) throw new TypeError("Fincra environment must be sandbox or live");
    if (this.environment === "live" && options.liveAcknowledged !== true) {
      throw new Error("Live Fincra access requires an explicit acknowledgement");
    }

    this.apiKey = requiredText(options.apiKey, "Fincra API key");
    this.businessId = String(options.businessId || "").trim();
    this.allowMutations = options.allowMutations === true;
    this.timeoutMs = Math.min(15000, Math.max(1000, Number(options.timeoutMs || 5000)));
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.now = options.now || (() => Date.now());
    if (typeof this.fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
  }

  business(value) {
    return requiredText(value || this.businessId, "Fincra business ID");
  }

  async request(pathname, options = {}) {
    if (!String(pathname).startsWith("/")) throw new TypeError("Fincra path must start with /");
    const method = String(options.method || "GET").toUpperCase();
    const mutating = !["GET", "HEAD"].includes(method);
    if (mutating && options.requireMutationPermission && !this.allowMutations) {
      throw new FincraError("Fincra mutating calls are disabled", {
        errorType: "MUTATIONS_DISABLED",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    timeout.unref?.();
    try {
      const response = await this.fetchImpl(new URL(pathname, this.baseUrl), {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": this.apiKey,
        },
        body: options.body == null ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let payload = {};
      if (responseText) {
        try {
          payload = JSON.parse(responseText);
        } catch {
          throw new FincraError("Fincra returned a non-JSON response", {
            statusCode: response.status,
            errorType: "INVALID_RESPONSE",
            retriable: response.status >= 500,
          });
        }
      }

      if (!response.ok || payload?.success === false) {
        throw new FincraError(responseMessage(payload, `Fincra request failed with ${response.status}`), {
          statusCode: response.status,
          errorType: payload?.errorType || "REQUEST_FAILED",
          retriable: response.status === 429 || response.status >= 500,
          details: payload,
        });
      }
      return payload;
    } catch (error) {
      if (error instanceof FincraError) throw error;
      if (error?.name === "AbortError") {
        throw new FincraError("Fincra request timed out", {
          errorType: "TIMEOUT",
          retriable: true,
        });
      }
      throw new FincraError("Unable to reach Fincra", {
        errorType: "NETWORK_ERROR",
        retriable: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  getBusinessInformation() {
    return this.request("/profile/business/me");
  }

  getRates(filters = {}) {
    const url = new URL("/quotes/treasury-orders/rates", this.baseUrl);
    for (const [key, value] of Object.entries(filters)) {
      if (!RATE_FILTERS.has(key) || value == null || value === "") continue;
      if (key === "side" && !["buy", "sell"].includes(String(value).toLowerCase())) {
        throw new TypeError("side must be buy or sell");
      }
      url.searchParams.set(key, String(value));
    }
    return this.request(`${url.pathname}${url.search}`);
  }

  async generateQuote(input = {}) {
    const transactionType = String(input.transactionType || "conversion").toLowerCase();
    if (!["conversion", "disbursement"].includes(transactionType)) {
      throw new TypeError("transactionType must be conversion or disbursement");
    }
    const action = String(input.action || "send").toLowerCase();
    if (!["send", "receive"].includes(action)) {
      throw new TypeError("action must be send or receive");
    }
    const paymentDestination = input.paymentDestination
      || (transactionType === "conversion" ? "fliqpay_wallet" : "bank_account");
    if (transactionType === "conversion" && paymentDestination !== "fliqpay_wallet") {
      throw new TypeError("conversion quotes must use fliqpay_wallet");
    }

    const body = {
      sourceCurrency: currencyCode(input.sourceCurrency, "source currency"),
      destinationCurrency: currencyCode(input.destinationCurrency, "destination currency"),
      amount: decimalAmount(input.amount),
      action,
      transactionType,
      business: this.business(input.business),
      feeBearer: input.feeBearer || "business",
      paymentDestination,
    };
    if (input.paymentScheme) body.paymentScheme = String(input.paymentScheme);
    if (input.beneficiaryType) body.beneficiaryType = String(input.beneficiaryType);
    if (input.delay != null) body.delay = Boolean(input.delay);

    const payload = await this.request("/quotes/generate", { method: "POST", body });
    return normalizeQuote(payload, this.now());
  }

  initiateConversion(input = {}) {
    return this.request("/conversions/initiate", {
      method: "POST",
      requireMutationPermission: true,
      body: {
        business: this.business(input.business),
        quoteReference: requiredText(input.quoteReference, "quote reference"),
        customerReference: requiredText(input.customerReference, "customer reference"),
      },
    });
  }

  verifyConversion(conversionReference) {
    const reference = referencePath(conversionReference, "conversion reference");
    return this.request(`/conversions/reference/${reference}`);
  }
}

module.exports = {
  FINCRA_BASE_URLS,
  FincraClient,
  FincraError,
  normalizeQuote,
  verifyFincraWebhookSignature,
};
