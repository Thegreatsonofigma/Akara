const { supabaseRequest, filterValue } = require("../lib/supabase");
const { isCoinProfileEnabled, findNigerianBanks, resolveBankAccount } = require("../lib/coinprofile");
const { title, caption, action, labeled, normalizeShortText, digitsOnly } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { paymentOptionLines } = require("../nlp/currency");
const { isEditIntent, isCancelIntent, isDeclineIntent } = require("../nlp/intents");
const { getUserById, updateUser, latestVerificationRequest } = require("../db/users");
const { upsertSession, clearSession } = require("../db/sessions");
const { mainMenu } = require("../messages/copy");
const { sendVerificationSuccessCard } = require("../lib/listing-card");

function paymentMethodForCurrency(currency) {
  return currency === "NGN" ? "bank" : "momo";
}

function paymentChoicePrompt(excludeCurrency = null) {
  return [
    title("Payout details"),
    caption("Choose where incoming payments should land."),
    "",
    ...paymentOptionLines(excludeCurrency),
    "",
    caption("Example: add NGN bank"),
  ].join("\n");
}

function mobileNetworkOptions(currency) {
  const options = {
    RWF: ["MTN", "Airtel"],
    XAF: ["MTN", "Orange"],
    KES: ["M-Pesa"],
    GHS: ["MTN", "Vodafone", "AirtelTigo"],
  };
  return options[currency] || [];
}

function mobileNetworkOptionLines(currency) {
  return mobileNetworkOptions(currency).map((network, index) => `${index + 1}. ${action(network)}`);
}

function normalizeMobileNetwork(currency, input) {
  const value = compactText(input);
  const options = mobileNetworkOptions(currency);
  if (/^\d+$/.test(value)) return options[Number(value) - 1] || null;

  const aliases = {
    "mtn": "MTN",
    "airtel": "Airtel",
    "orange": "Orange",
    "mpesa": "M-Pesa",
    "m pesa": "M-Pesa",
    "m-pesa": "M-Pesa",
    "vodafone": "Vodafone",
    "airteltigo": "AirtelTigo",
    "airtel tigo": "AirtelTigo",
    "airtel-tigo": "AirtelTigo",
  };
  const normalized = aliases[value] || null;
  return normalized && options.includes(normalized) ? normalized : null;
}

function networkPrompt(currency) {
  const options = mobileNetworkOptionLines(currency);
  if (!options.length) return "Which network?";
  return [
    title(`${currency} mobile network`),
    caption("Choose one option so the payout detail stays clean."),
    "",
    ...options,
  ].join("\n");
}

function paymentProfileStartPrompt(currency) {
  return paymentMethodForCurrency(currency) === "bank"
    ? [
        title(`Add ${currency} bank account`),
        caption("This is where your trade partner will send your money."),
        "",
        "Send the bank name first.",
        caption("Example: GTBank, Access, Kuda"),
      ].join("\n")
    : [
        title(`Add ${currency} mobile money`),
        caption("This is where your trade partner will send your money."),
        "",
        networkPrompt(currency),
      ].join("\n");
}

async function startPaymentProfileForCurrency(user, currency, context = {}) {
  const paymentContext = {
    ...context,
    payment_currency: currency,
  };
  const nextStep = paymentMethodForCurrency(currency) === "bank" ? "payment_bank_name" : "payment_network";
  await upsertSession(user, user.whatsapp_phone, "payment_profile", nextStep, paymentContext);
  return paymentProfileStartPrompt(currency);
}

async function startPaymentProfileFlow(user, context = {}) {
  if (context.payment_currency) {
    return startPaymentProfileForCurrency(user, context.payment_currency, context);
  }

  await upsertSession(user, user.whatsapp_phone, "payment_profile", "payment_currency", context);
  return paymentChoicePrompt();
}

function bankAccountNumberStatus(input) {
  const digits = digitsOnly(input);
  if (!digits) return { digits, valid: false, reason: "missing" };
  if (digits.length < 10) return { digits, valid: false, reason: "short" };
  if (digits.length > 11) return { digits, valid: false, reason: "long" };
  return { digits, valid: true, reason: "ok" };
}

