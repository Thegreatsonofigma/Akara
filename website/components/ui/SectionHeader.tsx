import { cn } from "@/lib/cn";
import { Reveal } from "@/components/motion/Reveal";

const ACCENT_DOTS = {
  brand: "bg-brand",
  pink: "bg-pink",
  acid: "bg-acid",
  electric: "bg-[#7b8cff]",
} as const;

export type SectionAccent = keyof typeof ACCENT_DOTS;

export function SectionHeader({
  eyebrow,
  title,
  copy,
  accent = "brand",
  align = "center",
  light = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  accent?: SectionAccent;
  align?: "center" | "left";
  light?: boolean;
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "mb-12 flex flex-col gap-5 sm:mb-16",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow && (
        <p
          className={cn(
            "inline-flex w-fit items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em]",
            light
              ? "border-black/15 bg-black/[0.03] text-black/55"
              : "border-white/10 bg-white/[0.03] text-white/70",
          )}
        >
          <span
            aria-hidden="true"
            className={cn("size-1.5 rounded-full", ACCENT_DOTS[accent])}
          />
          {eyebrow}
        </p>
      )}
      <h2
        className={cn(
          "max-w-2xl text-balance text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl md:text-5xl",
          light ? "font-black text-black" : "text-white",
        )}
      >
        {title}
      </h2>
      {copy && (
        <p
          className={cn(
            "max-w-xl text-pretty text-base leading-relaxed sm:text-lg",
            light ? "text-black/55" : "text-muted",
          )}
        >
          {copy}
        </p>
      )}
    </Reveal>
  );
}
