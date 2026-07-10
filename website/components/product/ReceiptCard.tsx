import {
  FileArrowUp,
  CheckCircle,
  SealCheck,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

export function ReceiptCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-hairline bg-surface-2 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.6)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-white">
          <FileArrowUp size={18} className="text-brand" aria-hidden="true" />
          Receipt uploaded
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-brand">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
          Verified
        </span>
      </div>

      <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-black/50 px-3 py-2.5">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-lg bg-brand/10 font-numbers text-[10px] tracking-wider text-brand"
        >
          PDF
        </span>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-white/90">
            transfer_receipt_gtb.pdf
          </p>
          <p className="font-numbers text-[10px] tracking-wider text-faint">
            84 KB · 7:26 PM
          </p>
        </div>
      </div>

      <ul className="mb-3 flex flex-col gap-1.5">
        {["Amount matches trade", "Reference matches trade"].map((line) => (
          <li
            key={line}
            className="flex items-center gap-2 text-[12px] text-white/75"
          >
            <CheckCircle
              size={14}
              weight="fill"
              className="text-brand"
              aria-hidden="true"
            />
            {line}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 rounded-xl border border-brand/25 bg-brand/[0.07] px-3 py-2">
        <SealCheck
          size={16}
          weight="fill"
          className="shrink-0 text-brand"
          aria-hidden="true"
        />
        <p className="text-[11px] text-white/85">
          Payout name match ·{" "}
          <span className="font-semibold tracking-wide text-brand">
            ADA OKAFOR
          </span>
        </p>
      </div>
    </div>
  );
}