function looksLikeAccountNumber(input) {
  const value = String(input || "").trim();
  const digits = digitsOnly(value);
  if (!digits) return false;
  return digits.length >= 6 && digits.length >= value.replace(/\s+/g, "").length * 0.7;
}

function bankAccountNumberPrompt(status = null) {
  if (status?.reason === "short") {
    return [
      title("Account number needed"),
      "",
      "That number is too short for a bank account.",
      "Send a 10 or 11 digit account number.",
      "",
      caption("You can say edit bank if the bank name is wrong."),
    ].join("\n");
  }

  if (status?.reason === "long") {
    return [
      title("Account number needed"),
      "",
      "That number is too long for a bank account.",
      "Send only the 10 or 11 digit account number.",
      "",
      caption("You can say edit bank if the bank name is wrong."),
    ].join("\n");
  }

  return [
    "Send the account number.",
    caption("Use 10 or 11 digits only."),
  ].join("\n");
}

function paymentStepPrompt(step, context = {}) {
  const currency = context.payment_currency;
  if (step === "payment_bank_name") {
    return [
      title(`Add ${currency} bank account`),
      "",
      "Send the bank name.",
      caption("Example: GTBank, Access, Kuda"),
    ].join("\n");
  }
  if (step === "payment_network") return networkPrompt(currency);
  if (step === "payment_account_name") {
    return paymentMethodForCurrency(currency) === "bank"
      ? "Send the name on that bank account."
      : "Send the name registered on that mobile money account.";
  }
  if (step === "payment_account_number") return bankAccountNumberPrompt();
  if (step === "payment_number") return "Send the mobile money phone number.";
  return paymentChoicePrompt();
}

function accountNamePrompt(user, context = {}) {
  const verifiedName = normalizeShortText(user?.legal_name || context.legal_name || "", 120);
  const target = paymentMethodForCurrency(context.payment_currency) === "bank"
    ? "bank account"
    : "mobile money account";
  const lines = [
    `What name is registered on that ${target}?`,
  ];

  if (verifiedName) {
    lines.push(
      "",
      title("Quick option"),
      `${action("1")} ${verifiedName}`,
      `${action("different name")} if it is not the same`,
    );
  }

  return lines.join("\n");
}

function parseAccountNameReply(text, user, context = {}) {
  const value = compactText(text);
  const verifiedName = normalizeShortText(user?.legal_name || context.legal_name || "", 120);
  if (verifiedName && /^(1|same|use same|use verified|verified name|my name|legal name|full name)$/.test(value)) {
    return verifiedName;
  }
  if (verifiedName && /\b(different|another|not same|not the same|manual)\b/.test(value)) {
    return null;
  }
  return normalizeShortText(text, 120);
}

function paymentEditMenuPrompt(context = {}) {
  const method = paymentMethodForCurrency(context.payment_currency);
  const options = method === "bank"
    ? [
        `${action("bank")} Bank name`,
        `${action("number")} Account number`,
        `${action("name")} Account name`,
      ]
    : [
        `${action("network")} Mobile money network`,
        `${action("number")} Mobile money number`,
        `${action("name")} Registered name`,
      ];

  return [
    title(`Edit ${context.payment_currency} payout`),
    caption("Choose only the detail you want to update."),
    "",
    ...options,
    "",
    `${action("cancel")} to keep the current details`,
  ].join("\n");
}

function paymentEditMenuStep(text, context = {}) {
  const value = compactText(text);
  const method = paymentMethodForCurrency(context.payment_currency);
  if (method === "bank") {
    if (/^(1|bank|bank name)$/.test(value) || /\bbank\b/.test(value)) return "payment_bank_name";
    if (/^(2|number|account number|acct number)$/.test(value) || /\b(account )?number\b/.test(value)) return "payment_account_number";
    if (/^(3|name|account name)$/.test(value) || /\bname\b/.test(value)) return "payment_account_name";
    return null;
  }

  if (/^(1|network|momo network|mobile money network)$/.test(value) || /\bnetwork\b/.test(value)) return "payment_network";
  if (/^(2|number|phone|momo number|mobile money number)$/.test(value) || /\b(number|phone)\b/.test(value)) return "payment_number";
  if (/^(3|name|registered name|account name)$/.test(value) || /\bname\b/.test(value)) return "payment_account_name";
  return null;
}

