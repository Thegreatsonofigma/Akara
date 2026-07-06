import { WhatsappLogo, ArrowDown } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { GradientBackground } from "@/components/ui/GradientBackground";
import { HeroVisual } from "@/components/product/HeroVisual";
import { CyclingCorridor } from "@/components/product/CyclingCorridor";
import { Reveal } from "@/components/motion/Reveal";
import { SITE } from "@/lib/site";

const HERO_BADGES = [
  { label: "No custody", tone: "custody" },
  { label: "Verified people", tone: "green" },
  { label: "NGN · RWF · GHS · KES · XAF", tone: "neutral" },
] as const;

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <GradientBackground />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_35%_at_85%_15%,rgba(66,43,243,0.10),transparent_65%)]"
      />
      <Container className="relative grid items-center gap-16 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-28">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <Reveal y={20}>
            <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 py-1.5 text-xs text-white/75">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-brand"
              />
              Built for African money corridors
            </p>
          </Reveal>

          <Reveal y={28} delay={0.08}>
            <h1 className="max-w-2xl text-balance text-5xl font-black leading-[1.06] tracking-tight sm:text-6xl xl:text-7xl">
              Swap <CyclingCorridor /> with{" "}
              <span className="text-brand">people you can trust.</span>
            </h1>
          </Reveal>

          <Reveal y={24} delay={0.16}>
            <p className="mt-7 max-w-md text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Akara matches you with verified swap partners on WhatsApp. You
              pay each other directly, every step is recorded — and Akara
              never holds the money.
            </p>
          </Reveal>

          <Reveal y={20} delay={0.24}>
            <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
              <Button href={SITE.whatsappHref} external size="lg">
                <WhatsappLogo size={20} weight="fill" aria-hidden="true" />
                Start on WhatsApp
              </Button>
              <Button href="#how-it-works" variant="secondary" size="lg">
                See how it works
                <ArrowDown size={16} aria-hidden="true" />
              </Button>
            </div>
          </Reveal>

          <Reveal y={16} delay={0.32}>
            <ul className="mt-9 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
              {HERO_BADGES.map((badge) => (
                <li key={badge.label}>
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal y={36} delay={0.2} className="lg:justify-self-center">
          <HeroVisual />
        </Reveal>
      </Container>
    </section>
  );
}
