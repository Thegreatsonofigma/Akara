import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
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

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title,
    template: "%s | Akara",
  },
  description: SITE.description,
  openGraph: {
    title: SITE.title,
    description: SITE.description,
    url: SITE.url,
    siteName: SITE.name,
    type: "website",
    locale: "en",
  },
  twitter: {
    card: "summary",
    title: SITE.title,
    description: SITE.description,
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-full focus:bg-brand focus:px-5 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-black"
        >
          Skip to content
        </a>
        <Navbar />
        <main id="main-content" className="pt-16">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