function paymentContextFromProfile(profile, extra = {}) {
  return {
    ...extra,
    payment_currency: profile.currency,
    payment_profile_id: profile.id,
    payment_bank_name: profile.bank_name || "",
    payment_account_number: profile.account_number_encrypted || "",
    payment_network: profile.momo_network || "",
    payment_number: profile.momo_number_encrypted || "",
    payment_account_name: profile.account_name || "",
  };
}

function formatPayoutReview(context) {
  const currency = context.payment_currency;
  const method = paymentMethodForCurrency(currency);
  const lines = method === "bank"
    ? [
        labeled("Type", `${currency} bank account`),
        "",
        labeled("Bank", context.payment_bank_name),
        labeled("Account", context.payment_account_number),
        labeled("Name", context.payment_account_name),
        ...(context.payment_account_resolved ? [caption("Account name confirmed by the bank ✅")] : []),
      ]
    : [
        labeled("Type", `${currency} mobile money`),
        "",
        labeled("Network", context.payment_network),
        labeled("Number", context.payment_number),
        labeled("Name", context.payment_account_name),
      ];

  return [
    title("Review payout detail"),
    caption("Check this carefully before I save it."),
    "",
    ...lines,
    "",
    title("Important"),
    "Only save details you own or control. Wrong payout details can send money to the wrong place, and Akara may not be able to reverse external transfers.",
    "",
    `${action("save payout")} to confirm`,
    `${action("edit")} to correct something`,
    `${action("cancel")} to stop`,
  ].join("\n");
}

async function promptPaymentProfileConfirmation(user, flow, context) {
  await upsertSession(user, user.whatsapp_phone, flow, "payment_confirm", context);
  return formatPayoutReview(context);
}

