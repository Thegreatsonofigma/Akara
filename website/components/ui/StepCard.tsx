import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/cn";

export const NUMBER_TONES = {
  brand: "border-brand/20 bg-brand/[0.08] text-brand",
  acid: "border-acid/25 bg-acid/[0.08] text-acid",
  electric: "border-electric/40 bg-electric/[0.14] text-[#8f9dff]",
  pink: "border-pink/25 bg-pink/[0.08] text-pink",
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
}: {
  number: string;
  title: string;
  copy: string;
  tone?: StepTone;
  warning?: string;
  delay?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal delay={delay} className={cn("h-full", className)}>
      <div className="flex h-full flex-col gap-3.5 rounded-2xl border border-hairline bg-surface-2 p-6 transition-all duration-300 hover:border-white/20">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 items-center justify-center rounded-xl border font-numbers text-lg tracking-wider",
            NUMBER_TONES[tone],
          )}
        >
          {number}
        </span>
        <p className="text-[15px] font-semibold text-white">{title}</p>
        <p className="text-[13px] leading-relaxed text-faint">{copy}</p>
        {children}
        {warning && (
          <p className="mt-auto flex items-start gap-2 rounded-xl border border-acid/25 bg-acid/[0.06] px-3.5 py-2.5 text-[12px] leading-snug text-acid">
            <span
              aria-hidden="true"
              className="mt-1 size-1.5 shrink-0 rounded-full bg-acid"
            />
            {warning}
          </p>
        )}
      </div>
    </Reveal>
  );
}
