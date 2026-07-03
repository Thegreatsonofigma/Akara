const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const opentype = require("opentype.js");
const { rootDir, config, getPublicUrl } = require("../config");
const { supabaseRequest, filterValue } = require("./supabase");
const { uploadWhatsAppMedia, sendWhatsAppMedia } = require("./whatsapp");
const { displayReference, listingWaOpenUrl } = require("../db/listings");

const execFileAsync = promisify(execFile);
const CARD_WIDTH = 3200;
const CARD_HEIGHT = 1600;
const FIGMA_SOURCE_WIDTH = 800;
const CARD_SCALE = CARD_WIDTH / FIGMA_SOURCE_WIDTH;
const LISTING_NUMBER_SOURCE_SIZE = 120;
const LISTING_NUMBER_TRACKING = 2;
const RECEIPT_NUMBER_SOURCE_SIZE = 240;
const RECEIPT_NUMBER_TRACKING = 2;
const RECEIPT_META_FONT_SIZE = 12 * CARD_SCALE;
const RECEIPT_CAPTION_FONT_SIZE = 10 * CARD_SCALE;
const RECEIPT_SITE_FONT_SIZE = 22 * CARD_SCALE;
const RECEIPT_TEXT_TRACKING = 6;
const cacheDir = path.join(rootDir, ".cache", "listing-cards");
const fontDir = path.join(rootDir, "server", "assets", "fonts");
const cardAssetDir = path.join(rootDir, "server", "assets", "cards");

const fontFiles = {
  coolveticaCompressedHeavy: "coolvetica-compressed-hv.otf",
  coolveticaCrammedRegular: "coolvetica-crammed-rg.otf",
  coolveticaCondensedRegular: "coolvetica-condensed-rg.otf",
  coolveticaRegular: "coolvetica-rg.otf",
  coolveticaRegularItalic: "coolvetica-rg-it.otf",
  camptonBook: "CamptonBook.otf",
  camptonSemiBold: "CamptonSemiBold.otf",
  camptonBold: "CamptonBold.otf",
  camptonBlack: "CamptonBlack.otf",
};

const currencyColors = {
  NGN: { fill: "#F80000", text: "#FFFFFF" },
  RWF: { fill: "#9DFF1E", text: "#000000" },
  XAF: { fill: "#FFD233", text: "#000000" },
  KES: { fill: "#00A86B", text: "#FFFFFF" },
  GHS: { fill: "#F7D116", text: "#000000" },
};

const AKR_BACKGROUND_PATH = "M201.903 314.234L196.051 279.124H93.4219L74.9666 314.234H-38.9159L139.785 6.34606H244.215L313.985 314.234H201.903ZM135.734 197.201H182.097L170.844 130.131L135.734 197.201ZM613.401 8.14657L479.263 140.935L563.887 314.234H440.552L392.388 226.459L353.227 265.17L344.675 314.234H239.345L293.36 8.14657H398.69L379.785 116.177L490.066 8.14657H613.401ZM814.324 104.024C814.324 149.487 791.368 190.449 750.856 215.656L799.92 314.234H673.434L641.925 242.213H612.216L599.613 314.234H494.283L548.298 8.14657H691.439C770.662 8.14657 814.324 41.4561 814.324 104.024ZM638.324 95.4715L628.421 150.387H666.232C688.738 150.387 705.393 135.983 705.393 118.428C705.393 104.024 694.14 95.4715 676.135 95.4715H638.324Z";

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeFileCode(code) {
  return displayReference(code, "listing").replace(/[^A-Z0-9-]/g, "_");
}

function listingCardVersion(listing) {
  const parts = [
    listing?.have_currency,
    listing?.want_currency,
    listing?.have_amount,
    listing?.want_amount,
    listing?.listing_type,
    listing?.status,
    listing?.updated_at,
  ].filter((value) => value !== undefined && value !== null && value !== "");
  const raw = parts.join("-");
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) - hash + String(raw).charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function fontData(fileName) {
  const fontPath = path.join(fontDir, fileName);
  if (!fs.existsSync(fontPath)) return "";
  return fs.readFileSync(fontPath).toString("base64");
}

const fontCache = new Map();

function parsedFont(fileName) {
  if (fontCache.has(fileName)) return fontCache.get(fileName);
  const fontPath = path.join(fontDir, fileName);
  const buffer = fs.readFileSync(fontPath);
  const font = opentype.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  fontCache.set(fileName, font);
  return font;
}

function numberFont() {
  return parsedFont(fontFiles.coolveticaCompressedHeavy);
}

function appendPath(target, source) {
  for (const command of source.commands) {
    target.commands.push({ ...command });
  }
}