function normalizeNameForMatch(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(name) {
  return normalizeNameForMatch(name)
    .split(" ")
    .filter((token) => token.length > 1);
}

function namesLikelyMatch(kycName, payoutName) {
  const kyc = normalizeNameForMatch(kycName);
  const payout = normalizeNameForMatch(payoutName);
  if (!kyc || !payout) return false;
  if (kyc === payout) return true;
  if (kyc.length > 5 && payout.length > 5 && (kyc.includes(payout) || payout.includes(kyc))) return true;

  const kycTokens = new Set(nameTokens(kyc));
  const payoutTokens = new Set(nameTokens(payout));
  if (!kycTokens.size || !payoutTokens.size) return false;

  const overlap = [...payoutTokens].filter((token) => kycTokens.has(token)).length;
  const required = Math.max(1, Math.ceil(Math.min(kycTokens.size, payoutTokens.size) * 0.7));
  return overlap >= required;
}

function canResolveNgnAccounts(context = {}) {
  return context.payment_currency === "NGN" && isCoinProfileEnabled();
}

function bankPickPrompt(candidates = []) {
  return [
    title("Which bank exactly?"),
    caption("Reply with a number."),
    "",
    ...candidates.map((bank, index) => `${index + 1}. ${action(bank.name)}`),
    "",
    caption("Or send the bank name again."),
  ].join("\n");
}

// Matches the typed bank name against CoinProfile's NGN bank list so the
// account number can be resolved later. Returns null when CoinProfile is
// unreachable, so the caller can fall back to the manual flow.
async function handleBankNameWithResolution(flow, user, context, bankName) {
  let matches;
  try {
    matches = await findNigerianBanks(bankName);
  } catch (error) {
    console.error("CoinProfile bank lookup failed:", error.message);
    return null;
  }

  if (!matches.length) {
    return [
      title("Bank not found"),
      "",
      `I could not find a Nigerian bank called "${bankName}".`,
      "Send the bank name again.",
      "",
      caption("Example: GTBank, Access, Kuda, Zenith, UBA"),
    ].join("\n");
  }

  if (matches.length > 1) {
    context.payment_bank_candidates = matches
      .slice(0, 3)
      .map((bank) => ({ name: bank.name, code: bank.code }));
    await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_pick", context);
    return bankPickPrompt(context.payment_bank_candidates);
  }

  context.payment_bank_name = matches[0].name;
  context.payment_bank_code = matches[0].code;
  delete context.payment_bank_candidates;
  return proceedAfterBankChosen(flow, user, context);
}

async function proceedAfterBankChosen(flow, user, context) {
  if (context.payment_account_number) {
    return resolveAndConfirmAccount(flow, user, context);
  }

  await upsertSession(user, user.whatsapp_phone, flow, "payment_account_number", context);
  return [
    labeled("Bank", context.payment_bank_name),
    "",
    bankAccountNumberPrompt(),
  ].join("\n");
}

// Looks up the account holder's name from the bank through CoinProfile, checks
// it against the KYC name, and jumps straight to the save confirmation.
async function resolveAndConfirmAccount(flow, user, context) {
  let resolved = null;
  try {
    resolved = await resolveBankAccount(context.payment_account_number, context.payment_bank_code);
  } catch (error) {
    console.error("CoinProfile account resolve failed:", error.message);

    // CoinProfile answers 404 when the bank does not recognise the account.
    if (error.statusCode === 422 || error.statusCode === 400 || error.statusCode === 404) {
      context.payment_account_number = "";
      context.payment_account_resolved = false;
      await upsertSession(user, user.whatsapp_phone, flow, "payment_account_number", context);
      return [
        title("Account not found"),
        "",
        `${context.payment_bank_name} did not recognise that account number.`,
        "Check the digits and send the account number again.",
        "",
        caption("You can say edit bank if the bank is wrong."),
      ].join("\n");
    }

    // CoinProfile is down or rate limited — continue with the manual name step.
    context.payment_account_resolved = false;
    await upsertSession(user, user.whatsapp_phone, flow, "payment_account_name", context);
    return [
      caption("I could not auto-check that account right now, so let's confirm the name manually."),
      "",
      accountNamePrompt(user, context),
    ].join("\n");
  }

  const accountName = normalizeShortText(resolved?.account_name || "", 120);
  if (!accountName) {
    context.payment_account_resolved = false;
    await upsertSession(user, user.whatsapp_phone, flow, "payment_account_name", context);
    return accountNamePrompt(user, context);
  }

  context.payment_account_name = accountName;
  context.payment_account_resolved = true;
  return promptPaymentProfileConfirmation(user, flow, context);
}

async function assessPayoutNameTrust(user, payoutName, { notifyVerificationSuccess = true } = {}) {
  const freshUser = await getUserById(user.id);
  if (!freshUser) return { status: "unknown", reason: "User not found." };

  const request = await latestVerificationRequest(user.id);
  const kycName = freshUser.legal_name || request?.extracted_name || "";
  if (!kycName || !payoutName) return { status: "unknown", reason: "KYC name or payout name is missing." };

  const matched = namesLikelyMatch(kycName, payoutName);
  if (matched) {
    if (request?.id) {
      await supabaseRequest(`verification_requests?id=eq.${filterValue(request.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          automated_decision: "tier_1_candidate",
          automated_reason: "Payout account name matches the submitted KYC name. Tier 1 auto-check passed, pending higher-limit review.",
        }),
      });
    }

    const shouldNotifySuccess = notifyVerificationSuccess && ["unverified", "pending_input", "pending_review"].includes(freshUser.verification_status);
    if (["unverified", "pending_input", "pending_review"].includes(freshUser.verification_status)) {
      await updateUser(user.id, {
        verification_status: "verified_auto",
        verification_score: Math.max(Number(freshUser.verification_score || 0), 65),
        risk_status: "normal",
      });
    }
    if (shouldNotifySuccess) {
      sendVerificationSuccessCard(freshUser.whatsapp_phone || user.whatsapp_phone).catch((error) => {
        console.error(`[kyc] verification card failed for ${user.id}: ${error.message}`);
      });
    }

    return { status: "matched", reason: "Payout name matches KYC name." };
  }

  if (request?.id) {
    await supabaseRequest(`verification_requests?id=eq.${filterValue(request.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        automated_decision: "name_mismatch",
        automated_reason: "Payout account name does not closely match the submitted KYC name. Manual review required before higher limits.",
      }),
    });
  }

  if (["unverified", "pending_input", "pending_review"].includes(freshUser.verification_status)) {
    await updateUser(user.id, {
      verification_status: "pending_review",
      verification_score: Math.max(Number(freshUser.verification_score || 0), 45),
      risk_status: "watch",
    });
  }

  return { status: "mismatch", reason: "Payout name does not match KYC name." };
}

async function savePaymentProfile(user, context, { notifyVerificationSuccess = true } = {}) {
  const currency = context.payment_currency;
  const method = paymentMethodForCurrency(currency);
  const body = {
    user_id: user.id,
    currency,
    method,
    account_name: context.payment_account_name,
    is_default: true,
  };

  if (method === "bank") {
    body.bank_name = context.payment_bank_name;
    body.account_number_encrypted = context.payment_account_number;
  } else {
    body.momo_network = context.payment_network;
    body.momo_number_encrypted = context.payment_number;
  }

  await supabaseRequest(
    `payment_profiles?user_id=eq.${filterValue(user.id)}&currency=eq.${filterValue(currency)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ is_default: false }),
    }
  );

  if (context.payment_profile_id) {
    const rows = await supabaseRequest(
      `payment_profiles?id=eq.${filterValue(context.payment_profile_id)}&user_id=eq.${filterValue(user.id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...body,
          bank_name: method === "bank" ? body.bank_name : null,
          account_number_encrypted: method === "bank" ? body.account_number_encrypted : null,
          momo_network: method === "momo" ? body.momo_network : null,
          momo_number_encrypted: method === "momo" ? body.momo_number_encrypted : null,
        }),
      }
    );
    const profile = rows[0] || null;
    await assessPayoutNameTrust(user, context.payment_account_name, { notifyVerificationSuccess }).catch((error) => {
      console.error(`[kyc] payout name check failed for ${user.id}: ${error.message}`);
    });
    return profile;
  }

  const rows = await supabaseRequest("payment_profiles", {
    method: "POST",
    body: JSON.stringify(body),
  });
  const profile = rows[0] || null;
  await assessPayoutNameTrust(user, context.payment_account_name, { notifyVerificationSuccess }).catch((error) => {
    console.error(`[kyc] payout name check failed for ${user.id}: ${error.message}`);
  });
  return profile;
}

