const path = require("node:path");
const { rootDir, config } = require("./config");
const { jsonResponse, readJsonBody } = require("./lib/http");
const { supabaseRequest, filterValue, createStorageSignedUrl } = require("./lib/supabase");
const { sendWhatsAppText } = require("./lib/whatsapp");
const { sendVerificationSuccessCard, sendUpgradeSuccessCard } = require("./lib/listing-card");
const { getUserById, updateUser } = require("./db/users");
const { mainMenu } = require("./messages/copy");
const { title } = require("./lib/format");
const { displayReference } = require("./db/listings");

function requireAdmin(req) {
  const token = req.headers["x-akara-admin-token"];
  return Boolean(token && token === config.adminToken);
}

function forbiddenAdmin(res) {
  return jsonResponse(res, 401, { ok: false, error: "Admin token is missing or invalid." });
}

function adminFilePath(fileName) {
  return path.join(rootDir, "admin", fileName);
}

function buildLastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en", { weekday: "short" }),
    };
  });
}

function countCreatedOn(items, dayKey) {
  return items.filter((item) => String(item.created_at || "").slice(0, 10) === dayKey).length;
}

function countBy(items, fieldOrGetter) {
  return items.reduce((counts, item) => {
    const key = typeof fieldOrGetter === "function" ? fieldOrGetter(item) : item[fieldOrGetter];
    const label = key || "unknown";
    counts[label] = (counts[label] || 0) + 1;
    return counts;
  }, {});
}

async function attachDealProofs(rows, dealIdGetter = (row) => row.id) {
  const dealIds = [...new Set(rows.map(dealIdGetter).filter(Boolean))];
  if (!dealIds.length) return rows;

  const proofs = await supabaseRequest(
    [
      "deal_proofs?select=id,deal_id,user_id,proof_path,proof_type,created_at,",
      "users!deal_proofs_user_id_fkey(whatsapp_phone,display_name)",
      `&deal_id=in.(${dealIds.map(filterValue).join(",")})`,
      "&order=created_at.desc",
    ].join("")
  );

  const proofsByDeal = proofs.reduce((grouped, proof) => {
    const key = proof.deal_id;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(proof);
    return grouped;
  }, {});

  return rows.map((row) => {
    const dealId = dealIdGetter(row);
    return {
      ...row,
      proofs: proofsByDeal[dealId] || [],
      evidence_count: (proofsByDeal[dealId] || []).length,
    };
  });
}

async function resumeApprovedUserAction(user) {
  const sessions = await supabaseRequest(
    `message_sessions?user_id=eq.${filterValue(user.id)}&limit=1`
  );
  const session = sessions[0];
  const context = session?.context_json || {};
  if (session?.current_flow !== "kyc_upgrade" || context.return_flow !== "publish_listing" || !context.pending_listing) {
    return false;
  }

  const { publishListing } = require("./flows/listing");
  const reply = await publishListing(user, context.pending_listing);
  if (reply) {
    await sendWhatsAppText(user.whatsapp_phone, reply).catch((error) => {
      console.error(`[admin] approval resume reply failed for ${user.whatsapp_phone}: ${error.message}`);
    });
  }
  return true;
}

function dealParticipantPhones(deal = {}) {
  return [
    deal.maker?.whatsapp_phone,
    deal.taker?.whatsapp_phone,
  ].filter(Boolean);
}

function deriveDealStatusAfterDispute(deal = {}) {
  if (deal.maker_received_at && deal.taker_received_at) return "closed";
  if ((deal.maker_sent_at && deal.taker_sent_at) || deal.maker_received_at || deal.taker_received_at) return "partially_confirmed";
  if (deal.maker_sent_at) return "maker_sent";
  if (deal.taker_sent_at) return "taker_sent";
  return "reserved";
}

function disputeStatusLabel(status) {
  const labels = {
    open: "Open",
    waiting_for_user: "Waiting for user",
    under_review: "Under review",
    resolved: "Resolved",
    rejected: "Rejected",
  };
  return labels[status] || String(status || "Updated").replaceAll("_", " ");
}

