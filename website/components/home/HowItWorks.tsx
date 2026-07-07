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

/**
 * Clay-style globe rising from the card's bottom edge — dark sphere,
 * raised green continents (Africa front and center), drifting meridian
 * sheen, and floating currency glyphs.
 */
function GlowGlobe() {
  const meridians = Array.from({ length: 10 }, (_, i) => -50 + i * 44);
  return (
    <div
      className="relative -mx-6 -mb-6 mt-4 h-48 overflow-hidden rounded-b-[15px]"
      aria-hidden="true"
    >
      {/* glow bed */}
      <div className="absolute bottom-[-90px] left-1/2 h-56 w-72 -translate-x-1/2 rounded-full bg-brand/15 blur-3xl" />

      {/* floating currency glyphs */}
      <span className="float-a absolute left-5 top-3 rotate-[-14deg] font-numbers text-3xl text-brand/70 drop-shadow-[0_0_14px_rgba(157,255,30,0.5)]">
        ₦
      </span>
      <span className="float-b absolute right-5 top-1 rotate-[12deg] font-numbers text-2xl text-[#8f9dff]/80 drop-shadow-[0_0_14px_rgba(66,43,243,0.6)]">
        ₵
      </span>

      <svg
        viewBox="0 0 340 340"
        className="absolute left-1/2 top-4 h-[300px] w-[300px] -translate-x-1/2"
      >
        <defs>
          <radialGradient id="akr-sphere" cx="42%" cy="26%" r="85%">
            <stop offset="0%" stopColor="#1a2410" />
            <stop offset="45%" stopColor="#0c1108" />
            <stop offset="100%" stopColor="#050505" />
          </radialGradient>
          <linearGradient id="akr-land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9DFF1E" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#6cc20e" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#3f7a04" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="akr-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(157,255,30,0.55)" />
            <stop offset="60%" stopColor="rgba(157,255,30,0.12)" />
            <stop offset="100%" stopColor="rgba(157,255,30,0)" />
          </linearGradient>
          <clipPath id="akr-sphere-clip">
            <circle cx="170" cy="190" r="168" />
          </clipPath>
        </defs>

        {/* sphere */}
        <circle cx="170" cy="190" r="168" fill="url(#akr-sphere)" />

        <g clipPath="url(#akr-sphere-clip)">
          {/* Europe — a coastline band above the Mediterranean gap */}
          <path
            d="M 148 94 C 154 80 168 72 182 76 C 190 66 206 62 220 66 C 234 70 250 66 258 76 C 264 84 258 92 248 96 C 254 102 250 110 238 112 C 222 114 204 118 190 114 C 174 110 156 108 148 94 Z"
            fill="url(#akr-land)"
            opacity="0.9"
          />
          {/* Africa — west bulge, Gulf of Guinea notch, the horn */}
          <path
            d="M 122 140 C 138 126 170 120 198 126 C 222 131 242 128 252 140 C 260 150 256 162 266 170 C 276 178 270 190 258 192 C 248 194 244 204 240 216 C 236 228 230 238 224 248 L 160 248 C 156 234 148 226 140 218 C 130 208 126 202 134 200 C 144 198 148 192 142 184 C 120 182 104 172 102 158 C 100 148 110 144 122 140 Z"
            fill="url(#akr-land)"
          />
          {/* Arabia across the Red Sea */}
          <path
            d="M 268 148 C 280 140 296 144 306 156 C 316 168 320 184 310 194 C 300 204 286 198 278 186 C 272 176 262 160 268 148 Z"
            fill="url(#akr-land)"
            opacity="0.85"
          />
          {/* Americas sliver on the left horizon */}
          <path
            d="M 6 130 C 18 120 36 122 44 134 C 52 146 48 164 38 172 C 28 180 12 176 6 164 Z"
            fill="url(#akr-land)"
            opacity="0.6"
          />

          {/* drifting meridian sheen */}
          <g className="globe-spin" opacity="0.5">
            {meridians.map((x) => (
              <ellipse
                key={x}
                cx={x}
                cy="190"
                rx="40"
                ry="168"
                fill="none"
                stroke="rgba(157,255,30,0.12)"
                strokeWidth="1"
              />
            ))}
          </g>

          {/* top-light sheen */}
          <ellipse
            cx="140"
            cy="70"
            rx="130"
            ry="60"
            fill="rgba(255,255,255,0.05)"
          />
        </g>

        {/* rim light */}
        <circle
          cx="170"
          cy="190"
          r="168"
          fill="none"
          stroke="url(#akr-rim)"
          strokeWidth="1.5"
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
