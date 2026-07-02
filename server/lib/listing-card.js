const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { rootDir, config, getPublicUrl } = require("../config");
const { supabaseRequest, filterValue } = require("./supabase");
const { uploadWhatsAppMedia, sendWhatsAppMedia } = require("./whatsapp");
const { displayReference, listingWaOpenUrl } = require("../db/listings");

const execFileAsync = promisify(execFile);
const CARD_WIDTH = 3200;
const CARD_HEIGHT = 1600;
const cacheDir = path.join(rootDir, ".cache", "listing-cards");
const fontDir = path.join(rootDir, "server", "assets", "fonts");
const cardAssetDir = path.join(rootDir, "server", "assets", "cards");

const fontFiles = {
  coolvetica: "CoolveticaCompressedHeavy.otf",
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

function fontData(fileName) {
  const fontPath = path.join(fontDir, fileName);
  if (!fs.existsSync(fontPath)) return "";
  return fs.readFileSync(fontPath).toString("base64");
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

function numberText(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  });
}

function amountFontSize(text) {
  if (text.length <= 8) return 318;
  if (text.length <= 10) return 282;
  if (text.length <= 12) return 238;
  return 196;
}

function pillWidth(currency) {
  return Math.max(340, Math.min(470, 170 + String(currency || "").length * 72));
}

function labelPill({ x, y, label, currency }) {
  const labelWidth = 420;
  const gap = 36;
  const code = String(currency || "").toUpperCase();
  const codeWidth = pillWidth(code);
  const totalWidth = labelWidth + gap + codeWidth;
  const startX = x - totalWidth / 2;
  const colors = currencyColors[code] || { fill: "#E9EBED", text: "#000000" };
  return `
    <g>
      <rect x="${startX}" y="${y}" width="${labelWidth}" height="150" rx="12" fill="#030303" stroke="#1B1818" stroke-width="7"/>
      <text x="${startX + labelWidth / 2}" y="${y + 94}" text-anchor="middle" class="label-text">${escapeXml(label)}</text>

      <rect x="${startX + labelWidth + gap}" y="${y}" width="${codeWidth}" height="150" rx="12" fill="${colors.fill}"/>
      <text x="${startX + labelWidth + gap + codeWidth / 2}" y="${y + 101}" text-anchor="middle" class="currency-text" fill="${colors.text}">${escapeXml(code)}</text>
    </g>
  `;
}

function currencyChip({ x, y, currency, width = null, height = 150, fontSize = 78 }) {
  const code = String(currency || "").toUpperCase();
  const chipWidth = width || pillWidth(code);
  const colors = currencyColors[code] || { fill: "#E9EBED", text: "#000000" };
  return `
    <g>
      <rect x="${x - chipWidth / 2}" y="${y}" width="${chipWidth}" height="${height}" rx="${Math.round(height * 0.12)}" fill="${colors.fill}"/>
      <text x="${x}" y="${y + height * 0.68}" text-anchor="middle" class="currency-text" font-size="${fontSize}" fill="${colors.text}">${escapeXml(code)}</text>
    </g>
  `;
}

function cardBackground() {
  const background = assetDataUri("exchange-confirmation-bg.png");
  if (!background) {
    return `
      <rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#000"/>
      <text x="1600" y="1294" text-anchor="middle" font-family="CamptonCard, Arial, sans-serif" font-size="1660" font-weight="900" fill="#5C6670" opacity="0.13">AKR</text>
      <rect y="1526" width="${CARD_WIDTH}" height="22" fill="#9DFF1E"/>
      <rect y="1562" width="${CARD_WIDTH}" height="18" fill="#FFFFFF"/>
      <rect y="1594" width="${CARD_WIDTH}" height="18" fill="#F80000"/>
    `;
  }
  return `<image href="${background}" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="xMidYMid slice"/>`;
}

