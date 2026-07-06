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
    <section className="border-t border-black/10 bg-[#F7F6F1] py-20 text-black sm:py-28">
      <Container>
        <SectionHeader
          light
          eyebrow="Straight talk"
          title="What Akara is. What Akara isn't."
        />
        <div className="mx-auto max-w-4xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-3xl border border-black/[0.08] bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <p className="mb-5 inline-flex rounded-full bg-brand px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-black">
                  Akara is
                </p>
                <ul className="flex flex-col gap-4">
                  {AKARA_IS.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle
                        size={19}
                        weight="fill"
                        className="mt-0.5 shrink-0 text-[#4f8a00]"
                        aria-hidden="true"
                      />
                      <span className="text-sm leading-relaxed text-black/75">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="h-full rounded-3xl border border-black/[0.08] bg-white p-7 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
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
                      <span className="text-sm leading-relaxed text-black/75">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.15}>
            <p className="mt-8 text-center text-sm font-bold text-black">
              {NO_CUSTODY_LINE}
            </p>
            <p className="mt-4 text-pretty text-center text-xs leading-relaxed text-black/45">
              {MANDATORY_WORDING}
            </p>
            <ul className="mt-8 flex flex-wrap justify-center gap-2.5">
              {COMPLIANCE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-4 py-2 text-[13px] font-medium text-black/70 transition-colors hover:border-black/40 hover:text-black"
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
