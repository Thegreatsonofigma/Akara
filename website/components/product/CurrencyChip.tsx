import { cn } from "@/lib/cn";

export function CurrencyChip({
  code,
  country,
  size = "md",
  className,
}: {
  code: string;
  country?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/12 bg-surface-2 font-numbers tracking-wide text-white transition-colors",
        size === "sm" && "px-3 py-1 text-sm",
        size === "md" && "px-4 py-1.5 text-base",
        size === "lg" && "px-5 py-2.5 text-xl",
        className,
      )}
    >
      {code}
      {country && (
        <span className="font-sans text-xs font-normal text-faint">
          {country}
        </span>
      )}
    </span>
  );
}

export function CorridorChip({
  from,
  to,
  className,
}: {
  from: string;
  to: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "group inline-flex items-center gap-2 rounded-full border border-white/12 bg-surface-2 px-4 py-2 font-numbers text-sm tracking-wider text-white transition-all duration-300 hover:border-brand/50 hover:shadow-[0_0_24px_rgba(157,255,30,0.15)]",
        className,
      )}
    >
      {from}
      <span aria-hidden="true" className="text-brand">
        ⇄
      </span>
      <span className="sr-only">to</span>
      {to}
    </span>
  );
}
