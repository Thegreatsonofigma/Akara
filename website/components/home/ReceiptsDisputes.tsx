import { Warning } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { DisputeTimeline } from "@/components/product/DisputeTimeline";
import { Reveal } from "@/components/motion/Reveal";

export function ReceiptsDisputes() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="Receipts & disputes"
          title="Receipts, confirmations, and disputes stay in one place."
          copy="Users upload proof after payment. Akara may reject blurry, cropped, edited, reused, mismatched, or suspicious receipts."
        />

        <div className="grid items-start gap-12 lg:grid-cols-[1fr_1fr]">
          <DisputeTimeline />

          <div className="flex flex-col gap-4">
            <Reveal delay={0.1}>
              <div className="rounded-2xl border border-pink/25 bg-pink/[0.05] p-5">
                <p className="flex items-start gap-3 text-sm leading-relaxed text-white/85">
                  <Warning
                    size={19}
                    className="mt-0.5 shrink-0 text-pink"
                    aria-hidden="true"
                  />
                  Raise a dispute within 24 hours if something goes wrong.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.18}>
              <div className="rounded-2xl border border-hairline bg-surface-2 p-5">
                <p className="text-sm leading-relaxed text-muted">
                  Every dispute is reviewed against the trade record: KYC data,
                  receipts, payout details, confirmations, and chat history.
                  Accounts may be restricted during review, and an admin or
                  compliance reviewer decides the outcome.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.26}>
              <div className="rounded-2xl border border-hairline bg-surface p-5">
                <p className="text-sm leading-relaxed text-faint">
                  Akara does not guarantee refunds or reversals because Akara
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
