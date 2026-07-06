import { cn } from "@/lib/cn";

/**
 * Layered dark backdrop: radial green glow + subtle grid + grain.
 * Purely decorative — all layers are aria-hidden and non-interactive.
 */
export function GradientBackground({
  className,
  grid = true,
  position = "top",
}: {
  className?: string;
  grid?: boolean;
  position?: "top" | "bottom";
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0",
          position === "top" ? "glow-green" : "glow-green-soft",
        )}
      />
      {grid && <div className="absolute inset-0 bg-grid" />}
      <div className="absolute inset-0 bg-grain" />
    </div>
  );
}
