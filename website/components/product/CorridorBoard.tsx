import { ArrowsLeftRight } from "@phosphor-icons/react/dist/ssr";
import { CurrencyChip } from "@/components/product/CurrencyChip";
import { CURRENCIES } from "@/lib/site";
import { Reveal } from "@/components/motion/Reveal";

const EXAMPLE_LISTINGS = [
  { have: "NGN", haveAmount: "350,000", need: "RWF", needAmount: "412,500" },
  { have: "GHS", haveAmount: "4,800", need: "KES", needAmount: "48,900" },
  { have: "XAF", haveAmount: "350,798", need: "NGN", needAmount: "800,000" },
  { have: "RWF", haveAmount: "1,260,000", need: "NGN", needAmount: "1,850,000" },
];

export function CorridorBoard() {
  return (
    <div className="flex flex-col gap-10">
      <Reveal>
        <ul
          className="flex flex-wrap items-center justify-center gap-3 sm:gap-4"
          aria-label="Launch currencies"
        >
          {CURRENCIES.map((c) => (
            <li key={c.code}>
              <CurrencyChip code={c.code} country={c.country} size="lg" />
            </li>
          ))}
        </ul>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2">
        {EXAMPLE_LISTINGS.map((listing, i) => (
          <Reveal key={`${listing.have}-${listing.need}`} delay={i * 0.07}>
            <div className="group flex items-center justify-between gap-4 rounded-2xl border border-hairline bg-surface-2 p-5 transition-all duration-300 hover:border-brand/40 hover:shadow-[0_0_32px_rgba(157,255,30,0.08)]">
              <div>
                <p className="font-numbers text-2xl tracking-wide text-white">
                  {listing.haveAmount}{" "}
                  <span className="text-sm text-faint">{listing.have}</span>
                </p>
                <p className="mt-1 text-xs text-faint">I have</p>
              </div>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black transition-colors group-hover:border-brand/40">
                <ArrowsLeftRight
                  size={16}
                  className="text-brand"
                  aria-hidden="true"
                />
              </span>
              <div className="text-right">
                <p className="font-numbers text-2xl tracking-wide text-white">
                  {listing.needAmount}{" "}
                  <span className="text-sm text-faint">{listing.need}</span>
                </p>
                <p className="mt-1 text-xs text-faint">I need</p>
              </div>
            </div>
            <p className="mt-2 text-center text-[10px] uppercase tracking-[0.18em] text-faint">
              Example listing — not a live rate
            </p>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
