import {
  IdentificationCard,
  UserFocus,
  SealCheck,
  ArrowRight,
  Bank,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { StepCard } from "@/components/ui/StepCard";

function MiniChip({
  icon: Icon,
  label,
}: {
  icon: typeof IdentificationCard;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-black/[0.03] px-3 py-1.5 text-[11px] font-medium text-black/70">
      <Icon size={13} className="text-black/50" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Continuation of the paper act — light bento with solid color blocks. */
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-24 overflow-hidden border-t border-black/10 bg-[#F2F2ED] py-20 text-black sm:py-28"
    >
      <div aria-hidden="true" className="absolute inset-0 bg-grain" />
      <Container className="relative">
        <Reveal className="mb-14 flex flex-col items-center gap-5 text-center sm:mb-16">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-black/15 bg-black/[0.03] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/55">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-brand"
            />
            How it works
          </p>
          <h2 className="max-w-2xl text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            From hello to swapped, in six steps.
          </h2>
        </Reveal>

        <div className="grid gap-4 lg:grid-cols-3">
          <StepCard
            light
            number="01"
            tone="brand"
            title="Verify yourself"
            copy="Real name, real ID, quick selfie. Once, not every time."
            className="lg:col-span-2"
          >
            <div className="mt-1 flex flex-wrap gap-2">
              <MiniChip icon={IdentificationCard} label="ID document" />
              <MiniChip icon={UserFocus} label="Selfie check" />
              <MiniChip icon={SealCheck} label="Name confirmed" />
            </div>
          </StepCard>

          <StepCard
            light
            number="02"
            tone="electric"
            title="List or browse"
            copy="Say what you have and what you need."
            delay={0.06}
          />

          <StepCard
            light
            number="03"
            tone="acid"
            title="Open a trade"
            copy="Lock it in with a reference code."
            delay={0.06}
          />

          <StepCard
            light
            number="04"
            tone="pink"
            title="Check payout details"
            copy="Name-matched and shared inside the trade."
            warning="Always confirm payout details before sending money."
            className="lg:col-span-2"
            delay={0.12}
          >
            <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-black/[0.08] bg-black/[0.03] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-black/85">
                  GTBank ···· 1234
                </p>
                <p className="text-[11px] tracking-wide text-black/45">
                  ADA C. OKAFOR
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                <SealCheck size={12} weight="fill" aria-hidden="true" />
                Name match
              </span>
            </div>
          </StepCard>

          <StepCard
            light
            number="05"
            tone="brand"
            title="Pay each other directly"
            copy="Bank or mobile money, account to account. No middle stop."
            className="lg:col-span-2"
            delay={0.18}
          >
            <div className="mt-1 flex items-center gap-3 rounded-xl border border-black/[0.08] bg-black/[0.03] px-4 py-3 text-[12px] font-medium text-black/70">
              <span className="flex items-center gap-1.5">
                <Bank size={14} className="text-black/45" aria-hidden="true" />
                Your bank
              </span>
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-r from-black/30 to-black/10"
              />
              <ArrowRight
                size={14}
                className="text-black/60"
                aria-hidden="true"
              />
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-r from-black/10 to-black/30"
              />
              <span className="flex items-center gap-1.5">
                <Bank size={14} className="text-black/45" aria-hidden="true" />
                Their bank
              </span>
            </div>
          </StepCard>

          <StepCard
            light
            number="06"
            tone="electric"
            title="Confirm with proof"
            copy="Upload the receipt. Both sides confirm. Done."
            delay={0.18}
          />
        </div>
      </Container>
    </section>
  );
}
