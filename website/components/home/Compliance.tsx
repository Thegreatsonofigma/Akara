import Link from "next/link";
import { ArrowRight, CheckCircle, XCircle } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";
import { MANDATORY_WORDING, NO_CUSTODY_LINE } from "@/lib/site";

const AKARA_IS = [
  "Software that coordinates person-to-person swaps",
  "Identity checks, name-matched payouts, receipts",
  "A registered Nigerian business — BN 9656395",
];

const AKARA_ISNT = [
  "A bank, wallet, or escrow service",
  "A remittance company or money transfer operator",
  "Ever in possession of your money",
];

const COMPLIANCE_LINKS = [
  { label: "Terms of Service", href: "/legal/terms-of-service" },
  { label: "Privacy Policy", href: "/legal/privacy-policy" },
  { label: "No-Custody Risk Disclosure", href: "/legal/no-custody-risk-disclosure" },
  { label: "Support and Complaints", href: "/legal/support-and-complaints-policy" },
  { label: "Prohibited Transactions", href: "/legal/prohibited-transactions-policy" },
];

export function Compliance() {
  return (
    <section className="border-t border-hairline bg-surface py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="Straight talk"
          title="What Akara is. What Akara isn't."
        />
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-3xl border border-hairline-strong/50 bg-surface-2 p-7">
                <p className="mb-5 inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-black">
                  Akara is
                </p>
                <ul className="flex flex-col gap-4">
                  {AKARA_IS.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle
                        size={19}
                        weight="fill"
                        className="mt-0.5 shrink-0 text-brand"
                        aria-hidden="true"
                      />
                      <span className="text-sm leading-relaxed text-white/85">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="h-full rounded-3xl border border-pink/25 bg-surface-2 p-7">
                <p className="mb-5 inline-flex rounded-full bg-pink px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white">
                  Akara is not
                </p>
                <ul className="flex flex-col gap-4">
                  {AKARA_ISNT.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <XCircle
                        size={19}
                        weight="fill"
                        className="mt-0.5 shrink-0 text-pink"
                        aria-hidden="true"
                      />
                      <span className="text-sm leading-relaxed text-white/85">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.15}>
            <p className="mt-8 text-center text-sm font-bold text-brand">
              {NO_CUSTODY_LINE}
            </p>
            <p className="mt-4 text-pretty text-center text-xs leading-relaxed text-faint">
              {MANDATORY_WORDING}
            </p>
            <ul className="mt-8 flex flex-wrap justify-center gap-2.5">
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
          </Reveal>
        </div>
      </Container>
    </section>
  );
}