function trackedTextPath(text, fontSize, tracking) {
  return trackedTextPathForFont(numberFont(), text, fontSize, tracking);
}

function trackedTextPathForFont(font, text, fontSize, tracking) {
  const output = new opentype.Path();
  let x = 0;
  const chars = [...String(text || "")];

  chars.forEach((char, index) => {
    const glyph = font.charToGlyph(char);
    appendPath(output, glyph.getPath(x, 0, fontSize));
    x += (glyph.advanceWidth * fontSize) / font.unitsPerEm;
    if (index < chars.length - 1) x += tracking;
  });

  return output;
}

function trackedGlyphPaths(text, fontSize, tracking) {
  return trackedGlyphPathsForFont(numberFont(), text, fontSize, tracking);
}

function trackedGlyphPathsForFont(font, text, fontSize, tracking) {
  let x = 0;
  const chars = [...String(text || "")];

  return chars.map((char, index) => {
    const glyph = font.charToGlyph(char);
    const glyphPath = glyph.getPath(x, 0, fontSize);
    x += (glyph.advanceWidth * fontSize) / font.unitsPerEm;
    if (index < chars.length - 1) x += tracking;
    return glyphPath;
  });
}

function closedPathData(outline) {
  const closed = new opentype.Path();
  let hasOpenContour = false;

  outline.commands.forEach((command) => {
    if (command.type === "M") {
      if (hasOpenContour) closed.commands.push({ type: "Z" });
      hasOpenContour = true;
    }
    closed.commands.push({ ...command });
  });

  if (hasOpenContour) closed.commands.push({ type: "Z" });
  return closed.toPathData(2);
}

function listingNumberScaleX(text, sourceWidth) {
  if (!sourceWidth) return 1;
  const targetWidth = amountTextLength(text) / CARD_SCALE;
  const scale = targetWidth / sourceWidth;
  return Math.max(0.85, Math.min(1.55, scale || 1));
}

function commaPath(x, fontSize = LISTING_NUMBER_SOURCE_SIZE) {
  const scale = fontSize / LISTING_NUMBER_SOURCE_SIZE;
  const point = (value) => (x + value * scale).toFixed(2);
  const scalar = (value) => (value * scale).toFixed(2);
  const left = x + 1.8 * scale;
  const right = x + 13.68 * scale;
  return [
    `M ${left.toFixed(2)} ${scalar(17.88)}`,
    `C ${point(9.48)} ${scalar(16.44)} ${right.toFixed(2)} ${scalar(10.92)} ${right.toFixed(2)} ${scalar(1.08)}`,
    `L ${right.toFixed(2)} ${scalar(-11.76)}`,
    `L ${left.toFixed(2)} ${scalar(-11.76)}`,
    `L ${left.toFixed(2)} 0`,
    `C ${left.toFixed(2)} ${scalar(7.68)} ${point(0.6)} ${scalar(12.96)} ${point(-3.36)} ${scalar(17.88)}`,
    "Z",
  ].join(" ");
}

function listingCommaPath(x) {
  return commaPath(x, LISTING_NUMBER_SOURCE_SIZE);
}

function amountGlyphs(text, fontSize, tracking) {
  const font = numberFont();
  let x = 0;
  const chars = [...String(text || "")];

  return chars
    .map((char, index) => {
      const glyph = font.charToGlyph(char);
      const glyphX = Number(x.toFixed(2));
      const pathData = char === "," ? commaPath(glyphX, fontSize) : closedPathData(glyph.getPath(glyphX, 0, fontSize));
      x += (glyph.advanceWidth * fontSize) / font.unitsPerEm;
      if (index < chars.length - 1) x += tracking;
      return `<path d="${pathData}"/>`;
    })
    .join("");
}

function listingAmountGlyphs(text, tracking) {
  return amountGlyphs(text, LISTING_NUMBER_SOURCE_SIZE, tracking);
}

function listingAmountPath(text, { centerX, topY }) {
  const tracking = LISTING_NUMBER_TRACKING;
  const outline = trackedTextPath(text, LISTING_NUMBER_SOURCE_SIZE, tracking);
  const box = outline.getBoundingBox();
  const scaleX = listingNumberScaleX(text, box.x2 - box.x1);
  const width = (box.x2 - box.x1) * CARD_SCALE * scaleX;
  const x = centerX - width / 2 - box.x1 * CARD_SCALE * scaleX;
  const y = topY - box.y1 * CARD_SCALE;
  const glyphs = listingAmountGlyphs(text, tracking);

  return `<g fill="#FFFFFF" transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${(CARD_SCALE * scaleX).toFixed(4)} ${CARD_SCALE})">${glyphs}</g>`;
}

