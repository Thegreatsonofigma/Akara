const crypto = require("node:crypto");
const { config } = require("../config");
const { supabaseRequest, filterValue, uploadSupabaseStorage } = require("../lib/supabase");
const { getWhatsAppMedia, mediaExtension, sendWhatsAppList } = require("../lib/whatsapp");
const { title, caption, action, labeled, normalizeShortText } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { getUserById, updateUser, latestVerificationRequest } = require("../db/users");
const { getSession, upsertSession, clearSession } = require("../db/sessions");
const { mainMenu, mainMenuListPayload } = require("../messages/copy");
const { sendVerificationSuccessCard } = require("../lib/listing-card");
const {
  paymentChoicePrompt,
  paymentStepPrompt,
  formatPayoutReview,
  namesLikelyMatch,
  maybeHandlePaymentEdit,
  handlePaymentSteps,
} = require("./payment-profile");

// Every reply in this flow is predetermined copy. The model may classify a
// message (the router uses that to wall off outside requests), but nothing it
// writes is ever sent to the user or stored as an answer here.

const LEGAL_NAME_PROMPT = "Send your full legal name exactly as it appears on your ID.";
const NATIONALITY_PROMPT = "What is your nationality? Example: Nigeria, Rwanda, Ghana.";
const RESIDENCE_PROMPT = "What country do you currently live in? Example: Rwanda.";
const ID_COUNTRY_PROMPT = "Which country issued your ID? Example: Nigeria, Rwanda.";
const DOCUMENT_LABEL = "a clear photo or PDF of the front/main page of your ID";
const SELFIE_PROMPT = [
  "Now send a clear selfie so admin can compare it with the document.",
  "Make sure your face is visible.",
].join("\n");
const MEDIA_RETRY_PROMPT = "I could not read that file. Please send it again as a clear photo or PDF.";
const PAYMENT_MORE_PROMPT = `Reply ${action("another")} to add one more payout method, or ${action("submit")} to review and submit.`;
const VERIFICATION_FLOW_SCREEN = "KYC_DETAILS";
const COUNTRY_LABELS = {
  NG: "Nigeria",
  RW: "Rwanda",
  GH: "Ghana",
  KE: "Kenya",
  CM: "Cameroon",
  GA: "Gabon",
  OTHER: "Other",
};

const COUNTRY_CITY_EXAMPLES = {
  nigeria: ["Lagos", "Abuja"],
  rwanda: ["Kigali"],
  ghana: ["Accra", "Kumasi"],
  kenya: ["Nairobi", "Mombasa"],
  cameroon: ["Douala", "Yaounde"],
  gabon: ["Libreville"],
};

const ID_TYPE_LABELS = {
  passport: "passport",
  national_id: "national id",
  driver_license: "driver's licence",
  residence_permit: "residence permit",
  student_id: "student id",
};

const DEFAULT_ID_TYPES = ["passport", "national_id", "residence_permit", "student_id"];
const ID_TYPES_BY_COUNTRY = {
  nigeria: ["passport", "national_id", "driver_license", "student_id"],
  rwanda: ["passport", "national_id", "residence_permit", "student_id"],
  ghana: ["passport", "national_id", "driver_license", "student_id"],
  kenya: ["passport", "national_id", "driver_license", "student_id"],
  cameroon: ["passport", "national_id", "residence_permit", "student_id"],
  gabon: ["passport", "national_id", "residence_permit", "student_id"],
};

function countryKey(value) {
  const normalized = compactText(value).replace(/[^a-z]+/g, "");
  const aliases = {
    ng: "nigeria",
    nga: "nigeria",
    nigeria: "nigeria",
    rw: "rwanda",
    rwa: "rwanda",
    rwanda: "rwanda",
    gh: "ghana",
    gha: "ghana",
    ghana: "ghana",
    ke: "kenya",
    ken: "kenya",
    kenya: "kenya",
    cm: "cameroon",
    cmr: "cameroon",
    cameroon: "cameroon",
    ga: "gabon",
    gab: "gabon",
    gabon: "gabon",
  };
  return aliases[normalized] || normalized;
}

function cityPromptForCountry(country) {
  const examples = COUNTRY_CITY_EXAMPLES[countryKey(country)] || ["Lagos", "Kigali"];
  return `What city are you in? Example: ${examples.join(" or ")}.`;
}

function idTypeOptions(context = {}) {
  const key = countryKey(context.nationality || context.id_country || "");
  const options = ID_TYPES_BY_COUNTRY[key] || DEFAULT_ID_TYPES;
  return Array.from(new Set([...options, "student_id"]));
}

function idTypePrompt(context = {}) {
  const options = idTypeOptions(context);
  return [
    "What ID are you using?",
    "",
    "Reply with a number:",
    ...options.map((type, index) => `${index + 1}. ${action(ID_TYPE_LABELS[type])}`),
  ].join("\n");
}

function mediaPrompt(label) {
  return [
    `Please send ${label} now.`,
    "",
    "Accepted: clear photo or PDF.",
    "Make sure the name and document number are readable.",
    "Type cancel to stop.",
  ].join("\n");
}