function disputeOutcomeLabel(outcome) {
  const labels = {
    none: "No trade change",
    keep_reviewing: "Trade remains paused",
    resume_trade: "Trade can continue",
    close_refunded: "Trade closed after refund",
    close_completed: "Trade completed",
  };
  return labels[outcome] || labels.none;
}

function disputeNotice(dispute, outcome) {
  const dealCode = displayReference(dispute.deals?.deal_code, "deal");
  const lines = [
    `Dispute update for ${dealCode}`,
    "",
    `Status: ${disputeStatusLabel(dispute.status)}`,
  ];

  if (dispute.resolution) lines.push(`Admin note: ${dispute.resolution}`);

  if (outcome && outcome !== "none") {
    lines.push("", `Trade outcome: ${disputeOutcomeLabel(outcome)}`);
  }

  if (outcome === "keep_reviewing" || ["open", "waiting_for_user", "under_review"].includes(dispute.status)) {
    lines.push("This trade remains paused. Do not send new money until Akara gives the next update.");
  } else if (outcome === "resume_trade") {
    lines.push("You can continue this trade from the transaction room. Check the latest status before sending anything.");
  } else if (outcome === "close_refunded") {
    lines.push("This trade is closed as refunded. Do not send more money for this transaction.");
  } else if (outcome === "close_completed") {
    lines.push("This trade is closed as completed. Both sides should keep their receipts for records.");
  } else if (dispute.status === "rejected") {
    lines.push("The dispute was not accepted based on the current review. You can continue the trade if it is still active.");
  }

  return lines.join("\n");
}

async function getDisputeWithDeal(disputeId) {
  const rows = await supabaseRequest(
    [
      "disputes?select=id,deal_id,opened_by_user_id,category,description,status,resolution,created_at,resolved_at,",
      "deals!disputes_deal_id_fkey(id,deal_code,status,maker_user_id,taker_user_id,have_currency,want_currency,have_amount,want_amount,maker_sent_at,taker_sent_at,maker_received_at,taker_received_at,",
      "maker:users!deals_maker_user_id_fkey(whatsapp_phone,display_name),taker:users!deals_taker_user_id_fkey(whatsapp_phone,display_name)),",
      "users!disputes_opened_by_user_id_fkey(whatsapp_phone,display_name)",
      `&id=eq.${filterValue(disputeId)}`,
      "&limit=1",
    ].join("")
  );

  const dispute = rows[0];
  if (!dispute) return null;
  if (dispute.deals?.id && (dispute.deals?.maker || dispute.deals?.taker)) return dispute;

  const dealRows = await supabaseRequest(`deals?id=eq.${filterValue(dispute.deal_id)}&limit=1`);
  const deal = dealRows[0] || dispute.deals || null;
  if (!deal) return dispute;

  const [makerRows, takerRows] = await Promise.all([
    supabaseRequest(`users?id=eq.${filterValue(deal.maker_user_id)}&select=whatsapp_phone,display_name&limit=1`),
    supabaseRequest(`users?id=eq.${filterValue(deal.taker_user_id)}&select=whatsapp_phone,display_name&limit=1`),
  ]);
  dispute.deals = {
    ...deal,
    maker: makerRows[0] || {},
    taker: takerRows[0] || {},
  };
  return dispute;
}

