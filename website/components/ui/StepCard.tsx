import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/cn";

export function StepCard({
  number,
  title,
  copy,
  warning,
  delay = 0,
  className,
}: {
  number: string;
  title: string;
  copy: string;
  warning?: string;
  delay?: number;
  className?: string;
}) {
  return (
    <Reveal delay={delay} className={cn("h-full", className)}>
      <div className="flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-6 transition-all duration-300 hover:border-brand/35">
        <span
          aria-hidden="true"
          className="font-numbers text-4xl tracking-wide text-brand/90"
        >
          {number}
        </span>
        <p className="text-base font-semibold text-white">{title}</p>
        <p className="text-sm leading-relaxed text-faint">{copy}</p>
        {warning && (
          <p className="mt-auto flex items-start gap-2 rounded-xl border border-acid/25 bg-acid/[0.06] px-3.5 py-2.5 text-[13px] leading-snug text-acid">
            <span aria-hidden="true" className="mt-1 size-1.5 shrink-0 rounded-full bg-acid" />
            {warning}
          </p>
        )}
      </div>
    </Reveal>
  );
}
