const crypto = require("node:crypto");

const LEAF_DOMAIN = Buffer.from("akara-integrity-leaf-v1\0", "utf8");
const NODE_DOMAIN = Buffer.from("akara-integrity-node-v1\0", "utf8");
const COMMITMENT_DOMAIN = "akara-integrity-record-v1";

function canonicalize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  const entries = Object.keys(value)
    .sort()
    .filter((key) => value[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`);
  return `{${entries.join(",")}}`;
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function sha256Hex(value) {
  return sha256Buffer(value).toString("hex");
}

function randomSalt() {
  return crypto.randomBytes(32).toString("hex");
}

function opaqueSubject(secret, namespace, entityId) {
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error("AKARA_INTEGRITY_HMAC_SECRET must contain at least 32 bytes.");
  }
  return crypto
    .createHmac("sha256", secret)
    .update(`${namespace}:${entityId}`)
    .digest("hex");
}

function createCommitment(payload, saltHex) {
  if (!/^[0-9a-f]{64}$/i.test(String(saltHex || ""))) {
    throw new Error("Integrity record salt must be a 32-byte hex value.");
  }

  const envelope = canonicalize({
    domain: COMMITMENT_DOMAIN,
    payload,
    salt: String(saltHex).toLowerCase(),
  });
  return sha256Hex(envelope);
}

function leafNode(commitmentHash) {
  return sha256Buffer(Buffer.concat([
    LEAF_DOMAIN,
    Buffer.from(commitmentHash, "hex"),
  ]));
}

function parentNode(left, right) {
  return sha256Buffer(Buffer.concat([NODE_DOMAIN, left, right]));
}

function buildMerkleTree(commitmentHashes) {
  if (!Array.isArray(commitmentHashes) || commitmentHashes.length === 0) {
    throw new Error("At least one commitment is required to build a Merkle tree.");
  }
  for (const hash of commitmentHashes) {
    if (!/^[0-9a-f]{64}$/i.test(String(hash || ""))) {
      throw new Error("Every integrity commitment must be a SHA-256 hex digest.");
    }
  }

  const leaves = commitmentHashes.map((hash) => leafNode(hash));
  const levels = [leaves];
  let current = leaves;

  while (current.length > 1) {
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1] || left;
      next.push(parentNode(left, right));
    }
    levels.push(next);
    current = next;
  }

  const proofs = leaves.map((_, leafIndex) => {
    const proof = [];
    let index = leafIndex;
    for (let levelIndex = 0; levelIndex < levels.length - 1; levelIndex += 1) {
      const level = levels[levelIndex];
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      const sibling = level[siblingIndex] || level[index];
      proof.push({
        position: index % 2 === 0 ? "right" : "left",
        hash: sibling.toString("hex"),
      });
      index = Math.floor(index / 2);
    }
    return proof;
  });

  return {
    root: current[0].toString("hex"),
    proofs,
  };
}

function verifyMerkleProof(commitmentHash, proof, expectedRoot) {
  if (!/^[0-9a-f]{64}$/i.test(String(expectedRoot || ""))) return false;
  let current = leafNode(commitmentHash);

  for (const step of proof || []) {
    if (!["left", "right"].includes(step?.position)) return false;
    if (!/^[0-9a-f]{64}$/i.test(String(step?.hash || ""))) return false;
    const sibling = Buffer.from(step.hash, "hex");
    current = step.position === "left"
      ? parentNode(sibling, current)
      : parentNode(current, sibling);
  }

  return current.toString("hex") === String(expectedRoot).toLowerCase();
}

module.exports = {
  canonicalize,
  sha256Hex,
  randomSalt,
  opaqueSubject,
  createCommitment,
  buildMerkleTree,
  verifyMerkleProof,
};