// The predetermined prompt for whatever step the session is on, so walls and
// re-asks always end by repeating exactly what is needed next.
function verificationStepPrompt(step, context = {}) {
  if (step === "legal_name") return LEGAL_NAME_PROMPT;
  if (step === "nationality") return NATIONALITY_PROMPT;
  if (step === "residence_country") return RESIDENCE_PROMPT;
  if (step === "city") return cityPromptForCountry(context.residence_country);
  if (step === "id_type") return idTypePrompt(context);
  if (step === "id_country") return ID_COUNTRY_PROMPT;
  if (step === "document_front") return mediaPrompt(DOCUMENT_LABEL);
  if (step === "selfie") return SELFIE_PROMPT;
  if (step === "review_submission") return verificationReviewPrompt();
  if (step === "review_edit_menu") return verificationReviewEditPrompt();
  if (String(step || "").startsWith("review_edit_")) return verificationReviewEditStepPrompt(step, context);
  if (step === "payment_more") return PAYMENT_MORE_PROMPT;
  if (step === "payment_confirm") return formatPayoutReview(context);
  if (String(step || "").startsWith("payment_")) return paymentStepPrompt(step, context);
  return "Use the Start verification button to continue verification.";
}

// Bare commands must never be stored as somebody's name or nationality; the
// step is asked again instead.
const COMMAND_WORDS = new Set([
  "menu", "help", "verify", "verify me", "start", "settings", "profile", "status",
  "hi", "hello", "hey", "yo", "ok", "okay", "sure",
]);

function isBareCommandWord(text) {
  return COMMAND_WORDS.has(compactText(text));
}

function isValidPersonName(value) {
  if (!value || value.length < 5 || /\d/.test(value)) return false;
  const words = value.split(/\s+/).filter((word) => /[a-z]{2,}/i.test(word));
  return words.length >= 2;
}

function isValidPlaceName(value) {
  if (!value || /\d/.test(value)) return false;
  return /[a-z]{2,}/i.test(value);
}