function amountOutlinePlacement(text, { fontSize, tracking, leftX = null, centerX = null, topY, targetWidth = null }) {
  const outline = trackedTextPath(text, fontSize, tracking);
  const box = outline.getBoundingBox();
  const naturalWidth = (box.x2 - box.x1) * CARD_SCALE;
  const scaleX = targetWidth ? Math.max(0.72, Math.min(1.18, targetWidth / naturalWidth)) : 1;
  const width = naturalWidth * scaleX;
  const visualLeft = leftX ?? (centerX ?? CARD_WIDTH / 2) - width / 2;
  const x = visualLeft - box.x1 * CARD_SCALE * scaleX;
  const y = topY - box.y1 * CARD_SCALE;

  return {
    box,
    scaleX,
    width,
    visualLeft,
    visualRight: visualLeft + width,
    x,
    y,
  };
}

function amountOutlinePath(text, options) {
  const { fontSize, tracking } = options;
  const placement = amountOutlinePlacement(text, options);
  const glyphs = amountGlyphs(text, fontSize, tracking);

  return `<g fill="#FFFFFF" transform="translate(${placement.x.toFixed(3)} ${placement.y.toFixed(3)}) scale(${(CARD_SCALE * placement.scaleX).toFixed(4)} ${CARD_SCALE})">${glyphs}</g>`;
}

function textOutlineGroup({ text, fontFile, fontSize, centerX, centerY, fill, tracking = 0, targetWidth = null, strokeWidth = 0 }) {
  const value = String(text || "");
  const font = parsedFont(fontFile);
  if (targetWidth && value.length > 1) {
    const untrackedBox = trackedTextPathForFont(font, value, fontSize, 0).getBoundingBox();
    tracking = (targetWidth - (untrackedBox.x2 - untrackedBox.x1)) / (value.length - 1);
  }
  const outline = trackedTextPathForFont(font, value, fontSize, tracking);
  const box = outline.getBoundingBox();
  const x = centerX - (box.x1 + box.x2) / 2;
  const y = centerY - (box.y1 + box.y2) / 2;
  const glyphs = trackedGlyphPathsForFont(font, value, fontSize, tracking)
    .map((glyphPath) => `<path d="${closedPathData(glyphPath)}"/>`)
    .join("");
  const stroke = strokeWidth > 0 ? ` stroke="${fill}" stroke-width="${strokeWidth}" stroke-linejoin="round" paint-order="stroke fill"` : "";

  return `<g fill="${fill}"${stroke} transform="translate(${x.toFixed(3)} ${y.toFixed(3)})">${glyphs}</g>`;
}

function listingCurrencyTextWidth(currency) {
  const code = String(currency || "").toUpperCase();
  if (code === "NGN") return 202;
  if (code === "RWF") return 206;
  return 206;
}

function fontFace(name, fileName, weight = 700) {
  const data = fontData(fileName);
  if (!data) return "";
  return `
    @font-face {
      font-family: '${name}';
      src: url(data:font/otf;base64,${data}) format('opentype');
      font-weight: ${weight};
      font-style: normal;
    }
  `;
}

function assetDataUri(fileName, contentType = "image/png") {
  const assetPath = path.join(cardAssetDir, fileName);
  if (!fs.existsSync(assetPath)) return "";
  return `data:${contentType};base64,${fs.readFileSync(assetPath).toString("base64")}`;
}

function svgAsset(fileName) {
  return assetDataUri(fileName, "image/svg+xml");
}

function numberText(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  });
}

function amountTextLength(text) {
  const value = String(text || "").trim();
  if (value === "1,000,000") return 1020;
  if (value === "1,150,000") return 991;

  const advance = {
    "0": 34.5,
    "1": 24,
    "2": 34.5,
    "3": 34.5,
    "4": 34.5,
    "5": 35.1,
    "6": 34.5,
    "7": 34.5,
    "8": 34.5,
    "9": 34.5,
    ",": 14.2,
    ".": 14.2,
  };
  const lastWidth = {
    "0": 29.52,
    "1": 17.88,
    "2": 29.52,
    "3": 29.52,
    "4": 29.52,
    "5": 28.92,
    "6": 29.52,
    "7": 29.52,
    "8": 29.52,
    "9": 29.52,
    ",": 11.88,
    ".": 11.88,
  };
  const chars = [...value];
  if (!chars.length) return 0;
  const units = chars.reduce((sum, char, index) => {
    const table = index === chars.length - 1 ? lastWidth : advance;
    return sum + (table[char] || 34.5);
  }, 0);
  return Math.round(units * 4);
}

function completionAmountTextLength(text) {
  const value = String(text || "").trim();
  if (value === "1,000,000") return 2048;
  if (value === "1,150,000") return 1993;
  return amountTextLength(text) * 2;
}

