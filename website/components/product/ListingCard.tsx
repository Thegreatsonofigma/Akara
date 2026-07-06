import { cn } from "@/lib/cn";

export function ListingCard({
  have,
  haveAmount,
  need,
  needAmount,
  reference,
  className,
}: {
  have: string;
  haveAmount: string;
  need: string;
  needAmount: string;
  reference: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-hairline bg-black shadow-[0_24px_60px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      <div className="flex items-center justify-between px-5 pt-4">
        <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-white/50">
          Swap with me on <span className="text-white">Akara</span>
        </p>
        <span className="rounded-full border border-acid/30 bg-acid/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-acid">
          Example listing
        </span>
      </div>

      <div className="flex items-center justify-center gap-4 px-5 py-5">
        <div className="flex flex-col items-center gap-2">
          <span className="font-numbers text-[26px] tracking-wide text-white">
            {haveAmount}
          </span>
          <span className="rounded bg-alert px-2 py-0.5 text-[10px] font-bold tracking-wider text-white">
            I HAVE: {have}
          </span>
        </div>
        <span
          aria-hidden="true"
          className="font-numbers text-lg text-white/40"
        >
          ×
        </span>
        <div className="flex flex-col items-center gap-2">
          <span className="font-numbers text-[26px] tracking-wide text-white">
            {needAmount}
          </span>
          <span className="rounded bg-brand px-2 py-0.5 text-[10px] font-bold tracking-wider text-black">
            I NEED: {need}
          </span>
        </div>
      </div>

      <div className="border-t border-hairline px-5 py-2.5">
        <p className="text-center text-[9px] uppercase tracking-[0.2em] text-white/45">
          Interested? Open{" "}
          <span className="font-numbers text-[10px] tracking-widest text-brand">
            {reference}
          </span>{" "}
          on Akara to swap
        </p>
      </div>

      <div
        aria-hidden="true"
        className="h-1 w-full bg-gradient-to-r from-brand via-acid to-alert"
      />
    </div>
  );
}
