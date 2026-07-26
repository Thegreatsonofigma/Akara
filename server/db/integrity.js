const crypto = require("node:crypto");
const { config } = require("../config");
const { supabaseRequest, filterValue } = require("../lib/supabase");
const {
  randomSalt,
  opaqueSubject,
  createCommitment,
  buildMerkleTree,
  verifyMerkleProof,
} = require("../lib/integrity-crypto");
const {
  stellarIntegrityEnabled,
  prepareIntegrityTransaction,
  submitPreparedIntegrityTransaction,
  verifyIntegrityTransaction,
} = require("../lib/stellar");
const { isCompletedDeal } = require("./deals");

let anchorRun = null;

function integrityRecordingEnabled() {
  if (!stellarIntegrityEnabled()) return false;
  if (Buffer.byteLength(config.integrityHmacSecret || "", "utf8") < 32) {
    throw new Error("AKARA_INTEGRITY_HMAC_SECRET must contain at least 32 bytes.");
  }
  return true;
}

function normalizedAmount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric.toFixed(2);
}

function privacySafeProof(proof) {
  return {
    owner: opaqueSubject(config.integrityHmacSecret, "user", proof.user_id),
    content_sha256: proof.content_sha256 || null,
    proof_type: proof.proof_type || "transfer_receipt",
    ocr_status: proof.ocr_status || "pending",
    ocr_matched: Boolean(proof.ocr_matched),
    created_at: proof.created_at || null,
  };
}

function privacySafeDispute(dispute) {
  return {
    subject: opaqueSubject(config.integrityHmacSecret, "dispute", dispute.id),
    category: dispute.category || "unspecified",
    status: dispute.status,
    resolution_digest: dispute.resolution
      ? crypto.createHash("sha256").update(dispute.resolution).digest("hex")
      : null,
    created_at: dispute.created_at || null,
    resolved_at: dispute.resolved_at || null,
  };
}

async function createIntegrityRecord({
  eventKey,
  recordType,
  entityType,
  entityId,
  payload,
  previousCommitmentHash = null,
}) {
  const existing = await supabaseRequest(
    `integrity_records?event_key=eq.${filterValue(eventKey)}&limit=1`
  );
  if (existing.length) return existing[0];

  const salt = randomSalt();
  const commitmentHash = createCommitment(payload, salt);
  try {
    const rows = await supabaseRequest("integrity_records", {
      method: "POST",
      body: JSON.stringify({
        event_key: eventKey,
        record_type: recordType,
        entity_type: entityType,
        entity_id: entityId,
        subject_ref: payload.subject,
        payload_version: 1,
        payload_snapshot: payload,
        salt,
        commitment_hash: commitmentHash,
        previous_commitment_hash: previousCommitmentHash,
        status: "pending",
      }),
    });
    return rows[0] || null;
  } catch (error) {
    if (!/(duplicate|unique|23505)/i.test(String(error?.message || ""))) throw error;
    const concurrent = await supabaseRequest(
      `integrity_records?event_key=eq.${filterValue(eventKey)}&limit=1`
    );
    return concurrent[0] || null;
  }
}

async function recordIntegrityEvent({
  eventKey,
  recordType,
  entityType,
  entityId,
  payload,
  previousCommitmentHash = null,
  schedule = true,
}) {
  if (!integrityRecordingEnabled()) return null;
  const record = await createIntegrityRecord({
    eventKey,
    recordType,
    entityType,
    entityId,
    payload,
    previousCommitmentHash,
  });
  if (record && schedule) scheduleIntegrityAnchoring();
  return record;
}

async function latestReputationSnapshot(userId) {
  const rows = await supabaseRequest(
    `user_reputation_snapshots?user_id=eq.${filterValue(userId)}&order=created_at.desc&limit=1`
  );
  return rows[0] || null;
}

async function getLatestUserReputation(userId) {
  if (!stellarIntegrityEnabled()) return null;
  try {
    const snapshot = await latestReputationSnapshot(userId);
    if (!snapshot) return null;

    const records = await supabaseRequest(
      `integrity_records?id=eq.${filterValue(snapshot.integrity_record_id)}&limit=1`
    );
    const record = records[0] || null;
    let batch = null;
    if (record?.batch_id) {
      const batches = await supabaseRequest(
        `stellar_anchor_batches?id=eq.${filterValue(record.batch_id)}&limit=1`
      );
      batch = batches[0] || null;
    }

    return {
      ...snapshot,
      integrity_status:
        record?.status === "anchored" && batch?.status === "confirmed"
          ? "verified"
          : "pending",
      anchored_at: record?.anchored_at || null,
    };
  } catch (error) {
    console.warn(`[stellar-integrity] reputation unavailable: ${error.message}`);
    return null;
  }
}

