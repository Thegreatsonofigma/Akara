import type { Metadata } from "next";
import { WhatsAppRedirect } from "@/components/listing/WhatsAppRedirect";
import {
  akaraWhatsAppUrl,
  formatListingAmount,
  getPublicListing,
  listingCardVersion,
  normalizeListingCode,
} from "@/lib/listing-share";

export const dynamic = "force-dynamic";

type ListingPageProps = {
  params: Promise<{ code: string }>;
};

const siteUrl = "https://tryakara.com";

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { code: rawCode } = await params;
  const code = normalizeListingCode(rawCode);
  const listing = await getPublicListing(code);
  if (!listing) return { title: "Listing unavailable | Akara" };

  const have = `${formatListingAmount(listing.have_amount)} ${listing.have_currency}`;
  const want = `${formatListingAmount(listing.want_amount)} ${listing.want_currency}`;
  const title = `${have} for ${want} on Akara`;
  const description = `Review ${code} and open this peer exchange securely in your Akara WhatsApp chat.`;
  const version = encodeURIComponent(listingCardVersion(listing));
  const canonical = `${siteUrl}/l/${encodeURIComponent(code)}`;
  const image = `${canonical}/card?v=${version}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      siteName: "Akara",
      title,
      description,
      images: [{
        url: image,
        width: 3200,
        height: 1600,
        alt: title,
        type: "image/png",
      }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { code: rawCode } = await params;
  const code = normalizeListingCode(rawCode);
  const whatsappUrl = akaraWhatsAppUrl(code || String(rawCode || "").toUpperCase());
  const listing = await getPublicListing(code);
  if (!listing) {
    return (
      <main style={{
        minHeight: "100vh",
        background: "#030303",
        color: "#fff",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        textAlign: "center",
      }}>
        <WhatsAppRedirect url={whatsappUrl} />
        <div>
          <strong style={{ display: "block", fontSize: "20px" }}>Opening Akara on WhatsApp</strong>
          <a
            href={whatsappUrl}
            style={{ display: "inline-block", marginTop: "18px", color: "#9DFF1E", fontWeight: 800 }}
          >
            Continue to WhatsApp
          </a>
        </div>
      </main>
    );
  }

  const version = encodeURIComponent(listingCardVersion(listing));
  const cardUrl = `/l/${encodeURIComponent(code)}/card?v=${version}`;

  return (
    <main style={{
      minHeight: "100vh",
      background: "#030303",
      color: "#fff",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <WhatsAppRedirect url={whatsappUrl} />
      <div style={{ width: "min(1120px, 100%)" }}>
        {/* The image is also the exact Open Graph preview WhatsApp requests. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cardUrl}
          alt={`${formatListingAmount(listing.have_amount)} ${listing.have_currency} for ${formatListingAmount(listing.want_amount)} ${listing.want_currency}`}
          style={{ width: "100%", height: "auto", display: "block", borderRadius: "8px" }}
        />
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "16px",
          paddingTop: "20px",
        }}>
          <div>
            <strong style={{ display: "block", fontSize: "18px" }}>{code}</strong>
            <span style={{ color: "#a8a8a8", fontSize: "14px" }}>
              Opening this listing inside your Akara WhatsApp chat.
            </span>
          </div>
          <a
            href={whatsappUrl}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: "48px",
              padding: "0 18px",
              borderRadius: "6px",
              background: "#9DFF1E",
              color: "#000",
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            Continue to WhatsApp
          </a>
        </div>
      </div>
    </main>
  );
}
