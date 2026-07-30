#!/usr/bin/env node

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AKARA_SEND_MODE = "log";
process.env.AKARA_ADMIN_TOKEN = "test-admin-token-that-is-at-least-32-characters";

const { Readable } = require("node:stream");
const fs = require("node:fs");
const path = require("node:path");
const {
  applySecurityHeaders,
  parseJsonBody,
  readJsonBody,
} = require("../lib/http");
const {
  adminSessionCookie,
} = require("../lib/admin-auth");
const {
  consumeRateLimit,
} = require("../lib/rate-limit");
const {
  validAuthorizationPasscode,
  validNewPasscode,
} = require("../lib/security");

const failures = [];
let passed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(label);
}

async function expectedStatus(promise, statusCode) {
  try {
    await promise;
    return false;
  } catch (error) {
    return error.statusCode === statusCode;
  }
}

async function run() {
  const headers = {};
  applySecurityHeaders(
    { url: "/admin", headers: {} },
    { setHeader(name, value) { headers[name.toLowerCase()] = value; } }
  );
  check("content sniffing is disabled", headers["x-content-type-options"] === "nosniff");
  check("admin framing is blocked", headers["x-frame-options"] === "DENY");
  check("CSP blocks object content", headers["content-security-policy"].includes("object-src 'none'"));

  let malformedStatus = null;
  try {
    parseJsonBody(Buffer.from("{broken"));
  } catch (error) {
    malformedStatus = error.statusCode;
  }
  check("malformed JSON is a client error", malformedStatus === 400);

  const wrongType = Readable.from([Buffer.from("{}")]);
  wrongType.headers = { "content-type": "text/plain" };
  check(
    "explicit non-JSON request bodies are rejected",
    await expectedStatus(readJsonBody(wrongType), 415)
  );

  const cookie = adminSessionCookie("session-value");
  check("admin session cookie is HttpOnly", cookie.includes("HttpOnly"));
  check("admin session cookie is strict same-site", cookie.includes("SameSite=Strict"));
  check("admin session cookie is scoped to admin routes", cookie.includes("Path=/admin"));

  check("new passcodes require six digits", validNewPasscode("123456"));
  check("short new passcodes are rejected", !validNewPasscode("12345"));
  check("legacy passcodes remain usable during migration", validAuthorizationPasscode("1234"));

  const securityFlow = JSON.parse(fs.readFileSync(
    path.join(__dirname, "../../docs/akara-security-flow.json"),
    "utf8"
  ));
  check("security flow has one connected terminal screen", securityFlow.screens.length === 1);
  check("security flow entry screen matches the server contract", securityFlow.screens[0]?.id === "SECURITY_PIN");

  const subject = `test-${Date.now()}`;
  check("first limited request is accepted", consumeRateLimit("test", subject, 1, 1000).allowed);
  check("excess limited request is rejected", !consumeRateLimit("test", subject, 1, 1000).allowed);

  if (failures.length) {
    failures.forEach((failure) => console.error(`FAIL: ${failure}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Security hardening tests passed: ${passed}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