async function getLatestUserReputations(userIds) {
  if (!stellarIntegrityEnabled()) return {};
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return {};

  try {
    const snapshots = await supabaseRequest(
      [
        "user_reputation_snapshots?",
        `user_id=in.(${ids.map(filterValue).join(",")})`,
        "&order=created_at.desc",
        `&limit=${Math.max(20, ids.length * 10)}`,
      ].join("")
    );
    const latestByUser = {};
    for (const snapshot of snapshots) {
      if (!latestByUser[snapshot.user_id]) latestByUser[snapshot.user_id] = snapshot;
    }

    const recordIds = Object.values(latestByUser)
      .map((snapshot) => snapshot.integrity_record_id)
      .filter(Boolean);
    if (!recordIds.length) return latestByUser;

    const records = await supabaseRequest(
      `integrity_records?id=in.(${recordIds.map(filterValue).join(",")})`
    );
    const recordsById = Object.fromEntries(records.map((record) => [record.id, record]));
    const batchIds = [...new Set(records.map((record) => record.batch_id).filter(Boolean))];
    const batches = batchIds.length
      ? await supabaseRequest(
          `stellar_anchor_batches?id=in.(${batchIds.map(filterValue).join(",")})`
        )
      : [];
    const batchesById = Object.fromEntries(batches.map((batch) => [batch.id, batch]));

    return Object.fromEntries(
      Object.entries(latestByUser).map(([userId, snapshot]) => {
        const record = recordsById[snapshot.integrity_record_id] || null;
        const batch = record?.batch_id ? batchesById[record.batch_id] : null;
        return [
          userId,
          {
            ...snapshot,
            integrity_status:
              record?.status === "anchored" && batch?.status === "confirmed"
                ? "verified"
                : "pending",
          },
        ];
      })
    );
  } catch (error) {
    console.warn(`[stellar-integrity] reputation batch unavailable: ${error.message}`);
    return {};
  }
}

function reputationBand(metrics) {
  if (metrics.open_disputes > 0) return "review";
  if (metrics.completed_trades >= 10 && metrics.completion_rate >= 95) return "strong";
  if (metrics.completed_trades >= 3 && metrics.completion_rate >= 80) return "established";
  if (metrics.completed_trades >= 1) return "active";
  return "new";
}

async function calculateReputation(userId) {
  const deals = await supabaseRequest(
    [
      "deals?select=id,status,completed_at,cancelled_at,maker_received_at,taker_received_at",
      `or=(maker_user_id.eq.${filterValue(userId)},taker_user_id.eq.${filterValue(userId)})`,
      "limit=5000",
    ].join("&")
  );
  const dealIds = deals.map((deal) => deal.id);
  const disputes = dealIds.length
    ? await supabaseRequest(
      `disputes?select=id,deal_id,status&deal_id=in.(${dealIds.map(filterValue).join(",")})&limit=5000`
    )
    : [];

  const completedTrades = deals.filter(isCompletedDeal).length;
  const cancelledTrades = deals.filter((deal) => deal.status === "cancelled").length;
  const expiredTrades = deals.filter((deal) => deal.status === "expired").length;
  const decidedTrades = completedTrades + cancelledTrades + expiredTrades;
  const completionRate = decidedTrades
    ? Number(((completedTrades / decidedTrades) * 100).toFixed(2))
    : 0;
  const openDisputes = disputes.filter((dispute) =>
    ["open", "waiting_for_user", "under_review"].includes(dispute.status)
  ).length;

  const metrics = {
    completed_trades: completedTrades,
    cancelled_trades: cancelledTrades,
    expired_trades: expiredTrades,
    completion_rate: completionRate,
    disputes_total: disputes.length,
    open_disputes: openDisputes,
    resolved_disputes: disputes.filter((dispute) => dispute.status === "resolved").length,
  };

  return {
    ...metrics,
    reputation_band: reputationBand(metrics),
  };
}

