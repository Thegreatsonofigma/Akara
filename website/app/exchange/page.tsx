import type { Metadata } from "next";
import Link from "next/link";
import { SEO_CORRIDORS, SITE } from "@/lib/site";

const corridorSlug = (from: string, to: string) =>
  `${from.toLowerCase()}-${to.toLowerCase()}`;

export const metadata: Metadata = {
  title: "Currency exchange corridors on WhatsApp | Akara",
  description:
    "Browse Akara exchange corridors for NGN, RWF, GHS, KES, and XAF. Compare peer-listed offers, create rate listings, and start from WhatsApp.",
  alternates: { canonical: `${SITE.url}/exchange` },
  openGraph: {
    title: "Currency exchange corridors on WhatsApp | Akara",
    description:
      "Browse peer-listed African currency exchange corridors and start from WhatsApp.",
    url: `${SITE.url}/exchange`,
    siteName: "Akara",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Currency exchange corridors on WhatsApp | Akara",
    description:
      "Browse peer-listed African currency exchange corridors and start from WhatsApp.",
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
      name: "Exchange corridors",
      item: `${SITE.url}/exchange`,
    },
  ],
};

export default function ExchangePage() {
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Akara exchange corridors",
    itemListElement: SEO_CORRIDORS.map((corridor, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: `${corridor.from} to ${corridor.to}`,
      url: `${SITE.url}/exchange/${corridorSlug(corridor.from, corridor.to)}`,
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
            Exchange corridors
          </p>
          <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
            Browse African currency offers before you open WhatsApp.
          </h1>
          <p className="mt-6 text-lg leading-8 text-white/70">
            Explore Akara corridors across NGN, RWF, GHS, KES, and XAF. Each
            corridor page helps people compare available directions, understand
            payout rules, and start a verified WhatsApp trade.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SEO_CORRIDORS.map((corridor) => {
            const slug = corridorSlug(corridor.from, corridor.to);

            return (
              <Link
                key={slug}
                href={`/exchange/${slug}`}
                className="group rounded-[28px] border border-white/10 bg-white/[0.04] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#9DFF1E]/60 hover:bg-white/[0.07]"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-3xl font-black">{corridor.from}</span>
                  <span className="rounded-full border border-white/10 bg-black px-3 py-1 text-sm text-[#9DFF1E]">
                    swap
                  </span>
                  <span className="text-3xl font-black">{corridor.to}</span>
                </div>
                <p className="mt-5 text-sm leading-6 text-white/60">
                  See peer-listed offers, payout expectations, safety steps, and
                  shareable listing paths for this corridor.
                </p>
                <span className="mt-6 inline-flex text-sm font-semibold text-[#9DFF1E]">
                  View corridor
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
