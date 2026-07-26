import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import {
  formatListingAmount,
  getPublicListing,
  normalizeListingCode,
} from "@/lib/listing-share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const coolveticaPromise = readFile(
  path.join(process.cwd(), "public/fonts/CoolveticaCompressedHeavy.otf")
);
const camptonBlackPromise = readFile(
  path.join(process.cwd(), "public/fonts/CamptonBlack.otf")
);

function amountFontSize(value: string) {
  if (value.length <= 6) return 292;
  if (value.length === 7) return 270;
  if (value.length === 8) return 244;
  if (value.length === 9) return 220;
  return 196;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code: rawCode } = await params;
  const code = normalizeListingCode(rawCode);
  const listing = await getPublicListing(code);
  if (!listing) return new Response("Listing not found", { status: 404 });

  const [coolvetica, camptonBlack] = await Promise.all([
    coolveticaPromise,
    camptonBlackPromise,
  ]);
  const haveAmount = formatListingAmount(listing.have_amount);
  const wantAmount = formatListingAmount(listing.want_amount);
  const backgroundUrl = new URL("/cards/listing-card-base.webp", request.url).toString();

  return new ImageResponse(
    (
      <div style={{
        width: "3200px",
        height: "1600px",
        position: "relative",
        display: "flex",
        background: "#030303",
        overflow: "hidden",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={backgroundUrl}
          alt=""
          width="3200"
          height="1600"
          style={{ position: "absolute", inset: 0, width: "3200px", height: "1600px" }}
        />
        <div style={{
          position: "absolute",
          left: "850px",
          top: "438px",
          width: "1180px",
          transform: "translateX(-50%)",
          display: "flex",
          justifyContent: "center",
          color: "#fff",
          fontFamily: "Coolvetica Compressed Heavy",
          fontSize: `${amountFontSize(haveAmount)}px`,
          fontWeight: 900,
          letterSpacing: "-2px",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}>
          {haveAmount}
        </div>
        <div style={{
          position: "absolute",
          left: "2350px",
          top: "438px",
          width: "1180px",
          transform: "translateX(-50%)",
          display: "flex",
          justifyContent: "center",
          color: "#fff",
          fontFamily: "Coolvetica Compressed Heavy",
          fontSize: `${amountFontSize(wantAmount)}px`,
          fontWeight: 900,
          letterSpacing: "-2px",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}>
          {wantAmount}
        </div>
        <div style={{
          position: "absolute",
          left: "1088px",
          top: "894px",
          width: "440px",
          transform: "translateX(-50%)",
          display: "flex",
          justifyContent: "center",
          color: "#fff",
          fontFamily: "Campton Black",
          fontSize: "94px",
          fontWeight: 900,
          lineHeight: 1,
        }}>
          {listing.have_currency}
        </div>
        <div style={{
          position: "absolute",
          left: "2584px",
          top: "894px",
          width: "440px",
          transform: "translateX(-50%)",
          display: "flex",
          justifyContent: "center",
          color: "#000",
          fontFamily: "Campton Black",
          fontSize: "94px",
          fontWeight: 900,
          lineHeight: 1,
        }}>
          {listing.want_currency}
        </div>
        <div style={{
          position: "absolute",
          left: "2220px",
          top: "1342px",
          display: "flex",
          color: "#fff",
          fontFamily: "Campton Black",
          fontSize: "50px",
          fontWeight: 900,
          letterSpacing: "7px",
          whiteSpace: "nowrap",
        }}>
          OPEN {code}
        </div>
      </div>
    ),
    {
      width: 3200,
      height: 1600,
      fonts: [
        {
          name: "Coolvetica Compressed Heavy",
          data: coolvetica,
          weight: 900,
          style: "normal",
        },
        {
          name: "Campton Black",
          data: camptonBlack,
          weight: 900,
          style: "normal",
        },
      ],
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      },
    }
  );
}
