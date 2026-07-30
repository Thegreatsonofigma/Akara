#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
loadEnv(path.join(rootDir, ".env"));

const supabaseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const shouldPurgeStorage = process.argv.includes("--purge-storage");

const operationalTables = [
  "users",
  "verification_requests",
  "payment_profiles",
  "listings",
  "negotiable_offers",
  "deals",
  "deal_proofs",
  "fees",
  "disputes",
  "penalties",
  "message_sessions",
  "audit_events",
  "security_challenges",
  "privacy_consents",
  "data_subject_requests",
  "data_deletion_jobs",
  "stellar_anchor_batches",
  "integrity_records",
  "user_reputation_snapshots",
  "market_rate_snapshots",
  "locked_quotes",
  "reputation_credentials",
  "liquidity_route_plans",
  "liquidity_route_legs",
];

const preservedTables = [
  "admin_users",
  "admin_sessions",
  "admin_access_requests",
  "admin_audit_events",
  "waitlist_signups",
  "processor_contracts",
  "retention_rules",
  "compliance_tasks",
  "data_breach_incidents",
];

const privateBuckets = ["verification-documents", "deal-proofs"];

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;

    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[name]) process.env[name] = value;
  }
}

function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value || value.startsWith("replace_with_")) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function authHeaders(extra = {}) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function countTable(table) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=0`, {
    headers: authHeaders({
      prefer: "count=exact",
      range: "0-0",
    }),
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    if (body.includes("PGRST205") || body.includes("42P01")) return null;
    throw new Error(`Unable to count ${table}: ${response.status} ${body}`);
  }

  const contentRange = response.headers.get("content-range") || "";
  const total = contentRange.split("/")[1];
  return total === "*" ? 0 : Number(total || 0);
}

async function listBucketObjects(bucket, prefix = "") {
  const objects = [];
  let offset = 0;

  while (true) {
    const response = await fetch(`${supabaseUrl}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({
        prefix,
        limit: 1000,
        offset,
        sortBy: { column: "name", order: "asc" },
      }),
    });

    if (response.status === 404) return [];
    if (!response.ok) {
      throw new Error(`Unable to inspect ${bucket}: ${response.status} ${await response.text()}`);
    }

    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;

    for (const entry of page) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) {
        objects.push(objectPath);
      } else {
        objects.push(...await listBucketObjects(bucket, objectPath));
      }
    }

    if (page.length < 1000) break;
    offset += page.length;
  }

  return objects;
}

async function deleteBucketObjects(bucket, objects) {
  for (let offset = 0; offset < objects.length; offset += 1000) {
    const prefixes = objects.slice(offset, offset + 1000);
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: authHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ prefixes }),
    });

    if (!response.ok) {
      throw new Error(`Unable to clean ${bucket}: ${response.status} ${await response.text()}`);
    }
  }
}

async function collectSnapshot() {
  const operational = {};
  const preserved = {};
  const storage = {};

  for (const table of operationalTables) operational[table] = await countTable(table);
  for (const table of preservedTables) preserved[table] = await countTable(table);
  for (const bucket of privateBuckets) storage[bucket] = (await listBucketObjects(bucket)).length;

  return { operational, preserved, storage };
}

function printGroup(title, values) {
  console.log(`\n${title}`);
  for (const [name, count] of Object.entries(values)) {
    console.log(`  ${name}: ${count === null ? "not installed" : count}`);
  }
}

async function run() {
  if (shouldPurgeStorage) {
    if (process.env.AKARA_CONFIRM_PRELAUNCH_PURGE !== "DELETE_TEST_DATA") {
      throw new Error(
        "Refusing storage cleanup. Set AKARA_CONFIRM_PRELAUNCH_PURGE=DELETE_TEST_DATA for this command."
      );
    }

    for (const bucket of privateBuckets) {
      const objects = await listBucketObjects(bucket);
      await deleteBucketObjects(bucket, objects);
      console.log(`Removed ${objects.length} test object(s) from ${bucket}.`);
    }
  }

  const snapshot = await collectSnapshot();
  printGroup("Operational records (must be zero after SQL cleanup)", snapshot.operational);
  printGroup("Preserved production configuration", snapshot.preserved);
  printGroup("Private storage objects (must be zero after storage cleanup)", snapshot.storage);

  const remainingRows = Object.values(snapshot.operational)
    .filter((count) => count !== null)
    .reduce((sum, count) => sum + count, 0);
  const remainingObjects = Object.values(snapshot.storage).reduce((sum, count) => sum + count, 0);
  if (remainingRows || remainingObjects) {
    process.exitCode = 2;
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
