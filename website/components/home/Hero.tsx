import { WhatsappLogo, ArrowDown } from "@phosphor-icons/react/dist/ssr";
import { HeroVisual } from "@/components/product/HeroVisual";
import { HeroHeadline } from "@/components/home/HeroHeadline";
import { Reveal } from "@/components/motion/Reveal";
import { SITE } from "@/lib/site";

const HERO_BADGES = [
  "No custody",
  "Verified people",
  "NGN · RWF · GHS · KES · XAF",
];

export function Hero() {
  return (
    <section className="relative -mt-[76px] overflow-hidden pt-[76px] sm:-mt-20 sm:pt-20">
      <div aria-hidden="true" className="absolute inset-0 aurora" />
      <div aria-hidden="true" className="absolute inset-0 bg-grid" />
      <div aria-hidden="true" className="absolute inset-0 bg-grain" />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-14 px-5 pb-20 pt-12 sm:px-8 sm:pt-16 lg:grid-cols-[1fr_1.1fr] lg:gap-8 lg:pb-24">
        <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
          <Reveal y={20}>
            <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-4 py-1.5 text-xs font-medium text-white/70">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-brand"
              />
              Built for African money corridors
            </p>
          </Reveal>

          <HeroHeadline />

          <Reveal y={24} delay={0.16}>
            <p className="mt-7 max-w-md text-pretty text-base leading-relaxed text-muted sm:text-lg">
              Akara matches you with verified swap partners on WhatsApp. You
              pay each other directly, every step is recorded, and Akara
              never holds the money.
            </p>
          </Reveal>

          <Reveal y={20} delay={0.24}>
            <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
              <a
                href={SITE.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-7 py-3.5 text-base font-semibold text-black transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_48px_rgba(157,255,30,0.4)]"
              >
                <WhatsappLogo size={20} weight="fill" aria-hidden="true" />
                Try it on WhatsApp
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.02] px-7 py-3.5 text-base font-semibold text-white transition-colors hover:border-brand/50 hover:text-brand"
              >
                See how it works
                <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
          </Reveal>

          <Reveal y={16} delay={0.32}>
            <ul className="mt-9 flex flex-wrap items-center justify-center gap-2.5 lg:justify-start">
              {HERO_BADGES.map((badge) => (
                <li
                  key={badge}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/70"
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full bg-brand"
                  />
                  {badge}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal y={36} delay={0.2} className="lg:justify-self-center">
          <HeroVisual />
        </Reveal>
      </div>
    </section>
  );
}
