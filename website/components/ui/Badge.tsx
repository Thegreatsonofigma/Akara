import { cn } from "@/lib/cn";

export type BadgeTone =
  | "green"
  | "acid"
  | "pink"
  | "blue"
  | "neutral"
  | "custody";

const tones: Record<BadgeTone, { pill: string; dot: string }> = {
  green: {
    pill: "border-brand/30 bg-brand/10 text-brand",
    dot: "bg-brand",
  },
  acid: {
    pill: "border-acid/30 bg-acid/10 text-acid",
    dot: "bg-acid",
  },
  pink: {
    pill: "border-pink/35 bg-pink/10 text-pink",
    dot: "bg-pink",
  },
  blue: {
    pill: "border-electric/45 bg-electric/15 text-[#a9b4ff]",
    dot: "bg-[#7b8cff]",
  },
  neutral: {
    pill: "border-white/15 bg-white/[0.04] text-white/80",
    dot: "bg-white/60",
  },
  custody: {
    pill: "border-white/15 bg-white/[0.04] text-white",
    dot: "bg-brand",
  },
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot = true,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tracking-wide",
        tones[tone].pill,
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 rounded-full", tones[tone].dot)}
        />
      )}
      {children}
    </span>
  );
}
