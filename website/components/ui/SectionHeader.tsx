import { cn } from "@/lib/cn";
import { Reveal } from "@/components/motion/Reveal";

export function SectionHeader({
  eyebrow,
  title,
  copy,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: string;
  copy?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <Reveal
      className={cn(
        "mb-12 flex flex-col gap-4 sm:mb-16",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand">
          {eyebrow}
        </p>
      )}
      <h2 className="max-w-2xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-[2.75rem]">
        {title}
      </h2>
      {copy && (
        <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted sm:text-lg">
          {copy}
        </p>
      )}
    </Reveal>
  );
}