function completionAmountLayout(text) {
  const options = {
    fontSize: RECEIPT_NUMBER_SOURCE_SIZE,
    tracking: RECEIPT_NUMBER_TRACKING,
    centerX: CARD_WIDTH / 2,
    topY: 392,
    targetWidth: completionAmountTextLength(text),
  };
  const placement = amountOutlinePlacement(text, options);
  const glyphs = amountGlyphs(text, RECEIPT_NUMBER_SOURCE_SIZE, RECEIPT_NUMBER_TRACKING);

  return {
    svg: `<g fill="#FFFFFF" transform="translate(${placement.x.toFixed(3)} ${placement.y.toFixed(3)}) scale(${(CARD_SCALE * placement.scaleX).toFixed(4)} ${CARD_SCALE})">${glyphs}</g>`,
    bounds: placement,
  };
}

function completionAmountPath(text) {
  return completionAmountLayout(text).svg;
}

function completionCurrencyChipX(bounds) {
  if (bounds.width >= 1800) return 708;
  return Math.max(560, Math.min(bounds.visualLeft + 180, 1220));
}

function completionStampImage(stamp, bounds) {
  if (!stamp) return "";
  const stampSize = 600;
  const stampX = Math.max(1540, Math.min(bounds.visualRight - stampSize * 0.48, CARD_WIDTH - stampSize - 280));
  return `<image href="${stamp}" x="${stampX.toFixed(0)}" y="220" width="${stampSize}" height="${stampSize}" preserveAspectRatio="xMidYMid meet"/>`;
}

function pillWidth(currency) {
  return Math.max(340, Math.min(470, 170 + String(currency || "").length * 72));
}

function labelPill({ x, y, label, currency }) {
  const labelWidth = 416;
  const labelHeight = 176;
  const gap = 36;
  const code = String(currency || "").toUpperCase();
  const codeWidth = 344;
  const totalWidth = labelWidth + gap + codeWidth;
  const startX = x - totalWidth / 2;
  const colors = currencyColors[code] || { fill: "#E9EBED", text: "#000000" };
  return `
    <g>
      <rect x="${startX}" y="${y}" width="${labelWidth}" height="${labelHeight}" rx="16" fill="#030303" stroke="#1B1818" stroke-width="8"/>
      <text x="${startX + labelWidth / 2}" y="${y + 110}" text-anchor="middle" class="label-text">${escapeXml(label)}</text>

      <rect x="${startX + labelWidth + gap}" y="${y}" width="${codeWidth}" height="${labelHeight}" rx="16" fill="${colors.fill}"/>
      <text x="${startX + labelWidth + gap + codeWidth / 2}" y="${y + 120}" text-anchor="middle" class="currency-text" fill="${colors.text}">${escapeXml(code)}</text>
    </g>
  `;
}

function currencyChip({ x, y, currency, width = null, height = 150, fontSize = 78 }) {
  const code = String(currency || "").toUpperCase();
  const chipWidth = width || pillWidth(code);
  const colors = currencyColors[code] || { fill: "#E9EBED", text: "#000000" };
  const textWidth = listingCurrencyTextWidth(code);
  return `
    <g>
      <rect x="${x - chipWidth / 2}" y="${y}" width="${chipWidth}" height="${height}" rx="${Math.round(height * 0.09)}" fill="${colors.fill}" stroke="#030303" stroke-width="16"/>
      ${textOutlineGroup({
        text: code,
        fontFile: fontFiles.camptonBlack,
        fontSize,
        centerX: x,
        centerY: y + height * 0.56,
        fill: colors.text,
        targetWidth: textWidth,
      })}
    </g>
  `;
}

function cardBackground({ footerBand = false } = {}) {
  return `
    <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#000"/>
    <path d="${AKR_BACKGROUND_PATH}" fill="#5C6670" fill-opacity="0.13" transform="scale(4)"/>
    ${footerBand ? `<rect y="1280" width="${CARD_WIDTH}" height="204" fill="#0F1012"/>` : ""}
    <rect y="1492" width="${CARD_WIDTH}" height="24" fill="#9DFF1E"/>
    <rect y="1524" width="${CARD_WIDTH}" height="24" fill="#FFFFFF"/>
    <rect y="1556" width="${CARD_WIDTH}" height="24" fill="#F80000"/>
  `;
}

function akaraLogo({ x, y, width = 220, height = 224, opacity = 1 }) {
  const logo = assetDataUri("akara-logo-mark.png");
  if (!logo) return "";
  return `<image href="${logo}" x="${x}" y="${y}" width="${width}" height="${height}" opacity="${opacity}" preserveAspectRatio="xMidYMid meet"/>`;
}

