const { getPublicUrl } = require("../config");
const { supabaseRequest, filterValue, uploadSupabaseStorage, createStorageSignedUrl } = require("./supabase");
const { getWhatsAppMedia, uploadWhatsAppMedia, sendWhatsAppMedia, mediaExtension } = require("./whatsapp");
const { textResponse } = require("./http");
const { getUserById } = require("../db/users");

// Short receipt tokens live in memory: they map an 8-char prefix to the full
// proof id so receipt links stay short. Falls back to a prefix scan after a
// restart.
const receiptShortIds = new Map();

async function storeDealProof(user, dealId, incoming) {
  if (!incoming.media?.id) return null;

  const media = await getWhatsAppMedia(incoming.media.id);
  const extension = mediaExtension(media.contentType, incoming.media.filename);
  const filename = incoming.media.filename || `akara-receipt-${Date.now()}.${extension}`;
  const objectPath = `${dealId}/${user.id}/receipt-${Date.now()}.${extension}`;
  await uploadSupabaseStorage("deal-proofs", objectPath, media.buffer, media.contentType);
  let whatsappMediaId = null;
  try {
    whatsappMediaId = await uploadWhatsAppMedia(media.buffer, media.contentType, filename);
  } catch (error) {
    console.error(`[receipt] WhatsApp media upload failed for deal ${dealId}: ${error.message}`);
  }

  const rows = await supabaseRequest("deal_proofs", {
    method: "POST",
    body: JSON.stringify({
      deal_id: dealId,
      user_id: user.id,
      proof_path: objectPath,
      proof_type: "transfer_receipt",
    }),
  });

  const proofId = rows[0]?.id || null;
  const shortId = proofId ? String(proofId).split("-")[0] : null;
  if (proofId && shortId) receiptShortIds.set(shortId, proofId);

  return {
    id: proofId,
    shortId,
    path: objectPath,
    contentType: media.contentType,
    filename,
    whatsappMediaId,
  };
}

async function getDealProofs(dealId, userId = null) {
  const filters = [`deal_id=eq.${filterValue(dealId)}`];
  if (userId) filters.push(`user_id=eq.${filterValue(userId)}`);
  return supabaseRequest(`deal_proofs?select=id,proof_path,user_id,created_at&${filters.join("&")}&order=created_at.desc`);
}

async function dealUserHasProof(dealId, userId) {
  const proofs = await getDealProofs(dealId, userId);
  return proofs.length > 0;
}

async function signedDealProofUrl(pathname) {
  if (!pathname) return "";
  return createStorageSignedUrl("deal-proofs", pathname, 600);
}

function shortDealProofUrl(proof) {
  const baseUrl = getPublicUrl();
  if (!proof?.id || !baseUrl) return "";
  return `${baseUrl.replace(/\/+$/, "")}/r/${proof.shortId || proof.id}`;
}

function receiptMediaType(proof) {
  return String(proof?.contentType || "").includes("pdf") ? "document" : "image";
}

async function sendDealProofToUser(userId, proof, caption) {
  const target = await getUserById(userId);
  if (!target?.whatsapp_phone || !proof) return { sent: false, url: "" };

  if (proof.whatsappMediaId) {
    try {
      await sendWhatsAppMedia(
        target.whatsapp_phone,
        receiptMediaType(proof),
        proof.whatsappMediaId,
        caption,
        proof.filename || "akara-receipt"
      );
      return { sent: true, url: "" };
    } catch (error) {
      console.error(`[receipt] WhatsApp receipt forward failed for ${target.whatsapp_phone}: ${error.message}`);
    }
  }

  return { sent: false, url: shortDealProofUrl(proof) };
}

async function findDealProofByToken(proofToken) {
  const proofId = receiptShortIds.get(proofToken) || proofToken;
  const isFullUuid = /^[0-9a-f-]{36}$/i.test(proofId);
  if (isFullUuid) {
    const rows = await supabaseRequest(
      `deal_proofs?id=eq.${filterValue(proofId)}&select=id,proof_path&limit=1`
    );
    return rows[0] || null;
  }

  const rows = await supabaseRequest(
    "deal_proofs?select=id,proof_path,created_at&order=created_at.desc&limit=200"
  );
  return rows.find((proof) => String(proof.id || "").startsWith(proofId)) || null;
}

async function handleReceiptRedirect(res, proofToken) {
  const proof = await findDealProofByToken(proofToken);
  if (!proof?.proof_path) {
    return textResponse(res, 404, "Receipt not found");
  }

  const signedUrl = await signedDealProofUrl(proof.proof_path);
  const fileResponse = await fetch(signedUrl);
  const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
  if (!fileResponse.ok) {
    return textResponse(res, fileResponse.status, "Receipt could not be loaded");
  }

  res.writeHead(200, {
    "content-type": fileResponse.headers.get("content-type") || "application/octet-stream",
    "content-length": String(fileBuffer.length),
    "cache-control": "no-store",
  });
  res.end(fileBuffer);
}

module.exports = {
  storeDealProof,
  getDealProofs,
  dealUserHasProof,
  sendDealProofToUser,
  handleReceiptRedirect,
};