function normalizeIdType(input, context = {}) {
  const value = compactText(input).replace(/[`'".!?]/g, "").trim().replace(/[\s-]+/g, "_");
  const options = idTypeOptions(context);
  if (/^\d+$/.test(value)) return options[Number(value) - 1] || null;

  const aliases = {
    passport: "passport",
    international_passport: "passport",
    travel_passport: "passport",
    national_id: "national_id",
    nin: "national_id",
    national_identity_number: "national_id",
    id_card: "national_id",
    identity_card: "national_id",
    national_id_card: "national_id",
    national_identity_card: "national_id",
    driver_license: "driver_license",
    drivers_license: "driver_license",
    driving_license: "driver_license",
    license: "driver_license",
    driver_licence: "driver_license",
    drivers_licence: "driver_license",
    driving_licence: "driver_license",
    licence: "driver_license",
    residence_permit: "residence_permit",
    resident_permit: "residence_permit",
    residency_permit: "residence_permit",
    permit: "residence_permit",
    student_id: "student_id",
    student_card: "student_id",
    school_id: "student_id",
  };

  const mapped = aliases[value] || null;
  return mapped && options.includes(mapped) ? mapped : null;
}

function flowValue(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    return String(value.id || value.title || value.value || value.label || "").trim();
  }
  return String(value).trim();
}

function countryFromFlow(value) {
  const raw = flowValue(value);
  if (!raw) return "";
  const upper = raw.toUpperCase();
  return COUNTRY_LABELS[upper] || normalizeShortText(raw, 60);
}

function hashIdNumber(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!normalized) return "";
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function normalizeIdentitySignal(value) {
  return compactText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCountrySignal(value) {
  return normalizeIdentitySignal(value).replace(/\s+/g, "");
}

function countrySignalsForUser(user) {
  return [
    normalizeCountrySignal(user?.nationality),
    normalizeCountrySignal(user?.residence_country),
  ].filter(Boolean);
}

function countriesOverlapForDuplicateReview(firstUser, secondUser) {
  const first = new Set(countrySignalsForUser(firstUser));
  const second = countrySignalsForUser(secondUser);
  return first.size > 0 && second.length > 0 && second.some((country) => first.has(country));
}

function payoutDetailRefs(profile) {
  const refs = [];
  const accountNumber = String(profile?.account_number_encrypted || "").replace(/\D/g, "");
  const momoNumber = String(profile?.momo_number_encrypted || "").replace(/\D/g, "");

  if (accountNumber.length >= 6) refs.push(`bank:${accountNumber}`);
  if (momoNumber.length >= 6) refs.push(`momo:${momoNumber}`);
  return refs;
}

async function duplicateVerificationSignals(user, payouts) {
  const signals = [];
  const legalName = normalizeIdentitySignal(user?.legal_name);

  if (legalName.length >= 8) {
    const users = await supabaseRequest("users?select=id,legal_name,nationality,residence_country&limit=1000");
    const duplicateIdentity = users.find((row) =>
      row.id !== user.id
      && normalizeIdentitySignal(row.legal_name) === legalName
      && countriesOverlapForDuplicateReview(row, user)
    );
    if (duplicateIdentity) signals.push("same verified legal identity already exists on Akara");
  }

  const ownPayoutRefs = new Set(payouts.flatMap(payoutDetailRefs));
  if (ownPayoutRefs.size) {
    const profiles = await supabaseRequest(
      "payment_profiles?select=id,user_id,currency,account_number_encrypted,momo_number_encrypted&limit=1000"
    );
    const duplicatePayout = profiles.find((profile) =>
      profile.user_id !== user.id
      && payoutDetailRefs(profile).some((ref) => ownPayoutRefs.has(ref))
    );
    if (duplicatePayout) signals.push("same payout account already exists on another Akara profile");
  }

  return Array.from(new Set(signals));
}

function verificationFlowToken(incoming = {}) {
  const response = incoming.flowResponse || {};
  return String(
    response.verification_token ||
    response.flow_token ||
    response.token ||
    incoming.flowToken ||
    ""
  ).trim();
}

function isVerificationFlowResponse(incoming = {}) {
  const response = incoming.flowResponse || {};
  return response.mode === "verification" ||
    Boolean(response.verification_token) ||
    Boolean(response.legal_name && response.id_type && response.id_number);
}

function verificationFlowPrompt(token) {
  return {
    type: "whatsapp_flow",
    fallbackText: [
      "Let's verify your Akara profile.",
      "",
      LEGAL_NAME_PROMPT,
      "",
      "If the verification tray does not open, reply with your legal name to continue in chat.",
    ].join("\n"),
    flow: {
      flowId: config.akaraVerificationFlowId,
      flowToken: token,
      screen: VERIFICATION_FLOW_SCREEN,
      button: "Start verification",
      body: "Let's collect your verification details in one clean step. Your ID photo and selfie still happen here in chat after this.",
      data: {
        mode: "verification",
        verification_token: token,
      },
    },
  };
}

// Downloads and stores an uploaded document. A download or upload failure is
// reported back as `failed` so the step can re-prompt instead of crashing the
// webhook mid-verification.
async function storeVerificationMedia(user, requestId, incoming, slot) {
  if (!incoming.media?.id) return { path: null, failed: false };

  try {
    const media = await getWhatsAppMedia(incoming.media.id);
    const extension = mediaExtension(media.contentType, incoming.media.filename);
    const objectPath = `${user.id}/${requestId}/${slot}-${Date.now()}.${extension}`;
    await uploadSupabaseStorage("verification-documents", objectPath, media.buffer, media.contentType);
    return { path: objectPath, failed: false };
  } catch (error) {
    console.error(`[verification] media store failed for ${user.id}: ${error.message}`);
    return { path: null, failed: true };
  }
}

function idTypeLabel(idType) {
  const labels = {
    passport: "Passport",
    national_id: "National ID",
    residence_permit: "Residence permit",
    student_id: "Student ID",
  };
  return labels[idType] || idType || "Missing";
}

function presentOrMissing(value) {
  return value || "Missing";
}

function mediaStatus(path) {
  return path ? "Received" : "Missing";
}

function payoutSummaryLine(payout, index) {
  const currency = payout.currency || "Currency";
  if (payout.method === "bank") {
    return [
      `${index + 1}. ${title(`${currency} bank account`)}`,
      labeled("Bank", presentOrMissing(payout.bank_name)),
      labeled("Name", presentOrMissing(payout.account_name)),
      labeled("Account", presentOrMissing(payout.account_number_encrypted)),
    ].join("\n");
  }

  return [
    `${index + 1}. ${title(`${currency} mobile money`)}`,
    labeled("Network", presentOrMissing(payout.momo_network)),
    labeled("Name", presentOrMissing(payout.account_name)),
    labeled("Number", presentOrMissing(payout.momo_number_encrypted)),
  ].join("\n");
}

async function verificationReviewData(user, requestId) {
  const [freshUser, requestRows, payouts] = await Promise.all([
    getUserById(user.id),
    supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}&limit=1`),
    supabaseRequest(
      [
        "payment_profiles?select=id,currency,method,account_name,bank_name,account_number_encrypted,momo_network,momo_number_encrypted,is_default,created_at",
        `user_id=eq.${filterValue(user.id)}`,
        "order=is_default.desc,created_at.desc",
        "limit=20",
      ].join("&")
    ),
  ]);

  return {
    user: freshUser || user,
    request: requestRows[0] || {},
    payouts,
  };
}

function verificationReviewPrompt() {
  return [
    title("Review verification"),
    caption("Check everything before Akara submits it."),
    "",
    `${action("submit")} if everything is correct`,
    `${action("edit")} to correct something`,
    `${action("cancel")} to pause`,
  ].join("\n");
}

