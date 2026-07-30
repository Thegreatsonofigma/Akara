#!/usr/bin/env node

const { checkStellarReadiness } = require("../server/lib/stellar");

async function run() {
  const readiness = await checkStellarReadiness();
  console.log(JSON.stringify(readiness, null, 2));
}

run().catch((error) => {
  console.error(`[stellar-integrity] readiness failed: ${error.message}`);
  process.exitCode = 1;
});
