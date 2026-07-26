const CURRENCY_ALIASES = {
  NGN: ["ngn", "naira", "nigerian naira", "₦"],
  RWF: ["rwf", "rwandan franc", "rwandan francs", "rof", "rf"],
  XAF: ["xaf", "cfa", "cefa", "sefa", "central african franc", "cameroon franc"],
  KES: ["kes", "ksh", "kenyan shilling", "kenyan shillings", "kenya shilling"],
  GHS: ["ghs", "ghana cedi", "ghana cedis", "cedi", "cedis", "₵"],
};

const OCR_TIMEOUT_MS = Number(process.env.AKARA_RECEIPT_OCR_TIMEOUT_MS || 25000);
const OCR_MIN_CONFIDENCE = Number(process.env.AKARA_RECEIPT_OCR_MIN_CONFIDENCE || 45);
let tesseractWorkerPromise = null;

function collectReceiptText(incoming = {}) {
  return [
    incoming.text,
    incoming.caption,
    incoming.media?.caption,
    incoming.media?.filename,
  ].filter(Boolean).join("\n").trim();
}

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function detectCurrency(text) {
  const normalized = normalizeText(text);
  return Object.entries(CURRENCY_ALIASES).find(([, aliases]) => (
    aliases.some((alias) => normalized.includes(alias.toLowerCase()))
  ))?.[0] || null;
}

function normalizeAmount(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const multiplier = /k$/i.test(value) ? 1000 : /m$/i.test(value) ? 1000000 : 1;
  const numeric = value
    .replace(/[₦₵]/g, "")
    .replace(/[kKmM]$/g, "")
    .replace(/[,\s]/g, "");
  const amount = Number(numeric);
  return Number.isFinite(amount) && amount > 0 ? amount * multiplier : null;
}

function findAmountCandidates(text) {
  // Keep each visible number independent. In particular, never let line
  // breaks combine a receipt date, phone number and reference into one value.
  const matches = String(text || "").match(
    /(?:[₦₵][ \t]*)?(?:\d{1,3}(?:[,\u00a0 ]\d{3})+|\d+)(?:\.\d+)?[ \t]*[kKmM]?/g
  ) || [];
  return matches
    .map(normalizeAmount)
    .filter((amount) => amount && amount >= 1)
    .sort((a, b) => b - a);
}

function findCurrencyAmountCandidates(text) {
  const amountToken = "(?:\\d{1,3}(?:[,\\u00a0 ]\\d{3})+|\\d+)(?:\\.\\d+)?";
  const currencyToken = "(?:NGN|RWF|XAF|KES|KSH|GHS|NAIRA|₦|₵)";
  const patterns = [
    new RegExp(`${currencyToken}[ \\t]*(${amountToken})`, "gi"),
    new RegExp(`(${amountToken})[ \\t]*${currencyToken}`, "gi"),
  ];
  const amounts = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(String(text || "")))) {
      const amount = normalizeAmount(match[1]);
      if (amount) amounts.push(amount);
    }
  }
  return [...new Set(amounts)];
}

function parseReceiptEvidenceText(text) {
  const amounts = findAmountCandidates(text);
  const currencyAmounts = findCurrencyAmountCandidates(text);
  const amount = currencyAmounts[0] || amounts[0] || null;
  return {
    amount,
    amounts: [...new Set([...currencyAmounts, ...amounts])],
    currency: detectCurrency(text),
    paymentStatus: detectPaymentStatus(text),
  };
}

function detectPaymentStatus(text) {
  const normalized = normalizeText(text);
  if (/\b(failed|declined|rejected|reversed|cancelled|canceled|unsuccessful)\b/.test(normalized)) return "failed";
  if (/\b(pending|processing|initiated|in progress)\b/.test(normalized)) return "pending";
  if (/\b(success|successful|completed|paid|sent|transferred|transfer complete)\b/.test(normalized)) return "successful";
  return "unknown";
}

function amountsMatch(expected, actual) {
  if (!expected || !actual) return false;
  const tolerance = Math.max(1, expected * 0.001);
  return Math.abs(Number(expected) - Number(actual)) <= tolerance;
}