async function createReputationSnapshot(userId, triggerType, triggerId, recordedAt) {
  const eventKey = `reputation:${userId}:${triggerType}:${triggerId}:v1`;
  const existing = await supabaseRequest(
    `user_reputation_snapshots?event_key=eq.${filterValue(eventKey)}&limit=1`
  );
  if (existing.length) return existing[0];

  const previous = await latestReputationSnapshot(userId);
  const metrics = await calculateReputation(userId);
  const subject = opaqueSubject(config.integrityHmacSecret, "user", userId);
  const payload = {
    schema: "akara.reputation.v1",
    subject,
    trigger: {
      type: triggerType,
      subject: opaqueSubject(config.integrityHmacSecret, triggerType, triggerId),
    },
    metrics,
    previous_commitment_hash: previous?.commitment_hash || null,
    recorded_at: recordedAt,
  };

  const integrityRecord = await createIntegrityRecord({
    eventKey,
    recordType: "reputation_snapshot",
    entityType: "user",
    entityId: userId,
    payload,
    previousCommitmentHash: previous?.commitment_hash || null,
  });
  if (!integrityRecord) return null;

  try {
    const rows = await supabaseRequest("user_reputation_snapshots", {
      method: "POST",
      body: JSON.stringify({
        event_key: eventKey,
        user_id: userId,
        trigger_type: triggerType,
        trigger_entity_id: triggerId,
        completed_trades: metrics.completed_trades,
        cancelled_trades: metrics.cancelled_trades,
        expired_trades: metrics.expired_trades,
        completion_rate: metrics.completion_rate,
        disputes_total: metrics.disputes_total,
        open_disputes: metrics.open_disputes,
        resolved_disputes: metrics.resolved_disputes,
        reputation_band: metrics.reputation_band,
        previous_commitment_hash: previous?.commitment_hash || null,
        commitment_hash: integrityRecord.commitment_hash,
        integrity_record_id: integrityRecord.id,
      }),
    });
    return rows[0] || null;
  } catch (error) {
    if (!/(duplicate|unique|23505)/i.test(String(error?.message || ""))) throw error;
    const concurrent = await supabaseRequest(
      `user_reputation_snapshots?event_key=eq.${filterValue(eventKey)}&limit=1`
    );
    return concurrent[0] || null;
  }
}

async function recordCompletedDealIntegrity(deal, options = {}) {
  if (!integrityRecordingEnabled() || !deal?.id) return null;

  const completedAt = deal.completed_at || options.completedAt || new Date().toISOString();
  const [proofs, disputes] = await Promise.all([
    supabaseRequest(
      `deal_proofs?select=id,user_id,proof_type,content_sha256,ocr_status,ocr_matched,created_at&deal_id=eq.${filterValue(deal.id)}&order=created_at.asc`
    ),
    supabaseRequest(
      `disputes?select=id,category,status,resolution,created_at,resolved_at&deal_id=eq.${filterValue(deal.id)}&order=created_at.asc`
    ),
  ]);

  const subject = opaqueSubject(config.integrityHmacSecret, "deal", deal.id);
  const payload = {
    schema: "akara.trade-completion.v1",
    subject,
    listing_subject: opaqueSubject(config.integrityHmacSecret, "listing", deal.listing_id),
    quote_subject: deal.locked_quote_id
      ? opaqueSubject(config.integrityHmacSecret, "quote", deal.locked_quote_id)
      : null,
    parties: {
      maker: opaqueSubject(config.integrityHmacSecret, "user", deal.maker_user_id),
      taker: opaqueSubject(config.integrityHmacSecret, "user", deal.taker_user_id),
    },
    locked_terms: {
      have_currency: deal.have_currency,
      have_amount: normalizedAmount(deal.have_amount),
      want_currency: deal.want_currency,
      want_amount: normalizedAmount(deal.want_amount),
    },
    timeline: {
      maker_sent_at: deal.maker_sent_at || null,
      taker_sent_at: deal.taker_sent_at || null,
      maker_received_at: deal.maker_received_at || null,
      taker_received_at: deal.taker_received_at || null,
      completed_at: completedAt,
    },
    completion_basis: options.completionBasis || "mutual_confirmation",
    evidence: proofs.map(privacySafeProof),
    disputes: disputes.map(privacySafeDispute),
  };

  const record = await createIntegrityRecord({
    eventKey: `trade:${deal.id}:completed:v1`,
    recordType: "trade_completion",
    entityType: "deal",
    entityId: deal.id,
    payload,
  });

  await Promise.all([
    createReputationSnapshot(deal.maker_user_id, "deal", deal.id, completedAt),
    createReputationSnapshot(deal.taker_user_id, "deal", deal.id, completedAt),
  ]);
  if (options.schedule !== false) scheduleIntegrityAnchoring();
  return record;
}

