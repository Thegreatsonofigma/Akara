import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  ListBullets,
} from "@phosphor-icons/react/dist/ssr";
import type { LegalDoc } from "@/lib/legal-content";
import { SHARED_LEGAL_NOTICE, KEY_REMINDERS } from "@/lib/site";
import { Container } from "@/components/ui/Container";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { LegalSection, slugifyHeading } from "@/components/legal/LegalSection";

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
            EFFECTIVE: JULY 5, 2026
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
            {doc.sections.map((section, i) => (
              <LegalSection key={section.heading} section={section} index={i} />
            ))}
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
