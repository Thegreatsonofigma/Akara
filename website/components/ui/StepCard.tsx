import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/cn";

export const NUMBER_TONES = {
  brand: "border-brand/20 bg-brand/[0.08] text-brand",
  acid: "border-acid/25 bg-acid/[0.08] text-acid",
  electric: "border-electric/40 bg-electric/[0.14] text-[#8f9dff]",
  pink: "border-pink/25 bg-pink/[0.08] text-pink",
} as const;

/* On paper, the number chips go solid — Bardeen-style color blocks. */
export const NUMBER_TONES_LIGHT = {
  brand: "border-transparent bg-brand text-black",
  acid: "border-transparent bg-acid text-black",
  electric: "border-transparent bg-electric text-white",
  pink: "border-transparent bg-pink text-white",
} as const;

export type StepTone = keyof typeof NUMBER_TONES;

export function StepCard({
  number,
  title,
  copy,
  tone = "brand",
  warning,
  delay = 0,
  className,
  children,
  light = false,
}: {
  number: string;
  title: string;
  copy: string;
  tone?: StepTone;
  warning?: string;
  delay?: number;
  className?: string;
  children?: React.ReactNode;
  light?: boolean;
}) {
  return (
    <Reveal delay={delay} className={cn("h-full", className)}>
      <div
        className={cn(
          "flex h-full flex-col gap-3.5 rounded-2xl border p-6 transition-all duration-300",
          light
            ? "border-black/[0.08] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]"
            : "border-hairline bg-surface-2 hover:border-white/20",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 items-center justify-center rounded-xl border font-numbers text-lg tracking-wider",
            light ? NUMBER_TONES_LIGHT[tone] : NUMBER_TONES[tone],
          )}
        >
          {number}
        </span>
        <p
          className={cn(
            "text-[15px] font-semibold",
            light ? "text-black" : "text-white",
          )}
        >
          {title}
        </p>
        <p
          className={cn(
            "text-[13px] leading-relaxed",
            light ? "text-black/55" : "text-faint",
          )}
        >
          {copy}
        </p>
        {children}
        {warning && (
          <p
            className={cn(
              "mt-auto flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12px] leading-snug",
              light
                ? "border border-black/10 bg-acid/30 text-black/80"
                : "border border-acid/25 bg-acid/[0.06] text-acid",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "mt-1 size-1.5 shrink-0 rounded-full",
                light ? "bg-black/70" : "bg-acid",
              )}
            />
            {warning}
          </p>
        )}
      </div>
    </Reveal>
  );
}
