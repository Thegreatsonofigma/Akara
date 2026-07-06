import { WhatsappLogo, ArrowDown } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { ProductMockup } from "@/components/product/ProductMockup";
import { Reveal } from "@/components/motion/Reveal";
import { SITE } from "@/lib/site";

const HERO_BADGES = [
  { label: "No custody", tone: "custody" },
  { label: "Verified users", tone: "green" },
  { label: "Receipt-backed trades", tone: "green" },
  { label: "WhatsApp-first", tone: "neutral" },
  { label: "NGN · RWF · GHS · KES · XAF", tone: "neutral" },
] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <GradientBackground />
      <Container className="relative flex flex-col items-center pb-20 pt-16 text-center sm:pt-24">
        <Reveal y={20}>
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 py-1.5 text-xs text-white/75">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
            Find trusted currency offers. Complete payment directly. Keep every
            step recorded.
          </p>
        </Reveal>

        <Reveal y={28} delay={0.08}>
          <h1 className="mx-auto max-w-4xl text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl md:text-7xl">
            Peer-to-peer currency exchange,{" "}
            <span className="text-brand">coordinated on WhatsApp.</span>
          </h1>
        </Reveal>

        <Reveal y={24} delay={0.16}>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
            Akara helps verified users discover offers, open trades, exchange
            payout details, upload receipts, confirm payment, and resolve
            issues — without Akara holding or moving funds.
          </p>
        </Reveal>

        <Reveal y={20} delay={0.24}>
          <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
            <Button href={SITE.whatsappHref} external size="lg">
              <WhatsappLogo size={20} weight="fill" aria-hidden="true" />
              Start on WhatsApp
            </Button>
            <Button href="#how-it-works" variant="secondary" size="lg">
              See how Akara works
              <ArrowDown size={16} aria-hidden="true" />
            </Button>
          </div>
        </Reveal>

        <Reveal y={16} delay={0.32}>
          <ul className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
            {HERO_BADGES.map((badge) => (
              <li key={badge.label}>
                <Badge tone={badge.tone}>{badge.label}</Badge>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal y={36} delay={0.2} className="mt-16 w-full sm:mt-20">
          <ProductMockup />
        </Reveal>
      </Container>
    </section>
  );
}