async function recordDisputeOutcomeIntegrity(dispute, outcome) {
  if (!integrityRecordingEnabled() || !dispute?.id || !dispute?.deal_id) return null;
  const recordedAt = dispute.resolved_at || new Date().toISOString();
  const deal = dispute.deals || {};
  const payload = {
    schema: "akara.dispute-outcome.v1",
    subject: opaqueSubject(config.integrityHmacSecret, "dispute", dispute.id),
    trade_subject: opaqueSubject(config.integrityHmacSecret, "deal", dispute.deal_id),
    opened_by: dispute.opened_by_user_id
      ? opaqueSubject(config.integrityHmacSecret, "user", dispute.opened_by_user_id)
      : null,
    category: dispute.category,
    status: dispute.status,
    outcome,
    description_digest: dispute.description
      ? crypto.createHash("sha256").update(dispute.description).digest("hex")
      : null,
    resolution_digest: dispute.resolution
      ? crypto.createHash("sha256").update(dispute.resolution).digest("hex")
      : null,
    recorded_at: recordedAt,
  };

  const record = await createIntegrityRecord({
    eventKey: `dispute:${dispute.id}:${dispute.status}:${outcome}:v1`,
    recordType: "dispute_outcome",
    entityType: "dispute",
    entityId: dispute.id,
    payload,
  });

  if (deal.maker_user_id && deal.taker_user_id) {
    await Promise.all([
      createReputationSnapshot(deal.maker_user_id, "dispute", dispute.id, recordedAt),
      createReputationSnapshot(deal.taker_user_id, "dispute", dispute.id, recordedAt),
    ]);
  }
  scheduleIntegrityAnchoring();
  return record;
}

async function markBatchFailed(batchId, error, attemptCount) {
  const delayMinutes = Math.min(60, 2 ** Math.min(attemptCount, 5));
  const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
  await supabaseRequest(`stellar_anchor_batches?id=eq.${filterValue(batchId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "failed",
      attempt_count: attemptCount,
      next_retry_at: nextRetryAt,
      last_error: String(error?.message || error).slice(0, 1000),
      lease_token: null,
      lease_expires_at: null,
    }),
  });
}

async function confirmBatch(batch, result) {
  const anchoredAt = new Date().toISOString();
  await supabaseRequest(`stellar_anchor_batches?id=eq.${filterValue(batch.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "confirmed",
      transaction_hash: result.transactionHash || batch.transaction_hash,
      source_account: result.sourceAccount || batch.source_account,
      ledger_sequence: result.ledgerSequence || batch.ledger_sequence,
      explorer_url: result.explorerUrl || batch.explorer_url,
      submitted_at: batch.submitted_at || anchoredAt,
      confirmed_at: anchoredAt,
      next_retry_at: null,
      last_error: null,
      lease_token: null,
      lease_expires_at: null,
    }),
  });
  await supabaseRequest(`integrity_records?batch_id=eq.${filterValue(batch.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "anchored",
      anchored_at: anchoredAt,
    }),
  });
}

async function recoverSubmittedBatch(batch) {
  if (!batch?.transaction_hash) return null;
  try {
    const verification = await verifyIntegrityTransaction(
      batch.transaction_hash,
      batch.merkle_root,
      batch.source_account
    );
    if (!verification.verified) return null;
    return {
      transactionHash: batch.transaction_hash,
      sourceAccount: verification.sourceAccount || batch.source_account,
      ledgerSequence: verification.ledgerSequence,
      explorerUrl: verification.explorerUrl || batch.explorer_url,
    };
  } catch (_) {
    return null;
  }
}

function leaseIsActive(batch) {
  const expiresAt = Date.parse(batch?.lease_expires_at || "");
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function resetBatchRecords(batchId) {
  await supabaseRequest(`integrity_records?batch_id=eq.${filterValue(batchId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "pending",
      batch_id: null,
      leaf_index: null,
      merkle_proof: [],
    }),
  });
}

