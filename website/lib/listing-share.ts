import "server-only";

const LISTING_PREVIEW_REVISION = "preview-v2";

export type PublicListing = {
  listing_code: string;
  have_currency: string;
  want_currency: string;
  have_amount: number | string;
  want_amount: number | string;
  listing_type: "fixed" | "negotiable";
  status: string;
  updated_at: string | null;
};

const LISTING_FIELDS = [
  "listing_code",
  "have_currency",
  "want_currency",
  "have_amount",
  "want_amount",
  "listing_type",
  "status",
  "updated_at",
].join(",");

export function normalizeListingCode(value: string) {
  const code = decodeURIComponent(String(value || "")).trim().toUpperCase();
  return /^AKR-(?:LIST|LISTING|OFFER|DROP)-\d{1,5}$/.test(code) ? code : "";
}

export function formatListingAmount(value: number | string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}

export function listingCardVersion(listing: PublicListing) {
  return [
    LISTING_PREVIEW_REVISION,
    listing.have_currency,
    listing.want_currency,
    listing.have_amount,
    listing.want_amount,
    listing.listing_type,
    listing.status,
    listing.updated_at,
  ].filter(Boolean).join("-");
}

export function akaraWhatsAppUrl(code: string) {
  const phone = String(
    process.env.NEXT_PUBLIC_AKARA_WHATSAPP_NUMBER
    || process.env.AKARA_WHATSAPP_NUMBER
    || "15556733907"
  ).replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(`open ${code}`)}`;
}

export async function getPublicListing(rawCode: string): Promise<PublicListing | null> {
  const code = normalizeListingCode(rawCode);
  if (!code) return null;

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error("[listing-share] Missing Supabase server environment variables");
    return null;
  }

  const url = [
    `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/listings`,
    `?select=${encodeURIComponent(LISTING_FIELDS)}`,
    `&listing_code=eq.${encodeURIComponent(code)}`,
    "&limit=1",
  ].join("");
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    console.error(`[listing-share] Supabase returned ${response.status}`);
    return null;
  }

  const rows = await response.json() as PublicListing[];
  return rows[0] || null;
}
