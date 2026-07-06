import type { Icon } from "@phosphor-icons/react";
import { Reveal } from "@/components/motion/Reveal";

const TILE_TONES = {
  brand: "border-brand/20 bg-brand/[0.07] text-brand",
  acid: "border-acid/25 bg-acid/[0.08] text-acid",
  electric: "border-electric/40 bg-electric/[0.14] text-[#8f9dff]",
  pink: "border-pink/25 bg-pink/[0.08] text-pink",
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
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-5 transition-all duration-300 hover:border-white/20 hover:bg-surface-3">
        <span
          className={`flex size-10 items-center justify-center rounded-xl border ${TILE_TONES[tone]}`}
        >
          <IconComponent size={20} aria-hidden="true" />
        </span>
        <p className="text-sm font-semibold text-white">{title}</p>
        {copy && <p className="text-[13px] leading-relaxed text-faint">{copy}</p>}
      </div>
    </Reveal>
  );
}