async function recoverStaleSubmittingBatches() {
  const batches = await supabaseRequest(
    "stellar_anchor_batches?status=eq.submitting&order=created_at.asc&limit=20"
  );

  for (const batch of batches) {
    if (leaseIsActive(batch)) continue;

    let recovered = await recoverSubmittedBatch(batch);
    if (!recovered && batch.transaction_xdr) {
      try {
        recovered = await submitPreparedIntegrityTransaction({
          transactionXdr: batch.transaction_xdr,
          transactionHash: batch.transaction_hash,
          sourceAccount: batch.source_account,
        });
      } catch (_) {
        recovered = await recoverSubmittedBatch(batch);
      }
    }

    if (recovered) {
      await confirmBatch(batch, recovered);
      continue;
    }

    const attemptCount = Number(batch.attempt_count || 0);
    await markBatchFailed(
      batch.id,
      new Error("A stale Stellar submission could not be confirmed and was released for retry."),
      attemptCount
    );
    await resetBatchRecords(batch.id);
  }
}

async function claimBatch(batch) {
  if (batch.status === "submitting" && leaseIsActive(batch)) return null;
  if (
    batch.status === "failed"
    && Number.isFinite(Date.parse(batch.next_retry_at || ""))
    && Date.parse(batch.next_retry_at) > Date.now()
  ) {
    return null;
  }

  const leaseToken = crypto.randomUUID();
  const leaseExpiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const attemptCount = Number(batch.attempt_count || 0) + 1;
  const claimed = await supabaseRequest(
    [
      "stellar_anchor_batches?",
      `id=eq.${filterValue(batch.id)}`,
      `&status=eq.${filterValue(batch.status)}`,
      `&attempt_count=eq.${filterValue(batch.attempt_count || 0)}`,
    ].join(""),
    {
      method: "PATCH",
      body: JSON.stringify({
        status: "submitting",
        attempt_count: attemptCount,
        lease_token: leaseToken,
        lease_expires_at: leaseExpiresAt,
        next_retry_at: null,
        last_error: null,
      }),
    }
  );
  return claimed[0] || null;
}

async function assignRecordsToBatch(records, batch, proofs) {
  for (let index = 0; index < records.length; index += 1) {
    await supabaseRequest(`integrity_records?id=eq.${filterValue(records[index].id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: "batched",
        batch_id: batch.id,
        leaf_index: index,
        merkle_proof: proofs[index],
      }),
    });
  }
}

async function anchorPendingRecords() {
  if (!integrityRecordingEnabled()) return { anchored: 0, skipped: true };
  if (anchorRun) return anchorRun;

  anchorRun = (async () => {
    await recoverStaleSubmittingBatches();

    const pending = await supabaseRequest(
      `integrity_records?status=eq.pending&order=created_at.asc&limit=${config.stellarBatchSize}`
    );
    if (!pending.length) return { anchored: 0 };

    const tree = buildMerkleTree(pending.map((record) => record.commitment_hash));
    const existingBatches = await supabaseRequest(
      [
        "stellar_anchor_batches?",
        `network=eq.${filterValue(config.stellarNetwork)}`,
        `&merkle_root=eq.${filterValue(tree.root)}`,
        "&limit=1",
      ].join("")
    );
    let batch = existingBatches[0] || null;
    if (!batch) {
      try {
        const batchRows = await supabaseRequest("stellar_anchor_batches", {
          method: "POST",
          body: JSON.stringify({
            network: config.stellarNetwork,
            merkle_root: tree.root,
            leaf_count: pending.length,
            status: "pending",
            attempt_count: 0,
          }),
        });
        batch = batchRows[0];
      } catch (error) {
        if (!/(duplicate|unique|23505)/i.test(String(error?.message || ""))) throw error;
        const concurrent = await supabaseRequest(
          [
            "stellar_anchor_batches?",
            `network=eq.${filterValue(config.stellarNetwork)}`,
            `&merkle_root=eq.${filterValue(tree.root)}`,
            "&limit=1",
          ].join("")
        );
        batch = concurrent[0] || null;
      }
    }
    if (!batch) return { anchored: 0, busy: true };

    if (batch.status === "confirmed") {
      await assignRecordsToBatch(pending, batch, tree.proofs);
      await confirmBatch(batch, batch);
      return {
        anchored: pending.length,
        batchId: batch.id,
        transactionHash: batch.transaction_hash,
        recovered: true,
      };
    }

    const recovered = await recoverSubmittedBatch(batch);
    if (recovered) {
      await assignRecordsToBatch(pending, batch, tree.proofs);
      await confirmBatch(batch, recovered);
      return {
        anchored: pending.length,
        batchId: batch.id,
        transactionHash: recovered.transactionHash,
        recovered: true,
      };
    }

    const claimedBatch = await claimBatch(batch);
    if (!claimedBatch) return { anchored: 0, busy: true };
    batch = claimedBatch;
    const attemptCount = Number(batch.attempt_count || 1);

    try {
      const prepared = await prepareIntegrityTransaction(tree.root);
      await supabaseRequest(`stellar_anchor_batches?id=eq.${filterValue(batch.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: "submitting",
          source_account: prepared.sourceAccount,
          transaction_hash: prepared.transactionHash,
          transaction_xdr: prepared.transactionXdr,
          submitted_at: new Date().toISOString(),
        }),
      });
      batch = { ...batch, ...prepared, transaction_hash: prepared.transactionHash };

      await assignRecordsToBatch(pending, batch, tree.proofs);

      const result = await submitPreparedIntegrityTransaction(prepared);
      await confirmBatch(batch, result);
      return { anchored: pending.length, batchId: batch.id, transactionHash: result.transactionHash };
    } catch (error) {
      const accepted = await recoverSubmittedBatch(batch);
      if (accepted) {
        await confirmBatch(batch, accepted);
        return {
          anchored: pending.length,
          batchId: batch.id,
          transactionHash: accepted.transactionHash,
          recovered: true,
        };
      }

      await markBatchFailed(batch.id, error, attemptCount);
      await resetBatchRecords(batch.id);
      throw error;
    }
  })().finally(() => {
    anchorRun = null;
  });

  return anchorRun;
}

