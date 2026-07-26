const MOBILE_NUMBER_RULES = Object.freeze({
  NGN: {
    country: "Nigeria",
    countryCode: "234",
    nationalDigits: 10,
    localDigits: 11,
    trunkPrefix: "0",
    example: "08031234567",
  },
  RWF: {
    country: "Rwanda",
    countryCode: "250",
    nationalDigits: 9,
    localDigits: 10,
    trunkPrefix: "0",
    example: "0788123456",
  },
  XAF: {
    country: "Cameroon",
    countryCode: "237",
    nationalDigits: 9,
    localDigits: 9,
    trunkPrefix: "",
    example: "670123456",
  },
  KES: {
    country: "Kenya",
    countryCode: "254",
    nationalDigits: 9,
    localDigits: 10,
    trunkPrefix: "0",
    example: "0712345678",
  },
  GHS: {
    country: "Ghana",
    countryCode: "233",
    nationalDigits: 9,
    localDigits: 10,
    trunkPrefix: "0",
    example: "0241234567",
  },
});

function mobileNumberRule(currency) {
  return MOBILE_NUMBER_RULES[String(currency || "").toUpperCase()] || null;
}

function inputDigits(input) {
  const raw = String(input || "").trim();
  const internationalPrefix = /^\s*(?:\+|00)/.test(raw);
  let digits = raw.replace(/\D/g, "");
  if (/^\s*00/.test(raw) && digits.startsWith("00")) digits = digits.slice(2);
  return { digits, internationalPrefix };
}

function detectForeignCountryCode(digits, expectedCurrency) {
  return Object.entries(MOBILE_NUMBER_RULES).find(([currency, rule]) => (
    currency !== expectedCurrency
    && digits.startsWith(rule.countryCode)
    && digits.length >= rule.countryCode.length + rule.nationalDigits
  )) || null;
}

function normalizeMobileMoneyNumber(currency, input) {
  const normalizedCurrency = String(currency || "").toUpperCase();
  const rule = mobileNumberRule(normalizedCurrency);
  if (!rule) {
    return {
      valid: false,
      reason: "unsupported",
      number: "",
      currency: normalizedCurrency,
      rule: null,
    };
  }

  const parsed = inputDigits(input);
  let digits = parsed.digits;
  if (!digits) {
    return {
      valid: false,
      reason: "missing",
      number: "",
      currency: normalizedCurrency,
      rule,
    };
  }

  const foreignCode = detectForeignCountryCode(digits, normalizedCurrency);
  if (parsed.internationalPrefix && foreignCode) {
    return {
      valid: false,
      reason: "wrong_country",
      number: digits,
      currency: normalizedCurrency,
      detectedCurrency: foreignCode[0],
      detectedCountry: foreignCode[1].country,
      rule,
    };
  }

  let countryCodeRemoved = false;
  if (digits.startsWith(rule.countryCode)
      && digits.length >= rule.countryCode.length + rule.nationalDigits) {
    digits = digits.slice(rule.countryCode.length);
    countryCodeRemoved = true;
  }

  if (rule.trunkPrefix) {
    if (digits.length === rule.nationalDigits && !digits.startsWith(rule.trunkPrefix)) {
      digits = `${rule.trunkPrefix}${digits}`;
    }
  } else if (digits.length === rule.localDigits + 1 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  if (digits.length < rule.localDigits) {
    return {
      valid: false,
      reason: "short",
      number: digits,
      countryCodeRemoved,
      currency: normalizedCurrency,
      rule,
    };
  }

  if (digits.length > rule.localDigits) {
    return {
      valid: false,
      reason: "long",
      number: digits,
      countryCodeRemoved,
      currency: normalizedCurrency,
      rule,
    };
  }

  if (rule.trunkPrefix && !digits.startsWith(rule.trunkPrefix)) {
    return {
      valid: false,
      reason: "format",
      number: digits,
      countryCodeRemoved,
      currency: normalizedCurrency,
      rule,
    };
  }

  return {
    valid: true,
    reason: "ok",
    number: digits,
    countryCodeRemoved,
    currency: normalizedCurrency,
    rule,
  };
}

module.exports = {
  MOBILE_NUMBER_RULES,
  mobileNumberRule,
  normalizeMobileMoneyNumber,
};
