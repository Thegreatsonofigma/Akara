// In-memory stand-in for lib/supabase.js implementing the PostgREST subset
// the server actually uses: eq/neq/gt/gte/lt/lte/like/in/not.in filters,
// or=(...) groups, multi-column order, limit/offset, on_conflict upserts, and
// the one embedded join (listings -> users). Lets the whole bot run offline.

const crypto = require("node:crypto");

const tables = {};

function reset() {
  for (const key of Object.keys(tables)) delete tables[key];
}

function table(name) {
  if (!tables[name]) tables[name] = [];
  return tables[name];
}

function likeToRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function compareValues(a, b) {
  const aNum = Number(a);
  const bNum = Number(b);
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function matchCondition(row, column, expression) {
  if (expression.startsWith("eq.")) return String(row[column]) === expression.slice(3);
  if (expression.startsWith("neq.")) return String(row[column]) !== expression.slice(4);
  if (expression.startsWith("gte.")) return compareValues(row[column], expression.slice(4)) >= 0;
  if (expression.startsWith("lte.")) return compareValues(row[column], expression.slice(4)) <= 0;
  if (expression.startsWith("gt.")) return compareValues(row[column], expression.slice(3)) > 0;
  if (expression.startsWith("lt.")) return compareValues(row[column], expression.slice(3)) < 0;
  if (expression.startsWith("like.")) return likeToRegex(expression.slice(5)).test(String(row[column] ?? ""));
  if (expression.startsWith("in.(")) {
    const values = expression.slice(4, -1).split(",");
    return values.includes(String(row[column]));
  }
  if (expression.startsWith("not.in.(")) {
    const values = expression.slice(8, -1).split(",");
    return !values.includes(String(row[column]));
  }
  throw new Error(`fake-supabase: unsupported filter "${column}=${expression}"`);
}

function matchOrGroup(row, group) {
  const conditions = group.slice(1, -1).split(",");
  return conditions.some((condition) => {
    const firstDot = condition.indexOf(".");
    const column = condition.slice(0, firstDot);
    const expression = condition.slice(firstDot + 1);
    return matchCondition(row, column, expression);
  });
}

function parsePath(pathname) {
  const [tableName, queryString = ""] = pathname.split("?");
  const params = [];
  for (const part of queryString.split("&")) {
    if (!part) continue;
    const equalsIndex = part.indexOf("=");
    params.push([
      decodeURIComponent(part.slice(0, equalsIndex)),
      decodeURIComponent(part.slice(equalsIndex + 1)),
    ]);
  }
  return { tableName, params };
}

function applyQuery(rows, params) {
  let result = rows;
  let order = null;
  let limit = null;
  let offset = 0;
  let select = null;

  for (const [key, value] of params) {
    if (key === "select") select = value;
    else if (key === "order") order = value;
    else if (key === "limit") limit = Number(value);
    else if (key === "offset") offset = Number(value);
    else if (key === "on_conflict") continue;
    else if (key === "or") result = result.filter((row) => matchOrGroup(row, value));
    else result = result.filter((row) => matchCondition(row, key, value));
  }

  if (order) {
    const keys = order.split(",").map((piece) => {
      const [column, direction] = piece.split(".");
      return { column, desc: direction === "desc" };
    });
    result = [...result].sort((a, b) => {
      for (const { column, desc } of keys) {
        const aValue = typeof a[column] === "boolean" ? (a[column] ? 1 : 0) : a[column];
        const bValue = typeof b[column] === "boolean" ? (b[column] ? 1 : 0) : b[column];
        const compared = compareValues(aValue, bValue);
        if (compared !== 0) return desc ? -compared : compared;
      }
      return 0;
    });
  }

  if (offset) result = result.slice(offset);
  if (limit !== null && Number.isFinite(limit)) result = result.slice(0, limit);

  // The only embedded join in the codebase: listing owner stats.
  if (select && select.includes("users!")) {
    result = result.map((row) => ({
      ...row,
      users: table("users").find((user) => user.id === row.owner_user_id) || {},
    }));
  }

  return result;
}

function filtersOnly(params) {
  return params.filter(([key]) => !["select", "order", "limit", "offset", "on_conflict"].includes(key));
}

function matchesFilters(row, params) {
  return filtersOnly(params).every(([key, value]) =>
    key === "or" ? matchOrGroup(row, value) : matchCondition(row, key, value)
  );
}

async function supabaseRequest(pathname, options = {}) {
  const { tableName, params } = parsePath(pathname);
  const method = (options.method || "GET").toUpperCase();
  const rows = table(tableName);
  const body = options.body ? JSON.parse(options.body) : null;

  if (method === "GET") return applyQuery(rows, params);

  if (method === "POST") {
    const conflictColumn = params.find(([key]) => key === "on_conflict")?.[1];
    const inserts = Array.isArray(body) ? body : [body];
    const returned = [];
    for (const insert of inserts) {
      const existing = conflictColumn
        ? rows.find((row) => String(row[conflictColumn]) === String(insert[conflictColumn]))
        : null;
      if (existing) {
        Object.assign(existing, insert);
        returned.push(existing);
      } else {
        const row = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          ...insert,
        };
        rows.push(row);
        returned.push(row);
      }
    }
    return returned;
  }

  if (method === "PATCH") {
    const matched = rows.filter((row) => matchesFilters(row, params));
    for (const row of matched) Object.assign(row, body);
    return matched;
  }

  if (method === "DELETE") {
    const matched = rows.filter((row) => matchesFilters(row, params));
    for (const row of matched) rows.splice(rows.indexOf(row), 1);
    return matched;
  }

  throw new Error(`fake-supabase: unsupported method ${method}`);
}

function filterValue(value) {
  return encodeURIComponent(value);
}

async function uploadSupabaseStorage(bucket, objectPath) {
  return objectPath;
}

async function createStorageSignedUrl(bucket, objectPath) {
  return `https://fake.storage/${bucket}/${objectPath}`;
}

module.exports = {
  supabaseRequest,
  filterValue,
  uploadSupabaseStorage,
  createStorageSignedUrl,
  __tables: tables,
  __table: table,
  __reset: reset,
};
