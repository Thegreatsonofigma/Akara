import { Warning } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DisputeTimeline } from "@/components/product/DisputeTimeline";
import { TradeTracker } from "@/components/product/TradeTracker";
import { Reveal } from "@/components/motion/Reveal";

export function ReceiptsDisputes() {
  return (
    <section className="relative overflow-hidden border-t border-black/10 bg-[#F2F2ED] py-20 text-black sm:py-28">
      <Container className="relative">
        <SectionHeader
          light
          eyebrow="Receipts & disputes"
          accent="acid"
          title="Proof beats promises."
          copy="Every payment gets a receipt. Every problem gets a process."
        />

        <div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr]">
          <DisputeTimeline light />

          <div className="flex flex-col gap-4">
            <Reveal delay={0.1}>
              <div className="rounded-2xl border border-pink/30 bg-pink/[0.06] p-5">
                <p className="flex items-start gap-3 text-sm leading-relaxed text-black/80">
                  <Warning
                    size={19}
                    className="mt-0.5 shrink-0 text-pink"
                    aria-hidden="true"
                  />
                  Something wrong? Raise a dispute within 24 hours.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.18}>
              <TradeTracker className="shadow-[0_24px_64px_rgba(0,0,0,0.18)]" />
            </Reveal>
            <Reveal delay={0.26}>
              <div className="rounded-2xl border border-black/10 bg-white p-5">
                <p className="text-sm leading-relaxed text-black/60">
                  Akara does not guarantee refunds or reversals, because Akara
                  does not hold funds.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}
