import type { Metadata } from "next";
import Link from "next/link";
import {
  ShieldCheck,
  SealCheck,
  Receipt,
  Scales,
  ArrowRight,
  LockKey,
  Eye,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { Reveal } from "@/components/motion/Reveal";
import { VerificationPanel } from "@/components/product/VerificationPanel";
import { PayoutNameMatchPanel } from "@/components/product/PayoutNameMatchPanel";
import { DisputeTimeline } from "@/components/product/DisputeTimeline";
import { NoCustodyDiagram } from "@/components/product/NoCustodyDiagram";
import { MANDATORY_WORDING, NO_CUSTODY_LINE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Trust & Safety",
  description:
    "How Akara keeps peer-to-peer currency exchange coordination safer: verification, payout name matching, receipts, dispute review, and a strict no-custody model.",
  alternates: { canonical: "/trust" },
  openGraph: {
    title: "Trust & Safety | Akara",
    description:
      "How Akara keeps peer-to-peer currency exchange coordination safer: verification, payout name matching, receipts, dispute review, and a strict no-custody model.",
    url: "/trust",
  },
};

const PRINCIPLES = [
  {
    icon: LockKey,
    title: "No custody, ever",
    copy: "Akara does not hold, receive, escrow, custody, remit, convert, or move user funds. Payments go directly between users' own accounts.",
  },
  {
    icon: SealCheck,
    title: "Verified before trade actions",
    copy: "Listings, trades, payout accounts, and completions all require identity verification — browsing basic information does not.",
  },
  {
    icon: Receipt,
    title: "Receipt-backed records",
    copy: "Every trade keeps its own evidence trail: payout details, receipts, confirmations, and timestamps.",
  },
  {
    icon: Eye,
    title: "Active fraud monitoring",
    copy: "KYC data, receipts, and chat records may be used for fraud prevention and dispute review. Akara may pause trades or restrict accounts for safety.",
  },
];

export default function TrustPage() {
  return (
    <div>
      <div className="relative overflow-hidden border-b border-hairline">
        <GradientBackground />
        <Container className="relative py-16 text-center sm:py-24">
          <Reveal>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-brand">
              Trust & safety
            </p>
            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
              Trust is the product.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Akara exists to make peer-to-peer currency exchange coordination
              safer — with verification, name-matched payouts, receipts, and
              dispute review, while your money moves only between you and the
              other user.
            </p>
          </Reveal>
        </Container>
      </div>

      <section className="py-20 sm:py-24">
        <Container>
          <div className="grid gap-4 sm:grid-cols-2">
            {PRINCIPLES.map((principle, i) => (
              <Reveal key={principle.title} delay={i * 0.06} className="h-full">
                <div className="flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-6 transition-colors duration-300 hover:border-brand/35">
                  <span className="flex size-11 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.07]">
                    <principle.icon
                      size={22}
                      className="text-brand"
                      aria-hidden="true"
                    />
                  </span>
                  <p className="text-base font-semibold text-white">
                    {principle.title}
                  </p>
                  <p className="text-sm leading-relaxed text-faint">
                    {principle.copy}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline py-20 sm:py-24">
        <Container>
          <SectionHeader
            eyebrow="No-custody model"
            title="Money moves between users. Nowhere else."
          />
          <Reveal y={32}>
            <NoCustodyDiagram />
          </Reveal>
        </Container>
      </section>

      <section className="border-t border-hairline py-20 sm:py-24">
        <Container>
          <div className="grid items-start gap-12 lg:grid-cols-2">
            <div>
              <SectionHeader
                align="left"
                eyebrow="Verification"
                title="Every serious action requires a verified person."
                copy="Users may browse basic information, but must be verified before creating listings, opening trades, adding payout accounts, or completing exchanges."
                className="mb-8"
              />
              <Reveal>
                <VerificationPanel />
              </Reveal>
            </div>
            <div>
              <SectionHeader
                align="left"
                eyebrow="Payout name match"
                title="Payouts must match the verified person."
                copy="Minor spelling differences may go to admin review. Someone else's payout account is not allowed at launch."
                className="mb-8"
              />
              <Reveal delay={0.1}>
                <PayoutNameMatchPanel />
              </Reveal>
            </div>
          </div>
        </Container>
      </section>

      <section className="border-t border-hairline py-20 sm:py-24">
        <Container>
          <SectionHeader
            eyebrow="Disputes"
            title="When something goes wrong, there is a process."
            copy="Raise a dispute within 24 hours. Akara reviews the trade record — KYC, receipts, payout details, and chats — and an admin or compliance reviewer decides the outcome. Akara does not guarantee refunds or reversals because Akara does not hold funds."
          />
          <DisputeTimeline />
        </Container>
      </section>

      <section className="border-t border-hairline py-20 sm:py-24">
        <Container>
          <Reveal>
            <div className="mx-auto max-w-3xl rounded-3xl border border-hairline-strong/60 bg-surface-2 p-7 text-center sm:p-10">
              <span className="mx-auto mb-6 flex size-11 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.07]">
                <Scales size={22} className="text-brand" aria-hidden="true" />
              </span>
              <p className="text-pretty text-sm leading-relaxed text-white/85 sm:text-base">
                {MANDATORY_WORDING}
              </p>
              <p className="mt-4 text-sm font-semibold text-brand sm:text-base">
                {NO_CUSTODY_LINE}
              </p>
              <Link
                href="/legal"
                className="mt-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 py-2.5 text-sm text-white/85 transition-colors hover:border-brand/50 hover:text-brand"
              >
                <ShieldCheck size={16} aria-hidden="true" />
                Visit the Legal, Trust, and Safety Center
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </Reveal>
        </Container>
      </section>
    </div>
  );
}
