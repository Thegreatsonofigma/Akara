import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Container } from "@/components/ui/Container";
import { CURRENCIES, NO_CUSTODY_LINE, SEO_CORRIDORS, SITE } from "@/lib/site";

type PageProps = {
  params: Promise<{ pair: string }>;
};

const corridorSlug = (from: string, to: string) =>
  `${from.toLowerCase()}-${to.toLowerCase()}`;

const getCorridor = (pair: string) =>
  SEO_CORRIDORS.find(
    (corridor) => corridorSlug(corridor.from, corridor.to) === pair.toLowerCase(),
  );

const getCurrencyCountry = (code: string) =>
  CURRENCIES.find((currency) => currency.code === code)?.country ?? code;

export function generateStaticParams() {
  return SEO_CORRIDORS.map((corridor) => ({
    pair: corridorSlug(corridor.from, corridor.to),
  }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { pair } = await params;
  const corridor = getCorridor(pair);

  if (!corridor) {
    return {
      title: SITE.title,
      description: SITE.description,
    };
  }

  const title = `${corridor.label} exchange on WhatsApp | Akara`;
  const description = `Find verified peer-listed ${corridor.label} exchange offers on WhatsApp with Akara. Compare live listings, lock terms, exchange payout details, upload receipts, and track the trade without Akara holding funds.`;
  const url = `${SITE.url}/exchange/${corridorSlug(corridor.from, corridor.to)}`;

  return {
    title,
    description,
    keywords: [
      corridor.label,
      `${corridor.from} to ${corridor.to}`,
      `${corridor.to} to ${corridor.from}`,
      `${getCurrencyCountry(corridor.from)} currency exchange`,
      `${getCurrencyCountry(corridor.to)} currency exchange`,
      "WhatsApp currency exchange",
      "peer-to-peer exchange Africa",
      "mobile money exchange Africa",
    ],
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE.name,
      images: [
        {
          url: SITE.ogImage,
          width: 1200,
          height: 630,
          alt: `${SITE.name} ${corridor.label}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SITE.ogImage],
    },
  };
}

export default async function ExchangeCorridorPage({ params }: PageProps) {
  const { pair } = await params;
  const corridor = getCorridor(pair);

  if (!corridor) {
    notFound();
  }

  const otherCorridors = SEO_CORRIDORS.filter((item) => item !== corridor).slice(
    0,
    5,
  );

  const features = [
    {
      title: "Browse peer-listed offers",
      body: `See available ${corridor.label} listings from verified users before you open a trade.`,
    },
    {
      title: "Lock the agreed terms",
      body: "Akara records the amount, rate, payout details, receipt trail, and trade timeline.",
    },
    {
      title: "Track the exchange in chat",
      body: "Use WhatsApp to upload receipts, send reminders, raise disputes, and confirm when money lands.",
    },
  ];

  const steps = [
    `Tell Akara you need ${corridor.to} or ask to see ${corridor.label} offers.`,
    "Review available listings, including fixed and negotiable terms.",
    "Open an Akara Trade, check payout details, then send directly through your bank or mobile money app.",
    "Upload receipt evidence and wait for the recipient to confirm the value arrived.",
  ];

  return (
    <main className="bg-[#050505] text-white">
      <section className="overflow-hidden border-b border-white/10 py-20 sm:py-28">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.45em] text-[#9DFF1E]">
                Currency corridor
              </p>
              <h1 className="mt-5 max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-7xl">
                Exchange {corridor.from} to {corridor.to} from WhatsApp.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">
                Akara helps verified users find, list, coordinate, and track
                peer-to-peer {corridor.label} exchange offers without
                downloading another app.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href={SITE.whatsappHref}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-[#9DFF1E] px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-black transition hover:bg-white"
                >
                  Start on WhatsApp
                </a>
                <Link
                  href="/support"
                  className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold uppercase tracking-[0.18em] text-white transition hover:border-white/60"
                >
                  Ask a question
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-[#9DFF1E]/10">
              <p className="text-sm uppercase tracking-[0.35em] text-white/45">
                Example listing
              </p>
              <div className="mt-8 flex items-center justify-between gap-6">
                <div>
                  <p className="text-4xl font-black sm:text-6xl">100,000</p>
                  <p className="mt-3 text-sm font-bold uppercase tracking-[0.28em] text-white/50">
                    {corridor.from}
                  </p>
                </div>
                <div className="grid size-16 place-items-center rounded-full border border-white/10 bg-black text-2xl font-black text-[#9DFF1E]">
                  x
                </div>
                <div className="text-right">
                  <p className="text-4xl font-black sm:text-6xl">Live</p>
                  <p className="mt-3 text-sm font-bold uppercase tracking-[0.28em] text-white/50">
                    {corridor.to} offers
                  </p>
                </div>
              </div>
              <p className="mt-8 border-t border-white/10 pt-5 text-sm leading-6 text-white/60">
                {NO_CUSTODY_LINE}
              </p>
            </div>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="grid gap-4 md:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
              >
                <h2 className="text-xl font-black">{feature.title}</h2>
                <p className="mt-4 text-sm leading-7 text-white/60">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-y border-white/10 bg-white/[0.03] py-16 sm:py-20">
        <Container>
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#9DFF1E]">
                How it works
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                A clear path from search to confirmation.
              </h2>
            </div>
            <ol className="grid gap-4">
              {steps.map((step, index) => (
                <li
                  key={step}
                  className="flex gap-4 rounded-3xl border border-white/10 bg-black/40 p-5"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#9DFF1E] text-sm font-black text-black">
                    {index + 1}
                  </span>
                  <p className="text-base leading-7 text-white/70">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        </Container>
      </section>

      <section className="py-16 sm:py-20">
        <Container>
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.35em] text-[#9DFF1E]">
                More corridors
              </p>
              <h2 className="mt-4 text-4xl font-black tracking-tight">
                Search more African currency offers.
              </h2>
            </div>
            <Link
              href="/"
              className="text-sm font-bold uppercase tracking-[0.18em] text-white/70 hover:text-white"
            >
              Back to Akara
            </Link>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-2">
            {otherCorridors.map((item) => (
              <Link
                key={`${item.from}-${item.to}`}
                href={`/exchange/${corridorSlug(item.from, item.to)}`}
                className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-[#9DFF1E]/60 hover:bg-[#9DFF1E]/10"
              >
                <span className="text-lg font-black">{item.label}</span>
                <span className="mt-2 block text-sm uppercase tracking-[0.22em] text-white/45">
                  {item.from} to {item.to}
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    </main>
  );
}