function listingCardSvg(listing) {
  const code = displayReference(listing.listing_code, "listing");
  const haveAmount = numberText(listing.have_amount);
  const wantAmount = numberText(listing.want_amount);
  const openCode = `OPEN ${code}`;
  const base = assetDataUri("listing-card-base.png");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    ${fontFace("CoolveticaCompressedHeavy", fontFiles.coolveticaCompressedHeavy, 900)}
    ${fontFace("CoolveticaCrammedRegular", fontFiles.coolveticaCrammedRegular, 400)}
    ${fontFace("CoolveticaCondensedRegular", fontFiles.coolveticaCondensedRegular, 400)}
    ${fontFace("CoolveticaRegular", fontFiles.coolveticaRegular, 400)}
    ${fontFace("CoolveticaRegularItalic", fontFiles.coolveticaRegularItalic, 400)}
    ${fontFace("CamptonCard", fontFiles.camptonBook, 400)}
    ${fontFace("CamptonCard", fontFiles.camptonSemiBold, 600)}
    ${fontFace("CamptonCard", fontFiles.camptonBold, 700)}
    ${fontFace("CamptonCard", fontFiles.camptonBlack, 900)}
    .footer-code { font-family: 'CamptonCard', Arial, sans-serif; font-size: 50px; font-weight: 900; fill: #fff; letter-spacing: 7px; }
  </style>

  ${base ? `<image href="${base}" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="none"/>` : cardBackground({ footerBand: true })}

  ${listingAmountPath(haveAmount, { centerX: 860, topY: 464 })}
  ${listingAmountPath(wantAmount, { centerX: 2356.5, topY: 464 })}

  ${textOutlineGroup({
    text: String(listing.have_currency || "").toUpperCase(),
    fontFile: fontFiles.camptonBlack,
    fontSize: 94,
    centerX: 1088,
    centerY: 967,
    fill: "#FFFFFF",
    targetWidth: listingCurrencyTextWidth(listing.have_currency),
  })}
  ${textOutlineGroup({
    text: String(listing.want_currency || "").toUpperCase(),
    fontFile: fontFiles.camptonBlack,
    fontSize: 94,
    centerX: 2584,
    centerY: 967,
    fill: "#000000",
    targetWidth: listingCurrencyTextWidth(listing.want_currency),
  })}

  <text x="2220" y="1396" class="footer-code">${escapeXml(openCode)}</text>
</svg>`;
}

function compactDay(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function timeLabel(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value || "AM";
  const weekday = parts.find((part) => part.type === "weekday")?.value || "Today";
  return `${hour} : ${minute} ${dayPeriod.toUpperCase()} - ${weekday.toUpperCase()}`;
}

function timeLabelParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    weekday: "long",
  }).formatToParts(date);
  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value || "AM";
  const weekday = parts.find((part) => part.type === "weekday")?.value || "Today";
  return {
    time: `${hour} : ${minute}`,
    period: dayPeriod.toUpperCase(),
    weekday: weekday.toUpperCase(),
  };
}

function dateLabel(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase();
  return `${day} - ${month} - ${date.getFullYear()}`;
}

function dateLabelParts(date) {
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase(),
    year: String(date.getFullYear()),
  };
}

function exchangeCompletionSvg(deal, role) {
  const { dealPartySummary } = require("../db/deals");
  const { youSend, youReceive } = dealPartySummary(role, deal);
  const completedAt = compactDay(deal.completed_at || new Date());
  const receiveAmount = numberText(youReceive.amount);
  const stamp = assetDataUri("success-stamp.png");
  const amountLayout = completionAmountLayout(receiveAmount);
  const chipX = completionCurrencyChipX(amountLayout.bounds);
  const timeParts = timeLabelParts(completedAt);
  const dateParts = dateLabelParts(completedAt);
  const lowerLine1Y = 1280;
  const lowerLine2Y = 1370;
  const lowerLine3Y = 1438;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    ${fontFace("CoolveticaCompressedHeavy", fontFiles.coolveticaCompressedHeavy, 900)}
    ${fontFace("CoolveticaCrammedRegular", fontFiles.coolveticaCrammedRegular, 400)}
    ${fontFace("CoolveticaCondensedRegular", fontFiles.coolveticaCondensedRegular, 400)}
    ${fontFace("CoolveticaRegular", fontFiles.coolveticaRegular, 400)}
    ${fontFace("CoolveticaRegularItalic", fontFiles.coolveticaRegularItalic, 400)}
    ${fontFace("CamptonCard", fontFiles.camptonBook, 400)}
    ${fontFace("CamptonCard", fontFiles.camptonSemiBold, 600)}
    ${fontFace("CamptonCard", fontFiles.camptonBold, 700)}
    ${fontFace("CamptonCard", fontFiles.camptonBlack, 900)}
    .header { font-family: 'CamptonCard', Arial, sans-serif; font-size: 54px; fill: #fff; letter-spacing: 18px; }
    .header-strong { font-weight: 900; letter-spacing: 12px; }
    .receipt-meta { font-family: 'CamptonCard', Arial, sans-serif; font-size: ${RECEIPT_META_FONT_SIZE}px; fill: #fff; font-weight: 400; letter-spacing: ${RECEIPT_TEXT_TRACKING}px; text-transform: uppercase; }
    .receipt-strong { font-weight: 700; }
    .receipt-caption { font-family: 'CamptonCard', Arial, sans-serif; font-size: ${RECEIPT_CAPTION_FONT_SIZE}px; fill: #fff; font-weight: 400; letter-spacing: ${RECEIPT_TEXT_TRACKING}px; text-transform: uppercase; }
    .receipt-site { font-family: 'CamptonCard', Arial, sans-serif; font-size: ${RECEIPT_SITE_FONT_SIZE}px; fill: #fff; font-weight: 600; letter-spacing: ${RECEIPT_TEXT_TRACKING}px; text-transform: uppercase; }
  </style>

  ${cardBackground()}
  ${akaraLogo({ x: 514, y: 58, width: 220, height: 224, opacity: 0.96 })}

  <text x="1600" y="172" text-anchor="middle" class="header">
    <tspan>EXCHANGE</tspan><tspan dx="34" class="header-strong">COMPLETED</tspan>
  </text>

  ${amountLayout.svg}
  ${currencyChip({ x: chipX, y: 616, currency: youReceive.currency, width: 344, height: 176, fontSize: 92 })}
  ${completionStampImage(stamp, amountLayout.bounds)}

  <text x="565" y="${lowerLine1Y}" class="receipt-meta">EXCHANGED</text>
  <text x="565" y="${lowerLine2Y}" class="receipt-meta">
    <tspan class="receipt-strong">${escapeXml(numberText(youSend.amount))}</tspan><tspan dx="24" class="receipt-strong">${escapeXml(String(youSend.currency || "").toUpperCase())}</tspan>
  </text>
  <text x="565" y="${lowerLine3Y}" class="receipt-meta">
    <tspan>FOR</tspan><tspan dx="24" class="receipt-strong">${escapeXml(numberText(youReceive.amount))}</tspan><tspan dx="24" class="receipt-strong">${escapeXml(String(youReceive.currency || "").toUpperCase())}</tspan>
  </text>

  <text x="1195" y="${lowerLine1Y}" class="receipt-meta">
    <tspan>${escapeXml(timeParts.time)}</tspan><tspan dx="24" class="receipt-strong">${escapeXml(timeParts.period)}</tspan><tspan dx="24">- ${escapeXml(timeParts.weekday)}</tspan>
  </text>
  <text x="1195" y="${lowerLine3Y}" class="receipt-meta">
    <tspan class="receipt-strong">${escapeXml(dateParts.day)}</tspan><tspan dx="24">-</tspan><tspan dx="24" class="receipt-strong">${escapeXml(dateParts.month)}</tspan><tspan dx="24">- ${escapeXml(dateParts.year)}</tspan>
  </text>

  <text x="1996" y="${lowerLine1Y}" class="receipt-caption">READY TO SWAP? VISIT AKARA</text>
  <text x="1996" y="${lowerLine3Y}" class="receipt-site">TRYAKARA.COM</text>
</svg>`;
}

function verificationSuccessSvg() {
  const template = svgAsset("verification-success-template.svg");
  if (template) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <image href="${template}" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="none"/>
</svg>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    ${fontFace("CamptonCard", fontFiles.camptonBook, 400)}
    ${fontFace("CamptonCard", fontFiles.camptonSemiBold, 600)}
    ${fontFace("CamptonCard", fontFiles.camptonBold, 700)}
    ${fontFace("CamptonCard", fontFiles.camptonBlack, 900)}
    .header { font-family: 'CamptonCard', Arial, sans-serif; font-size: 54px; fill: #fff; letter-spacing: 20px; }
    .header-strong { font-weight: 900; letter-spacing: 14px; }
    .verified { font-family: 'CamptonCard', Arial, sans-serif; font-size: 520px; font-weight: 900; fill: #fff; letter-spacing: -24px; }
    .pill { font-family: 'CamptonCard', Arial, sans-serif; font-size: 62px; font-weight: 900; fill: #000; letter-spacing: -3px; }
    .body { font-family: 'CamptonCard', Arial, sans-serif; font-size: 50px; fill: #fff; letter-spacing: 9px; }
    .body-strong { font-weight: 900; letter-spacing: 7px; }
  </style>

  ${cardBackground()}
  ${akaraLogo({ x: 510, y: 60, size: 220, opacity: 0.96 })}

  <text x="1600" y="178" text-anchor="middle" class="header">
    <tspan>VERIFICATION</tspan><tspan dx="34" class="header-strong">STATUS</tspan>
  </text>

  <text x="1600" y="1000" text-anchor="middle" class="verified">Verified!</text>

  <rect x="1916" y="544" width="500" height="150" rx="12" fill="#E8FF00" stroke="#030303" stroke-width="14"/>
  <text x="2166" y="642" text-anchor="middle" class="pill">You’re now</text>

  <text x="1600" y="1212" text-anchor="middle" class="body">
    <tspan>NOW YOU CAN</tspan><tspan dx="18" class="body-strong">SEE AVAILABLE OFFERS,</tspan><tspan dx="18">CREATE YOUR OWN RATE LISTING,</tspan>
  </text>
  <text x="1600" y="1300" text-anchor="middle" class="body">
    <tspan>SET UP A</tspan><tspan dx="18" class="body-strong">PAYOUT ACCOUNT</tspan><tspan dx="18">AND ENJOY</tspan><tspan dx="18" class="body-strong">BORDERLESS CONVERSIONS.</tspan>
  </text>
</svg>`;
}

async function verificationSuccessPng() {
  fs.mkdirSync(cacheDir, { recursive: true });
  const svgPath = path.join(cacheDir, "verification-success.svg");
  const pngPath = path.join(cacheDir, "verification-success.png");
  fs.writeFileSync(svgPath, verificationSuccessSvg());

  await renderPngWithAvailableTool(svgPath, pngPath);
  return fs.readFileSync(pngPath);
}

async function getListingByCode(code) {
  const normalized = displayReference(code, "listing");
  const rows = await supabaseRequest(
    [
      "listings?select=id,listing_code,have_currency,want_currency,have_amount,want_amount,listing_type,status,created_at",
      `listing_code=eq.${filterValue(normalized)}`,
      "limit=1",
    ].join("&")
  );
  return rows[0] || null;
}

function findExecutable(names) {
  const paths = String(process.env.PATH || "").split(path.delimiter);
  for (const name of names) {
    if (path.isAbsolute(name) && fs.existsSync(name)) return name;
    for (const dir of paths) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "";
}

async function renderPngWithAvailableTool(svgPath, pngPath) {
  try {
    const sharp = require("sharp");
    await sharp(svgPath, { density: 288 })
      .resize(CARD_WIDTH, CARD_HEIGHT, { fit: "fill" })
      .png()
      .toFile(pngPath);
    return;
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") {
      console.warn(`[listing-card] sharp render failed, trying system renderer: ${error.message}`);
    }
  }

  const rsvg = findExecutable(["rsvg-convert", "/opt/homebrew/bin/rsvg-convert", "/usr/local/bin/rsvg-convert"]);
  if (rsvg) {
    await execFileAsync(rsvg, ["-w", String(CARD_WIDTH), "-h", String(CARD_HEIGHT), "-f", "png", "-o", pngPath, svgPath]);
    return;
  }

  const magick = findExecutable(["magick", "convert", "/opt/homebrew/bin/magick", "/usr/local/bin/magick"]);
  if (magick) {
    const args = path.basename(magick) === "convert"
      ? [svgPath, pngPath]
      : [svgPath, pngPath];
    await execFileAsync(magick, args);
    return;
  }

  const qlmanage = findExecutable(["/usr/bin/qlmanage", "qlmanage"]);
  if (qlmanage) {
    await execFileAsync(qlmanage, ["-t", "-s", String(CARD_WIDTH), "-o", path.dirname(pngPath), svgPath]);
    const generated = path.join(path.dirname(pngPath), `${path.basename(svgPath)}.png`);
    if (fs.existsSync(generated)) {
      fs.renameSync(generated, pngPath);
      return;
    }
  }

  throw new Error("No SVG to PNG renderer found. Run npm install, or install librsvg or ImageMagick for PNG card delivery.");
}

async function listingCardPng(listing) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const fileCode = `${safeFileCode(listing.listing_code)}-${listingCardVersion(listing)}`;
  const svgPath = path.join(cacheDir, `${fileCode}.svg`);
  const pngPath = path.join(cacheDir, `${fileCode}.png`);
  const svg = listingCardSvg(listing);
  fs.writeFileSync(svgPath, svg);

  await renderPngWithAvailableTool(svgPath, pngPath);
  return fs.readFileSync(pngPath);
}

async function exchangeCompletionPng(deal, role) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const dealCode = displayReference(deal.deal_code, "deal");
  const fileCode = `${safeFileCode(dealCode)}-${role}-complete`;
  const svgPath = path.join(cacheDir, `${fileCode}.svg`);
  const pngPath = path.join(cacheDir, `${fileCode}.png`);
  fs.writeFileSync(svgPath, exchangeCompletionSvg(deal, role));

  await renderPngWithAvailableTool(svgPath, pngPath);
  return fs.readFileSync(pngPath);
}

function listingSharePage(listing) {
  const code = displayReference(listing.listing_code, "listing");
  const publicUrl = getPublicUrl();
  const version = listingCardVersion(listing);
  const versionQuery = version ? `?v=${encodeURIComponent(version)}` : "";
  const imageUrl = publicUrl ? `${publicUrl}/l/${encodeURIComponent(code)}.png${versionQuery}` : `/l/${encodeURIComponent(code)}.svg${versionQuery}`;
  const svgUrl = publicUrl ? `${publicUrl}/l/${encodeURIComponent(code)}.svg${versionQuery}` : `/l/${encodeURIComponent(code)}.svg${versionQuery}`;
  const openUrl = listingWaOpenUrl(code) || `https://wa.me/${String(config.akaraWhatsappNumber || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(`open ${code}`)}`;
  const title = `${numberText(listing.have_amount)} ${listing.have_currency} for ${numberText(listing.want_amount)} ${listing.want_currency} on Akara`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeXml(title)}</title>
  <meta property="og:title" content="${escapeXml(title)}">
  <meta property="og:description" content="Paste ${escapeXml(`open ${code}`)} on Akara to start this swap.">
  <meta property="og:image" content="${escapeXml(imageUrl)}">
  <meta property="og:image:width" content="${CARD_WIDTH}">
  <meta property="og:image:height" content="${CARD_HEIGHT}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${escapeXml(imageUrl)}">
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #030303; color: white; font-family: Arial, sans-serif; }
    main { width: min(100%, 1120px); padding: 24px; }
    img { width: 100%; height: auto; display: block; border-radius: 18px; }
    a { display: inline-block; margin-top: 18px; padding: 14px 18px; background: #9DFF1E; color: #000; border-radius: 10px; font-weight: 800; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <img src="${escapeXml(svgUrl)}" alt="${escapeXml(title)}">
    <a href="${escapeXml(openUrl)}">Open this listing on Akara</a>
  </main>
</body>
</html>`;
}

async function handleListingCardRoute(req, res, url) {
  const match = url.pathname.match(/^\/l\/([^/.]+)(?:\.(svg|png))?$/i);
  if (!match) return false;

  const [, rawCode, ext] = match;
  const listing = await getListingByCode(decodeURIComponent(rawCode));
  if (!listing) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Listing not found");
    return true;
  }

  if (ext === "svg") {
    res.writeHead(200, {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(listingCardSvg(listing));
    return true;
  }

  if (ext === "png") {
    try {
      const png = await listingCardPng(listing);
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "no-store",
      });
      res.end(png);
    } catch (error) {
      res.writeHead(307, { location: `/l/${encodeURIComponent(displayReference(listing.listing_code, "listing"))}.svg` });
      res.end();
    }
    return true;
  }

  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(listingSharePage(listing));
  return true;
}

async function sendListingCard(to, listing, caption = "") {
  if (!to) return null;
  const png = await listingCardPng(listing);
  const mediaId = await uploadWhatsAppMedia(
    png,
    "image/png",
    `${safeFileCode(listing.listing_code)}-${listingCardVersion(listing)}.png`
  );
  if (!mediaId) return null;
  return sendWhatsAppMedia(to, "image", mediaId, caption);
}

async function sendExchangeCompletionCard(to, deal, role, caption = "") {
  if (!to) return null;
  const png = await exchangeCompletionPng(deal, role);
  const mediaId = await uploadWhatsAppMedia(
    png,
    "image/png",
    `${safeFileCode(displayReference(deal.deal_code, "deal"))}-${role}-complete.png`
  );
  if (!mediaId) return null;
  return sendWhatsAppMedia(to, "image", mediaId, caption);
}

async function sendVerificationSuccessCard(to, caption = "") {
  if (!to) return null;
  const png = await verificationSuccessPng();
  const mediaId = await uploadWhatsAppMedia(png, "image/png", "akara-verification-success.png");
  if (!mediaId) return null;
  return sendWhatsAppMedia(to, "image", mediaId, caption);
}

module.exports = {
  listingCardSvg,
  listingCardVersion,
  listingCardPng,
  exchangeCompletionSvg,
  exchangeCompletionPng,
  verificationSuccessSvg,
  verificationSuccessPng,
  handleListingCardRoute,
  sendListingCard,
  sendExchangeCompletionCard,
  sendVerificationSuccessCard,
};
