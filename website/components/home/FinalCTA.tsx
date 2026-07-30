import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { SITE } from "@/lib/site";

export function FinalCTA() {
  return (
    <section
      id="get-started"
      className="scroll-mt-28 border-t border-hairline py-20 sm:py-28"
    >
      <Container>
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-surface px-6 py-14 text-center sm:px-12 sm:py-20">
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-0 h-px w-24 -translate-x-1/2 bg-brand/80"
            />
            <div className="relative flex flex-col items-center">
              <p className="mb-5 text-xs font-black uppercase tracking-[0.2em] text-brand">
                Now live
              </p>
              <h2 className="max-w-2xl text-balance text-4xl font-black leading-[1.03] tracking-tight text-white sm:text-5xl">
                Your next exchange can start here.
              </h2>
              <p className="mb-8 mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/55 sm:text-lg">
                Message Akara on WhatsApp to browse offers, create a listing,
                and coordinate a verified exchange.
              </p>
              <a
                href={SITE.whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-brand px-7 py-3.5 text-base font-semibold text-black transition-all duration-300 hover:-translate-y-0.5 hover:bg-white"
              >
                Start on WhatsApp
                <WhatsappLogo size={19} weight="fill" aria-hidden="true" />
              </a>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
