#!/usr/bin/env node

process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-service-role-key";
process.env.AKARA_SEND_MODE = "log";
process.env.AKARA_STELLAR_INTEGRITY_ENABLED = "true";
process.env.AKARA_STELLAR_NETWORK = "testnet";
process.env.AKARA_INTEGRITY_HMAC_SECRET = "test-only-integrity-secret-with-more-than-32-bytes";

const path = require("node:path");
const crypto = require("node:crypto");
const fakeSupabase = require("./fake-supabase");

function stubModule(relativePath, exports) {
  const filename = path.join(__dirname, "..", relativePath);
  require.cache[filename] = {
    id: filename,
    filename,
    loaded: true,
    exports,
    children: [],
    paths: [],
  };
}

stubModule("lib/supabase.js", fakeSupabase);
stubModule("lib/stellar.js", {
  stellarIntegrityEnabled: () => true,
  prepareIntegrityTransaction: async (root) => ({
    network: "testnet",
    sourceAccount: "GTESTANCHORACCOUNT",
    transactionHash: crypto.createHash("sha256").update(`tx:${root}`).digest("hex"),
    transactionXdr: `signed-xdr:${root}`,
  }),
  submitPreparedIntegrityTransaction: async (prepared) => ({
    network: "testnet",
    sourceAccount: prepared.sourceAccount,
    transactionHash: prepared.transactionHash,
    ledgerSequence: 123456,
    explorerUrl: `https://stellar.expert/explorer/testnet/tx/${prepared.transactionHash}`,
  }),
  verifyIntegrityTransaction: async (transactionHash, expectedRoot, expectedSourceAccount) => ({
    verified: Boolean(
      transactionHash
      && expectedRoot
      && (!expectedSourceAccount || expectedSourceAccount === "GTESTANCHORACCOUNT")
    ),
    ledgerSequence: 123456,
    sourceAccount: "GTESTANCHORACCOUNT",
  }),
});

const {
  canonicalize,
  createCommitment,
  buildMerkleTree,
  verifyMerkleProof,
} = require("../lib/integrity-crypto");
const {
  recordCompletedDealIntegrity,
  anchorPendingRecords,
  getLatestUserReputation,
  getLatestUserReputations,
  verifyIntegrityRecord,
} = require("../db/integrity");

const { __table, __reset } = fakeSupabase;
let passed = 0;
const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push({ label, detail: String(detail).slice(0, 600) });
}

async function run() {
  __reset();

  check(
    "canonical JSON ignores object insertion order",
    canonicalize({ b: 2, a: 1 }) === canonicalize({ a: 1, b: 2 })
  );

  const salt = "11".repeat(32);
  const firstCommitment = createCommitment({ terms: { amount: "50000.00", currency: "NGN" } }, salt);
  const secondCommitment = createCommitment({ terms: { amount: "55000.00", currency: "RWF" } }, "22".repeat(32));
  const thirdCommitment = createCommitment({ score: 3 }, "33".repeat(32));
  const tree = buildMerkleTree([firstCommitment, secondCommitment, thirdCommitment]);
  check("Merkle tree has a SHA-256 root", /^[0-9a-f]{64}$/.test(tree.root), tree.root);
  check(
    "every Merkle proof verifies",
    [firstCommitment, secondCommitment, thirdCommitment].every((hash, index) =>
      verifyMerkleProof(hash, tree.proofs[index], tree.root)
    )
  );
  check(
    "tampered Merkle leaf is rejected",
    !verifyMerkleProof("44".repeat(32), tree.proofs[0], tree.root)
  );

  const maker = {
    id: crypto.randomUUID(),
    whatsapp_phone: "250700000101",
    verification_status: "verified_manual",
  };
  const taker = {
    id: crypto.randomUUID(),
    whatsapp_phone: "250700000102",
    verification_status: "verified_manual",
  };
  __table("users").push(maker, taker);

  const now = new Date().toISOString();
  const deal = {
    id: crypto.randomUUID(),
    listing_id: crypto.randomUUID(),
    deal_code: "AKR-TXN-INTEGRITY",
    maker_user_id: maker.id,
    taker_user_id: taker.id,
    have_currency: "NGN",
    want_currency: "RWF",
    have_amount: 50000,
    want_amount: 55000,
    status: "closed",
    maker_sent_at: now,
    taker_sent_at: now,
    maker_received_at: now,
    taker_received_at: now,
    completed_at: now,
    created_at: now,
  };
  __table("deals").push(deal);
  __table("deal_proofs").push({
    id: crypto.randomUUID(),
    deal_id: deal.id,
    user_id: maker.id,
    proof_type: "transfer_receipt",
    content_sha256: "55".repeat(32),
    ocr_status: "matched",
    ocr_matched: true,
    created_at: now,
  });

  const record = await recordCompletedDealIntegrity(deal);
  check("trade completion creates an integrity record", record?.record_type === "trade_completion", JSON.stringify(record));
  check("completion creates two reputation snapshots", __table("user_reputation_snapshots").length === 2);
  check("completion creates three pending commitments", __table("integrity_records").length === 3);
  check(
    "on-chain payload excludes phone numbers",
    !JSON.stringify(__table("integrity_records")).includes(maker.whatsapp_phone)
      && !JSON.stringify(__table("integrity_records")).includes(taker.whatsapp_phone)
  );

  await recordCompletedDealIntegrity(deal);
  check("completion recording is idempotent", __table("integrity_records").length === 3);

  const anchorResult = await anchorPendingRecords();
  check("pending records anchor as one batch", anchorResult.anchored === 3, JSON.stringify(anchorResult));
  check("one Stellar batch is created", __table("stellar_anchor_batches").length === 1);
  check(
    "all records become anchored",
    __table("integrity_records").every((item) => item.status === "anchored")
  );

  const makerReputation = await getLatestUserReputation(maker.id);
  check(
    "latest reputation exposes verified integrity without private payloads",
    makerReputation?.integrity_status === "verified"
      && makerReputation?.completed_trades === 1,
    JSON.stringify(makerReputation)
  );
  const reputationMap = await getLatestUserReputations([maker.id, taker.id]);
  check(
    "offer-facing reputation lookup returns both verified participants",
    Object.keys(reputationMap).length === 2
      && Object.values(reputationMap).every((item) => item.integrity_status === "verified"),
    JSON.stringify(reputationMap)
  );

  const verification = await verifyIntegrityRecord(record.id, { checkStellar: true });
  check("anchored record verifies end to end", verification.verified === true, JSON.stringify(verification));

  const batch = __table("stellar_anchor_batches")[0];
  batch.source_account = "GWRONGANCHORACCOUNT";
  const wrongSigner = await verifyIntegrityRecord(record.id, { checkStellar: true });
  check("transaction from the wrong signer is rejected", wrongSigner.verified === false);
  batch.source_account = "GTESTANCHORACCOUNT";

  record.payload_snapshot.locked_terms.have_amount = "99999.00";
  const tampered = await verifyIntegrityRecord(record.id, { checkStellar: true });
  check("modified private snapshot fails verification", tampered.verified === false, JSON.stringify(tampered));

  if (failures.length) {
    console.error(`\n${failures.length} integrity test(s) failed:`);
    for (const failure of failures) {
      console.error(`- ${failure.label}${failure.detail ? `: ${failure.detail}` : ""}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Integrity tests passed: ${passed}`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
