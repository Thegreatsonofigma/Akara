import { cn } from "@/lib/cn";

/**
 * Signature Akara hairline — the same green→acid→red spectrum that runs
 * across the real swap cards, extended with electric blue. Decorative only.
 */
export function SpectrumBar({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-px w-full bg-[linear-gradient(90deg,#9DFF1E,#E8F500_32%,#FF2D55_66%,#422BF3)]",
        className,
      )}
    />
  );
}
