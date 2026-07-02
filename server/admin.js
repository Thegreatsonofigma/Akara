const path = require("node:path");
const { rootDir, config } = require("./config");
const { jsonResponse, readJsonBody } = require("./lib/http");
const { supabaseRequest, filterValue, createStorageSignedUrl } = require("./lib/supabase");
const { sendWhatsAppText } = require("./lib/whatsapp");
const { updateUser } = require("./db/users");
const { mainMenu } = require("./messages/copy");

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
    },
    recent: {
      users: users.slice(-5).reverse(),
      listings: listings.slice(-5).reverse(),
      deals: deals.slice(-5).reverse(),
      disputes: disputes.slice(-5).reverse(),
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
      "users?select=id,whatsapp_phone,display_name,verification_status,verification_score,completed_deals_count,cancelled_deals_24h,total_cancelled_deals,dispute_count,risk_status,hold_until,created_at&order=created_at.desc&limit=100"
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
    return jsonResponse(res, 200, { ok: true, data: deals });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/disputes") {
    const disputes = await supabaseRequest(
      "disputes?select=id,category,description,status,resolution,created_at,resolved_at,deals!disputes_deal_id_fkey(deal_code,status),users!disputes_opened_by_user_id_fkey(whatsapp_phone,display_name)&order=created_at.desc&limit=100"
    );
    return jsonResponse(res, 200, { ok: true, data: disputes });
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

    const notice = approved
      ? [
        "You are verified ✅",
        "",
        mainMenu(),
        "",
        "Try: I have 50k naira and want 55k RWF",
      ].join("\n")
      : "Your Akara verification was not approved. Reply verify to submit again with clearer details.";

    sendWhatsAppText(user.whatsapp_phone, notice).catch((error) => {
      console.error(`[admin] verification notice failed for ${user.whatsapp_phone}: ${error.message}`);
    });

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
    if (!allowed.includes(body.status)) return jsonResponse(res, 400, { ok: false, error: "Invalid dispute status." });
    const rows = await supabaseRequest(`disputes?id=eq.${filterValue(disputeStatusMatch[1])}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: body.status,
        resolution: body.resolution || null,
        resolved_at: ["resolved", "rejected"].includes(body.status) ? new Date().toISOString() : null,
      }),
    });
    return jsonResponse(res, 200, { ok: true, data: rows[0] });
  }

  return jsonResponse(res, 404, { ok: false, error: "Admin endpoint not found." });
}

module.exports = {
  handleAdminApi,
  adminFilePath,
};
