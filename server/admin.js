const path = require("node:path");
const crypto = require("node:crypto");
const { rootDir, config } = require("./config");
const { jsonResponse, readJsonBody } = require("./lib/http");
const {
  clientIp,
  consumeRateLimit,
  rateLimitResponse,
} = require("./lib/rate-limit");
const { supabaseRequest, filterValue, createStorageSignedUrl } = require("./lib/supabase");
const { sendWhatsAppText, sendWhatsAppList } = require("./lib/whatsapp");
const { sendVerificationSuccessCard, sendUpgradeSuccessCard, sendExchangeCompletionCard } = require("./lib/listing-card");
const { getUserById, updateUser } = require("./db/users");
const { exchangeCompleteMessage, getDealById, syncCompletedDealsCount } = require("./db/deals");
const {
  recordCompletedDealIntegrity,
  recordDisputeOutcomeIntegrity,
  verifyIntegrityRecord,
} = require("./db/integrity");
const { markLiquidityRouteDealCompleted } = require("./db/liquidity");
const { mainMenu, mainMenuListPayload } = require("./messages/copy");
const { title } = require("./lib/format");
const { displayReference } = require("./db/listings");
const {
  createDataSubjectRequest,
  listDataSubjectRequests,
  updateDataSubjectRequest,
  createBreachIncident,
  listBreachIncidents,
  updateBreachIncident,
  listProcessorContracts,
  updateProcessorContract,
  listRetentionRules,
  listComplianceTasks,
  updateComplianceTask,
  getComplianceDashboard,
} = require("./db/compliance");
const { listSupportRequests, updateSupportRequest } = require("./db/support");
const { releaseDisputeHolds } = require("./db/dispute-holds");
const {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  authenticateAdminRequest,
  adminSessionCookie,
  hasPermission,
  isMissingAdminSchema,
  loginAdmin,
  logoutAdmin,
  recordAdminAudit,
  tokenHash,
} = require("./lib/admin-auth");

const ALLOWED_PRIVATE_STORAGE_BUCKETS = new Set([
  "verification-documents",
  "deal-proofs",
]);

function isSameOriginRequest(req) {
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  try {
    return new URL(origin).host.toLowerCase()
      === String(req.headers.host || "").toLowerCase();
  } catch {
    return false;
  }
}

function forbiddenAdmin(res) {
  return jsonResponse(res, 401, {
    ok: false,
    code: "ADMIN_AUTH_REQUIRED",
    error: "Your admin session is missing, expired, or no longer has access.",
  });
}

function forbiddenPermission(res, permission) {
  return jsonResponse(res, 403, {
    ok: false,
    code: "ADMIN_PERMISSION_REQUIRED",
    permission,
    error: "Your admin role does not allow this action.",
  });
}

function adminFilePath(fileName) {
  return path.join(rootDir, "admin", fileName);
}

function requiredAdminPermission(req, pathname) {
  if (pathname === "/admin/api/session" || pathname === "/admin/api/auth/logout") return null;
  if (pathname.startsWith("/admin/api/admins") || pathname.startsWith("/admin/api/access-requests")) {
    return req.method === "GET" ? "admins.view" : "admins.manage";
  }
  if (pathname === "/admin/api/overview") return "dashboard.view";
  if (pathname === "/admin/api/reports") return "reports.view";
  if (pathname.startsWith("/admin/api/users")) {
    return req.method === "GET" ? "users.view" : "users.manage";
  }
  if (pathname.startsWith("/admin/api/verifications") || pathname === "/admin/api/storage-signed-url") {
    return req.method === "GET" ? "verifications.view" : "verifications.review";
  }
  if (pathname.startsWith("/admin/api/listings")) {
    return req.method === "GET" ? "listings.view" : "listings.manage";
  }
  if (pathname.startsWith("/admin/api/deals")) {
    return req.method === "GET" ? "trades.view" : "trades.manage";
  }
  if (pathname.startsWith("/admin/api/disputes")) {
    return req.method === "GET" ? "disputes.view" : "disputes.resolve";
  }
  if (pathname.startsWith("/admin/api/support")) {
    return req.method === "GET" ? "support.view" : "support.manage";
  }
  if (pathname.startsWith("/admin/api/compliance")) {
    return req.method === "GET" ? "compliance.view" : "compliance.manage";
  }
  if (pathname.startsWith("/admin/api/integrity")) return "integrity.view";
  return "dashboard.view";
}

