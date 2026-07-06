import Link from "next/link";
import { ArrowRight, Scales } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import { MANDATORY_WORDING, NO_CUSTODY_LINE } from "@/lib/site";

const COMPLIANCE_LINKS = [
  { label: "Terms of Service", href: "/legal/terms-of-service" },
  { label: "Privacy Policy", href: "/legal/privacy-policy" },
  { label: "No-Custody Risk Disclosure", href: "/legal/no-custody-risk-disclosure" },
  { label: "Support and Complaints", href: "/legal/support-and-complaints-policy" },
  { label: "Prohibited Transactions", href: "/legal/prohibited-transactions-policy" },
];

export function Compliance() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="Legal & compliance"
          title="Clear about what Akara is, and what Akara is not."
        />
        <Reveal>
          <div className="mx-auto max-w-3xl rounded-3xl border border-hairline-strong/60 bg-surface-2 p-7 sm:p-10">
            <span className="mb-6 flex size-11 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.07]">
              <Scales size={22} className="text-brand" aria-hidden="true" />
            </span>
            <p className="text-pretty text-sm leading-relaxed text-white/85 sm:text-base">
              {MANDATORY_WORDING}
            </p>
            <p className="mt-4 text-pretty text-sm font-semibold leading-relaxed text-brand sm:text-base">
              {NO_CUSTODY_LINE}
            </p>
            <ul className="mt-8 flex flex-wrap gap-2.5">
              {COMPLIANCE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.03] px-4 py-2 text-[13px] text-white/80 transition-colors hover:border-brand/50 hover:text-brand"
                  >
                    {link.label}
                    <ArrowRight
                      size={13}
                      aria-hidden="true"
                      className="transition-transform duration-300 group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
