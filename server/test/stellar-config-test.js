#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const StellarSdk = require("@stellar/stellar-sdk");

const rootDir = path.resolve(__dirname, "..", "..");
const anchor = StellarSdk.Keypair.random();
const otherAnchor = StellarSdk.Keypair.random();
const baseEnvironment = {
  ...process.env,
  NODE_ENV: "test",
  SUPABASE_URL: "https://fake.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
  AKARA_SEND_MODE: "log",
  AKARA_STELLAR_NETWORK: "testnet",
  AKARA_STELLAR_MAINNET_ACK: "false",
  AKARA_STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  AKARA_STELLAR_SECRET_KEY: anchor.secret(),
  AKARA_STELLAR_PUBLIC_KEY: anchor.publicKey(),
  AKARA_INTEGRITY_HMAC_SECRET: "test-only-integrity-secret-with-more-than-32-bytes",
};
const validationScript = [
  "const { validateStellarIntegrityConfiguration } = require('./server/lib/stellar');",
  "const result = validateStellarIntegrityConfiguration({ production: process.env.TEST_PRODUCTION === 'true' });",
  "process.stdout.write(JSON.stringify(result));",
].join("");

let passed = 0;
const failures = [];

function validate(environment = {}) {
  return spawnSync(process.execPath, ["-e", validationScript], {
    cwd: rootDir,
    env: {
      ...baseEnvironment,
      ...environment,
    },
    encoding: "utf8",
  });
}

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${label}${detail ? `: ${String(detail).slice(0, 300)}` : ""}`);
}

const disabled = validate({
  AKARA_STELLAR_INTEGRITY_ENABLED: "false",
  AKARA_STELLAR_SECRET_KEY: "replace_with_secret",
  AKARA_STELLAR_PUBLIC_KEY: "replace_with_public",
  AKARA_INTEGRITY_HMAC_SECRET: "replace_with_hmac",
});
check("disabled Stellar configuration is a safe no-op", disabled.status === 0, disabled.stderr);

const valid = validate({ AKARA_STELLAR_INTEGRITY_ENABLED: "true" });
check("valid testnet configuration passes", valid.status === 0, valid.stderr);
check("validation returns the pinned public key", valid.stdout.includes(anchor.publicKey()), valid.stdout);

const weakHmac = validate({
  AKARA_STELLAR_INTEGRITY_ENABLED: "true",
  AKARA_INTEGRITY_HMAC_SECRET: "too-short",
});
check("weak integrity HMAC secret is rejected", weakHmac.status !== 0, weakHmac.stderr);

const mismatchedKey = validate({
  AKARA_STELLAR_INTEGRITY_ENABLED: "true",
  AKARA_STELLAR_PUBLIC_KEY: otherAnchor.publicKey(),
});
check("mismatched public key is rejected", mismatchedKey.status !== 0, mismatchedKey.stderr);

const missingProductionPin = validate({
  AKARA_STELLAR_INTEGRITY_ENABLED: "true",
  AKARA_STELLAR_PUBLIC_KEY: "replace_with_public",
  TEST_PRODUCTION: "true",
});
check("production requires an explicit public-key pin", missingProductionPin.status !== 0);

const publicWithoutAcknowledgement = validate({
  AKARA_STELLAR_INTEGRITY_ENABLED: "true",
  AKARA_STELLAR_NETWORK: "public",
  AKARA_STELLAR_HORIZON_URL: "https://horizon.stellar.org",
});
check("public network requires explicit acknowledgement", publicWithoutAcknowledgement.status !== 0);

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Stellar configuration tests passed: ${passed}`);
}
