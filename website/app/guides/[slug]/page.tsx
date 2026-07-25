import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { getSeoGuide, SEO_GUIDES } from "@/lib/seo-guides";
import { SEO_CORRIDORS, SITE } from "@/lib/site";

type GuidePageProps = {
  params: Promise<{ slug: string }>;
};

const corridorSlug = (from: string, to: string) =>
  `${from.toLowerCase()}-${to.toLowerCase()}`;

export function generateStaticParams() {
  return SEO_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getSeoGuide(slug);

  if (!guide) {
    return {};
  }

  return {
    title: guide.title,
    description: guide.description,
    keywords: guide.keywords,
    alternates: {
      canonical: `${SITE.url}/guides/${guide.slug}`,
    },
    openGraph: {
      title: guide.title,
      description: guide.description,
      url: `${SITE.url}/guides/${guide.slug}`,
      images: [
        {
          url: SITE.ogImage,
          width: 2048,
          height: 1024,
          alt: "Akara WhatsApp currency exchange card",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
      images: [SITE.ogImage],
    },
  };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getSeoGuide(slug);

  if (!guide) {
    notFound();
  }

  const url = `${SITE.url}/guides/${guide.slug}`;
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    url,
    author: {
      "@type": "Organization",
      name: SITE.legalName,
    },
    publisher: {
      "@type": "Organization",
      name: SITE.legalName,
      url: SITE.url,
    },
    mainEntityOfPage: url,
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: guide.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE.url,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Guides",
        item: `${SITE.url}/guides`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: guide.title,
        item: `${SITE.url}/guides/${guide.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <main className="bg-black text-white">
        <Container className="py-16 sm:py-24">
          <Link
            href="/"
            className="text-sm font-semibold uppercase tracking-[0.24em] text-brand"
          >
            Akara
          </Link>

          <section className="mt-8 max-w-4xl">
            <p className="text-sm font-semibold uppercase tracking-[0.32em] text-white/45">
              Currency guide
            </p>
            <h1 className="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
              {guide.title}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-white/70">
              {guide.intro}
            </p>
          </section>

          <div className="mt-12 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8">
              <div className="space-y-8">
                {guide.sections.map((section) => (
                  <section key={section.heading}>
                    <h2 className="text-2xl font-black tracking-tight">
                      {section.heading}
                    </h2>
                    <p className="mt-3 text-base leading-7 text-white/68">
                      {section.body}
                    </p>
                  </section>
                ))}
              </div>

              <section className="mt-12 border-t border-white/10 pt-8">
                <h2 className="text-2xl font-black tracking-tight">
                  Questions people ask
                </h2>
                <div className="mt-6 space-y-5">
                  {guide.faqs.map((faq) => (
                    <div
                      key={faq.question}
                      className="rounded-2xl border border-white/10 bg-black/35 p-5"
                    >
                      <h3 className="text-lg font-black">{faq.question}</h3>
                      <p className="mt-2 text-sm leading-6 text-white/65">
                        {faq.answer}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </article>

            <aside className="space-y-5">
              <div className="rounded-[28px] border border-brand/30 bg-brand p-6 text-black">
                <p className="text-sm font-black uppercase tracking-[0.22em]">
                  Start in WhatsApp
                </p>
                <p className="mt-4 text-2xl font-black leading-tight">
                  Find offers, list your rate, and track the trade from chat.
                </p>
                <a
                  href={SITE.whatsappHref}
                  className="mt-6 inline-flex rounded-full bg-black px-5 py-3 text-sm font-black text-white"
                >
                  Try Akara
                </a>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
                <h2 className="text-lg font-black">Related corridors</h2>
                <div className="mt-4 space-y-3">
                  {SEO_CORRIDORS.slice(0, 8).map((corridor) => (
                    <Link
                      key={`${corridor.from}-${corridor.to}`}
                      href={`/exchange/${corridorSlug(corridor.from, corridor.to)}`}
                      className="block rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold text-white/75 transition hover:border-brand/50 hover:text-white"
                    >
                      {corridor.label}
                    </Link>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </Container>
      </main>
    </>
  );
}
