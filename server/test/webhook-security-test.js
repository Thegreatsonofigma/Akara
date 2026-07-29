#!/usr/bin/env node

process.env.NODE_ENV = "production";
process.env.RAILWAY_PROJECT_ID = "test-railway-project";
process.env.HOST = "127.0.0.1";
process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.META_APP_SECRET = "test-meta-app-secret";
process.env.AKARA_REQUIRE_WEBHOOK_SIGNATURE = "true";
process.env.AKARA_SEND_MODE = "whatsapp";
process.env.AKARA_ADMIN_TOKEN = "test-admin-token-that-is-at-least-32-characters";
process.env.WHATSAPP_VERIFY_TOKEN = "test-webhook-verify-token";
process.env.WHATSAPP_ACCESS_TOKEN = "test-whatsapp-access-token";
process.env.WHATSAPP_PHONE_NUMBER_ID = "1234567890";
process.env.AKARA_PUBLIC_URL = "https://api.tryakara.test";
process.env.AKARA_SHARE_URL = "https://api.tryakara.test";

const crypto = require("node:crypto");
const { verifyMetaWebhookSignature } = require("../app");
const { config } = require("../config");

let passed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push({ label, detail });
}

async function run() {
  check(
    "Railway overrides a copied localhost binding",
    config.host === "0.0.0.0",
    config.host
  );

  const body = Buffer.from(JSON.stringify({
    object: "whatsapp_business_account",
    entry: [],
  }));

  check(
    "unsigned Meta webhook is rejected",
    verifyMetaWebhookSignature("", body) === false
  );
  check(
    "incorrect Meta webhook signature is rejected",
    verifyMetaWebhookSignature(`sha256=${"0".repeat(64)}`, body) === false
  );

  const signature = `sha256=${crypto
    .createHmac("sha256", process.env.META_APP_SECRET)
    .update(body)
    .digest("hex")}`;
  check(
    "correct Meta webhook signature is accepted",
    verifyMetaWebhookSignature(signature, body) === true
  );
  check(
    "signature cannot be reused for a modified payload",
    verifyMetaWebhookSignature(signature, Buffer.from(`${body.toString("utf8")} `)) === false
  );

  if (failures.length) {
    failures.forEach((failure) => {
      console.error(`FAIL: ${failure.label}`);
      if (failure.detail) console.error(`  ${failure.detail}`);
    });
    process.exitCode = 1;
    return;
  }

  console.log(`Webhook security tests passed: ${passed}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