function formatVerificationReview(freshUser, request = {}, payouts = []) {
  const payoutLines = payouts.length
    ? payouts.map(payoutSummaryLine).join("\n\n")
    : "No payout method saved yet.";

  return [
    title("Review verification"),
    caption("Check everything before Akara submits it."),
    "",
    title("Identity"),
    labeled("Legal name", presentOrMissing(freshUser.legal_name || request.extracted_name)),
    labeled("Nationality", presentOrMissing(freshUser.nationality)),
    labeled("Residence", presentOrMissing(freshUser.residence_country)),
    labeled("City", presentOrMissing(freshUser.city)),
    labeled("ID type", idTypeLabel(request.id_type)),
    labeled("ID issued by", presentOrMissing(request.id_country)),
    "",
    title("Documents"),
    labeled("ID document", mediaStatus(request.document_front_path)),
    labeled("Selfie", mediaStatus(request.selfie_path)),
    "",
    title("Payout details"),
    payoutLines,
    "",
    title("Actions"),
    `${action("submit")} if everything is correct`,
    `${action("edit")} to correct something`,
    `${action("cancel")} to pause`,
  ].join("\n");
}

async function showVerificationReview(user, requestId) {
  const { user: freshUser, request, payouts } = await verificationReviewData(user, requestId);
  await upsertSession(user, user.whatsapp_phone, "verification", "review_submission", {
    request_id: requestId,
    payment_count: payouts.length,
  });
  return formatVerificationReview(freshUser, request, payouts);
}

function verificationReviewEditPrompt() {
  return [
    title("What should I correct?"),
    caption("Reply with a number or the detail name."),
    "",
    `1. ${action("legal name")}`,
    `2. ${action("nationality")}`,
    `3. ${action("residence")}`,
    `4. ${action("city")}`,
    `5. ${action("id type")}`,
    `6. ${action("id country")}`,
    `7. ${action("id document")}`,
    `8. ${action("selfie")}`,
    `9. ${action("payout")}`,
    "",
    `${action("submit")} if everything is already correct`,
  ].join("\n");
}

function verificationReviewEditStepPrompt(step, context = {}) {
  const prompts = {
    review_edit_legal_name: LEGAL_NAME_PROMPT,
    review_edit_nationality: NATIONALITY_PROMPT,
    review_edit_residence_country: RESIDENCE_PROMPT,
    review_edit_city: cityPromptForCountry(context.residence_country),
    review_edit_id_type: idTypePrompt(context),
    review_edit_id_country: ID_COUNTRY_PROMPT,
    review_edit_document_front: mediaPrompt(DOCUMENT_LABEL),
    review_edit_selfie: SELFIE_PROMPT,
  };
  return prompts[step] || verificationReviewEditPrompt();
}

function verificationReviewEditStep(text) {
  const command = compactText(text);
  if (/^(1|legal name|name|full name)$/.test(command) || /\blegal name\b/.test(command)) return "review_edit_legal_name";
  if (/^(2|nationality|country of origin)$/.test(command) || /\bnationality\b/.test(command)) return "review_edit_nationality";
  if (/^(3|residence|country|country of residence|where i live)$/.test(command) || /\b(residence|live in)\b/.test(command)) return "review_edit_residence_country";
  if (/^(4|city|location)$/.test(command) || /\bcity\b/.test(command)) return "review_edit_city";
  if (/^(5|id type|document type)$/.test(command) || /\b(id|document) type\b/.test(command)) return "review_edit_id_type";
  if (/^(6|id country|issuing country|issued by)$/.test(command) || /\b(issuing country|id country|issued by)\b/.test(command)) return "review_edit_id_country";
  if (/^(7|id document|document|id photo|id file)$/.test(command) || /\b(id document|document|id photo)\b/.test(command)) return "review_edit_document_front";
  if (/^(8|selfie|face|face photo)$/.test(command) || /\b(selfie|face photo)\b/.test(command)) return "review_edit_selfie";
  if (/^(9|payout|payout detail|payment|bank|momo|mobile money|account)$/.test(command)
      || /\b(payout|payment|bank|momo|mobile money|account)\b/.test(command)) return "payment_currency";
  return null;
}

function isSubmitVerificationIntent(text) {
  return /\b(submit|send|continue|confirm|finish|finished|complete|looks good|correct|go ahead|done)\b/.test(compactText(text));
}

async function startVerification(user) {
  // Re-running verify must never open a second request: reuse the request
  // that is still collecting input (e.g. after a cancel) and start over.
  const existing = await latestVerificationRequest(user.id);
  let requestId = existing && existing.status === "pending_input" ? existing.id : null;

  if (requestId) {
    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        automated_decision: "collecting",
        automated_reason: "Waiting for user to provide identity details and documents.",
      }),
    });
  } else {
    const rows = await supabaseRequest("verification_requests", {
      method: "POST",
      body: JSON.stringify({
        user_id: user.id,
        status: "pending_input",
        automated_decision: "collecting",
        automated_reason: "Waiting for user to provide identity details and documents.",
      }),
    });
    requestId = rows[0].id;
  }

  await updateUser(user.id, { verification_status: "pending_input", verification_score: 10 });

  if (config.akaraVerificationFlowId) {
    const token = crypto.randomBytes(18).toString("base64url");
    await upsertSession(user, user.whatsapp_phone, "verification", "flow_details", {
      request_id: requestId,
      verification_flow_token: token,
    });
    return verificationFlowPrompt(token);
  }

  await upsertSession(user, user.whatsapp_phone, "verification", "legal_name", {
    request_id: requestId,
  });

  return [
    "Let's verify your Akara profile.",
    "",
    LEGAL_NAME_PROMPT,
    "",
    "Akara stores this for safety review. Do not send someone else's document.",
  ].join("\n");
}

