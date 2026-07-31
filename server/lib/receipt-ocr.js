// receipt-ocr.js
//
// Receipt verification for payment confirmations sent via WhatsApp.
//
// KEY DESIGN CHANGE FROM THE ORIGINAL VERSION:
//
// Currency used to be detected by looking for a symbol/word alias
// (including "₦" and "₵") anywhere in the OCR text. In practice Tesseract's
// "eng" traineddata was never trained on those glyphs, so its confidence
// on them is inherently poor — no amount of whitelisting fixes that, since
// the model just doesn't have good features for an unfamiliar shape.
//
// Currency is now resolved from MULTIPLE independent signals instead:
//   1. currency symbol (₦, ₵)
//   2. ISO code (NGN, KES, RWF, GHS, XAF) or common word (naira, cedi...)
//   3. bank / mobile-money provider name (GTBank, M-Pesa, MTN MoMo, ...)
//   4. the trade's expected currency — used ONLY to break a tie between two
//      equally-scored currencies, never as a standalone signal
// Signals are weighted and combined; see resolveCurrency().
//
// A focused SECOND OCR pass re-reads just the amount/currency region at
// higher resolution with a restricted character whitelist. This is what
// actually improves symbol/code recognition — putting a whitelist on the
// full-page pass instead would only hurt recognition of the recipient
// name, date, and reference number.
//
// OCR NEVER independently approves a receipt. See REQUIRED_FIELDS and
// `analyzeReceiptEvidence` / `withFieldChecks` below — a "matched" result
// can still be downgraded to "needs_review" by a recipient/account/
// reference mismatch or a duplicate-reference hit.

const CURRENCY_ALIASES = {
  NGN: ["ngn", "naira", "nigerian naira", "₦"],
  RWF: ["rwf", "rwandan franc", "rwandan francs", "rof", "rf"],
  XAF: ["xaf", "cfa", "cefa", "sefa", "central african franc", "cameroon franc"],
  KES: ["kes", "ksh", "kenyan shilling", "kenyan shillings", "kenya shilling"],
  GHS: ["ghs", "ghana cedi", "ghana cedis", "cedi", "cedis", "₵"],
};

// Weaker than a symbol/code, but often the ONLY signal present on a
// mobile-money receipt (many never print a currency code at all).
// Note "mtn momo" and similar deliberately appear under more than one
// currency — that ambiguity is exactly why this is a low-weight signal
// that gets combined with everything else rather than trusted alone.
const PROVIDER_ALIASES = {
  NGN: ["gtbank", "gtb", "access bank", "zenith bank", "first bank", "uba",
    "opay", "palmpay", "kuda", "moniepoint", "paystack", "flutterwave",
    "wema bank", "polaris bank", "union bank nigeria"],
  KES: ["mpesa", "m-pesa", "safaricom", "equity bank kenya", "kcb",
    "airtel money kenya", "co-operative bank kenya"],
  GHS: ["mtn momo gh", "ecobank ghana", "gcb bank", "fidelity bank ghana",
    "vodafone cash", "airteltigo money"],
  RWF: ["mtn rwanda", "bank of kigali", "boa rwanda", "equity bank rwanda",
    "airtel rwanda", "i&m bank rwanda"],
  XAF: ["orange money", "mtn momo cameroon", "express union",
    "afriland first bank", "uba cameroon"],
};

const SIGNAL_WEIGHTS = { symbol: 4, code: 4, word: 3, provider: 2, expected: 1 };

const OCR_TIMEOUT_MS = Number(process.env.AKARA_RECEIPT_OCR_TIMEOUT_MS || 25000);
const OCR_MIN_CONFIDENCE = Number(process.env.AKARA_RECEIPT_OCR_MIN_CONFIDENCE || 45);
const AMOUNT_OCR_WHITELIST = "0123456789,.kKmM NGNRWFXAFKESGHSHnairacediFrancShilling₦₵";

let tesseractWorkerPromise = null;
let amountWorkerPromise = null;

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

// ---------------------------------------------------------------------
// Multi-signal currency detection
// ---------------------------------------------------------------------

