import { cn } from "@/lib/cn";

/**
 * CSS-only iPhone-style frame: dark bezel, dynamic island, side buttons.
 * Purely decorative chrome around real, crafted app UI.
 */
export function PhoneFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative w-[290px] sm:w-[330px]", className)}>
      {/* side buttons */}
      <span
        aria-hidden="true"
        className="absolute -left-[3px] top-24 h-8 w-[3px] rounded-l bg-[#2a2a2a]"
      />
      <span
        aria-hidden="true"
        className="absolute -left-[3px] top-36 h-14 w-[3px] rounded-l bg-[#2a2a2a]"
      />
      <span
        aria-hidden="true"
        className="absolute -right-[3px] top-32 h-16 w-[3px] rounded-r bg-[#2a2a2a]"
      />

      <div className="relative rounded-[3rem] border-[9px] border-[#1c1c1e] bg-black shadow-[0_48px_120px_rgba(0,0,0,0.75)] ring-1 ring-white/10">
        {/* dynamic island */}
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-2.5 z-20 h-[24px] w-[88px] -translate-x-1/2 rounded-full bg-black ring-1 ring-white/[0.06]"
        />
        <div className="overflow-hidden rounded-[2.45rem]">{children}</div>
      </div>
    </div>
  );
}
