import Image from "next/image";
import { SealCheck, ArrowRight, Bank } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StepCard } from "@/components/ui/StepCard";

function CardShot({
  src,
  alt,
  priorityHint = false,
}: {
  src: string;
  alt: string;
  priorityHint?: boolean;
}) {
  return (
    <div className="mt-1 overflow-hidden rounded-xl ring-1 ring-white/10">
      <Image
        src={src}
        alt={alt}
        width={2000}
        height={1000}
        loading={priorityHint ? "eager" : "lazy"}
        className="h-auto w-full"
        sizes="(max-width: 1024px) 100vw, 640px"
      />
    </div>
  );
}

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative scroll-mt-24 overflow-hidden border-t border-hairline bg-surface py-20 sm:py-28"
    >
      <Container className="relative">
        <SectionHeader
          eyebrow="How it works"
          title="From hello to swapped, in six steps."
        />

        <div className="grid gap-4 lg:grid-cols-3">
          <StepCard
            number="01"
            tone="brand"
            title="Verify yourself"
            copy="Real name, real ID, quick selfie. Once, not every time."
            className="lg:col-span-2"
          >
            <CardShot
              src="/cards/verified.png"
              alt="Akara verification success card: You're now Verified! Now you can see available offers, create your own rate listing, set up a payout account and enjoy borderless conversions."
            />
          </StepCard>

          <StepCard
            number="02"
            tone="electric"
            title="List or browse"
            copy="Say what you have and what you need — your listing becomes a shareable swap card."
            delay={0.06}
          >
            <CardShot
              src="/cards/listing.png"
              alt="Akara swap listing card: 1,000,000 NGN for 1,150,000 RWF, open AKR-LIST-016 on Akara to swap"
            />
          </StepCard>

          <StepCard
            number="03"
            tone="acid"
            title="Open a trade"
            copy="Lock it in with a reference code."
            delay={0.06}
          />

          <StepCard
            number="04"
            tone="pink"
            title="Check payout details"
            copy="Name-matched and shared inside the trade."
            warning="Always confirm payout details before sending money."
            className="lg:col-span-2"
            delay={0.12}
          >
            <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/40 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[12px] font-semibold text-white/90">
                  GTBank ···· 1234
                </p>
                <p className="text-[11px] tracking-wide text-faint">
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
            number="05"
            tone="brand"
            title="Pay each other directly"
            copy="Bank or mobile money, account to account. No middle stop."
            delay={0.18}
          >
            <div className="mt-1 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/40 px-4 py-3 text-[12px] font-medium text-white/75">
              <span className="flex items-center gap-1.5">
                <Bank size={14} className="text-white/50" aria-hidden="true" />
                Yours
              </span>
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-r from-brand/60 to-brand/15"
              />
              <ArrowRight size={14} className="text-brand" aria-hidden="true" />
              <span
                aria-hidden="true"
                className="h-px flex-1 bg-gradient-to-r from-brand/15 to-brand/60"
              />
              <span className="flex items-center gap-1.5">
                <Bank size={14} className="text-white/50" aria-hidden="true" />
                Theirs
              </span>
            </div>
          </StepCard>

          <StepCard
            number="06"
            tone="electric"
            title="Confirm with proof"
            copy="Upload the receipt. Both sides confirm — and the exchange closes with a completion card."
            className="lg:col-span-2"
            delay={0.18}
          >
            <CardShot
              src="/cards/exchange-completed.png"
              alt="Akara exchange completed card: 1,150,000 RWF received, exchanged 1,000,000 NGN for 1,150,000 RWF, marked successful"
            />
          </StepCard>
        </div>
      </Container>
    </section>
  );
}
