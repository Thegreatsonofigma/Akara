import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Analytics } from "@/components/analytics/Analytics";
import { StructuredData } from "@/components/seo/StructuredData";
import { SITE } from "@/lib/site";
import "./globals.css";

const campton = localFont({
  src: [
    { path: "../public/fonts/CamptonBook.otf", weight: "400", style: "normal" },
    { path: "../public/fonts/CamptonSemiBold.otf", weight: "600", style: "normal" },
    { path: "../public/fonts/CamptonBold.otf", weight: "700", style: "normal" },
    { path: "../public/fonts/CamptonBlack.otf", weight: "900", style: "normal" },
  ],
  variable: "--font-campton",
  display: "swap",
});

const coolvetica = localFont({
  src: "../public/fonts/coolvetica-rg.otf",
  weight: "400",
  variable: "--font-coolvetica",
  display: "swap",
});

const socialImage = {
  url: SITE.ogImage,
  width: 2048,
  height: 1024,
  alt: "Akara swap card for peer-to-peer currency exchange on WhatsApp",
};

const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
const bingSiteVerification = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;

const metadataVerification: Metadata["verification"] | undefined =
  googleSiteVerification || bingSiteVerification
    ? {
        ...(googleSiteVerification ? { google: googleSiteVerification } : {}),
        ...(bingSiteVerification
          ? { other: { "msvalidate.01": bingSiteVerification } }
          : {}),
      }
    : undefined;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  applicationName: SITE.name,
  title: {
    default: SITE.title,
    template: "%s | Akara",
  },
  description: SITE.description,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.legalName, url: SITE.url }],
  creator: SITE.legalName,
  publisher: SITE.legalName,
  verification: metadataVerification,
  category: "finance",
  classification: "Currency exchange coordination software",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: SITE.title,
    description: SITE.description,
    url: SITE.url,
    siteName: SITE.name,
    type: "website",
    locale: "en",
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
    images: [SITE.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${campton.variable} ${coolvetica.variable}`}>
      <body>
        <StructuredData />
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-brand focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-black"
        >
          Skip to content
        </a>
        <Navbar />
        <main id="main-content" className="pt-[76px] sm:pt-20">
          {children}
        </main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
