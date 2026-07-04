const { supabaseRequest, filterValue, uploadSupabaseStorage } = require("../lib/supabase");
const { getWhatsAppMedia, mediaExtension } = require("../lib/whatsapp");
const { title, action, normalizeShortText } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { getUserById, updateUser, latestVerificationRequest } = require("../db/users");
const { upsertSession, clearSession } = require("../db/sessions");
const { mainMenu } = require("../messages/copy");
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
const CITY_PROMPT = "What city are you in? Example: Kigali.";
const ID_COUNTRY_PROMPT = "Which country issued your ID? Example: Nigeria, Rwanda.";
const DOCUMENT_LABEL = "a clear photo or PDF of the front/main page of your ID";
const SELFIE_PROMPT = [
  "Now send a clear selfie so admin can compare it with the document.",
  "Make sure your face is visible.",
].join("\n");
const MEDIA_RETRY_PROMPT = "I could not read that file. Please send it again as a clear photo or PDF.";
const PAYMENT_MORE_PROMPT = `Reply ${action("another")} to add one more payout method, or ${action("submit")} to send for review.`;

function idTypePrompt() {
  return [
    "What ID are you using?",
    "",
    "Reply with a number:",
    `1. ${action("passport")}`,
    `2. ${action("national id")}`,
    `3. ${action("residence permit")}`,
    `4. ${action("student id")}`,
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
  if (step === "city") return CITY_PROMPT;
  if (step === "id_type") return idTypePrompt();
  if (step === "id_country") return ID_COUNTRY_PROMPT;
  if (step === "document_front") return mediaPrompt(DOCUMENT_LABEL);
  if (step === "selfie") return SELFIE_PROMPT;
  if (step === "payment_more") return PAYMENT_MORE_PROMPT;
  if (step === "payment_confirm") return formatPayoutReview(context);
  if (String(step || "").startsWith("payment_")) return paymentStepPrompt(step, context);
  return "Type verify to continue verification.";
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

function normalizeIdType(input) {
  const value = compactText(input).replace(/[`'".!?]/g, "").trim().replace(/[\s-]+/g, "_");
  const aliases = {
    "1": "passport",
    passport: "passport",
    international_passport: "passport",
    travel_passport: "passport",
    "2": "national_id",
    national_id: "national_id",
    nin: "national_id",
    national_identity_number: "national_id",
    id_card: "national_id",
    identity_card: "national_id",
    national_id_card: "national_id",
    national_identity_card: "national_id",
    "3": "residence_permit",
    residence_permit: "residence_permit",
    resident_permit: "residence_permit",
    residency_permit: "residence_permit",
    permit: "residence_permit",
    "4": "student_id",
    student_id: "student_id",
    student_card: "student_id",
    school_id: "student_id",
  };

  return aliases[value] || null;
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
  const isTierOneReady = freshUser.verification_status === "verified_auto"
    || payouts.some((payout) => namesLikelyMatch(kycName, payout.account_name));

  await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: isTierOneReady ? "verified_auto" : "pending_review",
      automated_decision: isTierOneReady ? "tier_1_approved" : "manual_review",
      automated_reason: isTierOneReady
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
    await updateUser(user.id, { verification_status: "pending_review", verification_score: 50 });
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
    return mainMenu();
  }

  return [
    "Verification submitted ✅",
    "",
    "Your profile is waiting for admin review. Once approved, your Akara menu opens up.",
    "",
    "I’ll message you when it’s done.",
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

  if (String(text || "").trim() && isBareCommandWord(text)) {
    return [
      "One step at a time 🙂 Let's finish verification first.",
      "",
      verificationStepPrompt(step, context),
    ].join("\n");
  }

  const editReply = await maybeHandlePaymentEdit(text, user, session, context);
  if (editReply) return editReply;

  // "submit" while the payout menu is open (after at least one payout was
  // saved) completes the submission instead of re-showing currency options.
  if (step === "payment_currency" && Number(context.payment_count || 0) > 0
      && /\b(submit|done|finish|finished|complete|no more|that is all|thats all)\b/.test(compactText(text))) {
    return finishVerificationSubmission(user, requestId);
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

  if (step === "nationality") {
    const nationality = normalizeShortText(text, 60);
    if (!isValidPlaceName(nationality)) return "Send your nationality as a country name. Example: Nigeria.";

    context.nationality = nationality;
    await updateUser(user.id, { nationality });
    await upsertSession(user, user.whatsapp_phone, "verification", "residence_country", context);
    return RESIDENCE_PROMPT;
  }

  if (step === "residence_country") {
    const residenceCountry = normalizeShortText(text, 60);
    if (!isValidPlaceName(residenceCountry)) return "Send the country you live in as a name. Example: Rwanda.";

    context.residence_country = residenceCountry;
    await updateUser(user.id, { residence_country: residenceCountry });
    await upsertSession(user, user.whatsapp_phone, "verification", "city", context);
    return CITY_PROMPT;
  }

  if (step === "city") {
    const city = normalizeShortText(text, 60);
    if (!isValidPlaceName(city)) return "Send your city as a name. Example: Kigali.";

    context.city = city;
    await updateUser(user.id, { city });
    await upsertSession(user, user.whatsapp_phone, "verification", "id_type", context);
    return idTypePrompt();
  }

  if (step === "id_type") {
    const idType = normalizeIdType(text);
    if (!idType) {
      return [
        "That ID type is not on the list.",
        "",
        idTypePrompt(),
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
      return finishVerificationSubmission(user, requestId);
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
  verificationStepPrompt,
};