function scheduleIntegrityAnchoring() {
  if (!integrityRecordingEnabled()) return;
  setImmediate(() => {
    anchorPendingRecords().catch((error) => {
      console.error(`[stellar-integrity] anchor attempt failed: ${error.message}`);
    });
  });
}

async function verifyIntegrityRecord(recordId, options = {}) {
  const records = await supabaseRequest(
    `integrity_records?id=eq.${filterValue(recordId)}&limit=1`
  );
  const record = records[0];
  if (!record) return { verified: false, reason: "Integrity record was not found." };
  const commitmentMatches =
    createCommitment(record.payload_snapshot, record.salt) === record.commitment_hash;
  if (!commitmentMatches) {
    return { verified: false, reason: "The stored snapshot no longer matches its commitment." };
  }
  if (!record.batch_id) {
    return { verified: false, pending: true, reason: "The record is waiting for a Stellar anchor." };
  }

  const batches = await supabaseRequest(
    `stellar_anchor_batches?id=eq.${filterValue(record.batch_id)}&limit=1`
  );
  const batch = batches[0];
  if (!batch) return { verified: false, reason: "The Stellar anchor batch was not found." };
  const merkleMatches = verifyMerkleProof(
    record.commitment_hash,
    record.merkle_proof,
    batch.merkle_root
  );
  if (!merkleMatches) {
    return { verified: false, reason: "The Merkle proof does not match the anchored batch." };
  }

  let stellar = null;
  if (options.checkStellar && batch.transaction_hash) {
    stellar = await verifyIntegrityTransaction(
      batch.transaction_hash,
      batch.merkle_root,
      batch.source_account
    );
    if (!stellar.verified) {
      return { verified: false, reason: "The Stellar transaction does not contain this batch root.", stellar };
    }
  }

  return {
    verified: batch.status === "confirmed",
    pending: batch.status !== "confirmed",
    commitmentHash: record.commitment_hash,
    merkleRoot: batch.merkle_root,
    transactionHash: batch.transaction_hash,
    network: batch.network,
    explorerUrl: batch.explorer_url,
    stellar,
  };
}

module.exports = {
  integrityRecordingEnabled,
  recordIntegrityEvent,
  calculateReputation,
  getLatestUserReputation,
  getLatestUserReputations,
  recordCompletedDealIntegrity,
  recordDisputeOutcomeIntegrity,
  anchorPendingRecords,
  scheduleIntegrityAnchoring,
  verifyIntegrityRecord,
};
