#!/usr/bin/env node

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AKARA_SEND_MODE = "log";
process.env.AKARA_ADMIN_TOKEN = "test-admin-token-that-is-at-least-32-characters";

const path = require("node:path");
const crypto = require("node:crypto");
const fakeSupabase = require("./fake-supabase");

function stubModule(relativePath, exports) {
  const filename = path.join(__dirname, "..", relativePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
    children: [],
    paths: [],
  };
}

stubModule("lib/supabase.js", fakeSupabase);

const { handleAdminApi } = require("../admin");
const { __table, __reset } = fakeSupabase;

let passed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push({ label, detail: String(detail).slice(0, 800) });
}

function responseRecorder() {
  return {
    statusCode: 0,
    headers: {},
    payload: null,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body) {
      this.payload = body ? JSON.parse(body) : null;
    },
  };
}

async function request(pathname, token = process.env.AKARA_ADMIN_TOKEN) {
  const req = {
    method: "GET",
    headers: token ? { "x-akara-admin-token": token } : {},
  };
  const res = responseRecorder();
  await handleAdminApi(req, res, new URL(`https://admin.tryakara.test${pathname}`));
  return res;
}

function daysAgo(days, hour = 12) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function run() {
  __reset();

  const users = [
    {
      id: crypto.randomUUID(),
      nationality: "NG",
      residence_country: "RW",
      verification_status: "verified_auto",
      risk_status: "normal",
      dispute_hold: false,
      created_at: daysAgo(2),
    },
    {
      id: crypto.randomUUID(),
      nationality: "KE",
      residence_country: "KE",
      verification_status: "verified_manual",
      risk_status: "watch",
      dispute_hold: true,
      created_at: daysAgo(1),
    },
    {
      id: crypto.randomUUID(),
      nationality: "GH",
      residence_country: "GH",
      verification_status: "pending_review",
      risk_status: "normal",
      dispute_hold: false,
      created_at: daysAgo(0),
    },
  ];
  __table("users").push(...users);
  __table("payment_profiles").push(
    { id: crypto.randomUUID(), currency: "NGN", method: "bank", bank_name: "Kuda", created_at: daysAgo(1) },
    { id: crypto.randomUUID(), currency: "KES", method: "momo", momo_network: "M-Pesa", created_at: daysAgo(1) }
  );
  __table("listings").push(
    { id: crypto.randomUUID(), status: "active", have_currency: "KES", want_currency: "RWF", have_amount: 13000, want_amount: 10000, listing_type: "negotiable", created_at: daysAgo(2) },
    { id: crypto.randomUUID(), status: "active", have_currency: "NGN", want_currency: "GHS", have_amount: 50000, want_amount: 500, listing_type: "negotiable", created_at: daysAgo(1) },
    { id: crypto.randomUUID(), status: "cancelled", have_currency: "RWF", want_currency: "KES", have_amount: 10000, want_amount: 13000, listing_type: "fixed", created_at: daysAgo(6) }
  );

  const dealOneId = crypto.randomUUID();
  const dealTwoId = crypto.randomUUID();
  __table("deals").push(
    { id: dealOneId, status: "closed", have_currency: "KES", want_currency: "RWF", have_amount: 13000, want_amount: 10000, created_at: daysAgo(2, 10), completed_at: daysAgo(2, 11) },
    { id: dealTwoId, status: "completed_pending_fee", have_currency: "NGN", want_currency: "GHS", have_amount: 50000, want_amount: 500, created_at: daysAgo(1, 10), completed_at: daysAgo(1, 10) },
    { id: crypto.randomUUID(), status: "cancelled", have_currency: "RWF", want_currency: "KES", have_amount: 10000, want_amount: 13000, created_at: daysAgo(3), cancelled_at: daysAgo(3) }
  );
  __table("disputes").push(
    { id: crypto.randomUUID(), deal_id: dealOneId, category: "payment_not_received", status: "open", created_at: daysAgo(1) },
    { id: crypto.randomUUID(), deal_id: dealTwoId, category: "wrong_amount", status: "resolved", created_at: daysAgo(4), resolved_at: daysAgo(3) }
  );
  __table("verification_requests").push(
    { id: crypto.randomUUID(), status: "pending_review", id_type: "passport", id_country: "RW", document_ocr_status: "matched", created_at: daysAgo(1) },
    { id: crypto.randomUUID(), status: "verified_manual", id_type: "national_id", id_country: "KE", document_ocr_status: "matched", created_at: daysAgo(3), reviewed_at: daysAgo(2) }
  );
  __table("deal_proofs").push(
    { id: crypto.randomUUID(), deal_id: dealOneId, ocr_status: "matched", ocr_matched: true, ocr_currency: "KES", ocr_expected_currency: "KES", created_at: daysAgo(2) },
    { id: crypto.randomUUID(), deal_id: dealTwoId, ocr_status: "mismatch", ocr_matched: false, ocr_currency: "NGN", ocr_expected_currency: "NGN", created_at: daysAgo(1) }
  );
  __table("audit_events").push({
    id: crypto.randomUUID(),
    entity_type: "support_request",
    event_payload: { status: "open", category: "account_help" },
    created_at: daysAgo(1),
  });

  const missingToken = await request("/admin/api/reports", "");
  check("reports reject a missing admin token", missingToken.statusCode === 401, JSON.stringify(missingToken.payload));

  const wrongToken = await request("/admin/api/session", "wrong-token");
  check("session validation rejects an invalid token", wrongToken.statusCode === 401, JSON.stringify(wrongToken.payload));

  const session = await request("/admin/api/session");
  check(
    "session validation accepts the configured token",
    session.statusCode === 200 && session.payload?.data?.authenticated === true,
    JSON.stringify(session.payload)
  );

  const reports = await request("/admin/api/reports");
  const data = reports.payload?.data;
  check("reports endpoint returns successfully", reports.statusCode === 200 && reports.payload?.ok, JSON.stringify(reports.payload));
  check("overview counts users and verified users", data?.totals?.users === 3 && data?.totals?.verifiedUsers === 2, JSON.stringify(data?.totals));
  check("trade outcomes are interpreted", data?.totals?.completedTrades === 2 && data?.totals?.cancelledTrades === 1, JSON.stringify(data?.totals));
  check("receipt OCR match rate uses reviewed receipts", data?.rates?.receiptMatch === 50, JSON.stringify(data?.rates));
  check("risk and KYC queues are counted", data?.totals?.flaggedUsers === 1 && data?.totals?.pendingKyc === 1, JSON.stringify(data?.totals));
  check("support events are summarized", data?.totals?.supportRequests === 1 && data?.distributions?.supportStatus?.open === 1, JSON.stringify(data?.distributions?.supportStatus));
  check(
    "completed values remain separated by currency",
    data?.currencyVolume?.some((row) => row.currency === "KES" && row.amount === 13000)
      && data?.currencyVolume?.some((row) => row.currency === "RWF" && row.amount === 10000)
      && data?.currencyVolume?.some((row) => row.currency === "NGN" && row.amount === 50000)
      && data?.currencyVolume?.some((row) => row.currency === "GHS" && row.amount === 500),
    JSON.stringify(data?.currencyVolume)
  );
  check(
    "corridors include directional completion performance",
    data?.corridors?.some((row) => row.corridor === "KES->RWF" && row.completed === 1 && row.completionRate === 100),
    JSON.stringify(data?.corridors)
  );
  check(
    "reports produce a complete 30-day activity series",
    data?.activity?.length === 30 && data.activity.some((day) => day.users > 0),
    JSON.stringify(data?.activity)
  );

  if (failures.length) {
    failures.forEach((failure) => {
      console.error(`FAIL: ${failure.label}`);
      if (failure.detail) console.error(`  ${failure.detail}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log(`Admin reports tests passed: ${passed}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
