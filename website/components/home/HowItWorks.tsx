import Image from "next/image";
import {
  SealCheck,
  ArrowRight,
  Bank,
  IdentificationCard,
  UserFocus,
  Timer,
  LockSimple,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StepCard } from "@/components/ui/StepCard";

function CardShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mt-1 overflow-hidden rounded-xl ring-1 ring-white/10">
      <Image
        src={src}
        alt={alt}
        width={2000}
        height={1000}
        loading="lazy"
        className="h-auto w-full"
        sizes="(max-width: 1024px) 100vw, 640px"
      />
    </div>
  );
}

function MiniChip({
  icon: Icon,
  label,
}: {
  icon: typeof IdentificationCard;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-medium text-white/75">
      <Icon size={13} className="text-brand" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Dark wireframe globe with a green glow and looped rotation. */
function GlowGlobe() {
  const meridians = Array.from({ length: 8 }, (_, i) => -32 + i * 44);
  return (
    <div
      className="relative mt-3 flex flex-1 items-center justify-center py-3"
      aria-hidden="true"
    >
      <div className="absolute size-40 rounded-full bg-brand/10 blur-2xl" />
      <svg
        viewBox="0 0 200 200"
        className="relative h-44 w-44 drop-shadow-[0_0_24px_rgba(157,255,30,0.2)]"
      >
        <defs>
          <radialGradient id="akr-globe-bg" cx="38%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#16220b" />
            <stop offset="55%" stopColor="#0a0f06" />
            <stop offset="100%" stopColor="#050505" />
          </radialGradient>
          <clipPath id="akr-globe-clip">
            <circle cx="100" cy="100" r="78" />
          </clipPath>
        </defs>

        <circle
          cx="100"
          cy="100"
          r="78"
          fill="url(#akr-globe-bg)"
          stroke="rgba(157,255,30,0.35)"
          strokeWidth="1.5"
        />

        <g clipPath="url(#akr-globe-clip)">
          <g className="globe-spin">
            {meridians.map((x) => (
              <ellipse
                key={x}
                cx={x}
                cy="100"
                rx="30"
                ry="78"
                fill="none"
                stroke="rgba(157,255,30,0.3)"
                strokeWidth="1"
              />
            ))}
          </g>
          <line
            x1="22"
            y1="100"
            x2="178"
            y2="100"
            stroke="rgba(157,255,30,0.25)"
            strokeWidth="1"
          />
          <ellipse
            cx="100"
            cy="100"
            rx="78"
            ry="34"
            fill="none"
            stroke="rgba(157,255,30,0.16)"
          />
          <ellipse
            cx="100"
            cy="100"
            rx="78"
            ry="62"
            fill="none"
            stroke="rgba(157,255,30,0.1)"
          />
        </g>

        <circle
          cx="100"
          cy="100"
          r="78"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
        />
      </svg>
    </div>
  );
}

/** WhatsApp "Your listing is live" message, rebuilt as a crafted mockup. */
function ListingLiveMockup() {
  return (
    <div
      className="mt-1 flex-1 rounded-2xl rounded-tl-md border border-white/[0.06] bg-surface-3 p-3.5"
      role="img"
      aria-label="WhatsApp message from Akara: your listing is live, with the swap card attached, reference AKR-LIST-016, you send 1,000,000 NGN, you receive 1,150,000 RWF, flexible rate, free service fee"
    >
      <div className="overflow-hidden rounded-lg ring-1 ring-white/10">
        <Image
          src="/cards/listing.webp"
          alt=""
          width={2000}
          height={1000}
          loading="lazy"
          className="h-auto w-full"
          sizes="(max-width: 1024px) 100vw, 400px"
        />
      </div>

      <p className="mt-3 text-[13px] font-bold text-white">
        Your listing is live ✅
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-white/70">
        Your swap card is attached.
      </p>

      <div className="mt-3 flex flex-col gap-2 text-[12px] text-white/70">
        <p>
          <span className="font-semibold text-white/85">Reference:</span>{" "}
          <span className="rounded bg-black/50 px-1.5 py-0.5 font-numbers text-[11px] tracking-widest text-white/80">
            AKR-LIST-016
          </span>
        </p>
        <p>
          <span className="font-semibold text-white/85">You send:</span>{" "}
          <span className="font-numbers tracking-wider text-white">
            1,000,000 NGN
          </span>
        </p>
        <p>
          <span className="font-semibold text-white/85">You receive:</span>{" "}
          <span className="font-numbers tracking-wider text-brand">
            1,150,000 RWF
          </span>
        </p>
        <p>
          <span className="font-semibold text-white/85">Terms:</span> Flexible
          rate
        </p>
        <p>
          <span className="font-semibold text-white/85">Service fee:</span>{" "}
          Free
        </p>
      </div>

      <p className="mt-3 border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-faint">
        Share this with anyone interested — they can review it and open the
        trade from their own chat.
      </p>
      <p className="mt-2 text-right text-[10px] text-white/40">5:46 PM</p>
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
              src="/cards/verified.webp"
              alt="Akara verification success card: You're now Verified! Now you can see available offers, create your own rate listing, set up a payout account and enjoy borderless conversions."
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <MiniChip icon={IdentificationCard} label="ID document" />
              <MiniChip icon={UserFocus} label="Selfie check" />
              <MiniChip icon={SealCheck} label="Name confirmed" />
            </div>
          </StepCard>

          <StepCard
            number="02"
            tone="electric"
            title="List or browse"
            copy="Say what you have and what you need — your listing goes live with a shareable swap card."
            className="lg:row-span-2"
            delay={0.06}
          >
            <ListingLiveMockup />
          </StepCard>

          <StepCard
            number="03"
            tone="acid"
            title="Open a trade"
            copy="Lock it in with a reference code."
            delay={0.06}
          >
            <div className="mt-1 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 font-numbers text-[11px] tracking-widest text-white/80">
                <LockSimple size={13} className="text-acid" aria-hidden="true" />
                AKR-TRD-104
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-acid/25 bg-acid/[0.06] px-3 py-1.5 text-[11px] font-medium text-acid">
                <Timer size={13} aria-hidden="true" />
                Expires in 15:00
              </span>
            </div>
          </StepCard>

          <StepCard
            number="04"
            tone="pink"
            title="Check payout details"
            copy="Name-matched and shared inside the trade."
            warning="Always confirm payout details before sending money."
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
                Match
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
            <GlowGlobe />
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
              src="/cards/exchange-completed.webp"
              alt="Akara exchange completed card: 60,000 RWF received, exchanged 50,000 NGN for 60,000 RWF, marked successful"
            />
          </StepCard>
        </div>
      </Container>
    </section>
  );
}
