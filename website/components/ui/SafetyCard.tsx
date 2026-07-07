import type { Icon } from "@phosphor-icons/react";
import { Reveal } from "@/components/motion/Reveal";

/* Solid color-block tiles — Bardeen-style pops on the dark cards. */
const TILE_TONES = {
  brand: "bg-brand text-black",
  acid: "bg-acid text-black",
  electric: "bg-electric text-white",
  pink: "bg-pink text-white",
} as const;

export type SafetyTone = keyof typeof TILE_TONES;

export function SafetyCard({
  icon: IconComponent,
  title,
  copy,
  tone = "brand",
  delay = 0,
}: {
  icon: Icon;
  title: string;
  copy?: string;
  tone?: SafetyTone;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className="h-full">
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_20px_48px_rgba(0,0,0,0.5)]">
        <span
          className={`flex size-10 items-center justify-center rounded-xl ${TILE_TONES[tone]}`}
        >
          <IconComponent size={20} weight="duotone" aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-white">{title}</p>
        {copy && (
          <p className="text-[13px] leading-relaxed text-faint">{copy}</p>
        )}
      </div>
    </Reveal>
  );
}
