const fs = require("node:fs");

const DEFAULT_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_JSON_LIMIT_BYTES = 256 * 1024;

function applySecurityHeaders(req, res) {
  const isProduction = process.env.NODE_ENV === "production";
  const pathname = String(req?.url || "").split("?")[0];
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  const styleSources = isAdmin
    ? "'self' 'unsafe-inline' https://unpkg.com"
    : "'self' 'unsafe-inline'";
  const fontSources = isAdmin
    ? "'self' data: https://unpkg.com"
    : "'self' data:";

  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("x-dns-prefetch-control", "off");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
  );
  res.setHeader(
    "content-security-policy",
    [
      "default-src 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self'",
      `style-src ${styleSources}`,
      `font-src ${fontSources}`,
      "img-src 'self' data: https:",
      "connect-src 'self'",
    ].join("; ")
  );

  if (isProduction) {
    res.setHeader(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains"
    );
  }
}

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function textResponse(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

async function readRawBody(req, limitBytes = DEFAULT_BODY_LIMIT_BYTES) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > limitBytes) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseJsonBody(rawBody) {
  const raw = Buffer.isBuffer(rawBody)
    ? rawBody.toString("utf8")
    : String(rawBody || "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function readJsonBody(req, limitBytes = DEFAULT_JSON_LIMIT_BYTES) {
  const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
  if (contentType && !contentType.includes("application/json")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
  }
  return parseJsonBody(await readRawBody(req, limitBytes));
}

function serveFile(res, filePath, contentType) {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  res.end(body);
}

module.exports = {
  applySecurityHeaders,
  jsonResponse,
  textResponse,
  readRawBody,
  parseJsonBody,
  readJsonBody,
  serveFile,
};
