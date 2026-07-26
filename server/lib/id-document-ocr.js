const OCR_TIMEOUT_MS = Number(process.env.AKARA_ID_OCR_TIMEOUT_MS || 30000);
const OCR_MIN_CONFIDENCE = Number(process.env.AKARA_ID_OCR_MIN_CONFIDENCE || 45);

const SUPPORTED_COUNTRIES = {
  NG: ["nigeria", "federal republic of nigeria", "nigerian"],
  RW: ["rwanda", "republic of rwanda", "rwandan"],
  GH: ["ghana", "republic of ghana", "ghanaian"],
  KE: ["kenya", "republic of kenya", "kenyan"],
  CM: ["cameroon", "republic of cameroon", "cameroun", "cameroonian"],
};

const DOCUMENT_TYPE_ALIASES = {
  passport: ["passport", "e-passport", "travel document"],
  national_id: ["national identity", "national id", "identity card", "id card", "nin", "national identification"],
  residence_permit: ["residence permit", "resident permit", "residence card", "resident card"],
  student_id: ["student id", "student card", "matriculation", "school id"],
  driver_license: ["driver license", "drivers license", "driver's license", "driving licence", "driving license"],
};

let tesseractWorkerPromise = null;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !/^\d+$/.test(token))
    .join(" ");
}

function nameTokens(value) {
  return new Set(normalizeName(value).split(" ").filter(Boolean));
}

function scoreNameMatch(expectedName, candidateName) {
  const expected = nameTokens(expectedName);
  const candidate = nameTokens(candidateName);
  if (!expected.size || !candidate.size) return 0;

  let overlap = 0;
  expected.forEach((token) => {
    if (candidate.has(token)) overlap += 1;
  });

  return overlap / Math.max(expected.size, candidate.size);
}

function namesLikelyMatch(expectedName, candidateName) {
  const score = scoreNameMatch(expectedName, candidateName);
  if (score >= 0.75) return true;

  const expected = Array.from(nameTokens(expectedName));
  const candidate = Array.from(nameTokens(candidateName));
  if (expected.length < 2 || candidate.length < 2) return false;

  // Allow common first/last-name order differences while keeping the bar high.
  return expected.filter((token) => candidate.includes(token)).length >= 2;
}

