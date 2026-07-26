const StellarSdk = require("@stellar/stellar-sdk");
const { config } = require("../config");

const NETWORKS = {
  testnet: {
    passphrase: StellarSdk.Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    explorerBaseUrl: "https://stellar.expert/explorer/testnet/tx",
  },
  public: {
    passphrase: StellarSdk.Networks.PUBLIC,
    horizonUrl: "https://horizon.stellar.org",
    explorerBaseUrl: "https://stellar.expert/explorer/public/tx",
  },
};

function stellarIntegrityEnabled() {
  return config.stellarIntegrityEnabled;
}

function networkConfig() {
  const selected = NETWORKS[config.stellarNetwork];
  if (!selected) {
    throw new Error("AKARA_STELLAR_NETWORK must be testnet or public.");
  }
  if (config.stellarNetwork === "public" && !config.stellarMainnetAcknowledged) {
    throw new Error(
      "AKARA_STELLAR_MAINNET_ACK must be true before permanent public-network anchoring is enabled."
    );
  }

  const horizonUrl = config.stellarHorizonUrl || selected.horizonUrl;
  const parsed = new URL(horizonUrl);
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHost) {
    throw new Error("AKARA_STELLAR_HORIZON_URL must use HTTPS.");
  }

  return {
    ...selected,
    horizonUrl: horizonUrl.replace(/\/+$/, ""),
    network: config.stellarNetwork,
  };
}

function anchoringKeypair() {
  if (!config.stellarSecretKey) {
    throw new Error("AKARA_STELLAR_SECRET_KEY is required when Stellar integrity anchoring is enabled.");
  }

  const keypair = StellarSdk.Keypair.fromSecret(config.stellarSecretKey);
  if (config.stellarPublicKey && keypair.publicKey() !== config.stellarPublicKey) {
    throw new Error("AKARA_STELLAR_PUBLIC_KEY does not match AKARA_STELLAR_SECRET_KEY.");
  }
  return keypair;
}

function createServer(horizonUrl) {
  return new StellarSdk.Horizon.Server(horizonUrl, {
    allowHttp: horizonUrl.startsWith("http://"),
  });
}

async function prepareIntegrityTransaction(rootHex) {
  if (!/^[0-9a-f]{64}$/i.test(String(rootHex || ""))) {
    throw new Error("Stellar integrity root must be a SHA-256 hex digest.");
  }

  const selected = networkConfig();
  const keypair = anchoringKeypair();
  const server = createServer(selected.horizonUrl);
  const [account, baseFee] = await Promise.all([
    server.loadAccount(keypair.publicKey()),
    server.fetchBaseFee(),
  ]);

  const fee = Number(baseFee);
  if (!Number.isFinite(fee) || fee <= 0 || fee > config.stellarMaxFeeStroops) {
    throw new Error(`Stellar base fee ${baseFee} exceeds Akara's configured safety limit.`);
  }

  const root = Buffer.from(rootHex, "hex");
  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee: String(fee),
    networkPassphrase: selected.passphrase,
  })
    .addMemo(StellarSdk.Memo.hash(root))
    .addOperation(StellarSdk.Operation.manageData({
      name: "akara.integrity.v1",
      value: root,
    }))
    .setTimeout(60)
    .build();

  transaction.sign(keypair);
  return {
    network: selected.network,
    sourceAccount: keypair.publicKey(),
    transactionHash: transaction.hash().toString("hex"),
    transactionXdr: transaction.toXDR(),
  };
}

async function submitPreparedIntegrityTransaction(prepared) {
  if (!prepared?.transactionXdr) {
    throw new Error("A signed Stellar transaction XDR is required.");
  }
  const selected = networkConfig();
  const server = createServer(selected.horizonUrl);
  const transaction = StellarSdk.TransactionBuilder.fromXDR(
    prepared.transactionXdr,
    selected.passphrase
  );
  const result = await server.submitTransaction(transaction);
  return {
    network: selected.network,
    sourceAccount: prepared.sourceAccount || transaction.source,
    transactionHash: result.hash,
    ledgerSequence: result.ledger,
    explorerUrl: `${selected.explorerBaseUrl}/${result.hash}`,
  };
}

async function verifyIntegrityTransaction(
  transactionHash,
  expectedRoot,
  expectedSourceAccount = null
) {
  if (!transactionHash || !/^[0-9a-f]{64}$/i.test(String(expectedRoot || ""))) {
    return { verified: false, reason: "Transaction hash or integrity root is invalid." };
  }

  const selected = networkConfig();
  const server = createServer(selected.horizonUrl);
  const transaction = await server.transactions().transaction(transactionHash).call();
  const memoRoot = transaction.memo_type === "hash" && transaction.memo
    ? Buffer.from(transaction.memo, "base64").toString("hex")
    : "";
  const sourceMatches = !expectedSourceAccount
    || transaction.source_account === expectedSourceAccount;

  return {
    verified:
      transaction.successful === true
      && memoRoot === expectedRoot.toLowerCase()
      && sourceMatches,
    memoRoot,
    sourceMatches,
    ledgerSequence: transaction.ledger,
    sourceAccount: transaction.source_account,
    explorerUrl: `${selected.explorerBaseUrl}/${transactionHash}`,
  };
}

module.exports = {
  stellarIntegrityEnabled,
  networkConfig,
  prepareIntegrityTransaction,
  submitPreparedIntegrityTransaction,
  verifyIntegrityTransaction,
};