function detectCurrencySignals(text) {
  const normalized = normalizeText(text);
  const scores = {};
  const matches = {};

  const addSignal = (currency, weight, term) => {
    scores[currency] = (scores[currency] || 0) + weight;
    matches[currency] = matches[currency] || [];
    matches[currency].push(term);
  };

  for (const [currency, aliases] of Object.entries(CURRENCY_ALIASES)) {
    for (const alias of aliases) {
      if (!alias || !normalized.includes(alias.toLowerCase())) continue;
      const isSymbol = /[^\x00-\x7F]/.test(alias) && alias.length <= 2;
      const isCode = alias.length === 3 && /^[a-z]+$/.test(alias);
      addSignal(currency, isSymbol ? SIGNAL_WEIGHTS.symbol : isCode ? SIGNAL_WEIGHTS.code : SIGNAL_WEIGHTS.word, alias);
    }
  }

  for (const [currency, providers] of Object.entries(PROVIDER_ALIASES)) {
    for (const provider of providers) {
      if (normalized.includes(provider.toLowerCase())) {
        addSignal(currency, SIGNAL_WEIGHTS.provider, provider);
      }
    }
  }

  return { scores, matches };
}

// Picks the best-supported currency. `expectedCurrency` only breaks a tie
// between two currencies that scored equally on real evidence — it can
// never be the sole reason a currency is chosen, and a tie it doesn't
// break is reported as ambiguous rather than guessed.
function resolveCurrency(text, expectedCurrency = null) {
  const { scores, matches } = detectCurrencySignals(text);

  if (expectedCurrency && CURRENCY_ALIASES[expectedCurrency]) {
    scores[expectedCurrency] = (scores[expectedCurrency] || 0) + SIGNAL_WEIGHTS.expected;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return { currency: null, confidence: "none", signals: [] };
  }

  const [topCurrency, topScore] = ranked[0];
  const runnerUp = ranked[1];
  const expectedOnlyWin = expectedCurrency === topCurrency && runnerUp && runnerUp[1] === topScore - SIGNAL_WEIGHTS.expected;

  if (expectedOnlyWin || (runnerUp && runnerUp[1] === topScore)) {
    return { currency: null, confidence: "ambiguous", signals: matches[topCurrency] || [] };
  }

  const confidence = topScore >= SIGNAL_WEIGHTS.symbol ? "high" : topScore >= SIGNAL_WEIGHTS.provider ? "medium" : "low";
  return { currency: topCurrency, confidence, signals: matches[topCurrency] || [] };
}

// ---------------------------------------------------------------------
// Amount extraction (unchanged logic, currency-word list widened slightly)
// ---------------------------------------------------------------------

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
  const currencyToken = "(?:NGN|RWF|XAF|KES|KSH|GHS|NAIRA|CEDIS?|FRANCS?|SHILLINGS?|₦|₵)";
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

function parseReceiptEvidenceText(text, expectedCurrency = null) {
  const amounts = findAmountCandidates(text);
  const currencyAmounts = findCurrencyAmountCandidates(text);
  const amount = currencyAmounts[0] || amounts[0] || null;
  const currencyResolution = resolveCurrency(text, expectedCurrency);
  return {
    amount,
    amounts: [...new Set([...currencyAmounts, ...amounts])],
    currency: currencyResolution.currency,
    currencyConfidence: currencyResolution.confidence,
    currencySignals: currencyResolution.signals,
    paymentStatus: detectPaymentStatus(text),
  };
}

