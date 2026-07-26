#!/usr/bin/env node

const { config } = require("../server/config");
const { supabaseRequest } = require("../server/lib/supabase");
const { isCompletedDeal } = require("../server/db/deals");
const {
  integrityRecordingEnabled,
  recordCompletedDealIntegrity,
  anchorPendingRecords,
} = require("../server/db/integrity");

async function run() {
  if (!integrityRecordingEnabled()) {
    throw new Error(
      "Enable AKARA_STELLAR_INTEGRITY_ENABLED and configure the Stellar and integrity secrets first."
    );
  }

  let offset = 0;
  let recorded = 0;
  const pageSize = 200;

  for (;;) {
    const deals = await supabaseRequest(
      [
        "deals?select=id,deal_code,listing_id,maker_user_id,taker_user_id,have_currency,want_currency,have_amount,want_amount,status,maker_sent_at,taker_sent_at,maker_received_at,taker_received_at,completed_at,created_at",
        "status=in.(closed,completed_pending_fee)",
        "order=created_at.asc",
        `limit=${pageSize}`,
        `offset=${offset}`,
      ].join("&")
    );
    if (!deals.length) break;

    for (const deal of deals) {
      if (!isCompletedDeal(deal)) continue;
      await recordCompletedDealIntegrity(deal, {
        completionBasis: "historical_backfill",
        schedule: false,
      });
      recorded += 1;
    }

    offset += deals.length;
    if (deals.length < pageSize) break;
  }

  let integrityRecordsAnchored = 0;
  const transactionHashes = [];
  for (;;) {
    const anchor = await anchorPendingRecords();
    if (!anchor.anchored) break;
    integrityRecordsAnchored += anchor.anchored;
    if (anchor.transactionHash) transactionHashes.push(anchor.transactionHash);
  }

  console.log(JSON.stringify({
    ok: true,
    network: config.stellarNetwork,
    completedDealsProcessed: recorded,
    integrityRecordsAnchored,
    batchesAnchored: transactionHashes.length,
    transactionHashes,
  }, null, 2));
}

run().catch((error) => {
  console.error(`[stellar-integrity] backfill failed: ${error.message}`);
  process.exitCode = 1;
});