function adminCode() {
  return `AKR-ADM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function invitationToken() {
  return `akara_admin_${crypto.randomBytes(24).toString("base64url")}`;
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

function buildRecentDays(totalDays = 30) {
  return Array.from({ length: totalDays }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (totalDays - 1 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: date.toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" }),
    };
  });
}

async function listAllAdminRows(resource, select, options = {}) {
  const pageSize = 1000;
  const maxRows = options.maxRows || 10000;
  const rows = [];

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const query = [
      `${resource}?select=${select}`,
      options.filter || "",
      options.order ? `order=${options.order}` : "",
      `limit=${pageSize}`,
      `offset=${offset}`,
    ].filter(Boolean).join("&");
    const batch = await supabaseRequest(query);
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

async function listAllAdminRowsWithFallback(resource, select, fallbackSelect, options = {}) {
  try {
    return await listAllAdminRows(resource, select, options);
  } catch (error) {
    if (!fallbackSelect) throw error;
    return listAllAdminRows(resource, fallbackSelect, options);
  }
}

function percent(part, whole) {
  if (!whole) return 0;
  return Math.round((Number(part || 0) / Number(whole)) * 1000) / 10;
}

function average(values) {
  const valid = values.map(Number).filter(Number.isFinite);
  if (!valid.length) return 0;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
}

function addCurrencyAmount(target, currency, amount) {
  if (!currency || !Number.isFinite(Number(amount))) return;
  target[currency] = (target[currency] || 0) + Number(amount);
}

const VERIFICATION_USER_SELECT =
  "users!verification_requests_user_id_fkey(id,whatsapp_phone,display_name,legal_name,nationality,residence_country,city,verification_status)";

const VERIFICATION_QUEUE_SELECT = [
  "id",
  "status",
  "id_type",
  "id_country",
  "document_front_path",
  "document_back_path",
  "selfie_path",
  "document_ocr_engine",
  "document_ocr_status",
  "document_ocr_confidence",
  "document_ocr_name",
  "document_ocr_country",
  "document_ocr_type",
  "document_name_match",
  "document_country_match",
  "document_type_match",
  "document_ocr_reasons",
  "automated_decision",
  "automated_reason",
  "admin_decision",
  "admin_notes",
  "created_at",
  "reviewed_at",
  VERIFICATION_USER_SELECT,
].join(",");

const VERIFICATION_QUEUE_LEGACY_SELECT = [
  "id",
  "status",
  "id_type",
  "id_country",
  "document_front_path",
  "document_back_path",
  "selfie_path",
  "automated_decision",
  "automated_reason",
  "admin_decision",
  "admin_notes",
  "created_at",
  "reviewed_at",
  VERIFICATION_USER_SELECT,
].join(",");

const VERIFICATION_SCHEMA_WARNING =
  "Verification OCR columns are not in Supabase yet. Apply supabase/migrations/007_admin_ocr_review_fields.sql.";

function getSupabaseErrorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;

  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code,
    error.body,
    error.responseText,
  ];

  if (error.error) {
    parts.push(typeof error.error === "string" ? error.error : JSON.stringify(error.error));
  }

  try {
    parts.push(JSON.stringify(error));
  } catch (_) {
    // Some error objects cannot be stringified.
  }

  return parts.filter(Boolean).join(" ");
}

function isMissingVerificationReviewColumn(error) {
  const message = getSupabaseErrorText(error);
  return /verification_requests/i.test(message)
    && /(document_ocr_|document_name_match|document_country_match|document_type_match)/i.test(message)
    && /(does not exist|column|42703)/i.test(message);
}

function withLegacyVerificationOcrFields(row) {
  return {
    document_ocr_engine: null,
    document_ocr_status: "migration_required",
    document_ocr_confidence: null,
    document_ocr_name: null,
    document_ocr_country: null,
    document_ocr_type: null,
    document_name_match: null,
    document_country_match: null,
    document_type_match: null,
    document_ocr_reasons: [VERIFICATION_SCHEMA_WARNING],
    ...row,
  };
}

async function listVerificationQueue() {
  try {
    return {
      data: await supabaseRequest(
        `verification_requests?select=${VERIFICATION_QUEUE_SELECT}&order=created_at.desc&limit=100`
      ),
      schemaWarning: null,
    };
  } catch (error) {
    if (!isMissingVerificationReviewColumn(error)) throw error;

    const data = await supabaseRequest(
      `verification_requests?select=${VERIFICATION_QUEUE_LEGACY_SELECT}&order=created_at.desc&limit=100`
    );
    return {
      data: data.map(withLegacyVerificationOcrFields),
      schemaWarning: VERIFICATION_SCHEMA_WARNING,
    };
  }
}

async function attachDealProofs(rows, dealIdGetter = (row) => row.id) {
  const dealIds = [...new Set(rows.map(dealIdGetter).filter(Boolean))];
  if (!dealIds.length) return rows;

  const proofs = await supabaseRequest(
    [
      "deal_proofs?select=id,deal_id,user_id,proof_path,proof_type,created_at,ocr_status,ocr_amount,ocr_currency,ocr_expected_amount,ocr_expected_currency,ocr_matched,ocr_mismatch_reason,",
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
  if (outcome === "close_completed") {
    await notifyDisputeExchangeCompleted(dispute);
  }
}

async function notifyDisputeExchangeCompleted(dispute) {
  const deal = dispute?.deals;
  if (!deal?.id) return;

  await Promise.allSettled([
    syncCompletedDealsCount(deal.maker_user_id),
    syncCompletedDealsCount(deal.taker_user_id),
  ]);

  const dealCode = displayReference(deal.deal_code, "deal");
  const recipients = [
    { phone: deal.maker?.whatsapp_phone, role: "maker" },
    { phone: deal.taker?.whatsapp_phone, role: "taker" },
  ].filter((recipient) => recipient.phone);

  await Promise.allSettled(recipients.flatMap(({ phone, role }) => [
    sendWhatsAppText(phone, exchangeCompleteMessage(deal, role)),
    sendExchangeCompletionCard(phone, deal, role, `Exchange receipt for ${dealCode}`),
  ]));
}

async function getAdminOverview() {
  const [users, listings, deals, disputes, verifications, supportRequests, compliance] = await Promise.all([
    supabaseRequest("users?select=id,verification_status,risk_status,dispute_hold,created_at&limit=1000"),
    supabaseRequest("listings?select=id,status,have_currency,want_currency,have_amount,want_amount,created_at&limit=1000"),
    supabaseRequest("deals?select=id,status,have_currency,want_currency,have_amount,want_amount,created_at&limit=1000"),
    supabaseRequest("disputes?select=id,status,created_at&limit=1000"),
    supabaseRequest("verification_requests?select=id,status,created_at&limit=1000"),
    listSupportRequests(100),
    getComplianceDashboard(),
  ]);

  const activeListings = listings.filter((item) => item.status === "active");
  const openDisputes = disputes.filter((item) => ["open", "waiting_for_user", "under_review"].includes(item.status));
  const pendingVerifications = verifications.filter((item) => ["pending_input", "pending_review"].includes(item.status));
  const openSupportRequests = supportRequests.filter((item) => ["open", "in_review"].includes(item.status));
  const flaggedUsers = users.filter((item) =>
    item.dispute_hold
    || ["watch", "limited", "suspended"].includes(item.risk_status)
    || item.verification_status === "suspended"
  );
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
      openSupportRequests: openSupportRequests.length,
      flaggedUsers: flaggedUsers.length,
      privacyRequests: compliance.totals?.dataSubjectRequests || 0,
      openBreaches: compliance.totals?.openBreaches || 0,
      pendingProcessorReviews: compliance.totals?.pendingProcessorReviews || 0,
      openComplianceTasks: compliance.totals?.openComplianceTasks || 0,
      needsReview:
        openDisputes.length +
        pendingVerifications.length +
        openSupportRequests.length +
        flaggedUsers.length +
        (compliance.totals?.overdueDataSubjectRequests || 0) +
        (compliance.totals?.openBreaches || 0) +
        (compliance.totals?.pendingProcessorReviews || 0) +
        (compliance.totals?.openComplianceTasks || 0),
    },
    recent: {
      users: users.slice(-5).reverse(),
      listings: listings.slice(-5).reverse(),
      deals: deals.slice(-5).reverse(),
      disputes: disputes.slice(-5).reverse(),
      reviewQueue: [
        ...pendingVerifications.slice(0, 5).map((item) => ({ ...item, queue_type: "verification" })),
        ...openDisputes.slice(0, 5).map((item) => ({ ...item, queue_type: "dispute" })),
        ...openSupportRequests.slice(0, 5).map((item) => ({ ...item, queue_type: "support" })),
        ...flaggedUsers.slice(0, 5).map((item) => ({ ...item, queue_type: "flagged_user" })),
        ...(compliance.queues?.dataSubjectRequests || []).slice(0, 3).map((item) => ({ ...item, queue_type: "privacy_request" })),
        ...(compliance.queues?.breaches || []).slice(0, 3).map((item) => ({ ...item, queue_type: "breach" })),
        ...(compliance.queues?.processorReviews || []).slice(0, 3).map((item) => ({ ...item, queue_type: "processor_review" })),
        ...(compliance.queues?.complianceTasks || []).slice(0, 3).map((item) => ({ ...item, queue_type: "compliance_task" })),
      ].slice(0, 8),
      compliance,
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

async function getAdminReports() {
  const [
    users,
    paymentProfiles,
    listings,
    deals,
    disputes,
    verifications,
    proofs,
    supportEvents,
  ] = await Promise.all([
    listAllAdminRows(
      "users",
      "id,nationality,residence_country,verification_status,risk_status,dispute_hold,created_at"
    ),
    listAllAdminRows("payment_profiles", "id,currency,method,bank_name,momo_network,created_at"),
    listAllAdminRows(
      "listings",
      "id,status,have_currency,want_currency,have_amount,want_amount,listing_type,created_at"
    ),
    listAllAdminRows(
      "deals",
      "id,status,have_currency,want_currency,have_amount,want_amount,created_at,completed_at,cancelled_at"
    ),
    listAllAdminRows("disputes", "id,deal_id,category,status,created_at,resolved_at"),
    listAllAdminRowsWithFallback(
      "verification_requests",
      "id,status,id_type,id_country,document_ocr_status,document_name_match,document_country_match,document_type_match,created_at,reviewed_at",
      "id,status,id_type,id_country,created_at,reviewed_at"
    ),
    listAllAdminRowsWithFallback(
      "deal_proofs",
      "id,deal_id,ocr_status,ocr_matched,ocr_currency,ocr_expected_currency,created_at",
      "id,deal_id,created_at"
    ),
    listAllAdminRows(
      "audit_events",
      "id,event_payload,created_at",
      { filter: "entity_type=eq.support_request" }
    ),
  ]);

  const completedDeals = deals.filter((deal) => ["completed_pending_fee", "closed"].includes(deal.status));
  const cancelledDeals = deals.filter((deal) => ["cancelled", "expired"].includes(deal.status));
  const activeListings = listings.filter((listing) => listing.status === "active");
  const verifiedUsers = users.filter((user) => ["verified_auto", "verified_manual"].includes(user.verification_status));
  const openDisputes = disputes.filter((dispute) =>
    ["open", "waiting_for_user", "under_review"].includes(dispute.status)
  );
  const pendingKyc = verifications.filter((request) =>
    ["pending_input", "pending_review"].includes(request.status)
  );
  const matchedProofs = proofs.filter((proof) => proof.ocr_matched || proof.ocr_status === "matched");
  const reviewedProofs = proofs.filter((proof) => ["matched", "mismatch"].includes(proof.ocr_status));
  const flaggedUsers = users.filter((user) =>
    user.dispute_hold || ["watch", "limited", "suspended"].includes(user.risk_status)
  );
  const completionMinutes = completedDeals
    .filter((deal) => deal.completed_at && deal.created_at)
    .map((deal) => (new Date(deal.completed_at) - new Date(deal.created_at)) / 60000)
    .filter((value) => value >= 0);

  const corridorMap = new Map();
  const ensureCorridor = (haveCurrency, wantCurrency) => {
    const key = `${haveCurrency || "?"}->${wantCurrency || "?"}`;
    if (!corridorMap.has(key)) {
      corridorMap.set(key, {
        corridor: key,
        listings: 0,
        liveListings: 0,
        trades: 0,
        completed: 0,
        cancelled: 0,
      });
    }
    return corridorMap.get(key);
  };

  listings.forEach((listing) => {
    const corridor = ensureCorridor(listing.have_currency, listing.want_currency);
    corridor.listings += 1;
    if (listing.status === "active") corridor.liveListings += 1;
  });
  deals.forEach((deal) => {
    const corridor = ensureCorridor(deal.have_currency, deal.want_currency);
    corridor.trades += 1;
    if (["completed_pending_fee", "closed"].includes(deal.status)) corridor.completed += 1;
    if (["cancelled", "expired"].includes(deal.status)) corridor.cancelled += 1;
  });

  const corridors = [...corridorMap.values()]
    .map((corridor) => ({
      ...corridor,
      completionRate: percent(corridor.completed, corridor.trades),
    }))
    .sort((left, right) =>
      right.completed - left.completed
      || right.trades - left.trades
      || right.liveListings - left.liveListings
    );

  const currencyVolume = {};
  completedDeals.forEach((deal) => {
    addCurrencyAmount(currencyVolume, deal.have_currency, deal.have_amount);
    addCurrencyAmount(currencyVolume, deal.want_currency, deal.want_amount);
  });

  const days = buildRecentDays(30);
  const activity = days.map((day) => ({
    label: day.label,
    users: countCreatedOn(users, day.key),
    offers: countCreatedOn(listings, day.key),
    trades: countCreatedOn(deals, day.key),
    completed: completedDeals.filter((deal) =>
      String(deal.completed_at || deal.created_at || "").slice(0, 10) === day.key
    ).length,
  }));

  const supportRequests = supportEvents.map((event) => ({
    ...event,
    ...(event.event_payload || {}),
  }));
  const countryDistribution = countBy(users, (user) => user.residence_country || user.nationality || "unknown");
  const payoutMethods = countBy(paymentProfiles, "method");
  const payoutCurrencies = countBy(paymentProfiles, "currency");
  const disputeCategories = countBy(disputes, "category");
  const disputeStatus = countBy(disputes, "status");
  const verificationStatus = countBy(verifications, "status");
  const userRisk = countBy(users, "risk_status");
  const receiptOcrStatus = countBy(proofs, "ocr_status");
  const supportStatus = countBy(supportRequests, "status");
  const offerStatus = countBy(listings, "status");
  const tradeStatus = countBy(deals, "status");

  const topCorridor = corridors[0] || null;
  const lowestCorridor = corridors
    .filter((corridor) => corridor.trades >= 2)
    .sort((left, right) => left.completionRate - right.completionRate)[0] || null;
  const insights = [
    topCorridor
      ? `${topCorridor.corridor.replace("->", " to ")} is the busiest corridor with ${topCorridor.trades} trade${topCorridor.trades === 1 ? "" : "s"} and ${topCorridor.completionRate}% completion.`
      : "No corridor has recorded trade activity yet.",
    pendingKyc.length
      ? `${pendingKyc.length} verification request${pendingKyc.length === 1 ? " is" : "s are"} waiting for review or user input.`
      : "The verification queue is clear.",
    openDisputes.length
      ? `${openDisputes.length} dispute${openDisputes.length === 1 ? " is" : "s are"} open; both participants remain restricted from new trades until resolution.`
      : "There are no open disputes.",
    reviewedProofs.length
      ? `${percent(matchedProofs.length, reviewedProofs.length)}% of OCR-reviewed receipts matched their expected payment details.`
      : "Receipt OCR has not reviewed enough evidence to calculate a match rate.",
    lowestCorridor && lowestCorridor !== topCorridor
      ? `${lowestCorridor.corridor.replace("->", " to ")} has the lowest completion rate among active corridors at ${lowestCorridor.completionRate}%.`
      : null,
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    coverage: {
      users: users.length,
      listings: listings.length,
      deals: deals.length,
      proofs: proofs.length,
      capped: [users, listings, deals, proofs].some((items) => items.length >= 10000),
    },
    totals: {
      users: users.length,
      verifiedUsers: verifiedUsers.length,
      activeListings: activeListings.length,
      listings: listings.length,
      trades: deals.length,
      completedTrades: completedDeals.length,
      cancelledTrades: cancelledDeals.length,
      openDisputes: openDisputes.length,
      pendingKyc: pendingKyc.length,
      payoutProfiles: paymentProfiles.length,
      receiptProofs: proofs.length,
      flaggedUsers: flaggedUsers.length,
      supportRequests: supportRequests.length,
    },
    rates: {
      verification: percent(verifiedUsers.length, users.length),
      completion: percent(completedDeals.length, deals.length),
      dispute: percent(disputes.length, deals.length),
      receiptMatch: percent(matchedProofs.length, reviewedProofs.length),
      averageCompletionMinutes: average(completionMinutes),
    },
    activity,
    distributions: {
      offerStatus,
      tradeStatus,
      verificationStatus,
      userRisk,
      disputeStatus,
      disputeCategories,
      payoutMethods,
      payoutCurrencies,
      receiptOcrStatus,
      supportStatus,
      countries: countryDistribution,
    },
    corridors,
    currencyVolume: Object.entries(currencyVolume)
      .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
      .sort((left, right) => right.amount - left.amount),
    insights,
  };
}

function pickAllowed(body, allowed) {
  return Object.fromEntries(Object.entries(body || {}).filter(([key, value]) => allowed.includes(key) && value !== undefined));
}

function isMissingIntegritySchema(error) {
  return /(integrity_records|stellar_anchor_batches|user_reputation_snapshots|market_rate_snapshots|locked_quotes|reputation_credentials|liquidity_route_plans)/i.test(String(error?.message || ""))
    && /(does not exist|relation|42P01)/i.test(String(error?.message || ""));
}

async function getIntegrityDashboard() {
  try {
    const [records, batches, reputations, marketRates, lockedQuotes, credentials, routes] = await Promise.all([
      supabaseRequest(
        "integrity_records?select=id,event_key,record_type,entity_type,entity_id,subject_ref,commitment_hash,status,batch_id,leaf_index,anchored_at,created_at&order=created_at.desc&limit=200"
      ),
      supabaseRequest(
        "stellar_anchor_batches?select=id,network,merkle_root,leaf_count,status,source_account,transaction_hash,ledger_sequence,explorer_url,attempt_count,next_retry_at,last_error,confirmed_at,created_at&order=created_at.desc&limit=100"
      ),
      supabaseRequest(
        "user_reputation_snapshots?select=id,user_id,completed_trades,cancelled_trades,expired_trades,completion_rate,disputes_total,open_disputes,resolved_disputes,reputation_band,commitment_hash,integrity_record_id,created_at&order=created_at.desc&limit=200"
      ),
      supabaseRequest(
        "market_rate_snapshots?select=id,corridor_key,send_currency,receive_currency,median_rate,weighted_rate,low_rate,high_rate,best_rate,active_listing_count,completed_trade_count,total_visible_liquidity,commitment_hash,integrity_record_id,expires_at,created_at&order=created_at.desc&limit=100"
      ),
      supabaseRequest(
        "locked_quotes?select=id,quote_code,listing_id,deal_id,send_currency,receive_currency,send_amount,receive_amount,rate,quote_type,status,terms_commitment_hash,integrity_record_id,expires_at,created_at&order=created_at.desc&limit=100"
      ),
      supabaseRequest(
        "reputation_credentials?select=id,credential_code,user_id,reputation_band,claims,status,commitment_hash,integrity_record_id,expires_at,created_at&order=created_at.desc&limit=100"
      ),
      supabaseRequest(
        "liquidity_route_plans?select=id,route_code,requester_user_id,send_currency,receive_currency,planned_send_amount,planned_receive_amount,coverage_percent,leg_count,status,commitment_hash,integrity_record_id,expires_at,created_at&order=created_at.desc&limit=100"
      ),
    ]);
    const batchesById = Object.fromEntries(batches.map((batch) => [batch.id, batch]));
    const reputationByRecordId = Object.fromEntries(
      reputations.map((snapshot) => [snapshot.integrity_record_id, snapshot])
    );
    return {
      schemaReady: true,
      enabled: config.stellarIntegrityEnabled,
      network: config.stellarNetwork,
      records: records.map((record) => ({
        ...record,
        batch: batchesById[record.batch_id] || null,
        reputation: reputationByRecordId[record.id] || null,
      })),
      batches,
      marketRates,
      lockedQuotes,
      credentials,
      routes,
      totals: {
        records: records.length,
        anchored: records.filter((record) => record.status === "anchored").length,
        pending: records.filter((record) => ["pending", "batched"].includes(record.status)).length,
        failedBatches: batches.filter((batch) => batch.status === "failed").length,
        rateSnapshots: marketRates.length,
        lockedQuotes: lockedQuotes.filter((quote) => ["locked", "converted_to_deal"].includes(quote.status)).length,
        activeCredentials: credentials.filter((credential) => credential.status === "active").length,
        routePlans: routes.length,
      },
    };
  } catch (error) {
    if (!isMissingIntegritySchema(error)) throw error;
    return {
      schemaReady: false,
      enabled: config.stellarIntegrityEnabled,
      network: config.stellarNetwork,
      records: [],
      batches: [],
      marketRates: [],
      lockedQuotes: [],
      credentials: [],
      routes: [],
      totals: {
        records: 0,
        anchored: 0,
        pending: 0,
        failedBatches: 0,
        rateSnapshots: 0,
        lockedQuotes: 0,
        activeCredentials: 0,
        routePlans: 0,
      },
      warning: "Apply Supabase migrations 008 and 009 before enabling Stellar integrity.",
    };
  }
}

async function getAdminDirectory() {
  try {
    const [admins, accessRequests] = await Promise.all([
      supabaseRequest(
        "admin_users?select=id,admin_code,name,email,role,status,permissions,invited_at,activated_at,last_login_at,last_seen_at,created_at&order=created_at.asc"
      ),
      supabaseRequest(
        "admin_access_requests?select=id,request_code,name,email,reason,status,reviewed_at,created_at&order=created_at.desc&limit=100"
      ),
    ]);
    return {
      schemaReady: true,
      admins,
      accessRequests,
      rolePermissions: ROLE_PERMISSIONS,
      allPermissions: ALL_PERMISSIONS,
    };
  } catch (error) {
    if (!isMissingAdminSchema(error)) throw error;
    return {
      schemaReady: false,
      admins: [],
      accessRequests: [],
      rolePermissions: ROLE_PERMISSIONS,
      allPermissions: ALL_PERMISSIONS,
      warning: "Apply Supabase migration 015 to enable admin invitations, roles, sessions, and access requests.",
    };
  }
}

async function createAdminInvitation(body, actor) {
  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const role = Object.hasOwn(ROLE_PERMISSIONS, body.role) ? body.role : "support";
  if (!name || !email || !email.includes("@")) {
    const error = new Error("A valid name and email are required.");
    error.statusCode = 400;
    throw error;
  }
  const token = invitationToken();
  const rows = await supabaseRequest("admin_users", {
    method: "POST",
    body: JSON.stringify({
      admin_code: adminCode(),
      name,
      email,
      role,
      status: "invited",
      permissions: role === "custom"
        ? (body.permissions || []).filter((permission) => ALL_PERMISSIONS.includes(permission))
        : [],
      access_token_hash: tokenHash(token),
      invited_by: actor.admin.id || null,
    }),
  });
  await recordAdminAudit(actor, "admin.invited", "admin_user", rows[0]?.id, {
    role,
    email,
  });
  return {
    admin: rows[0],
    invitationToken: token,
    note: "This one-time access token is shown only now. Send it to the invited admin through a secure channel.",
  };
}

async function updateAdminRecord(adminId, body, actor) {
  if (actor.admin.id && actor.admin.id === adminId && body.status && body.status !== "active") {
    const error = new Error("You cannot suspend or revoke your own active session.");
    error.statusCode = 400;
    throw error;
  }
  const patch = {};
  if (body.name) patch.name = String(body.name).trim();
  if (Object.hasOwn(ROLE_PERMISSIONS, body.role)) patch.role = body.role;
  if (["invited", "active", "suspended", "revoked"].includes(body.status)) patch.status = body.status;
  if (Array.isArray(body.permissions)) {
    patch.permissions = body.permissions.filter((permission) => ALL_PERMISSIONS.includes(permission));
  }
  const rows = await supabaseRequest(`admin_users?id=eq.${filterValue(adminId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!rows[0]) {
    const error = new Error("Admin account not found.");
    error.statusCode = 404;
    throw error;
  }
  if (patch.status && patch.status !== "active") {
    await supabaseRequest(`admin_sessions?admin_user_id=eq.${filterValue(adminId)}&revoked_at=is.null`, {
      method: "PATCH",
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
  }
  await recordAdminAudit(actor, "admin.updated", "admin_user", adminId, patch);
  return rows[0];
}

function addUserVolume(target, currency, amount) {
  if (!currency || !Number.isFinite(Number(amount))) return;
  target[currency] = (target[currency] || 0) + Number(amount);
}

async function getAdminUserDetails(userId) {
  const users = await listAllAdminRowsWithFallback(
    "users",
    "id,whatsapp_phone,display_name,legal_name,nationality,residence_country,city,verification_status,verification_score,completed_deals_count,cancelled_deals_24h,total_cancelled_deals,dispute_count,risk_status,dispute_hold,hold_until,admin_banned,admin_ban_reason,swap_restricted_currencies,created_at,updated_at",
    "id,whatsapp_phone,display_name,legal_name,nationality,residence_country,city,verification_status,verification_score,completed_deals_count,cancelled_deals_24h,total_cancelled_deals,dispute_count,risk_status,dispute_hold,hold_until,created_at,updated_at",
    { filter: `id=eq.${filterValue(userId)}`, maxRows: 1 }
  );
  const user = users[0];
  if (!user) return null;
  user.admin_banned = Boolean(user.admin_banned);
  user.admin_ban_reason = user.admin_ban_reason || null;
  user.swap_restricted_currencies = user.swap_restricted_currencies || [];

  const [payouts, listings, deals, verifications, penalties, userEvents] = await Promise.all([
    listAllAdminRows(
      "payment_profiles",
      "id,currency,method,account_name,bank_name,momo_network,is_default,created_at,updated_at",
      { filter: `user_id=eq.${filterValue(userId)}` }
    ),
    listAllAdminRows(
      "listings",
      "id,listing_code,status,have_currency,want_currency,have_amount,want_amount,listing_type,created_at,updated_at",
      { filter: `owner_user_id=eq.${filterValue(userId)}`, order: "created_at.desc" }
    ),
    listAllAdminRows(
      "deals",
      "id,deal_code,listing_id,maker_user_id,taker_user_id,status,have_currency,want_currency,have_amount,want_amount,created_at,completed_at,cancelled_at",
      {
        filter: `or=(maker_user_id.eq.${filterValue(userId)},taker_user_id.eq.${filterValue(userId)})`,
        order: "created_at.desc",
      }
    ),
    listAllAdminRowsWithFallback(
      "verification_requests",
      "id,status,id_type,id_country,document_ocr_status,document_ocr_name,document_name_match,document_country_match,document_type_match,automated_decision,admin_decision,created_at,reviewed_at",
      "id,status,id_type,id_country,automated_decision,admin_decision,created_at,reviewed_at",
      { filter: `user_id=eq.${filterValue(userId)}`, order: "created_at.desc" }
    ),
    listAllAdminRows(
      "penalties",
      "id,reason,severity,starts_at,ends_at,admin_notes,created_at",
      { filter: `user_id=eq.${filterValue(userId)}`, order: "created_at.desc" }
    ),
    listAllAdminRows(
      "audit_events",
      "id,entity_type,entity_id,event_name,event_payload,created_at",
      { filter: `actor_user_id=eq.${filterValue(userId)}`, order: "created_at.desc", maxRows: 500 }
    ),
  ]);

  const dealIds = deals.map((deal) => deal.id);
  const dealFilter = dealIds.length
    ? `deal_id=in.(${dealIds.map(filterValue).join(",")})`
    : "";
  const [disputes, proofs] = dealIds.length
    ? await Promise.all([
      listAllAdminRows(
        "disputes",
        "id,deal_id,opened_by_user_id,category,description,status,resolution,created_at,resolved_at",
        { filter: dealFilter, order: "created_at.desc" }
      ),
      listAllAdminRowsWithFallback(
        "deal_proofs",
        "id,deal_id,user_id,proof_type,ocr_status,ocr_amount,ocr_currency,ocr_expected_amount,ocr_expected_currency,ocr_matched,ocr_mismatch_reason,created_at",
        "id,deal_id,user_id,proof_type,created_at",
        { filter: dealFilter, order: "created_at.desc" }
      ),
    ])
    : [[], []];

  const completed = deals.filter((deal) => ["completed_pending_fee", "closed"].includes(deal.status));
  const sentVolume = {};
  const receivedVolume = {};
  completed.forEach((deal) => {
    const isMaker = deal.maker_user_id === userId;
    addUserVolume(sentVolume, isMaker ? deal.have_currency : deal.want_currency, isMaker ? deal.have_amount : deal.want_amount);
    addUserVolume(receivedVolume, isMaker ? deal.want_currency : deal.have_currency, isMaker ? deal.want_amount : deal.have_amount);
  });
  const firstTrade = [...deals].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0] || null;
  const completedAt = completed.map((deal) => deal.completed_at || deal.created_at).filter(Boolean);
  const timeline = [
    ...deals.map((deal) => ({ kind: "trade", label: deal.deal_code, status: deal.status, at: deal.created_at })),
    ...listings.map((listing) => ({ kind: "offer", label: listing.listing_code, status: listing.status, at: listing.created_at })),
    ...verifications.map((request) => ({ kind: "verification", label: request.id_type || "KYC", status: request.status, at: request.created_at })),
    ...disputes.map((dispute) => ({ kind: "dispute", label: dispute.category, status: dispute.status, at: dispute.created_at })),
    ...userEvents.map((event) => ({ kind: "activity", label: event.event_name, status: event.entity_type, at: event.created_at })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 100);

  return {
    user,
    summary: {
      firstTradeAt: firstTrade?.created_at || null,
      lastCompletedAt: completedAt.sort().at(-1) || null,
      totalTrades: deals.length,
      completedTrades: completed.length,
      completionRate: percent(completed.length, deals.length),
      liveListings: listings.filter((listing) => listing.status === "active").length,
      totalListings: listings.length,
      openDisputes: disputes.filter((dispute) => ["open", "waiting_for_user", "under_review"].includes(dispute.status)).length,
      receiptMatchRate: percent(
        proofs.filter((proof) => proof.ocr_matched || proof.ocr_status === "matched").length,
        proofs.filter((proof) => ["matched", "mismatch"].includes(proof.ocr_status)).length
      ),
      sentVolume,
      receivedVolume,
    },
    payouts,
    listings,
    deals,
    disputes,
    proofs,
    verifications,
    penalties,
    timeline,
  };
}

async function handleAdminApi(req, res, url) {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !isSameOriginRequest(req)) {
    return jsonResponse(res, 403, {
      ok: false,
      code: "ADMIN_ORIGIN_REJECTED",
      error: "This administrative request did not originate from Akara.",
    });
  }

  if (req.method === "POST" && url.pathname === "/admin/api/auth/login") {
    const limit = consumeRateLimit("admin-login", clientIp(req), 10, 15 * 60 * 1000);
    if (!limit.allowed) return rateLimitResponse(res, limit);
    const body = await readJsonBody(req);
    const result = await loginAdmin(body.access_token, req);
    if (!result) return forbiddenAdmin(res);
    res.setHeader("set-cookie", adminSessionCookie(result.token));
    return jsonResponse(res, 200, {
      ok: true,
      data: {
        admin: result.admin,
        migrationRequired: result.migrationRequired,
      },
    });
  }

  if (req.method === "POST" && url.pathname === "/admin/api/access-requests") {
    const limit = consumeRateLimit("admin-access-request", clientIp(req), 5, 60 * 60 * 1000);
    if (!limit.allowed) return rateLimitResponse(res, limit);
    const body = await readJsonBody(req);
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    if (!name || !email || !email.includes("@")) {
      return jsonResponse(res, 400, { ok: false, error: "Enter your name and a valid email." });
    }
    let rows;
    try {
      rows = await supabaseRequest("admin_access_requests", {
        method: "POST",
        body: JSON.stringify({
          name,
          email,
          reason: String(body.reason || "").trim() || null,
        }),
      });
    } catch (error) {
      if (!isMissingAdminSchema(error)) throw error;
      return jsonResponse(res, 503, {
        ok: false,
        code: "ADMIN_ACCESS_SCHEMA_REQUIRED",
        error: "Admin access requests are not ready yet. Apply Supabase migration 015 first.",
      });
    }
    return jsonResponse(res, 201, {
      ok: true,
      data: {
        requestCode: rows[0]?.request_code,
        status: "pending",
      },
    });
  }

  const actor = await authenticateAdminRequest(req);
  if (!actor) return forbiddenAdmin(res);
  const permission = requiredAdminPermission(req, url.pathname);
  if (permission && !hasPermission(actor, permission)) {
    return forbiddenPermission(res, permission);
  }

  if (req.method === "GET" && url.pathname === "/admin/api/session") {
    return jsonResponse(res, 200, {
      ok: true,
      data: {
        authenticated: true,
        checkedAt: new Date().toISOString(),
        admin: actor.public,
      },
    });
  }

  if (req.method === "POST" && url.pathname === "/admin/api/auth/logout") {
    await logoutAdmin(actor);
    res.setHeader("set-cookie", adminSessionCookie("", { clear: true }));
    return jsonResponse(res, 200, { ok: true, data: { loggedOut: true } });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/admins") {
    return jsonResponse(res, 200, { ok: true, data: await getAdminDirectory() });
  }

  if (req.method === "POST" && url.pathname === "/admin/api/admins/invite") {
    const body = await readJsonBody(req);
    return jsonResponse(res, 201, {
      ok: true,
      data: await createAdminInvitation(body, actor),
    });
  }

  const adminRecordMatch = url.pathname.match(/^\/admin\/api\/admins\/([^/]+)$/);
  if (req.method === "PATCH" && adminRecordMatch) {
    const body = await readJsonBody(req);
    return jsonResponse(res, 200, {
      ok: true,
      data: await updateAdminRecord(adminRecordMatch[1], body, actor),
    });
  }

  const accessRequestMatch = url.pathname.match(/^\/admin\/api\/access-requests\/([^/]+)$/);
  if (req.method === "PATCH" && accessRequestMatch) {
    const body = await readJsonBody(req);
    if (!["approved", "rejected"].includes(body.status)) {
      return jsonResponse(res, 400, { ok: false, error: "Choose approved or rejected." });
    }
    const rows = await supabaseRequest(`admin_access_requests?id=eq.${filterValue(accessRequestMatch[1])}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: body.status,
        reviewed_by: actor.admin.id || null,
        reviewed_at: new Date().toISOString(),
      }),
    });
    await recordAdminAudit(actor, "access_request.reviewed", "admin_access_request", accessRequestMatch[1], {
      status: body.status,
    });
    return jsonResponse(res, 200, { ok: true, data: rows[0] });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/overview") {
    return jsonResponse(res, 200, { ok: true, data: await getAdminOverview() });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/reports") {
    return jsonResponse(res, 200, { ok: true, data: await getAdminReports() });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/compliance") {
    return jsonResponse(res, 200, { ok: true, data: await getComplianceDashboard() });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/integrity") {
    return jsonResponse(res, 200, { ok: true, data: await getIntegrityDashboard() });
  }

  const integrityVerifyMatch = url.pathname.match(/^\/admin\/api\/integrity\/([^/]+)\/verify$/);
  if (req.method === "POST" && integrityVerifyMatch) {
    const verification = await verifyIntegrityRecord(integrityVerifyMatch[1], {
      checkStellar: true,
    });
    return jsonResponse(res, verification.verified ? 200 : 409, {
      ok: verification.verified,
      data: verification,
      error: verification.verified ? undefined : verification.reason,
    });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/compliance/dsr") {
    return jsonResponse(res, 200, { ok: true, data: await listDataSubjectRequests() });
  }

  if (req.method === "POST" && url.pathname === "/admin/api/compliance/dsr") {
    const body = await readJsonBody(req);
    if (!body.request_type) {
      return jsonResponse(res, 400, { ok: false, error: "request_type is required." });
    }
    const request = await createDataSubjectRequest({
      userId: body.user_id || null,
      whatsappPhone: body.whatsapp_phone || null,
      requestType: body.request_type,
      description: body.description || null,
      channel: body.channel || "admin",
      metadata: body.metadata || {},
    });
    return jsonResponse(res, 201, { ok: true, data: request });
  }

  const dsrMatch = url.pathname.match(/^\/admin\/api\/compliance\/dsr\/([^/]+)$/);
  if (req.method === "PATCH" && dsrMatch) {
    const body = await readJsonBody(req);
    const patch = pickAllowed(body, [
      "status",
      "description",
      "identity_checked_at",
      "legal_hold_reason",
      "admin_owner",
      "response_summary",
      "completed_at",
      "metadata",
    ]);
    return jsonResponse(res, 200, { ok: true, data: await updateDataSubjectRequest(dsrMatch[1], patch) });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/compliance/breaches") {
    return jsonResponse(res, 200, { ok: true, data: await listBreachIncidents() });
  }

  if (req.method === "POST" && url.pathname === "/admin/api/compliance/breaches") {
    const body = await readJsonBody(req);
    if (!body.summary) {
      return jsonResponse(res, 400, { ok: false, error: "summary is required." });
    }
    const incident = await createBreachIncident({
      severity: body.severity || "low",
      status: body.status || "suspected",
      summary: body.summary,
      affected_data_categories: body.affected_data_categories || [],
      affected_subject_count: Number(body.affected_subject_count || 0),
      notifiable_decision: body.notifiable_decision || null,
      root_cause: body.root_cause || null,
      remediation: body.remediation || null,
      metadata: body.metadata || {},
    });
    return jsonResponse(res, 201, { ok: true, data: incident });
  }

  const breachMatch = url.pathname.match(/^\/admin\/api\/compliance\/breaches\/([^/]+)$/);
  if (req.method === "PATCH" && breachMatch) {
    const body = await readJsonBody(req);
    const patch = pickAllowed(body, [
      "severity",
      "status",
      "summary",
      "affected_data_categories",
      "affected_subject_count",
      "contained_at",
      "notifiable_decision",
      "regulator_notified_at",
      "users_notified_at",
      "root_cause",
      "remediation",
      "metadata",
    ]);
    return jsonResponse(res, 200, { ok: true, data: await updateBreachIncident(breachMatch[1], patch) });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/compliance/processors") {
    return jsonResponse(res, 200, { ok: true, data: await listProcessorContracts() });
  }

  const processorMatch = url.pathname.match(/^\/admin\/api\/compliance\/processors\/([^/]+)$/);
  if (req.method === "PATCH" && processorMatch) {
    const body = await readJsonBody(req);
    const patch = pickAllowed(body, [
      "dpa_status",
      "risk_level",
      "transfer_mechanism",
      "contract_url",
      "review_due_at",
      "admin_notes",
    ]);
    return jsonResponse(res, 200, { ok: true, data: await updateProcessorContract(processorMatch[1], patch) });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/compliance/retention") {
    return jsonResponse(res, 200, { ok: true, data: await listRetentionRules() });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/compliance/tasks") {
    return jsonResponse(res, 200, { ok: true, data: await listComplianceTasks() });
  }

  const complianceTaskMatch = url.pathname.match(/^\/admin\/api\/compliance\/tasks\/([^/]+)$/);
  if (req.method === "PATCH" && complianceTaskMatch) {
    const body = await readJsonBody(req);
    const patch = pickAllowed(body, [
      "status",
      "priority",
      "owner",
      "due_at",
      "evidence_url",
      "notes",
    ]);
    return jsonResponse(res, 200, { ok: true, data: await updateComplianceTask(complianceTaskMatch[1], patch) });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/support") {
    return jsonResponse(res, 200, { ok: true, data: await listSupportRequests(100) });
  }

  const supportMatch = url.pathname.match(/^\/admin\/api\/support\/([^/]+)$/);
  if (req.method === "PATCH" && supportMatch) {
    const body = await readJsonBody(req);
    if (body.status && !["open", "in_review", "resolved"].includes(body.status)) {
      return jsonResponse(res, 400, { ok: false, error: "Invalid support status." });
    }

    const request = await updateSupportRequest(supportMatch[1], {
      status: body.status,
      admin_note: body.admin_note,
    });
    if (!request) {
      return jsonResponse(res, 404, { ok: false, error: "Support request not found." });
    }

    const user = request.user_id ? await getUserById(request.user_id) : null;
    if (user?.whatsapp_phone) {
      const heading = request.status === "resolved"
        ? "Support request resolved"
        : "Support request updated";
      const message = [
        title(heading),
        "",
        request.reference ? `*Reference:* ${request.reference}` : "",
        request.admin_note || (
          request.status === "resolved"
            ? "Akara support has completed its review."
            : "Akara support is reviewing your request."
        ),
      ].filter(Boolean).join("\n");
      await sendWhatsAppText(user.whatsapp_phone, message).catch((error) => {
        console.error(`[admin] support update failed for ${user.whatsapp_phone}: ${error.message}`);
      });
    }

    return jsonResponse(res, 200, { ok: true, data: request });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/users") {
    const users = await listAllAdminRowsWithFallback(
      "users",
      "id,whatsapp_phone,display_name,legal_name,verification_status,verification_score,completed_deals_count,cancelled_deals_24h,total_cancelled_deals,dispute_count,risk_status,dispute_hold,hold_until,admin_banned,admin_ban_reason,swap_restricted_currencies,created_at,payment_profiles(id,currency,method,account_name,bank_name,momo_network,created_at)",
      "id,whatsapp_phone,display_name,legal_name,verification_status,verification_score,completed_deals_count,cancelled_deals_24h,total_cancelled_deals,dispute_count,risk_status,dispute_hold,hold_until,created_at,payment_profiles(id,currency,method,account_name,bank_name,momo_network,created_at)",
      { order: "created_at.desc", maxRows: 100 }
    );
    return jsonResponse(res, 200, { ok: true, data: users });
  }

  if (req.method === "GET" && url.pathname === "/admin/api/verifications") {
    const { data, schemaWarning } = await listVerificationQueue();
    return jsonResponse(res, 200, { ok: true, data, schemaWarning });
  }

  if (req.method === "POST" && url.pathname === "/admin/api/storage-signed-url") {
    const body = await readJsonBody(req);
    if (!body.bucket || !body.path) {
      return jsonResponse(res, 400, { ok: false, error: "bucket and path are required." });
    }
    const bucket = String(body.bucket);
    const objectPath = String(body.path);
    if (!ALLOWED_PRIVATE_STORAGE_BUCKETS.has(bucket) || objectPath.includes("..")) {
      return jsonResponse(res, 400, {
        ok: false,
        error: "That private file location is not available to this admin tool.",
      });
    }
    const signedUrl = await createStorageSignedUrl(bucket, objectPath, 600);
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

  const userDetailsMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/details$/);
  if (req.method === "GET" && userDetailsMatch) {
    const details = await getAdminUserDetails(userDetailsMatch[1]);
    if (!details) return jsonResponse(res, 404, { ok: false, error: "User not found." });
    return jsonResponse(res, 200, { ok: true, data: details });
  }

  const userRestrictionsMatch = url.pathname.match(/^\/admin\/api\/users\/([^/]+)\/restrictions$/);
  if (req.method === "PATCH" && userRestrictionsMatch) {
    const body = await readJsonBody(req);
    const currencies = Array.isArray(body.swap_restricted_currencies)
      ? body.swap_restricted_currencies.filter((currency) => ["NGN", "RWF", "GHS", "KES", "XAF"].includes(currency))
      : [];
    const patch = {
      admin_banned: Boolean(body.admin_banned),
      admin_ban_reason: body.admin_banned ? String(body.admin_ban_reason || "").trim() || null : null,
      swap_restricted_currencies: currencies,
    };
    if (patch.admin_banned && !patch.admin_ban_reason) {
      return jsonResponse(res, 400, { ok: false, error: "Add a reason before banning this user." });
    }
    const rows = await supabaseRequest(`users?id=eq.${filterValue(userRestrictionsMatch[1])}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!rows[0]) return jsonResponse(res, 404, { ok: false, error: "User not found." });
    await recordAdminAudit(actor, "user.restrictions_updated", "user", userRestrictionsMatch[1], patch);
    return jsonResponse(res, 200, { ok: true, data: rows[0] });
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
    await recordAdminAudit(actor, "user.status_updated", "user", userStatusMatch[1], patch);
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
    await recordAdminAudit(actor, "verification.decision", "verification_request", request.id, {
      decision,
      user_id: request.user_id,
      admin_notes: body.admin_notes || null,
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
      const menuBody = mainMenu(user);
      try {
        await sendWhatsAppList(user.whatsapp_phone, mainMenuListPayload(menuBody));
      } catch (error) {
        console.error(`[admin] verification menu failed for ${user.whatsapp_phone}: ${error.message}`);
        await sendWhatsAppText(user.whatsapp_phone, menuBody).catch((fallbackError) => {
          console.error(`[admin] verification menu fallback failed for ${user.whatsapp_phone}: ${fallbackError.message}`);
        });
      }
    } else {
      sendWhatsAppText(
        user.whatsapp_phone,
        "Your Akara verification was not approved. Use the Start verification button in Akara to submit again with clearer details."
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
    await recordAdminAudit(actor, "listing.status_updated", "listing", listingStatusMatch[1], {
      status: body.status,
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
    if (body.status === "resolved" && !["resume_trade", "close_refunded", "close_completed"].includes(outcome)) {
      return jsonResponse(res, 400, {
        ok: false,
        error: "Choose whether the trade resumes, closes after a refund, or closes as completed.",
      });
    }
    const rows = await supabaseRequest(`disputes?id=eq.${filterValue(disputeStatusMatch[1])}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: body.status,
        resolution: body.resolution || null,
        resolved_at: ["resolved", "rejected"].includes(body.status) ? new Date().toISOString() : null,
      }),
    });
    await recordAdminAudit(actor, "dispute.status_updated", "dispute", disputeStatusMatch[1], {
      status: body.status,
      outcome,
      resolution: body.resolution || null,
    });

    const dispute = await getDisputeWithDeal(disputeStatusMatch[1]);
    if (dispute) {
      await applyDisputeDealOutcome(dispute, outcome, body.status);
      const updatedDispute = {
        ...dispute,
        status: body.status,
        resolution: body.resolution || null,
        resolved_at: ["resolved", "rejected"].includes(body.status)
          ? new Date().toISOString()
          : dispute.resolved_at,
      };
      if (["resolved", "rejected"].includes(body.status)) {
        await releaseDisputeHolds(dispute.deals);
        await recordDisputeOutcomeIntegrity(updatedDispute, outcome).catch((error) => {
          console.error(`[stellar-integrity] dispute record failed for ${dispute.id}: ${error.message}`);
        });
      }
      if (body.status === "resolved" && outcome === "close_completed") {
        const completedDeal = await getDealById(dispute.deal_id);
        await recordCompletedDealIntegrity(completedDeal, {
          completionBasis: "admin_resolution",
        }).catch((error) => {
          console.error(`[stellar-integrity] admin completion record failed for ${dispute.deal_id}: ${error.message}`);
        });
        await markLiquidityRouteDealCompleted(completedDeal).catch((error) => {
          console.error(`[liquidity-route] admin completion update failed for ${dispute.deal_id}: ${error.message}`);
        });
      }
      await notifyDisputeParticipants(updatedDispute, outcome);
    }

    return jsonResponse(res, 200, { ok: true, data: rows[0] });
  }

  return jsonResponse(res, 404, { ok: false, error: "Admin endpoint not found." });
}

module.exports = {
  handleAdminApi,
  adminFilePath,
};
