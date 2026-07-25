import type { Metadata } from "next";
import Link from "next/link";
import { SEO_GUIDES } from "@/lib/seo-guides";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Akara exchange guides | WhatsApp currency exchange help",
  description:
    "Read Akara guides for WhatsApp currency exchange, payout details, receipts, safer peer trades, and African currency corridors.",
  alternates: { canonical: `${SITE.url}/guides` },
  openGraph: {
    title: "Akara exchange guides",
    description:
      "Practical guides for WhatsApp currency exchange, payout details, receipts, and safer peer trades.",
    url: `${SITE.url}/guides`,
    siteName: "Akara",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Akara exchange guides",
    description:
      "Practical guides for WhatsApp currency exchange, payout details, receipts, and safer peer trades.",
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Akara", item: SITE.url },
    {
      "@type": "ListItem",
      position: 2,
      name: "Guides",
      item: `${SITE.url}/guides`,
    },
  ],
};

export default function GuidesPage() {
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Akara exchange guides",
    itemListElement: SEO_GUIDES.map((guide, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: guide.title,
      url: `${SITE.url}/guides/${guide.slug}`,
    })),
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 py-24 sm:px-8 lg:px-12">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#9DFF1E]">
            Akara guides
          </p>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            Learn how to swap, verify, and stay safe on WhatsApp.
          </h1>
          <p className="mt-6 text-lg leading-8 text-white/70">
            Short guides for people using Akara to discover offers, set payout
            details, upload receipts, resolve disputes, and understand
            peer-listed exchange rates.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {SEO_GUIDES.map((guide, index) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              className="group rounded-[28px] border border-white/10 bg-white/[0.04] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#9DFF1E]/60 hover:bg-white/[0.07]"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-white/40">
                  Guide {String(index + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-semibold text-[#9DFF1E]">
                  Read
                </span>
              </div>
              <h2 className="mt-5 text-2xl font-black tracking-tight text-white">
                {guide.title}
              </h2>
              <p className="mt-4 text-sm leading-6 text-white/60">
                {guide.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
