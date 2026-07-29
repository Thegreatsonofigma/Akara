const fs = require("node:fs");

const DEFAULT_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

function jsonResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function textResponse(res, statusCode, body) {
  res.writeHead(statusCode, { "content-type": "text/plain" });
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
  return JSON.parse(raw);
}

async function readJsonBody(req) {
  return parseJsonBody(await readRawBody(req));
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
  jsonResponse,
  textResponse,
  readRawBody,
  parseJsonBody,
  readJsonBody,
  serveFile,
};