async function applyDisputeDealOutcome(dispute, outcome, status) {
  const deal = dispute?.deals;
  if (!deal?.id) return;

  const now = new Date().toISOString();
  let patch = null;
  if (["open", "waiting_for_user", "under_review"].includes(status) || outcome === "keep_reviewing") {
    patch = { status: "disputed" };
  } else if (outcome === "resume_trade") {
    patch = { status: deriveDealStatusAfterDispute(deal) };
  } else if (outcome === "close_refunded") {
    patch = {
      status: "cancelled",
      cancelled_at: now,
      cancellation_reason: "Dispute resolved after refund confirmation.",
    };
  } else if (outcome === "close_completed") {
    patch = {
      status: "closed",
      completed_at: now,
    };
  } else if (status === "rejected") {
    patch = { status: deriveDealStatusAfterDispute(deal) };
  }

  if (!patch) return;
  await supabaseRequest(`deals?id=eq.${filterValue(deal.id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

async function notifyDisputeParticipants(dispute, outcome) {
  const message = disputeNotice(dispute, outcome);
  await Promise.allSettled(dealParticipantPhones(dispute.deals).map((phone) => sendWhatsAppText(phone, message)));
}

async function getAdminOverview() {
  const [users, listings, deals, disputes, verifications] = await Promise.all([
    supabaseRequest("users?select=id,verification_status,risk_status,created_at&limit=1000"),
    supabaseRequest("listings?select=id,status,have_currency,want_currency,have_amount,want_amount,created_at&limit=1000"),
    supabaseRequest("deals?select=id,status,have_currency,want_currency,have_amount,want_amount,created_at&limit=1000"),
    supabaseRequest("disputes?select=id,status,created_at&limit=1000"),
    supabaseRequest("verification_requests?select=id,status,created_at&limit=1000"),
  ]);

  const activeListings = listings.filter((item) => item.status === "active");
  const openDisputes = disputes.filter((item) => ["open", "waiting_for_user", "under_review"].includes(item.status));
  const pendingVerifications = verifications.filter((item) => ["pending_input", "pending_review"].includes(item.status));
  const flaggedUsers = users.filter((item) => ["watch", "limited", "suspended"].includes(item.risk_status) || item.verification_status === "suspended");
  const completedDeals = deals.filter((item) => ["completed_pending_fee", "closed"].includes(item.status));
  const lastSevenDays = buildLastSevenDays();

  return {
    totals: {
      users: users.length,
      activeListings: activeListings.length,
      deals: deals.length,
      completedDeals: completedDeals.length,
      openDisputes: openDisputes.length,
      pendingVerifications: pendingVerifications.length,
      flaggedUsers: flaggedUsers.length,
      needsReview: openDisputes.length + pendingVerifications.length + flaggedUsers.length,
    },
    recent: {
      users: users.slice(-5).reverse(),
      listings: listings.slice(-5).reverse(),
      deals: deals.slice(-5).reverse(),
      disputes: disputes.slice(-5).reverse(),
      reviewQueue: [
        ...pendingVerifications.slice(0, 5).map((item) => ({ ...item, queue_type: "verification" })),
        ...openDisputes.slice(0, 5).map((item) => ({ ...item, queue_type: "dispute" })),
        ...flaggedUsers.slice(0, 5).map((item) => ({ ...item, queue_type: "flagged_user" })),
      ].slice(0, 8),
    },
    charts: {
      activity: lastSevenDays.map((day) => ({
        label: day.label,
        users: countCreatedOn(users, day.key),
        offers: countCreatedOn(listings, day.key),
        deals: countCreatedOn(deals, day.key),
      })),
      offerStatus: countBy(listings, "status"),
      dealStatus: countBy(deals, "status"),
      verificationStatus: countBy(verifications, "status"),
      corridors: countBy(listings, (item) => `${item.have_currency}-${item.want_currency}`),
    },
  };
}

async function handleAdminApi(req, res, url) {
  if (!requireAdmin(req)) return forbiddenAdmin(res);

  if (req.method === "GET" && url.pathname === "/admin/api/overview") {
    return jsonResponse(res, 200, { ok: true, data: await getAdminOverview() });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/users") {
    const users = await supabaseRequest(
      "users?select=id,whatsapp_phone,display_name,legal_name,verification_status,verification_score,completed_deals_count,cancelled_deals_24h,total_cancelled_deals,dispute_count,risk_status,hold_until,created_at,payment_profiles(id,currency,method,account_name,bank_name,momo_network,created_at)&order=created_at.desc&limit=100"
    );
    return jsonResponse(res, 200, { ok: true, data: users });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/verifications") {
    const verifications = await supabaseRequest(
      "verification_requests?select=id,status,id_type,id_country,document_front_path,document_back_path,selfie_path,automated_decision,automated_reason,admin_decision,admin_notes,created_at,reviewed_at,users!verification_requests_user_id_fkey(id,whatsapp_phone,display_name,legal_name,nationality,residence_country,city,verification_status)&order=created_at.desc&limit=100"
    );
    return jsonResponse(res, 200, { ok: true, data: verifications });
  }

  if (req.method === "POST" && url.pathname === "/admin/api/storage-signed-url") {
    const body = await readJsonBody(req);
    if (!body.bucket || !body.path) {
      return jsonResponse(res, 400, { ok: false, error: "bucket and path are required." });
    }
    const signedUrl = await createStorageSignedUrl(body.bucket, body.path, 600);
    return jsonResponse(res, 200, { ok: true, data: { signedUrl } });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/listings") {
    const listings = await supabaseRequest(
      "listings?select=id,listing_code,status,have_currency,want_currency,have_amount,want_amount,rate,listing_type,created_at,users!listings_owner_user_id_fkey(whatsapp_phone,display_name,verification_status)&order=created_at.desc&limit=100"
    );
    return jsonResponse(res, 200, { ok: true, data: listings });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/deals") {
    const deals = await supabaseRequest(
      "deals?select=id,deal_code,status,have_currency,want_currency,have_amount,want_amount,rate,reservation_expires_at,completed_at,cancelled_at,created_at,maker:users!deals_maker_user_id_fkey(whatsapp_phone,display_name),taker:users!deals_taker_user_id_fkey(whatsapp_phone,display_name)&order=created_at.desc&limit=100"
    );
    return jsonResponse(res, 200, { ok: true, data: await attachDealProofs(deals) });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/disputes") {
    const disputes = await supabaseRequest(
      "disputes?select=id,deal_id,category,description,status,resolution,created_at,resolved_at,deals!disputes_deal_id_fkey(id,deal_code,status,maker_user_id,taker_user_id,maker_sent_at,taker_sent_at,maker_received_at,taker_received_at,maker:users!deals_maker_user_id_fkey(whatsapp_phone,display_name),taker:users!deals_taker_user_id_fkey(whatsapp_phone,display_name)),users!disputes_opened_by_user_id_fkey(whatsapp_phone,display_name)&order=created_at.desc&limit=100"
    );
    return jsonResponse(res, 200, { ok: true, data: await attachDealProofs(disputes, (row) => row.deal_id) });
  }

  const userStatusMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/status$/);
  if (req.method === "PATCH" && userStatusMatch) {
    const body = await readJsonBody(req);
    const allowedVerification = ["unverified", "pending_input", "pending_review", "verified_auto", "verified_manual", "rejected", "suspended"];
    const allowedRisk = ["normal", "watch", "limited", "suspended"];
    const patch = {};
    if (allowedVerification.includes(body.verification_status)) patch.verification_status = body.verification_status;
    if (allowedRisk.includes(body.risk_status)) patch.risk_status = body.risk_status;
    const user = await updateUser(userStatusMatch[1], patch);
    return jsonResponse(res, 200, { ok: true, data: user });
  }

  const verificationDecisionMatch = url.pathname.match(/^\/admin\/api\/verifications\/([^/]+)\/decision$/);
  if (req.method === "PATCH" && verificationDecisionMatch) {
    const body = await readJsonBody(req);
    const decision = body.decision;
    if (!["approve", "reject"].includes(decision)) {
      return jsonResponse(res, 400, { ok: false, error: "Decision must be approve or reject." });
    }

    const existing = await supabaseRequest(
      `verification_requests?id=eq.${filterValue(verificationDecisionMatch[1])}&select=id,user_id&limit=1`
    );
    const request = existing[0];
    if (!request) return jsonResponse(res, 404, { ok: false, error: "Verification request not found." });

    const approved = decision === "approve";
    const status = approved ? "verified_manual" : "rejected";
    const previousUser = await getUserById(request.user_id);
    const isTierUpgrade = approved && ["verified_auto", "verified_manual"].includes(previousUser?.verification_status);
    const rows = await supabaseRequest(`verification_requests?id=eq.${filterValue(request.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status,
        admin_decision: approved ? "approved" : "rejected",
        admin_notes: body.admin_notes || null,
        reviewed_at: new Date().toISOString(),
      }),
    });

    const user = await updateUser(request.user_id, {
      verification_status: status,
      verification_score: approved ? 80 : 0,
    });

    if (approved) {
      if (isTierUpgrade) {
        const caption = [
          title("Tier upgraded ✅"),
          "",
          "Your profile is now Tier 3 and can handle higher value exchanges.",
        ].join("\n");
        await sendUpgradeSuccessCard(user.whatsapp_phone, caption).catch((error) => {
          console.error(`[admin] tier upgrade card failed for ${user.whatsapp_phone}: ${error.message}`);
        });
      } else {
        const caption = [
          title("Verified"),
          "",
          "Your Akara profile is approved.",
          "",
          "You can now see offers, create listings, open Akara Trades, and manage payout details.",
        ].join("\n");
        await sendVerificationSuccessCard(user.whatsapp_phone, caption).catch((error) => {
          console.error(`[admin] verification card failed for ${user.whatsapp_phone}: ${error.message}`);
        });
      }
      await resumeApprovedUserAction(user).catch((error) => {
        console.error(`[admin] approval resume failed for ${user.whatsapp_phone}: ${error.message}`);
      });
      await sendWhatsAppText(user.whatsapp_phone, mainMenu()).catch((error) => {
        console.error(`[admin] verification menu failed for ${user.whatsapp_phone}: ${error.message}`);
      });
    } else {
      sendWhatsAppText(
        user.whatsapp_phone,
        "Your Akara verification was not approved. Reply verify to submit again with clearer details."
      ).catch((error) => {
        console.error(`[admin] verification notice failed for ${user.whatsapp_phone}: ${error.message}`);
      });
    }

    return jsonResponse(res, 200, { ok: true, data: rows[0] });
  }

  const listingStatusMatch = url.pathname.match(/^\/admin\/api\/listings\/([^/]+)\/status$/);
  if (req.method === "PATCH" && listingStatusMatch) {
    const body = await readJsonBody(req);
    const allowed = ["draft", "active", "reserved", "paused", "completed", "cancelled", "expired", "flagged"];
    if (!allowed.includes(body.status)) return jsonResponse(res, 400, { ok: false, error: "Invalid listing status." });
    const rows = await supabaseRequest(`listings?id=eq.${filterValue(listingStatusMatch[1])}`, {
      method: "PATCH",
      body: JSON.stringify({ status: body.status }),
    });
    return jsonResponse(res, 200, { ok: true, data: rows[0] });
  }

  const disputeStatusMatch = url.pathname.match(/^\/admin\/api\/disputes\/([^/]+)\/status$/);
  if (req.method === "PATCH" && disputeStatusMatch) {
    const body = await readJsonBody(req);
    const allowed = ["open", "waiting_for_user", "under_review", "resolved", "rejected"];
    const allowedOutcomes = ["none", "keep_reviewing", "resume_trade", "close_refunded", "close_completed"];
    const outcome = allowedOutcomes.includes(body.deal_outcome) ? body.deal_outcome : "none";
    if (!allowed.includes(body.status)) return jsonResponse(res, 400, { ok: false, error: "Invalid dispute status." });
    const rows = await supabaseRequest(`disputes?id=eq.${filterValue(disputeStatusMatch[1])}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: body.status,
        resolution: body.resolution || null,
        resolved_at: ["resolved", "rejected"].includes(body.status) ? new Date().toISOString() : null,
      }),
    });

    const dispute = await getDisputeWithDeal(disputeStatusMatch[1]);
    if (dispute) {
      await applyDisputeDealOutcome(dispute, outcome, body.status);
      await notifyDisputeParticipants({ ...dispute, status: body.status, resolution: body.resolution || null }, outcome);
    }

    return jsonResponse(res, 200, { ok: true, data: rows[0] });
  }

  return jsonResponse(res, 404, { ok: false, error: "Admin endpoint not found." });
}

module.exports = {
  handleAdminApi,
  adminFilePath,
};