function listingCardSvg(listing) {
  const code = displayReference(listing.listing_code, "listing");
  const haveAmount = numberText(listing.have_amount);
  const wantAmount = numberText(listing.want_amount);
  const haveSize = amountFontSize(haveAmount);
  const wantSize = amountFontSize(wantAmount);
  const openCode = `OPEN ${code}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    ${fontFace("CoolveticaCompressedHeavy", fontFiles.coolvetica, 900)}
    ${fontFace("CamptonCard", fontFiles.camptonBook, 400)}
    ${fontFace("CamptonCard", fontFiles.camptonSemiBold, 600)}
    ${fontFace("CamptonCard", fontFiles.camptonBold, 700)}
    ${fontFace("CamptonCard", fontFiles.camptonBlack, 900)}
    .amount { font-family: 'CoolveticaCompressedHeavy', Impact, sans-serif; font-weight: 900; fill: #fff; letter-spacing: -8px; }
    .header { font-family: 'CamptonCard', Arial, sans-serif; font-size: 52px; fill: #fff; letter-spacing: 18px; }
    .header-strong { font-weight: 900; letter-spacing: 14px; }
    .label-text { font-family: 'CamptonCard', Arial, sans-serif; font-size: 58px; font-weight: 700; fill: #E9EBED; letter-spacing: 22px; }
    .currency-text { font-family: 'CamptonCard', Arial, sans-serif; font-size: 78px; font-weight: 900; letter-spacing: -2px; }
    .footer { font-family: 'CamptonCard', Arial, sans-serif; font-size: 50px; fill: #fff; letter-spacing: 10px; }
    .footer-strong { font-weight: 900; letter-spacing: 7px; }
  </style>

  ${cardBackground()}

  <text x="1600" y="178" text-anchor="middle" class="header">
    <tspan>SWAP</tspan><tspan dx="36" class="header-strong">WITH ME ON AKARA</tspan>
  </text>

  <text x="800" y="820" text-anchor="middle" class="amount" font-size="${haveSize}">${escapeXml(haveAmount)}</text>
  <text x="2400" y="820" text-anchor="middle" class="amount" font-size="${wantSize}">${escapeXml(wantAmount)}</text>

  <g opacity="0.92">
    <circle cx="1515" cy="642" r="26" fill="#25292D"/>
    <text x="1600" y="705" text-anchor="middle" font-family="CamptonCard, Arial, sans-serif" font-size="150" font-weight="900" fill="#25292D">×</text>
    <circle cx="1685" cy="642" r="26" fill="#25292D"/>
  </g>

  ${labelPill({ x: 800, y: 920, label: "I HAVE:", currency: listing.have_currency })}
  ${labelPill({ x: 2400, y: 920, label: "I NEED:", currency: listing.want_currency })}

  <rect y="1312" width="${CARD_WIDTH}" height="203" fill="#0F1012"/>
  <text x="1600" y="1432" text-anchor="middle" class="footer">
    <tspan>INTERESTED?</tspan><tspan dx="26" class="footer-strong">PASTE THIS CODE</tspan><tspan dx="26">ON</tspan><tspan dx="26" class="footer-strong">AKARA</tspan><tspan dx="26">TO SWAP:</tspan><tspan dx="26" class="footer-strong">${escapeXml(openCode)}</tspan>
  </text>
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

function dateLabel(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date).toUpperCase();
  return `${day} ${month} ${date.getFullYear()}`;
}

function exchangeCompletionSvg(deal, role) {
  const { dealPartySummary } = require("../db/deals");
  const { youSend, youReceive } = dealPartySummary(role, deal);
  const completedAt = compactDay(deal.completed_at || new Date());
  const receiveAmount = numberText(youReceive.amount);
  const receiveSize = amountFontSize(receiveAmount) + 130;
  const stamp = assetDataUri("success-stamp.png");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <style>
    ${fontFace("CoolveticaCompressedHeavy", fontFiles.coolvetica, 900)}
    ${fontFace("CamptonCard", fontFiles.camptonBook, 400)}
    ${fontFace("CamptonCard", fontFiles.camptonSemiBold, 600)}
    ${fontFace("CamptonCard", fontFiles.camptonBold, 700)}
    ${fontFace("CamptonCard", fontFiles.camptonBlack, 900)}
    .amount { font-family: 'CoolveticaCompressedHeavy', Impact, sans-serif; font-weight: 900; fill: #fff; letter-spacing: -10px; }
    .header { font-family: 'CamptonCard', Arial, sans-serif; font-size: 54px; fill: #fff; letter-spacing: 18px; }
    .header-strong { font-weight: 900; letter-spacing: 12px; }
    .meta { font-family: 'CamptonCard', Arial, sans-serif; font-size: 46px; fill: #fff; letter-spacing: 8px; }
    .meta-strong { font-weight: 900; letter-spacing: 4px; }
    .meta-number { font-family: 'CoolveticaCompressedHeavy', Impact, sans-serif; font-weight: 900; letter-spacing: -1px; }
    .site { font-family: 'CamptonCard', Arial, sans-serif; font-size: 80px; fill: #fff; font-weight: 900; letter-spacing: 5px; }
    .currency-text { font-family: 'CamptonCard', Arial, sans-serif; font-weight: 900; letter-spacing: -2px; }
  </style>

  ${cardBackground()}

  <text x="1600" y="178" text-anchor="middle" class="header">
    <tspan>EXCHANGE</tspan><tspan dx="34" class="header-strong">COMPLETED</tspan>
  </text>

  <text x="1600" y="1050" text-anchor="middle" class="amount" font-size="${receiveSize}">${escapeXml(receiveAmount)}</text>
  ${currencyChip({ x: 690, y: 640, currency: youReceive.currency, width: 340, height: 170, fontSize: 88 })}
  ${stamp ? `<image href="${stamp}" x="2320" y="220" width="600" height="600" opacity="0.9"/>` : ""}

  <text x="565" y="1320" class="meta">EXCHANGED</text>
  <text x="565" y="1378" class="meta">
    <tspan class="meta-number">${escapeXml(numberText(youSend.amount))}</tspan><tspan dx="14" class="meta-strong">${escapeXml(String(youSend.currency || "").toUpperCase())}</tspan>
  </text>
  <text x="565" y="1438" class="meta">
    <tspan>FOR</tspan><tspan dx="18" class="meta-number">${escapeXml(numberText(youReceive.amount))}</tspan><tspan dx="14" class="meta-strong">${escapeXml(String(youReceive.currency || "").toUpperCase())}</tspan>
  </text>

  <text x="1470" y="1320" text-anchor="middle" class="meta">${escapeXml(timeLabel(completedAt))}</text>
  <text x="1470" y="1438" text-anchor="middle" class="meta">${escapeXml(dateLabel(completedAt))}</text>

  <text x="2280" y="1320" class="meta">READY TO SWAP? VISIT AKARA</text>
  <text x="2280" y="1438" class="site">TRYAKARA.COM</text>
</svg>`;
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
  const fileCode = safeFileCode(listing.listing_code);
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
  const imageUrl = publicUrl ? `${publicUrl}/l/${encodeURIComponent(code)}.png` : `/l/${encodeURIComponent(code)}.svg`;
  const svgUrl = publicUrl ? `${publicUrl}/l/${encodeURIComponent(code)}.svg` : `/l/${encodeURIComponent(code)}.svg`;
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
      "cache-control": "public, max-age=300",
    });
    res.end(listingCardSvg(listing));
    return true;
  }

  if (ext === "png") {
    try {
      const png = await listingCardPng(listing);
      res.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=300",
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
    "cache-control": "public, max-age=120",
  });
  res.end(listingSharePage(listing));
  return true;
}

async function sendListingCard(to, listing, caption = "") {
  if (!to) return null;
  const png = await listingCardPng(listing);
  const mediaId = await uploadWhatsAppMedia(png, "image/png", `${safeFileCode(listing.listing_code)}.png`);
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

module.exports = {
  listingCardSvg,
  listingCardPng,
  exchangeCompletionSvg,
  exchangeCompletionPng,
  handleListingCardRoute,
  sendListingCard,
  sendExchangeCompletionCard,
};
