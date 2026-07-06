import type { Metadata } from "next";
import Link from "next/link";
import {
  WhatsappLogo,
  EnvelopeSimple,
  Megaphone,
  Clock,
  Timer,
  ListChecks,
  ChatCenteredText,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { SupportCard } from "@/components/ui/SupportCard";
import { Reveal } from "@/components/motion/Reveal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Contact Akara for help with verification, payout details, listings, trades, receipts, disputes, complaints, and safety concerns.",
  alternates: { canonical: "/support" },
  openGraph: {
    title: "Support | Akara",
    description:
      "Contact Akara for help with verification, payout details, listings, trades, receipts, disputes, complaints, and safety concerns.",
    url: "/support",
  },
};

const HELP_TOPICS = [
  "Account access",
  "Verification",
  "Payout details",
  "Listings",
  "Trade status",
  "Receipt upload",
  "Disputes",
  "Complaints",
  "Safety concerns",
  "Platform guidance",
];

const INCLUDE_ITEMS = [
  "Your registered WhatsApp number",
  "Trade reference code",
  "Currency pair",
  "Amount",
  "Receipt or screenshot if relevant",
  "A clear description of the issue",
];

export default function SupportPage() {
  return (
    <div>
      <div className="relative overflow-hidden border-b border-hairline">
        <GradientBackground />
        <Container className="relative py-16 text-center sm:py-24">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Support
            </p>
            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Real help, on the channel you already use.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Questions, trade issues, complaints, or safety concerns — reach
              Akara through WhatsApp or email and we will pick it up from
              there.
            </p>
          </Reveal>
        </Container>
      </div>

      <section className="py-20 sm:py-24">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SupportCard icon={WhatsappLogo} title="WhatsApp" delay={0}>
              <p>
                Message the official Akara WhatsApp Business number:{" "}
                <span className="text-white">{SITE.whatsappLabel}</span>. Type{" "}
                <span className="font-numbers tracking-wider text-brand">
                  menu
                </span>{" "}
                at any time to see your options.
              </p>
            </SupportCard>
            <SupportCard icon={EnvelopeSimple} title="Email" delay={0.06}>
              <p>
                <a
                  href={`mailto:${SITE.supportEmail}`}
                  className="text-brand underline-offset-4 hover:underline"
                >
                  {SITE.supportEmail}
                </a>
                <br />
                If the domain email is not active yet, use{" "}
                <a
                  href={`mailto:${SITE.fallbackEmail}`}
                  className="text-white underline-offset-4 hover:underline"
                >
                  {SITE.fallbackEmail}
                </a>{" "}
                temporarily.
              </p>
            </SupportCard>
            <SupportCard icon={Megaphone} title="Complaints" delay={0.12}>
              <p>
                Formal complaints go to{" "}
                <a
                  href={`mailto:${SITE.complaintsEmail}`}
                  className="text-brand underline-offset-4 hover:underline"
                >
                  {SITE.complaintsEmail}
                </a>
                . Serious cases are escalated to an admin or compliance
                reviewer.
              </p>
            </SupportCard>
            <SupportCard icon={Clock} title="Support hours" delay={0.18}>
              <p>
                Monday to Saturday
                <br />
                <span className="font-numbers tracking-wide text-white">
                  9:00 AM – 6:00 PM
                </span>{" "}
                WAT/CAT
              </p>
            </SupportCard>
            <SupportCard icon={Timer} title="Response time" delay={0.24}>
              <p>
                We aim to respond within{" "}
                <span className="font-numbers tracking-wide text-white">
                  24–72 hours
                </span>
                . Complex reviews may take longer.
              </p>
            </SupportCard>
            <SupportCard
              icon={ChatCenteredText}
              title="Disputes"
              delay={0.3}
            >
              <p>
                Something wrong with a trade? Raise a dispute within 24 hours
                so the record is preserved.{" "}
                <Link
                  href="/legal/dispute-resolution-policy"
                  className="text-brand underline-offset-4 hover:underline"
                >
                  How disputes work
                </Link>
              </p>
            </SupportCard>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline py-20 sm:py-24">
        <Container>
          <div className="grid gap-10 lg:grid-cols-2">
            <Reveal>
              <div className="h-full rounded-3xl border border-hairline bg-surface-2 p-7 sm:p-8">
                <h2 className="mb-5 flex items-center gap-2.5 text-lg font-bold text-white">
                  <ListChecks size={20} className="text-brand" aria-hidden="true" />
                  What support can help with
                </h2>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {HELP_TOPICS.map((topic) => (
                    <li
                      key={topic}
                      className="flex items-center gap-2.5 text-sm text-white/80"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-brand"
                      />
                      {topic}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="h-full rounded-3xl border border-hairline bg-surface-2 p-7 sm:p-8">
                <h2 className="mb-5 flex items-center gap-2.5 text-lg font-bold text-white">
                  <ChatCenteredText
                    size={20}
                    className="text-brand"
                    aria-hidden="true"
                  />
                  What to include in your message
                </h2>
                <ul className="flex flex-col gap-2.5">
                  {INCLUDE_ITEMS.map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2.5 text-sm text-white/80"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-brand"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-sm text-faint">
                  The more of this you include up front, the faster the review
                  moves.
                </p>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.15}>
            <p className="mt-12 text-center text-sm text-muted">
              The full policy lives in the legal center:{" "}
              <Link
                href="/legal/support-and-complaints-policy"
                className="inline-flex items-center gap-1 text-brand underline-offset-4 hover:underline"
              >
                Support and Complaints Policy
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </p>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
