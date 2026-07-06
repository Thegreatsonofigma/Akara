import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Warning,
  ListBullets,
} from "@phosphor-icons/react/dist/ssr";
import type { LegalDoc } from "@/lib/legal-content";
import {
  BUSINESS,
  SITE,
  SHARED_LEGAL_NOTICE,
  KEY_REMINDERS,
} from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { LegalSection, slugifyHeading } from "@/components/legal/LegalSection";

const BUSINESS_ROWS = [
  { label: "Legal business name", value: BUSINESS.legalName },
  { label: "Registration number", value: BUSINESS.registrationNumber },
  { label: "Entity type", value: BUSINESS.entityType },
  { label: "Business type", value: BUSINESS.businessType },
  { label: "Country of registration", value: BUSINESS.country },
  { label: "Date of registration", value: BUSINESS.registrationDate },
  { label: "Business status", value: BUSINESS.status },
  { label: "Principal place of business", value: BUSINESS.address },
  { label: "Public support email", value: SITE.supportEmail },
  { label: "Temporary email", value: SITE.fallbackEmail },
  { label: "Website", value: SITE.url },
  { label: "Governing law", value: BUSINESS.governingLaw },
  { label: "Regulator", value: BUSINESS.regulator },
];

function KeyRemindersCard() {
  return (
    <div className="rounded-2xl border border-hairline-strong/60 bg-surface-2 p-5">
      <p className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <ShieldCheck size={17} className="text-brand" aria-hidden="true" />
        Key reminders
      </p>
      <ul className="flex flex-col gap-3">
        {KEY_REMINDERS.map((reminder) => (
          <li
            key={reminder}
            className="flex items-start gap-2.5 text-[13px] leading-relaxed text-white/78"
          >
            <span
              aria-hidden="true"
              className="mt-[0.5em] size-1.5 shrink-0 rounded-full bg-brand"
            />
            {reminder}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LegalLayout({ doc }: { doc: LegalDoc }) {
  return (
    <div className="relative">
      <div className="relative overflow-hidden border-b border-hairline">
        <GradientBackground />
        <Container className="relative py-16 sm:py-20">
          <Link
            href="/legal"
            className="mb-8 inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-brand"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            Legal, Trust, and Safety Center
          </Link>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
            {doc.category}
          </p>
          <h1 className="max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl">
            {doc.title}
          </h1>
          <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            {doc.intro}
          </p>
          <p className="mt-6 font-numbers text-xs tracking-widest text-faint">
            LAST UPDATED: [DATE PLACEHOLDER]
          </p>
        </Container>
      </div>

      <Container className="py-12 sm:py-16">
        <div
          role="note"
          className="mb-10 flex items-start gap-3.5 rounded-2xl border border-hairline-strong/60 bg-brand/[0.05] p-5 sm:p-6"
        >
          <ShieldCheck
            size={22}
            className="mt-0.5 shrink-0 text-brand"
            aria-hidden="true"
          />
          <p className="text-sm leading-relaxed text-white/85">
            {SHARED_LEGAL_NOTICE}
          </p>
        </div>

        <div className="lg:hidden">
          <KeyRemindersCard />
        </div>

        <div className="mt-10 grid gap-12 lg:mt-0 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex flex-col gap-10">
            <section aria-labelledby="business-details-heading">
              <h2
                id="business-details-heading"
                className="mb-4 text-xl font-bold text-white sm:text-2xl"
              >
                Business Details
              </h2>
              <dl className="overflow-hidden rounded-2xl border border-hairline bg-surface-2">
                {BUSINESS_ROWS.map((row, i) => (
                  <div
                    key={row.label}
                    className={`grid gap-1 px-5 py-3.5 sm:grid-cols-[220px_1fr] sm:gap-4 ${
                      i > 0 ? "border-t border-hairline" : ""
                    }`}
                  >
                    <dt className="text-[13px] text-faint">{row.label}</dt>
                    <dd className="text-sm text-white/85">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {doc.sections.map((section, i) => (
              <LegalSection key={section.heading} section={section} index={i} />
            ))}

            <div className="rounded-2xl border border-acid/25 bg-acid/[0.05] p-5">
              <p className="flex items-start gap-3 text-sm leading-relaxed text-acid">
                <Warning size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                This page is a draft and should be reviewed by a qualified
                legal professional before launch.
              </p>
            </div>
          </div>

          <aside className="hidden lg:block" aria-label="Page navigation and reminders">
            <div className="sticky top-24 flex flex-col gap-5">
              <KeyRemindersCard />
              <nav
                aria-label="On this page"
                className="rounded-2xl border border-hairline bg-surface p-5"
              >
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <ListBullets size={16} className="text-brand" aria-hidden="true" />
                  On this page
                </p>
                <ul className="flex flex-col gap-2">
                  {doc.sections.map((section) => (
                    <li key={section.heading}>
                      <a
                        href={`#${slugifyHeading(section.heading)}`}
                        className="block text-[13px] leading-snug text-muted transition-colors hover:text-brand"
                      >
                        {section.heading}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </aside>
        </div>
      </Container>
    </div>
  );
}
