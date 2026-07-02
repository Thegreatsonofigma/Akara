const { config } = require("../config");
const { supabaseRequest, filterValue } = require("../lib/supabase");
const { moneyNumber, positiveMoney } = require("../lib/format");

function referencePrefix(entity) {
  return entity === "listing" ? "AKR-LIST" : "AKR-TXN";
}

function displayReference(code, entity = "deal") {
  const value = String(code || "");
  const oldMatch = value.match(/kara\s+(match|offer|drop)\s+(\d{1,5})/i);
  if (oldMatch) {
    const [, type, sequence] = oldMatch;
    const normalizedType = type.toLowerCase() === "match" ? "TXN" : "OFFER";
    return `AKR-${normalizedType}-${String(sequence).padStart(3, "0")}`;
  }

  if (/^AKR[-\s]/i.test(value)) return value.toUpperCase().replace(/\s+/g, "-");
  return entity === "listing" ? "AKR-LIST-PENDING" : "AKR-TXN-PENDING";
}

async function generateReferenceCode(entity) {
  const table = entity === "listing" ? "listings" : "deals";
  const column = entity === "listing" ? "listing_code" : "deal_code";
  const prefix = referencePrefix(entity);
  const rows = await supabaseRequest(`${table}?select=${column}&${column}=like.${filterValue(`${prefix}-%`)}`);
  const nextSequence = rows.reduce((max, row) => {
    const value = row[column] || "";
    const sequence = Number(value.split(/[-\s]/).at(-1));
    return Number.isFinite(sequence) ? Math.max(max, sequence) : max;
  }, 0) + 1;

  return `${prefix}-${String(nextSequence).padStart(3, "0")}`;
}

function extractListingCode(input) {
  const value = String(input || "");
  const akaraMatch = value.match(/kara\s+(offer|drop)\s+\d{1,5}/i);
  if (akaraMatch) {
    const [, type] = akaraMatch;
    const sequence = String(akaraMatch[0].match(/\d{1,5}/)?.[0] || "").padStart(3, "0");
    const normalizedType = type.toLowerCase() === "offer" ? "Offer" : "Drop";
    return `Kara ${normalizedType} ${sequence}`;
  }

  const akrMatch = value.match(/\bakr[-\s](list|listing|offer|drop)[-\s]\d{1,5}\b/i);
  if (!akrMatch) return null;
  const [, type] = akrMatch;
  const sequence = String(akrMatch[0].match(/\d{1,5}/)?.[0] || "").padStart(3, "0");
  const normalizedType = ["LIST", "LISTING"].includes(type.toUpperCase())
    ? "LIST"
    : type.toUpperCase() === "DROP"
      ? "DROP"
      : "OFFER";
  return `AKR-${normalizedType}-${sequence}`;
}

function extractDealCode(input) {
  const value = String(input || "");
  const akaraMatch = value.match(/kara\s+match\s+\d{1,5}/i);
  if (akaraMatch) {
    const sequence = String(akaraMatch[0].match(/\d{1,5}/)?.[0] || "").padStart(3, "0");
    return `AKR-TXN-${sequence}`;
  }

  const akrMatch = value.match(/\bakr[-\s](txn|transaction|trade|deal|match)[-\s]\d{1,5}\b/i);
  if (akrMatch) {
    const sequence = String(akrMatch[0].match(/\d{1,5}/)?.[0] || "").padStart(3, "0");
    return `AKR-TXN-${sequence}`;
  }

  const shortMatch = value.match(/\b(txn|transaction|trade|deal)\s*[-#:]?\s*(\d{1,5})\b/i);
  if (!shortMatch) return null;
  return `AKR-TXN-${String(shortMatch[2]).padStart(3, "0")}`;
}

function listingShareUrl(listingCode) {
  const phone = String(config.akaraWhatsappNumber || "").replace(/[^\d]/g, "");
  if (!phone) return "";
  return `https://wa.me/${phone}?text=${encodeURIComponent(`open ${listingCode}`)}`;
}

function listingTypeLabel(value) {
  return value === "negotiable" ? "Flexible rate" : "Fixed rate";
}

function listingStatusLabel(status) {
  return {
    active: "Live",
    reserved: "In trade",
    paused: "Paused",
    completed: "Completed",
    cancelled: "Closed",
    expired: "Expired",
    flagged: "Flagged",
    draft: "Draft",
  }[status] || status;
}

async function getUserListings(userId, limit = 10) {
  return supabaseRequest(
    [
      "listings?select=id,listing_code,status,have_currency,want_currency,have_amount,want_amount,listing_type,created_at",
      `owner_user_id=eq.${filterValue(userId)}`,
      "order=created_at.desc",
      `limit=${limit}`,
    ].join("&")
  );
}

function listingHasEnoughForDeal(listing, haveAmount, wantAmount) {
  return moneyNumber(listing.have_amount) >= moneyNumber(haveAmount)
    && moneyNumber(listing.want_amount) >= moneyNumber(wantAmount);
}

async function createResidualListing(sourceListing, usedHaveAmount, usedWantAmount) {
  const remainingHaveAmount = positiveMoney(moneyNumber(sourceListing.have_amount) - moneyNumber(usedHaveAmount));
  const remainingWantAmount = positiveMoney(moneyNumber(sourceListing.want_amount) - moneyNumber(usedWantAmount));
  if (!remainingHaveAmount || !remainingWantAmount) return null;

  const listingCode = await generateReferenceCode("listing");
  const rows = await supabaseRequest("listings", {
    method: "POST",
    body: JSON.stringify({
      owner_user_id: sourceListing.owner_user_id,
      listing_code: listingCode,
      have_currency: sourceListing.have_currency,
      want_currency: sourceListing.want_currency,
      have_amount: remainingHaveAmount,
      want_amount: remainingWantAmount,
      listing_type: sourceListing.listing_type || "fixed",
      status: "active",
    }),
  });

  return rows[0] || null;
}

module.exports = {
  displayReference,
  generateReferenceCode,
  extractListingCode,
  extractDealCode,
  listingShareUrl,
  listingTypeLabel,
  listingStatusLabel,
  getUserListings,
  listingHasEnoughForDeal,
  createResidualListing,
};
