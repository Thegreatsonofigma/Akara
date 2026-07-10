import Link from "next/link";
import { WhatsappLogo, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { SITE } from "@/lib/site";

export function FinalCTA() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-[2.5rem] bg-brand px-6 py-16 text-center sm:px-16 sm:py-24">
            {/* depth wash + grain on the green field */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_-10%,rgba(255,255,255,0.28),transparent_60%),radial-gradient(ellipse_60%_60%_at_85%_110%,rgba(0,0,0,0.22),transparent_65%)]"
            />
            <div aria-hidden="true" className="absolute inset-0 bg-grain" />

            <div className="relative flex flex-col items-center gap-7">
              <h2 className="max-w-2xl text-balance text-4xl font-black leading-[1.03] tracking-tight text-black sm:text-6xl">
                Ready to swap the right way?
              </h2>
              <p className="max-w-md text-pretty text-base leading-relaxed text-black/70">
                A verified partner, a clear trail, and money that only ever
                moves between the two of you.
              </p>
<<<<<<< HEAD
              <div className="flex flex-col items-center gap-4 sm:flex-row">
=======
              <div className="flex w-full max-w-sm flex-col items-stretch gap-3.5 sm:w-auto sm:max-w-none sm:flex-row sm:items-center sm:gap-4">
>>>>>>> fd9915f77a886fcfd2ff478d206cc563f3425d52
                <a
                  href={SITE.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
<<<<<<< HEAD
                  className="inline-flex items-center gap-2 rounded-full bg-black px-7 py-3.5 text-base font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
=======
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-black px-7 py-3.5 text-base font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
>>>>>>> fd9915f77a886fcfd2ff478d206cc563f3425d52
                >
                  <WhatsappLogo
                    size={20}
                    weight="fill"
                    className="text-brand"
                    aria-hidden="true"
                  />
                  Try it on WhatsApp
                </a>
                <Link
                  href="/legal/no-custody-risk-disclosure"
<<<<<<< HEAD
                  className="inline-flex items-center gap-2 rounded-full border border-black/30 px-7 py-3.5 text-base font-semibold text-black transition-colors hover:bg-black/[0.06]"
=======
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-black/30 px-7 py-3.5 text-base font-semibold text-black transition-colors hover:bg-black/[0.06]"
>>>>>>> fd9915f77a886fcfd2ff478d206cc563f3425d52
                >
                  Read the No-Custody Disclosure
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
              <p className="text-sm font-medium text-black/60">
                Akara coordinates trades. Users pay each other directly.
              </p>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