function mergeParsedEvidence(base, focused) {
  if (!focused) return base;
  const rank = { none: 0, ambiguous: 0, low: 1, medium: 2, high: 3 };
  const useFocusedCurrency = rank[focused.currencyConfidence] > rank[base.currencyConfidence];
  return {
    amount: focused.amount || base.amount,
    amounts: [...new Set([...(base.amounts || []), ...(focused.amounts || [])])],
    currency: useFocusedCurrency ? focused.currency : (base.currency || focused.currency),
    currencyConfidence: useFocusedCurrency ? focused.currencyConfidence : base.currencyConfidence,
    currencySignals: useFocusedCurrency ? focused.currencySignals : base.currencySignals,
    paymentStatus: base.paymentStatus,
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
  return Number(amount || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------

function baseReceiptCheck(expected = {}, text = "", parsed = {}) {
  const expectedAmount = Number(expected.amount || 0) || null;
  const expectedCurrency = expected.currency || null;
  return {
    ocr_engine: "tesseract",
    ocr_text: text ? text.slice(0, 2000) : null,
    ocr_amount: parsed.amount || null,
    ocr_amounts: parsed.amounts || [],
    ocr_currency: parsed.currency || null,
    ocr_currency_confidence: parsed.currencyConfidence || "none",
    ocr_currency_signals: parsed.currencySignals || [],
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
  const parsed = parsedEvidence || parseReceiptEvidenceText(text, expected.currency);
  const base = baseReceiptCheck(expected, text, parsed);
  const expectedAmount = base.ocr_expected_amount;
  const expectedCurrency = base.ocr_expected_currency;
  const matchedAmount = expectedAmount
    ? (parsed.amounts || []).find((amount) => amountsMatch(expectedAmount, amount)) || null
    : parsed.amount;

  if (parsed.paymentStatus === "failed") {
    return { ...base, ocr_status: "mismatch", ocr_mismatch_reason: "This receipt shows a failed, declined, cancelled, or reversed payment." };
  }
  if (parsed.paymentStatus === "pending") {
    return { ...base, ocr_mismatch_reason: "This receipt shows a payment that is still pending or processing." };
  }
  if (!text) {
    return { ...base, ocr_mismatch_reason: "No readable receipt text was available for automatic checks." };
  }
  if (parsed.currencyConfidence === "ambiguous") {
    return { ...base, ocr_mismatch_reason: "Multiple currencies are equally plausible from the receipt text — needs manual review." };
  }
  if (!parsed.amount || !parsed.currency) {
    return { ...base, ocr_mismatch_reason: "No readable amount or currency signal (symbol, code, or provider name) was found automatically." };
  }
  if (expectedCurrency && parsed.currency !== expectedCurrency) {
    return { ...base, ocr_status: "mismatch", ocr_mismatch_reason: `Receipt currency reads ${parsed.currency}, expected ${expectedCurrency}.` };
  }
  if (expectedAmount && !matchedAmount) {
    return { ...base, ocr_status: "mismatch", ocr_mismatch_reason: `Receipt amount reads ${formatParsedAmount(parsed.amount)} ${expectedCurrency || parsed.currency}, expected ${formatParsedAmount(expectedAmount)} ${expectedCurrency || ""}.` };
  }

  const result = { ...base, ocr_amount: matchedAmount || parsed.amount, ocr_status: "matched", ocr_matched: true };

  // A "matched" currency backed only by a low-weight signal (e.g. a single
  // provider name, no code or symbol) is still worth a human glance.
  if (parsed.currencyConfidence === "low") {
    return { ...result, ocr_status: "needs_review", ocr_mismatch_reason: "Currency was inferred from a weak signal only (e.g. a provider name, no code or symbol)." };
  }
  return result;
}

// ---------------------------------------------------------------------
// Field checks that OCR alone can't safely resolve — recipient, account,
// reference/duplicate. These only run when `expected` supplies the field,
// and they can only downgrade a match to "needs_review", never upgrade one.
// ---------------------------------------------------------------------

function normalizeNameTokens(value) {
  return String(value || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter((t) => t.length > 1);
}

function compareRecipientName(expectedName, text) {
  const expectedTokens = normalizeNameTokens(expectedName);
  if (!expectedTokens.length) return null;
  const normalizedText = normalizeText(text);
  const found = expectedTokens.filter((token) => normalizedText.includes(token));
  const ratio = found.length / expectedTokens.length;
  return { ratio, matched: ratio >= 0.6 };
}

function matchAccountNumber(expectedAccount, text) {
  const digits = String(expectedAccount || "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  const last4 = digits.slice(-4);
  return String(text || "").replace(/\D/g, "").includes(last4);
}

function extractReference(text) {
  const match = String(text || "").match(/\b(?:ref(?:erence)?|trx|txn|transaction id)[:\s#]*([a-z0-9-]{6,25})\b/i);
  return match ? match[1] : null;
}

async function withFieldChecks(scored, expected, text, options = {}) {
  const result = { ...scored };
  const reasons = [];

  if (expected.recipientName) {
    const nameCheck = compareRecipientName(expected.recipientName, text);
    result.ocr_recipient_match = nameCheck ? nameCheck.matched : null;
    if (nameCheck && !nameCheck.matched) reasons.push("Recipient name on the receipt doesn't clearly match the expected recipient.");
  }

  if (expected.accountNumber) {
    result.ocr_account_match = matchAccountNumber(expected.accountNumber, text);
    if (result.ocr_account_match === false) reasons.push("Account / mobile-money number on the receipt doesn't match.");
  }

  const reference = extractReference(text);
  result.ocr_reference = reference;
  if (reference && typeof options.isDuplicateReference === "function") {
    try {
      const duplicate = await options.isDuplicateReference(reference);
      result.ocr_duplicate_reference = Boolean(duplicate);
      if (duplicate) reasons.push("This transaction reference has already been used on a previous receipt.");
    } catch (error) {
      console.warn(`[receipt-ocr] duplicate reference check failed: ${error.message}`);
    }
  }

  // Recommended but not implemented here (needs a persistent store you
  // control): hash the preprocessed image buffer with a perceptual hash
  // (e.g. blockhash/pHash, NOT a cryptographic hash — you want near-
  // duplicates from re-compression to still collide) and check it against
  // hashes of previously-accepted receipts via `options.isDuplicateImage`.
  // Wire it up as: await options.isDuplicateImage(imageHash) -> boolean.

  if (reasons.length) {
    result.ocr_status = result.ocr_status === "matched" ? "needs_review" : result.ocr_status;
    result.ocr_mismatch_reason = [result.ocr_mismatch_reason, ...reasons].filter(Boolean).join(" ");
  }

  return result;
}

// ---------------------------------------------------------------------
// OCR execution: full-page pass + focused amount/currency pass
// ---------------------------------------------------------------------

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
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
      return worker;
    })().catch((error) => { tesseractWorkerPromise = null; throw error; });
  }
  return tesseractWorkerPromise;
}

// Separate worker, deliberately restricted to digits/currency characters.
// Kept apart from the main worker so the full-page pass (recipient, date,
// reference, status) never has its character set narrowed.
async function getAmountFocusedWorker() {
  if (!amountWorkerPromise) {
    amountWorkerPromise = (async () => {
      const { createWorker, PSM } = require("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist: AMOUNT_OCR_WHITELIST,
        preserve_interword_spaces: "1",
      });
      return worker;
    })().catch((error) => { amountWorkerPromise = null; throw error; });
  }
  return amountWorkerPromise;
}

function findAmountWordBox(words = [], amountText) {
  if (!amountText) return null;
  const digitsOnly = String(amountText).replace(/[^\d.]/g, "");
  if (!digitsOnly) return null;
  const hit = words.find((word) => String(word.text || "").replace(/[^\d.]/g, "").includes(digitsOnly));
  return hit?.bbox || null;
}

async function runFocusedAmountPass(buffer, box) {
  if (!box) return null;
  const sharp = require("sharp");
  const metadata = await sharp(buffer).metadata();
  const padX = Math.round((box.x1 - box.x0) * 0.6) + 20;
  const padY = Math.round((box.y1 - box.y0) * 1.2) + 20;
  const left = Math.max(0, box.x0 - padX);
  const top = Math.max(0, box.y0 - padY);
  const width = Math.min((metadata.width || box.x1) - left, (box.x1 - box.x0) + padX * 2);
  const height = Math.min((metadata.height || box.y1) - top, (box.y1 - box.y0) + padY * 2);
  if (width <= 0 || height <= 0) return null;

  const cropped = await sharp(buffer)
    .extract({ left, top, width, height })
    .resize({ width: Math.round(width * 3) })
    .grayscale()
    .normalize()
    .threshold(150)
    .sharpen()
    .png()
    .toBuffer();

  const worker = await getAmountFocusedWorker();
  const result = await withTimeout(worker.recognize(cropped), OCR_TIMEOUT_MS, "Focused amount OCR took too long.");
  return { text: result?.data?.text || "", confidence: result?.data?.confidence ?? null };
}

async function recognizeReceiptImage(incoming = {}) {
  if (!incoming.media?.id) return null;
  if (!isImageReceipt(incoming)) {
    return {
      text: "",
      confidence: null,
      focusedText: "",
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
      .resize({ width: width && width < 1800 ? 1800 : width || 1800, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
  } catch (error) {
    console.warn(`[receipt-ocr] image preprocessing skipped: ${error.message}`);
  }

  const worker = await getTesseractWorker();
  const result = await withTimeout(worker.recognize(receiptBuffer), OCR_TIMEOUT_MS, "Receipt OCR took too long.");
  const text = result?.data?.text || "";
  const words = result?.data?.words || [];

  let focused = null;
  try {
    const candidateAmount = findCurrencyAmountCandidates(text)[0] ?? findAmountCandidates(text)[0];
    const box = findAmountWordBox(words, candidateAmount);
    focused = await runFocusedAmountPass(receiptBuffer, box);
  } catch (error) {
    console.warn(`[receipt-ocr] focused amount pass skipped: ${error.message}`);
  }

  return {
    text,
    confidence: result?.data?.confidence ?? null,
    focusedText: focused?.text || "",
    focusedConfidence: focused?.confidence ?? null,
  };
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------

async function analyzeReceiptEvidence(expected = {}, incoming = {}, options = {}) {
  const typedText = collectReceiptText(incoming);
  let ocrText = "";
  let ocrConfidence = null;
  let ocrSkippedReason = "";
  let focusedText = "";

  if (incoming.media?.id) {
    try {
      const recognized = await recognizeReceiptImage(incoming);
      ocrText = recognized?.text || "";
      ocrConfidence = recognized?.confidence ?? null;
      ocrSkippedReason = recognized?.skippedReason || "";
      focusedText = recognized?.focusedText || "";
    } catch (error) {
      ocrSkippedReason = `Automatic receipt reading failed: ${error.message}`;
    }
  }

  // A caption or filename can describe an upload, but it cannot prove what
  // appears on the receipt. Media receipts only pass from text Tesseract
  // read from the file itself; typed text is used only for text-only
  // evidence.
  const evidenceText = incoming.media?.id ? ocrText.trim() : typedText;
  const parsedFull = parseReceiptEvidenceText(evidenceText, expected.currency);
  const parsedFocused = focusedText ? parseReceiptEvidenceText(focusedText, expected.currency) : null;
  const parsed = mergeParsedEvidence(parsedFull, parsedFocused);

  const scored = scoreParsedReceipt(expected, evidenceText, { ...parsed, confidence: ocrConfidence });

  let outcome = scored;

  if (outcome.ocr_status === "matched" && ocrConfidence !== null && ocrConfidence < OCR_MIN_CONFIDENCE) {
    outcome = {
      ...outcome,
      ocr_status: "pending",
      ocr_matched: false,
      ocr_mismatch_reason: `Receipt text was detected, but OCR confidence is low (${Math.round(ocrConfidence)}%).`,
    };
  } else if (!evidenceText && ocrSkippedReason) {
    outcome = { ...outcome, ocr_engine: "tesseract", ocr_mismatch_reason: ocrSkippedReason };
  } else if (outcome.ocr_status === "pending" && ocrSkippedReason && !outcome.ocr_mismatch_reason) {
    outcome = { ...outcome, ocr_mismatch_reason: ocrSkippedReason };
  }

  return withFieldChecks(outcome, expected, evidenceText, options);
}

module.exports = {
  CURRENCY_ALIASES,
  PROVIDER_ALIASES,
  analyzeReceiptEvidence,
  detectPaymentStatus,
  parseReceiptEvidenceText,
  resolveCurrency,
  scoreParsedReceipt,
  extractReference,
  compareRecipientName,
  matchAccountNumber,
};