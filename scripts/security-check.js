#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const failures = [];

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  }).split("\0").filter(Boolean);
}

const secretPatterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/],
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Stripe live key", /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/],
];

const browserRoots = ["admin/", "public/", "website/public/"];
const serverSecretNames = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "META_APP_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "AKARA_ADMIN_TOKEN",
  "STELLAR_SECRET_KEY",
  "OPENAI_API_KEY",
];

for (const relative of trackedFiles()) {
  const normalized = relative.replaceAll("\\", "/");
  const base = path.basename(normalized);
  if (/^\.env(?:\.|$)/.test(base) && !/example|sample|template/i.test(base)) {
    failures.push(`${relative}: tracked environment file`);
    continue;
  }

  const fullPath = path.join(root, relative);
  let content;
  try {
    const buffer = fs.readFileSync(fullPath);
    if (buffer.includes(0)) continue;
    content = buffer.toString("utf8");
  } catch {
    continue;
  }

  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) failures.push(`${relative}: possible ${label}`);
  }

  const browserVisible = browserRoots.some((prefix) => normalized.startsWith(prefix))
    || /^\s*["']use client["'];/m.test(content);
  if (browserVisible) {
    for (const name of serverSecretNames) {
      if (content.includes(name)) {
        failures.push(`${relative}: server secret name ${name} referenced in browser code`);
      }
    }
  }

  if (/NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE_ROLE|PRIVATE|TOKEN|PASSWORD|KEY)/.test(content)) {
    failures.push(`${relative}: potentially sensitive NEXT_PUBLIC_* variable`);
  }
}

if (failures.length) {
  console.error("Security check failed:");
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Security check passed: tracked files contain no recognized secrets or browser-side privileged keys.");
