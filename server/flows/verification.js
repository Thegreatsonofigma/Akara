const { supabaseRequest, filterValue, uploadSupabaseStorage } = require("../lib/supabase");
const { getWhatsAppMedia, mediaExtension } = require("../lib/whatsapp");
const { title, normalizeShortText } = require("../lib/format");
const { compactText } = require("../nlp/slang");
const { getUserById, updateUser, latestVerificationRequest } = require("../db/users");
const { upsertSession, clearSession } = require("../db/sessions");
const { mainMenu } = require("../messages/copy");
const {
  paymentChoicePrompt,
  maybeHandlePaymentEdit,
  handlePaymentSteps,
} = require("./payment-profile");

function normalizeIdType(input) {
  const value = String(input || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const aliases = {
    passport: "passport",
    international_passport: "passport",
    travel_passport: "passport",
    national_id: "national_id",
    nin: "national_id",
    national_identity_number: "national_id",
    residence_permit: "residence_permit",
    resident_permit: "residence_permit",
    student_id: "student_id",
  };

  return aliases[value] || null;
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

async function storeVerificationMedia(user, requestId, incoming, slot) {
  if (!incoming.media?.id) {
    return null;
  }

  const media = await getWhatsAppMedia(incoming.media.id);
  const extension = mediaExtension(media.contentType, incoming.media.filename);
  const objectPath = `${user.id}/${requestId}/${slot}-${Date.now()}.${extension}`;
  await uploadSupabaseStorage("verification-documents", objectPath, media.buffer, media.contentType);
  return objectPath;
}

async function startVerification(user) {
  const rows = await supabaseRequest("verification_requests", {
    method: "POST",
    body: JSON.stringify({
      user_id: user.id,
      status: "pending_input",
      automated_decision: "collecting",
      automated_reason: "Waiting for user to provide identity details and documents.",
    }),
  });

  await updateUser(user.id, { verification_status: "pending_input", verification_score: 10 });
  await upsertSession(user, user.whatsapp_phone, "verification", "legal_name", {
    request_id: rows[0].id,
  });

  return [
    "Let's verify your Akara profile.",
    "",
    "Send your full legal name exactly as it appears on your ID.",
    "",
    "Akara stores this for safety review. Do not send someone else's document.",
  ].join("\n");
}

async function finishVerificationSubmission(user, requestId) {
  const freshUser = await getUserById(user.id) || user;
  const isTierOneReady = freshUser.verification_status === "verified_auto" && Number(freshUser.verification_score || 0) >= 65;

  await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: isTierOneReady ? "verified_auto" : "pending_review",
      automated_decision: isTierOneReady ? "tier_1_approved" : "manual_review",
      automated_reason: isTierOneReady
        ? "Tier 1 auto-check passed because payout account name matches the submitted KYC name. Higher limits still require admin review."
        : "Identity documents and at least one payment profile collected. Admin review required.",
    }),
  });

  if (!isTierOneReady) {
    await updateUser(user.id, { verification_status: "pending_review", verification_score: 50 });
  }

  await clearSession(user, user.whatsapp_phone);
  if (isTierOneReady) {
    return [
      "Verification submitted ✅",
      "",
      "Tier 1 is active. Your payout name matches your KYC name, so you can start with smaller Akara trades while higher limits wait for review.",
      "",
      mainMenu(),
    ].join("\n");
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

  const editReply = await maybeHandlePaymentEdit(text, user, session, context);
  if (editReply) return editReply;

  const paymentStepReply = await handlePaymentSteps("verification", text, user, session, context, {
    onDecline: async () => {
      await upsertSession(user, user.whatsapp_phone, "verification", "payment_currency", context);
      return [
        title("Payout not saved"),
        "",
        "Choose a payout method when you are ready.",
        "",
        paymentChoicePrompt(),
      ].join("\n");
    },
  });
  if (paymentStepReply) return paymentStepReply;

  if (step === "legal_name") {
    const legalName = normalizeShortText(text, 120);
    if (!legalName || legalName.length < 3) return "Send your full legal name as shown on your ID.";

    context.legal_name = legalName;
    await updateUser(user.id, { legal_name: legalName });
    await upsertSession(user, user.whatsapp_phone, "verification", "nationality", context);
    return "What is your nationality? Example: Nigeria, Rwanda, Ghana.";
  }

  if (step === "nationality") {
    const nationality = normalizeShortText(text, 60);
    if (!nationality) return "Send your nationality. Example: Nigeria.";

    context.nationality = nationality;
    await updateUser(user.id, { nationality });
    await upsertSession(user, user.whatsapp_phone, "verification", "residence_country", context);
    return "What country do you currently live in? Example: Rwanda.";
  }

  if (step === "residence_country") {
    const residenceCountry = normalizeShortText(text, 60);
    if (!residenceCountry) return "Send your current country of residence. Example: Rwanda.";

    context.residence_country = residenceCountry;
    await updateUser(user.id, { residence_country: residenceCountry });
    await upsertSession(user, user.whatsapp_phone, "verification", "city", context);
    return "What city are you in? Example: Kigali.";
  }

  if (step === "city") {
    const city = normalizeShortText(text, 60);
    if (!city) return "Send your city. Example: Kigali.";

    context.city = city;
    await updateUser(user.id, { city });
    await upsertSession(user, user.whatsapp_phone, "verification", "id_type", context);
    return [
      "What ID are you using?",
      "",
      "Type one:",
      "passport",
      "national id",
      "residence permit",
      "student id",
    ].join("\n");
  }

  if (step === "id_type") {
    const idType = normalizeIdType(text);
    if (!idType) return "Type passport, national id, residence permit, or student id.";

    context.id_type = idType;
    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ id_type: idType }),
    });
    await upsertSession(user, user.whatsapp_phone, "verification", "id_country", context);
    return "Which country issued the ID? Example: Nigeria, Rwanda.";
  }

  if (step === "id_country") {
    const idCountry = normalizeShortText(text, 60);
    if (!idCountry) return "Send the country that issued the ID. Example: Nigeria.";

    context.id_country = idCountry;
    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ id_country: idCountry }),
    });
    await upsertSession(user, user.whatsapp_phone, "verification", "document_front", context);
    return mediaPrompt("a clear photo or PDF of the front/main page of your ID");
  }

  if (step === "document_front") {
    const documentPath = await storeVerificationMedia(user, requestId, incoming, "document-front");
    if (!documentPath) return mediaPrompt("the ID document photo/PDF");

    context.document_front_path = documentPath;
    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({ document_front_path: documentPath }),
    });
    await upsertSession(user, user.whatsapp_phone, "verification", "selfie", context);
    return [
      "ID received.",
      "",
      "Now send a clear selfie so admin can compare it with the document.",
      "Make sure your face is visible.",
    ].join("\n");
  }

  if (step === "selfie") {
    const selfiePath = await storeVerificationMedia(user, requestId, incoming, "selfie");
    if (!selfiePath) return mediaPrompt("a clear selfie");

    await supabaseRequest(`verification_requests?id=eq.${filterValue(requestId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        selfie_path: selfiePath,
        automated_decision: "collecting_payment",
        automated_reason: "Identity details, ID document, and selfie collected. Waiting for payment profile.",
      }),
    });
    await upsertSession(user, user.whatsapp_phone, "verification", "payment_currency", {
      ...context,
      selfie_path: selfiePath,
      payment_count: 0,
    });
    return [
      "Selfie received ✅",
      "",
      paymentChoicePrompt(),
    ].join("\n");
  }

  if (step === "payment_more") {
    const command = compactText(text);
    if (/\b(add|another|yes|more)\b/.test(command)) {
      await upsertSession(user, user.whatsapp_phone, "verification", "payment_currency", {
        request_id: requestId,
        payment_count: Number(context.payment_count || 1),
      });
      return paymentChoicePrompt();
    }

    if (/\b(submit|done|finish|no)\b/.test(command)) {
      return finishVerificationSubmission(user, requestId);
    }

    return "Reply another to add one more, or submit to send for review.";
  }

  await clearSession(user, user.whatsapp_phone);
  return "I reset verification. Type verify to start again.";
}

module.exports = {
  startVerification,
  handleVerification,
};
