#!/usr/bin/env node

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AKARA_SEND_MODE = "log";
process.env.AKARA_ADMIN_TOKEN = "test-admin-token-that-is-at-least-32-characters";

const {
  isOnHold,
  swapRestrictionBlockForPair,
} = require("../db/users");
const {
  permissionsFor,
  tokenHash,
} = require("../lib/admin-auth");

const failures = [];
let passed = 0;

function check(label, condition) {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(label);
}

check(
  "super admins receive every administrative permission",
  permissionsFor({ role: "super_admin" }).includes("admins.manage")
    && permissionsFor({ role: "super_admin" }).includes("users.manage")
);
check(
  "support admins cannot manage administrator accounts",
  !permissionsFor({ role: "support" }).includes("admins.manage")
);
check(
  "custom permissions are added without duplicates",
  permissionsFor({
    role: "support",
    permissions: ["reports.view", "support.view"],
  }).filter((permission) => permission === "support.view").length === 1
);
check(
  "an administrative ban places a user on hold",
  isOnHold({ admin_banned: true, dispute_hold: false }) === true
);
check(
  "a currency restriction blocks either side of a pair",
  swapRestrictionBlockForPair(
    { swap_restricted_currencies: ["KES"] },
    "NGN",
    "KES"
  ).includes("KES")
);
check(
  "unrestricted pairs remain available",
  swapRestrictionBlockForPair(
    { swap_restricted_currencies: ["KES"] },
    "NGN",
    "RWF"
  ) === ""
);
check(
  "administrative tokens are stored as deterministic hashes",
  tokenHash("same-token") === tokenHash("same-token")
    && tokenHash("same-token") !== tokenHash("different-token")
);

if (failures.length) {
  failures.forEach((label) => console.error(`FAIL: ${label}`));
  process.exitCode = 1;
} else {
  console.log(`Admin access tests passed: ${passed}`);
}