function formatParsedAmount(amount) {
  return Number(amount || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function baseReceiptCheck(expected = {}, text = "", parsed = {}) {
  const expectedAmount = Number(expected.amount || 0) || null;
  const expectedCurrency = expected.currency || null;
  return {
    ocr_engine: "tesseract",
    ocr_text: text ? text.slice(0, 2000) : null,
    ocr_amount: parsed.amount || null,
    ocr_amounts: parsed.amounts || [],
    ocr_currency: parsed.currency || null,
    ocr_payment_status: parsed.paymentStatus || "unknown",
    ocr_expected_amount: expectedAmount,
    ocr_expected_currency: expectedCurrency,
    ocr_confidence: parsed.confidence ?? null,
    ocr_matched: false,
    ocr_status: "pending",
    ocr_mismatch_reason: null,
  };
}

function scoreParsedReceipt(expected = {}, text = "", parsedEvidence = null) {
  const parsed = parsedEvidence || parseReceiptEvidenceText(text);
  const base = baseReceiptCheck(expected, text, parsed);
  const expectedAmount = base.ocr_expected_amount;
  const expectedCurrency = base.ocr_expected_currency;
  const matchedAmount = expectedAmount
    ? (parsed.amounts || []).find((amount) => amountsMatch(expectedAmount, amount)) || null
    : parsed.amount;

  if (parsed.paymentStatus === "failed") {
    return {
      ...base,
      ocr_status: "mismatch",
      ocr_mismatch_reason: "This receipt shows a failed, declined, cancelled, or reversed payment.",
    };
  }

  if (parsed.paymentStatus === "pending") {
    return {
      ...base,
      ocr_mismatch_reason: "This receipt shows a payment that is still pending or processing.",
    };
  }

  if (!text) {
    return {
      ...base,
      ocr_mismatch_reason: "No readable receipt text was available for automatic checks.",
    };
  }

  if (!parsed.amount || !parsed.currency) {
    return {
      ...base,
      ocr_mismatch_reason: "No readable amount or currency was found automatically.",
    };
  }

  if (expectedCurrency && parsed.currency !== expectedCurrency) {
    return {
      ...base,
      ocr_status: "mismatch",
      ocr_mismatch_reason: `Receipt currency reads ${parsed.currency}, expected ${expectedCurrency}.`,
    };
  }

  if (expectedAmount && !matchedAmount) {
    return {
      ...base,
      ocr_status: "mismatch",
      ocr_mismatch_reason: `Receipt amount reads ${formatParsedAmount(parsed.amount)} ${expectedCurrency || parsed.currency}, expected ${formatParsedAmount(expectedAmount)} ${expectedCurrency || ""}.`,
    };
  }

  return {
    ...base,
    ocr_amount: matchedAmount || parsed.amount,
    ocr_status: "matched",
    ocr_matched: true,
  };
}

function isImageReceipt(incoming = {}) {
  const mimeType = String(incoming.media?.mimeType || incoming.media?.mime_type || "").toLowerCase();
  const filename = String(incoming.media?.filename || "").toLowerCase();
  if (mimeType) return mimeType.startsWith("image/");
  return /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(filename);
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function getTesseractWorker() {
  if (process.env.AKARA_RECEIPT_OCR === "off") {
    throw new Error("Receipt OCR is disabled.");
  }

  if (!tesseractWorkerPromise) {
    tesseractWorkerPromise = (async () => {
      const { createWorker, PSM } = require("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
      });
      return worker;
    })().catch((error) => {
      tesseractWorkerPromise = null;
      throw error;
    });
  }

  return tesseractWorkerPromise;
}

async function recognizeReceiptImage(incoming = {}) {
  if (!incoming.media?.id) return null;
  if (!isImageReceipt(incoming)) {
    return {
      text: "",
      confidence: null,
      skippedReason: "Only image receipts can be read automatically right now. The file is still saved as supporting evidence.",
    };
  }

  const { getWhatsAppMedia } = require("./whatsapp");
  const media = incoming.__receiptOcrMedia || await getWhatsAppMedia(incoming.media.id);
  incoming.__receiptOcrMedia = media;
  let receiptBuffer = media.buffer;
  try {
    const sharp = require("sharp");
    const metadata = await sharp(media.buffer).metadata();
    const width = Number(metadata.width || 0);
    receiptBuffer = await sharp(media.buffer)
      .rotate()
      .resize({
        width: width && width < 1800 ? 1800 : width || 1800,
        withoutEnlargement: false,
      })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch (error) {
    console.warn(`[receipt-ocr] image preprocessing skipped: ${error.message}`);
  }
  const worker = await getTesseractWorker();
  const result = await withTimeout(
    worker.recognize(receiptBuffer),
    OCR_TIMEOUT_MS,
    "Receipt OCR took too long."
  );
  return {
    text: result?.data?.text || "",
    confidence: result?.data?.confidence ?? null,
  };
}

async function analyzeReceiptEvidence(expected = {}, incoming = {}) {
  const typedText = collectReceiptText(incoming);
  let ocrText = "";
  let ocrConfidence = null;
  let ocrSkippedReason = "";

  if (incoming.media?.id) {
    try {
      const recognized = await recognizeReceiptImage(incoming);
      ocrText = recognized?.text || "";
      ocrConfidence = recognized?.confidence ?? null;
      ocrSkippedReason = recognized?.skippedReason || "";
    } catch (error) {
      ocrSkippedReason = `Automatic receipt reading failed: ${error.message}`;
    }
  }

  // A caption or filename can describe an upload, but it cannot prove what
  // appears on the receipt. Media receipts only pass from text Tesseract read
  // from the file itself; typed text is used only for text-only evidence.
  const evidenceText = incoming.media?.id ? ocrText.trim() : typedText;
  const parsed = parseReceiptEvidenceText(evidenceText);
  const scored = scoreParsedReceipt(expected, evidenceText, {
    ...parsed,
    confidence: ocrConfidence,
  });

  if (scored.ocr_status === "matched" && ocrConfidence !== null && ocrConfidence < OCR_MIN_CONFIDENCE) {
    return {
      ...scored,
      ocr_status: "pending",
      ocr_matched: false,
      ocr_mismatch_reason: `Receipt text was detected, but OCR confidence is low (${Math.round(ocrConfidence)}%).`,
    };
  }

  if (!evidenceText && ocrSkippedReason) {
    return {
      ...scored,
      ocr_engine: "tesseract",
      ocr_mismatch_reason: ocrSkippedReason,
    };
  }

  if (scored.ocr_status === "pending" && ocrSkippedReason && !scored.ocr_mismatch_reason) {
    return {
      ...scored,
      ocr_mismatch_reason: ocrSkippedReason,
    };
  }

  return scored;
}

module.exports = {
  CURRENCY_ALIASES,
  analyzeReceiptEvidence,
  detectPaymentStatus,
  parseReceiptEvidenceText,
  scoreParsedReceipt,
};
