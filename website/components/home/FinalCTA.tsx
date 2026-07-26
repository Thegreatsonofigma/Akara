import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { WaitlistForm } from "@/components/waitlist/WaitlistForm";

export function FinalCTA() {
  return (
    <section
      id="waitlist"
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
                Private launch
              </p>
              <h2 className="max-w-2xl text-balance text-4xl font-black leading-[1.03] tracking-tight text-white sm:text-5xl">
                Be first to swap with Akara.
              </h2>
              <p className="mb-8 mt-5 max-w-xl text-pretty text-base leading-relaxed text-white/55 sm:text-lg">
                Our public WhatsApp number is almost ready. Leave your email,
                phone number, or both, and we will let you know when access
                opens.
              </p>
              <WaitlistForm source="homepage_final_cta" tone="dark" />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