function cleanOcrLine(line) {
  return String(line || "")
    .replace(/[|{}[\]<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function lineLooksLikeName(value) {
  const cleaned = cleanOcrLine(value);
  if (!cleaned || /\d/.test(cleaned)) return false;
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length < 2 || tokens.length > 5) return false;
  const normalized = normalizeText(cleaned);
  if (/\b(passport|identity|republic|national|birth|date|sex|gender|country|issued|expires|expiry|number|signature|authority)\b/.test(normalized)) {
    return false;
  }
  return tokens.every((token) => /^[A-Za-z.'-]{2,}$/.test(token));
}

function extractNameCandidates(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map(cleanOcrLine)
    .filter(Boolean);
  const candidates = [];
  const labeledParts = {
    surname: [],
    given: [],
    full: [],
  };

  lines.forEach((line, index) => {
    const labelMatch = line.match(/^(surname|last name|given names?|first names?|full name|names?|nom|prenom)\b[:\s-]*(.+)$/i);
    if (labelMatch) {
      const label = normalizeText(labelMatch[1]);
      const value = cleanOcrLine(labelMatch[2]);
      if (value && !/\d/.test(value) && value.split(/\s+/).every((token) => /^[A-Za-z.'-]{2,}$/.test(token))) {
        if (/surname|last name|^nom$/.test(label)) labeledParts.surname.push(value);
        else if (/given|first|prenom/.test(label)) labeledParts.given.push(value);
        else labeledParts.full.push(value);
        if (value.split(/\s+/).length >= 2) candidates.push(value);
      }
      return;
    }

    if (/^(surname|last name|given names?|first names?|full name|names?|nom|prenom)$/i.test(line)) {
      const nextLine = lines[index + 1];
      if (nextLine && !/\d/.test(nextLine)) {
        const label = normalizeText(line);
        if (/surname|last name|^nom$/.test(label)) labeledParts.surname.push(nextLine);
        else if (/given|first|prenom/.test(label)) labeledParts.given.push(nextLine);
        else labeledParts.full.push(nextLine);
        if (lineLooksLikeName(nextLine)) candidates.push(nextLine);
      }
      return;
    }

    if (lineLooksLikeName(line) && /[A-Z]{2,}/.test(line)) candidates.push(line);
  });

  labeledParts.full.forEach((value) => candidates.push(value));
  labeledParts.given.forEach((given) => {
    labeledParts.surname.forEach((surname) => {
      candidates.push(`${given} ${surname}`, `${surname} ${given}`);
    });
  });

  return Array.from(new Set(candidates.map((candidate) => cleanOcrLine(candidate))));
}

function extractDocumentName(text, legalName) {
  const candidates = extractNameCandidates(text);
  if (!candidates.length) return "";

  if (legalName) {
    return candidates
      .map((candidate) => ({ candidate, score: scoreNameMatch(legalName, candidate) }))
      .sort((a, b) => b.score - a.score)[0]?.candidate || "";
  }

  return candidates[0];
}

function detectDocumentType(text) {
  const normalized = normalizeText(text);
  return Object.entries(DOCUMENT_TYPE_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => normalized.includes(normalizeText(alias)))
  )?.[0] || "";
}

function detectDocumentCountry(text) {
  const normalized = normalizeText(text);
  return Object.entries(SUPPORTED_COUNTRIES).find(([, aliases]) =>
    aliases.some((alias) => normalized.includes(normalizeText(alias)))
  )?.[0] || "";
}

function countryMatches(expectedCountry, detectedCountry) {
  if (!expectedCountry || !detectedCountry) return null;
  const expected = normalizeText(expectedCountry);
  const aliases = SUPPORTED_COUNTRIES[detectedCountry] || [];
  return aliases.some((alias) => expected.includes(normalizeText(alias)) || normalizeText(alias).includes(expected));
}

function canonicalDocumentType(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  if (/\b(passport|travel document)\b/.test(normalized)) return "passport";
  if (/\b(national|identity|nin|id card)\b/.test(normalized)) return "national_id";
  if (/\b(residence|resident|permit|card)\b/.test(normalized)) return "residence_permit";
  if (/\b(student|school|matriculation)\b/.test(normalized)) return "student_id";
  if (/\b(driver|driving|licen[cs]e)\b/.test(normalized)) return "driver_license";
  return normalized.replace(/\s+/g, "_");
}

function typeMatches(expectedType, detectedType) {
  if (!expectedType || !detectedType) return null;
  return canonicalDocumentType(expectedType) === canonicalDocumentType(detectedType);
}

function isImageMedia(media = {}) {
  const contentType = String(media.contentType || media.mimeType || media.mime_type || "").toLowerCase();
  const filename = String(media.filename || "").toLowerCase();
  if (contentType) return contentType.startsWith("image/");
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
  if (process.env.AKARA_ID_OCR === "off") {
    throw new Error("ID document OCR is disabled.");
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

function analyzeIdDocumentText(text, expected = {}) {
  const legalName = expected.legalName || "";
  const documentName = extractDocumentName(text, legalName);
  const documentCountry = detectDocumentCountry(text);
  const documentType = detectDocumentType(text);
  const legalNameMatch = legalName && documentName ? namesLikelyMatch(legalName, documentName) : null;
  const countryMatch = countryMatches(expected.idCountry, documentCountry);
  const typeMatch = typeMatches(expected.idType, documentType);
  const reasons = [];

  if (!String(text || "").trim()) reasons.push("No readable text was detected on the ID document.");
  if (!documentName) reasons.push("The legal name could not be read from the ID document.");
  if (legalNameMatch === false) reasons.push("The ID document name does not clearly match the submitted legal name.");
  if (countryMatch === false) reasons.push("The issuing country detected on the ID does not match the submitted ID country.");
  if (typeMatch === false) reasons.push("The detected document type does not match the selected ID type.");

  return {
    document_name: documentName || null,
    document_country: documentCountry || null,
    document_type: documentType || null,
    legal_name_match: legalNameMatch,
    country_match: countryMatch,
    type_match: typeMatch,
    reasons,
  };
}

async function analyzeIdDocumentMedia(expected = {}, media = {}) {
  if (!media?.buffer) {
    return {
      ocr_engine: "tesseract",
      ocr_status: "pending_review",
      ocr_confidence: null,
      ocr_text: null,
      document_name: null,
      document_country: null,
      document_type: null,
      legal_name_match: null,
      country_match: null,
      type_match: null,
      reasons: ["No document media was available for OCR."],
    };
  }

  if (!isImageMedia(media)) {
    return {
      ocr_engine: "tesseract",
      ocr_status: "pending_review",
      ocr_confidence: null,
      ocr_text: null,
      document_name: null,
      document_country: null,
      document_type: null,
      legal_name_match: null,
      country_match: null,
      type_match: null,
      reasons: ["This ID file is not an image, so Akara needs manual review."],
    };
  }

  try {
    const worker = await getTesseractWorker();
    const result = await withTimeout(
      worker.recognize(media.buffer),
      OCR_TIMEOUT_MS,
      "ID document OCR took too long."
    );
    const text = result?.data?.text || "";
    const confidence = result?.data?.confidence ?? null;
    const signals = analyzeIdDocumentText(text, expected);
    const lowConfidence = confidence !== null && confidence < OCR_MIN_CONFIDENCE;
    const hasMismatch = signals.legal_name_match === false || signals.country_match === false || signals.type_match === false;
    const hasRequiredMatch = signals.legal_name_match === true;

    return {
      ocr_engine: "tesseract",
      ocr_status: hasMismatch ? "mismatch" : lowConfidence || !hasRequiredMatch ? "pending_review" : "matched",
      ocr_confidence: confidence,
      ocr_text: text ? text.slice(0, 4000) : null,
      ...signals,
      reasons: [
        ...signals.reasons,
        ...(lowConfidence ? [`ID OCR confidence is low (${Math.round(confidence)}%).`] : []),
      ],
    };
  } catch (error) {
    return {
      ocr_engine: "tesseract",
      ocr_status: "pending_review",
      ocr_confidence: null,
      ocr_text: null,
      document_name: null,
      document_country: null,
      document_type: null,
      legal_name_match: null,
      country_match: null,
      type_match: null,
      reasons: [`Automatic ID reading failed: ${error.message}`],
    };
  }
}

function idOcrPatch(result = {}) {
  return {
    document_ocr_engine: result.ocr_engine || "tesseract",
    document_ocr_status: result.ocr_status || "pending_review",
    document_ocr_confidence: result.ocr_confidence ?? null,
    document_ocr_text: result.ocr_text || null,
    document_ocr_name: result.document_name || null,
    document_ocr_country: result.document_country || null,
    document_ocr_type: result.document_type || null,
    document_name_match: result.legal_name_match,
    document_country_match: result.country_match,
    document_type_match: result.type_match,
    document_ocr_reasons: result.reasons || [],
  };
}

module.exports = {
  analyzeIdDocumentMedia,
  analyzeIdDocumentText,
  idOcrPatch,
  namesLikelyMatch,
};
