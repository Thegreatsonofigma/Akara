import type { Icon } from "@phosphor-icons/react";
import { Reveal } from "@/components/motion/Reveal";

const TILE_TONES = {
  brand: "border-brand/20 bg-brand/[0.07] text-brand",
  acid: "border-acid/25 bg-acid/[0.08] text-acid",
  electric: "border-electric/40 bg-electric/[0.14] text-[#8f9dff]",
  pink: "border-pink/25 bg-pink/[0.08] text-pink",
} as const;

const TILE_TONES_LIGHT = {
  brand: "border-transparent bg-brand text-black",
  acid: "border-transparent bg-acid text-black",
  electric: "border-transparent bg-electric text-white",
  pink: "border-transparent bg-pink text-white",
} as const;

export type SafetyTone = keyof typeof TILE_TONES;

export function SafetyCard({
  icon: IconComponent,
  title,
  copy,
  tone = "brand",
  light = false,
  delay = 0,
}: {
  icon: Icon;
  title: string;
  copy?: string;
  tone?: SafetyTone;
  light?: boolean;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <div
        className={
          light
            ? "flex h-full flex-col gap-3 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]"
            : "flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-5 transition-all duration-300 hover:border-white/20 hover:bg-surface-3"
        }
      >
        <span
          className={`flex size-10 items-center justify-center rounded-xl border ${
            light ? TILE_TONES_LIGHT[tone] : TILE_TONES[tone]
          }`}
        >
          <IconComponent size={20} aria-hidden="true" />
        </span>
        <p
          className={`text-sm font-semibold ${light ? "text-black" : "text-white"}`}
        >
          {title}
        </p>
        {copy && (
          <p
            className={`text-[13px] leading-relaxed ${
              light ? "text-black/50" : "text-faint"
            }`}
          >
            {copy}
          </p>
        )}
      </div>
    </Reveal>
  );
}