// A verification is only complete when the identity documents AND at least
// one payout detail are all in. A missing piece routes the user back to that
// step instead of submitting a hollow request.
async function finishVerificationSubmission(user, requestId) {
  const freshUser = await getUserById(user.id) || user;
  const requestRows = await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}&limit=1`);
  const request = requestRows[0] || {};
  const payouts = await supabaseRequest(`payment_profiles?user_id=eq.${filterValue(user.id)}`);
  const resumeContext = { request_id: requestId, payment_count: payouts.length };

  if (!request.document_front_path) {
    await upsertSession(user, user.whatsapp_phone, "verification", "document_front", resumeContext);
    return [
      "Almost there — I still need your ID document.",
      "",
      mediaPrompt(DOCUMENT_LABEL),
    ].join("\n");
  }

  if (!request.selfie_path) {
    await upsertSession(user, user.whatsapp_phone, "verification", "selfie", resumeContext);
    return [
      "Almost there — I still need your selfie.",
      "",
      SELFIE_PROMPT,
    ].join("\n");
  }

  if (!payouts.length) {
    await upsertSession(user, user.whatsapp_phone, "verification", "payment_currency", resumeContext);
    return [
      "Almost there — Akara needs at least one payout method before review.",
      "",
      paymentChoicePrompt(),
    ].join("\n");
  }

  const kycName = freshUser.legal_name || request.extracted_name || "";
  const duplicateSignals = await duplicateVerificationSignals(freshUser, payouts);
  const hasDuplicateRisk = duplicateSignals.length > 0;
  const isTierOneReady = !hasDuplicateRisk && (freshUser.verification_status === "verified_auto"
    || payouts.some((payout) => namesLikelyMatch(kycName, payout.account_name)));

  await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: isTierOneReady ? "verified_auto" : "pending_review",
      automated_decision: isTierOneReady ? "tier_1_approved" : "manual_review",
      automated_reason: hasDuplicateRisk
        ? `Manual review needed because ${duplicateSignals.join("; ")}.`
        : isTierOneReady
        ? "Tier 1 auto-check passed because ID document, selfie, legal name, and payout account name were collected and matched against available profile signals."
        : "Identity documents and at least one payment profile collected, but one or more auto-check signals need admin review.",
    }),
  });

  if (isTierOneReady && freshUser.verification_status !== "verified_manual") {
    await updateUser(user.id, {
      verification_status: "verified_auto",
      verification_score: Math.max(Number(freshUser.verification_score || 0), 65),
    });
  }

  if (!isTierOneReady && freshUser.verification_status !== "verified_manual") {
    await updateUser(user.id, {
      verification_status: "pending_review",
      verification_score: 50,
      risk_status: hasDuplicateRisk ? "watch" : freshUser.risk_status || "normal",
    });
  }

  await clearSession(user, user.whatsapp_phone);

  if (isTierOneReady) {
    const successCaption = [
      title("Verified"),
      "",
      "Your ID, selfie, and payout name checks passed.",
      "",
      "You can now see offers, create listings, open Akara Trades, and manage payout details.",
    ].join("\n");
    await sendVerificationSuccessCard(user.whatsapp_phone, successCaption).catch((error) => {
      console.error(`[verification] success card failed for ${user.whatsapp_phone}: ${error.message}`);
    });
    try {
      await sendWhatsAppList(user.whatsapp_phone, mainMenuListPayload(mainMenu()));
      return null;
    } catch (error) {
      console.error(`[verification] menu list failed for ${user.whatsapp_phone}: ${error.message}`);
      return mainMenu();
    }
  }

  return [
    "Verification submitted ✅",
    "",
    "Your profile is waiting for admin review. Once approved, your menu opens up.",
    "",
    "I’ll message you when it’s done.",
  ].join("\n");
}

async function handleVerificationFlowResponse(incoming, user) {
  if (!isVerificationFlowResponse(incoming)) return undefined;

  const response = incoming.flowResponse || {};
  const session = await getSession(user.whatsapp_phone);
  const context = session?.context_json || {};
  const token = verificationFlowToken(incoming);

  if (context.verification_flow_token && token && context.verification_flow_token !== token) {
    return [
      title("Verification tray expired"),
      "",
      "Please start verification again so Akara can collect fresh details.",
    ].join("\n");
  }

  let requestId = context.request_id;
  if (!requestId) {
    const request = await latestVerificationRequest(user.id);
    requestId = request?.id;
  }

  if (!requestId) return startVerification(user);

  const legalName = normalizeShortText(flowValue(response.legal_name), 120);
  const nationality = countryFromFlow(response.nationality);
  const residenceCountry = countryFromFlow(response.residence_country);
  const city = normalizeShortText(flowValue(response.city), 60);
  const idType = normalizeIdType(flowValue(response.id_type), { nationality, residence_country: residenceCountry });
  const idCountry = countryFromFlow(response.id_country);
  const idNumber = normalizeShortText(flowValue(response.id_number), 80);

  if (!isValidPersonName(legalName) || !isValidPlaceName(nationality)
      || !isValidPlaceName(residenceCountry) || !isValidPlaceName(city)
      || !idType || !isValidPlaceName(idCountry) || idNumber.length < 4) {
    await upsertSession(user, user.whatsapp_phone, "verification", "flow_details", {
      ...context,
      request_id: requestId,
      verification_flow_token: token || context.verification_flow_token,
    });
    return [
      title("Check your details"),
      "",
      "Some verification details were missing or too short.",
      "",
      "Tap the verification button again and submit the full form.",
    ].join("\n");
  }

  await updateUser(user.id, {
    legal_name: legalName,
    nationality,
    residence_country: residenceCountry,
    city,
  });

  await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      id_type: idType,
      id_country: idCountry,
      extracted_id_hash: hashIdNumber(idNumber),
      automated_decision: "collecting_documents",
      automated_reason: "Identity text details were submitted through the WhatsApp verification Flow. Waiting for ID document and selfie uploads in chat.",
    }),
  });

  await upsertSession(user, user.whatsapp_phone, "verification", "document_front", {
    request_id: requestId,
    legal_name: legalName,
    nationality,
    residence_country: residenceCountry,
    city,
    id_type: idType,
    id_country: idCountry,
    id_number_last4: idNumber.slice(-4),
  });

  return [
    title("Details received"),
    "",
    "Now send your ID document here in chat.",
    "",
    mediaPrompt(DOCUMENT_LABEL),
  ].join("\n");
}

async function handleVerification(text, user, session, incoming = {}) {
  const context = session.context_json || {};
  const step = session.current_step;
  let requestId = context.request_id;

  if (!requestId) {
    const request = await latestVerificationRequest(user.id);
    requestId = request?.id;
    context.request_id = requestId;
  }

  if (!requestId) return startVerification(user);

  if (step === "flow_details") {
    if (String(text || "").trim()) {
      const fallbackContext = { request_id: requestId };
      await upsertSession(user, user.whatsapp_phone, "verification", "legal_name", fallbackContext);
      return handleVerification(text, user, {
        ...session,
        current_step: "legal_name",
        context_json: fallbackContext,
      }, incoming);
    }

    if (config.akaraVerificationFlowId) {
      const token = context.verification_flow_token || crypto.randomBytes(18).toString("base64url");
      await upsertSession(user, user.whatsapp_phone, "verification", "flow_details", {
        request_id: requestId,
        verification_flow_token: token,
      });
      return verificationFlowPrompt(token);
    }
  }

  if (String(text || "").trim() && isBareCommandWord(text)) {
    return [
      "One step at a time 🙂 Let's finish verification first.",
      "",
      verificationStepPrompt(step, context),
    ].join("\n");
  }

  if (step === "review_submission") {
    const command = compactText(text);

    if (isSubmitVerificationIntent(command)) {
      return finishVerificationSubmission(user, requestId);
    }

    if (/\b(edit|update|change|correct|fix)\b/.test(command)) {
      const directStep = verificationReviewEditStep(command);
      if (directStep === "payment_currency") {
        await upsertSession(user, user.whatsapp_phone, "verification", "payment_currency", {
          request_id: requestId,
          payment_count: Number(context.payment_count || 0),
          return_to_review: true,
        });
        return [
          title("Add corrected payout"),
          caption("Saved payout details stay locked until verification is submitted, but you can add a corrected payout now."),
          "",
          paymentChoicePrompt(),
        ].join("\n");
      }

      if (directStep) {
        await upsertSession(user, user.whatsapp_phone, "verification", directStep, {
          request_id: requestId,
          payment_count: Number(context.payment_count || 0),
          return_to_review: true,
        });
        return verificationReviewEditStepPrompt(directStep, context);
      }

      await upsertSession(user, user.whatsapp_phone, "verification", "review_edit_menu", {
        request_id: requestId,
        payment_count: Number(context.payment_count || 0),
      });
      return verificationReviewEditPrompt();
    }

    if (/\b(cancel|stop|pause|later|not now)\b/.test(command)) {
      await upsertSession(user, user.whatsapp_phone, "verification", "review_submission", {
        request_id: requestId,
        payment_count: Number(context.payment_count || 0),
      });
      return [
        title("Verification paused"),
        "",
        "Your details are saved. Reply submit when you are ready, or edit to correct something first.",
      ].join("\n");
    }

    return verificationReviewPrompt();
  }

  if (step === "review_edit_menu") {
    if (isSubmitVerificationIntent(text)) return finishVerificationSubmission(user, requestId);

    const nextStep = verificationReviewEditStep(text);
    if (!nextStep) return verificationReviewEditPrompt();

    if (nextStep === "payment_currency") {
      await upsertSession(user, user.whatsapp_phone, "verification", "payment_currency", {
        request_id: requestId,
        payment_count: Number(context.payment_count || 0),
        return_to_review: true,
      });
      return [
        title("Add corrected payout"),
        caption("Saved payout details stay locked until verification is submitted, but you can add a corrected payout now."),
        "",
        paymentChoicePrompt(),
      ].join("\n");
    }

    await upsertSession(user, user.whatsapp_phone, "verification", nextStep, {
      request_id: requestId,
      payment_count: Number(context.payment_count || 0),
      return_to_review: true,
    });
    return verificationReviewEditStepPrompt(nextStep, context);
  }

  const editReply = await maybeHandlePaymentEdit(text, user, session, context);
  if (editReply) return editReply;

  // "submit" while the payout menu is open (after at least one payout was
  // saved) completes the submission instead of re-showing currency options.
  if (step === "payment_currency" && Number(context.payment_count || 0) > 0
      && /\b(submit|done|finish|finished|complete|no more|that is all|thats all)\b/.test(compactText(text))) {
    return showVerificationReview(user, requestId);
  }

  const paymentStepReply = await handlePaymentSteps("verification", text, user, session, context, {
    onDecline: async () => {
      const paymentCount = Number(context.payment_count || 0);
      const cleanContext = { request_id: requestId, payment_count: paymentCount };

      if (paymentCount > 0) {
        await upsertSession(user, user.whatsapp_phone, "verification", "payment_more", cleanContext);
        return [
          title("Payout not saved"),
          "",
          PAYMENT_MORE_PROMPT,
        ].join("\n");
      }

      await upsertSession(user, user.whatsapp_phone, "verification", "payment_currency", cleanContext);
      return [
        title("Payout not saved"),
        "",
        "Akara needs at least one payout method to finish verification.",
        "",
        paymentChoicePrompt(),
      ].join("\n");
    },
  });
  if (paymentStepReply) return paymentStepReply;

  if (step === "legal_name") {
    const legalName = normalizeShortText(text, 120);
    if (!isValidPersonName(legalName)) {
      return [
        "That does not look like a full legal name.",
        "",
        "Send your first and last name exactly as they appear on your ID.",
        "Example: Amina Yusuf",
      ].join("\n");
    }

    context.legal_name = legalName;
    await updateUser(user.id, { legal_name: legalName });
    await upsertSession(user, user.whatsapp_phone, "verification", "nationality", context);
    return NATIONALITY_PROMPT;
  }

  if (step === "review_edit_legal_name") {
    const legalName = normalizeShortText(text, 120);
    if (!isValidPersonName(legalName)) {
      return [
        "That does not look like a full legal name.",
        "",
        "Send your first and last name exactly as they appear on your ID.",
      ].join("\n");
    }

    await updateUser(user.id, { legal_name: legalName });
    return showVerificationReview(user, requestId);
  }

  if (step === "nationality") {
    const nationality = normalizeShortText(text, 60);
    if (!isValidPlaceName(nationality)) return "Send your nationality as a country name. Example: Nigeria.";

    context.nationality = nationality;
    await updateUser(user.id, { nationality });
    await upsertSession(user, user.whatsapp_phone, "verification", "residence_country", context);
    return RESIDENCE_PROMPT;
  }

  if (step === "review_edit_nationality") {
    const nationality = normalizeShortText(text, 60);
    if (!isValidPlaceName(nationality)) return "Send your nationality as a country name. Example: Nigeria.";

    await updateUser(user.id, { nationality });
    return showVerificationReview(user, requestId);
  }

  if (step === "residence_country") {
    const residenceCountry = normalizeShortText(text, 60);
    if (!isValidPlaceName(residenceCountry)) return "Send the country you live in as a name. Example: Rwanda.";

    context.residence_country = residenceCountry;
    await updateUser(user.id, { residence_country: residenceCountry });
    await upsertSession(user, user.whatsapp_phone, "verification", "city", context);
    return cityPromptForCountry(residenceCountry);
  }

  if (step === "review_edit_residence_country") {
    const residenceCountry = normalizeShortText(text, 60);
    if (!isValidPlaceName(residenceCountry)) return "Send the country you live in as a name. Example: Rwanda.";

    await updateUser(user.id, { residence_country: residenceCountry });
    return showVerificationReview(user, requestId);
  }

  if (step === "city") {
    const city = normalizeShortText(text, 60);
    if (!isValidPlaceName(city)) return `Send your city as a name. ${cityPromptForCountry(context.residence_country)}`;

    context.city = city;
    await updateUser(user.id, { city });
    await upsertSession(user, user.whatsapp_phone, "verification", "id_type", context);
    return idTypePrompt(context);
  }

  if (step === "review_edit_city") {
    const city = normalizeShortText(text, 60);
    if (!isValidPlaceName(city)) return `Send your city as a name. ${cityPromptForCountry(context.residence_country)}`;

    await updateUser(user.id, { city });
    return showVerificationReview(user, requestId);
  }

  if (step === "id_type") {
    const idType = normalizeIdType(text, context);
    if (!idType) {
      return [
        "That ID type is not on the list.",
        "",
        idTypePrompt(context),
      ].join("\n");
    }

    context.id_type = idType;
    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ id_type: idType }),
    });
    await upsertSession(user, user.whatsapp_phone, "verification", "id_country", context);
    return ID_COUNTRY_PROMPT;
  }

  if (step === "review_edit_id_type") {
    const idType = normalizeIdType(text, context);
    if (!idType) {
      return [
        "That ID type is not on the list.",
        "",
        idTypePrompt(context),
      ].join("\n");
    }

    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ id_type: idType }),
    });
    return showVerificationReview(user, requestId);
  }

  if (step === "id_country") {
    const idCountry = normalizeShortText(text, 60);
    if (!isValidPlaceName(idCountry)) return "Send the country that issued your ID as a name. Example: Nigeria.";

    context.id_country = idCountry;
    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ id_country: idCountry }),
    });
    await upsertSession(user, user.whatsapp_phone, "verification", "document_front", context);
    return mediaPrompt(DOCUMENT_LABEL);
  }

  if (step === "review_edit_id_country") {
    const idCountry = normalizeShortText(text, 60);
    if (!isValidPlaceName(idCountry)) return "Send the country that issued your ID as a name. Example: Nigeria.";

    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ id_country: idCountry }),
    });
    return showVerificationReview(user, requestId);
  }

  if (step === "document_front") {
    const stored = await storeVerificationMedia(user, requestId, incoming, "document-front");
    if (stored.failed) return MEDIA_RETRY_PROMPT;
    if (!stored.path) return mediaPrompt(DOCUMENT_LABEL);

    context.document_front_path = stored.path;
    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ document_front_path: stored.path }),
    });
    await upsertSession(user, user.whatsapp_phone, "verification", "selfie", context);
    return [
      "ID received.",
      "",
      SELFIE_PROMPT,
    ].join("\n");
  }

  if (step === "review_edit_document_front") {
    const stored = await storeVerificationMedia(user, requestId, incoming, "document-front");
    if (stored.failed) return MEDIA_RETRY_PROMPT;
    if (!stored.path) return mediaPrompt(DOCUMENT_LABEL);

    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ document_front_path: stored.path }),
    });
    return showVerificationReview(user, requestId);
  }

  if (step === "selfie") {
    const stored = await storeVerificationMedia(user, requestId, incoming, "selfie");
    if (stored.failed) return MEDIA_RETRY_PROMPT;
    if (!stored.path) return mediaPrompt("a clear selfie");

    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        selfie_path: stored.path,
        automated_decision: "collecting_payment",
        automated_reason: "Identity details, ID document, and selfie collected. Waiting for payment profile.",
      }),
    });
    await upsertSession(user, user.whatsapp_phone, "verification", "payment_currency", {
      ...context,
      selfie_path: stored.path,
      payment_count: Number(context.payment_count || 0),
    });
    return [
      "Selfie received ✅",
      "",
      paymentChoicePrompt(),
    ].join("\n");
  }

  if (step === "review_edit_selfie") {
    const stored = await storeVerificationMedia(user, requestId, incoming, "selfie");
    if (stored.failed) return MEDIA_RETRY_PROMPT;
    if (!stored.path) return mediaPrompt("a clear selfie");

    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ selfie_path: stored.path }),
    });
    return showVerificationReview(user, requestId);
  }

  if (step === "payment_more") {
    const command = compactText(text);
    if (/\b(edit|update|change|correct|fix)\b.*\b(payout|payment|bank|momo|mobile money|account|details?)\b/.test(command)) {
      return [
        title("Payout already saved"),
        "",
        "For verification, saved payout details stay locked until your profile is approved.",
        "",
        `${action("another")} to add a different payout method`,
        `${action("submit")} to finish verification`,
      ].join("\n");
    }

    const wantsAnother = /\b(add|another)\b/.test(command);

    if (!wantsAnother && /\b(submit|done|finish|finished|complete|review|no|nope|nothing)\b/.test(command)) {
      return showVerificationReview(user, requestId);
    }

    if (wantsAnother || /\b(yes|more)\b/.test(command)) {
      await upsertSession(user, user.whatsapp_phone, "verification", "payment_currency", {
        request_id: requestId,
        payment_count: Number(context.payment_count || 1),
      });
      return paymentChoicePrompt();
    }

    return PAYMENT_MORE_PROMPT;
  }

  // Stale or unknown step: restart cleanly, reusing the open request.
  return startVerification(user);
}

module.exports = {
  startVerification,
  handleVerification,
  handleVerificationFlowResponse,
  verificationStepPrompt,
};