async function finishPaymentProfileSave(user, flow, context) {
  // Lazy requires: these flows also route back into payment profile setup, so
  // requiring them at the top would create circular imports.
  await savePaymentProfile(user, context, { notifyVerificationSuccess: flow !== "verification" });

  if (flow === "verification") {
    const paymentCount = Number(context.payment_count || 0) + 1;
    await upsertSession(user, user.whatsapp_phone, "verification", "payment_more", {
      request_id: context.request_id,
      payment_count: paymentCount,
    });

    return [
      "Payout detail saved ✅",
      "",
      "Add another payout method?",
      "Reply another, or submit.",
    ].join("\n");
  }

  if (context.return_flow === "publish_listing" && context.pending_listing) {
    const { publishListing } = require("./listing");
    return publishListing(user, context.pending_listing);
  }

  if (context.return_flow === "preview_listing" && context.pending_listing) {
    const { prepareListingPreview } = require("./listing");
    return prepareListingPreview(user, context.pending_listing, "Payout detail saved ✅");
  }

  if (context.return_flow === "reserve_listing" && context.pending_listing_id) {
    const { reserveListingById } = require("./listing");
    return reserveListingById(user, context.pending_listing_id);
  }

  if (context.return_flow === "settings") {
    const { profileSettingsReply } = require("./settings");
    return profileSettingsReply(user, "Payout detail saved ✅");
  }

  await clearSession(user, user.whatsapp_phone);
  return [
    "Payout detail saved ✅",
    "",
    "You can now make offers or start exchanges with that currency.",
  ].join("\n");
}

function paymentEditStep(text, context = {}) {
  const value = compactText(text);
  if (!context.payment_currency) return null;
  if (!/\b(edit|change|correct|fix|update)\b/.test(value)) return null;
  const method = paymentMethodForCurrency(context.payment_currency);

  if (method === "bank" && /\b(bank|bank name)\b/.test(value)) return "payment_bank_name";
  if (method === "bank" && /\b(number|account number|acct number)\b/.test(value)) return "payment_account_number";
  if (/\b(name|account name|registered name)\b/.test(value)) return "payment_account_name";
  if (method !== "bank" && /\b(network|momo|mobile money)\b/.test(value)) return "payment_network";
  if (method !== "bank" && /\b(number|phone)\b/.test(value)) return "payment_number";

  return null;
}

async function maybeHandlePaymentEdit(text, user, session, context) {
  const step = paymentEditStep(text, context);
  if (!step) return null;

  await upsertSession(user, user.whatsapp_phone, session.current_flow, step, context);
  return [
    title("No problem"),
    "",
    paymentStepPrompt(step, context),
  ].join("\n");
}

// Shared step machine for collecting payout details. Both the standalone
// payment_profile flow and the verification flow use it; they differ only in
// the flow name saved on the session and what "decline" does at the review
// step. Returns a reply string, or null when the step is not a payment step.
async function handlePaymentSteps(flow, text, user, session, context, { onDecline }) {
  const step = session.current_step;

  if (step === "payment_confirm") {
    const command = compactText(text);
    if (/\b(save|confirm|yes|correct|looks good|go ahead)\b/.test(command)) {
      return finishPaymentProfileSave(user, flow, context);
    }

    if (isEditIntent(command)) {
      await upsertSession(user, user.whatsapp_phone, flow, "payment_edit_menu", context);
      return paymentEditMenuPrompt(context);
    }

    if (isDeclineIntent(command) || isCancelIntent(command)) {
      return onDecline(context);
    }

    return formatPayoutReview(context);
  }

  if (step === "payment_edit_menu") {
    if (isCancelIntent(text) || isDeclineIntent(text)) {
      await upsertSession(user, user.whatsapp_phone, flow, "payment_confirm", context);
      return formatPayoutReview(context);
    }

    const nextStep = paymentEditMenuStep(text, context);
    if (!nextStep) return paymentEditMenuPrompt(context);

    await upsertSession(user, user.whatsapp_phone, flow, nextStep, context);
    return [
      title("Let's update that"),
      "",
      nextStep === "payment_account_name" ? accountNamePrompt(user, context) : paymentStepPrompt(nextStep, context),
    ].join("\n");
  }

  if (step === "payment_currency") {
    const { parsePaymentCurrency } = require("../nlp/currency");
    const currency = parsePaymentCurrency(text);
    if (!currency) return paymentChoicePrompt();

    context.payment_currency = currency;
    const nextStep = paymentMethodForCurrency(currency) === "bank" ? "payment_bank_name" : "payment_network";
    await upsertSession(user, user.whatsapp_phone, flow, nextStep, context);
    return paymentProfileStartPrompt(currency);
  }

  if (step === "payment_bank_name") {
    if (looksLikeAccountNumber(text)) {
      const status = bankAccountNumberStatus(text);
      if (!status.valid) return bankAccountNumberPrompt(status);

      context.payment_account_number = status.digits;
      await upsertSession(user, user.whatsapp_phone, flow, "payment_bank_name", context);
      return [
        title("I saved the account number"),
        "",
        "That looks like your account number, not the bank name.",
        "Send the bank name now.",
        "",
        caption("Example: GTBank, Access, Kuda"),
        caption("You can say edit number if that number is wrong."),
      ].join("\n");
    }

    const bankName = normalizeShortText(text, 80);
    if (!bankName) return "Send the bank name. Example: GTBank.";

    if (canResolveNgnAccounts(context)) {
      const resolutionReply = await handleBankNameWithResolution(flow, user, context, bankName);
      if (resolutionReply) return resolutionReply;
    }

    context.payment_bank_name = bankName;
    await upsertSession(user, user.whatsapp_phone, flow, "payment_account_name", context);
    return accountNamePrompt(user, context);
  }

  if (step === "payment_bank_pick") {
    const candidates = context.payment_bank_candidates || [];
    const value = compactText(text);
    const pick = /^\d$/.test(value) ? candidates[Number(value) - 1] : null;

    if (pick) {
      context.payment_bank_name = pick.name;
      context.payment_bank_code = pick.code;
      delete context.payment_bank_candidates;
      return proceedAfterBankChosen(flow, user, context);
    }

    const bankName = normalizeShortText(text, 80);
    if (bankName && !/^\d+$/.test(bankName)) {
      const resolutionReply = await handleBankNameWithResolution(flow, user, context, bankName);
      if (resolutionReply) return resolutionReply;
    }

    return bankPickPrompt(candidates);
  }

  if (step === "payment_network") {
    const network = normalizeMobileNetwork(context.payment_currency, text);
    if (!network) {
      return [
        "Choose one of the listed networks first.",
        "",
        "We can continue the other conversation after this payout detail is clean.",
        "",
        networkPrompt(context.payment_currency),
      ].join("\n");
    }

    context.payment_network = network;
    await upsertSession(user, user.whatsapp_phone, flow, "payment_account_name", context);
    return accountNamePrompt(user, context);
  }

  if (step === "payment_account_name") {
    const accountName = parseAccountNameReply(text, user, context);
    if (!accountName) return accountNamePrompt(user, context);

    context.payment_account_name = accountName;
    context.payment_account_resolved = false;
    if (paymentMethodForCurrency(context.payment_currency) === "bank" && context.payment_account_number) {
      return promptPaymentProfileConfirmation(user, flow, context);
    }

    const nextStep = paymentMethodForCurrency(context.payment_currency) === "bank" ? "payment_account_number" : "payment_number";
    await upsertSession(user, user.whatsapp_phone, flow, nextStep, context);
    return paymentMethodForCurrency(context.payment_currency) === "bank"
      ? bankAccountNumberPrompt()
      : "What is the mobile money phone number?";
  }

  if (step === "payment_account_number" || step === "payment_number") {
    const number = normalizeShortText(text, 40);
    if (step === "payment_account_number") {
      const status = bankAccountNumberStatus(number);
      if (!status.valid) return bankAccountNumberPrompt(status);
      context.payment_account_number = status.digits;

      if (canResolveNgnAccounts(context) && context.payment_bank_code) {
        return resolveAndConfirmAccount(flow, user, context);
      }
    } else if (!number || !/\d{5,}/.test(number.replace(/\D/g, ""))) {
      return "Send a valid mobile money number.";
    }

    if (step === "payment_number") context.payment_number = number;
    return promptPaymentProfileConfirmation(user, flow, context);
  }

  return null;
}

async function handlePaymentProfile(text, user, session) {
  const context = session.context_json || {};
  const editReply = await maybeHandlePaymentEdit(text, user, session, context);
  if (editReply) return editReply;

  const stepReply = await handlePaymentSteps("payment_profile", text, user, session, context, {
    onDecline: async () => {
      await clearSession(user, user.whatsapp_phone);
      return [title("Payout not saved"), "", mainMenu()].join("\n");
    },
  });
  if (stepReply) return stepReply;

  await clearSession(user, user.whatsapp_phone);
  return "I reset payment setup. Type add payment to start again.";
}

module.exports = {
  paymentMethodForCurrency,
  paymentChoicePrompt,
  startPaymentProfileForCurrency,
  startPaymentProfileFlow,
  paymentEditMenuPrompt,
  paymentContextFromProfile,
  formatPayoutReview,
  maybeHandlePaymentEdit,
  handlePaymentSteps,
  handlePaymentProfile,
};
