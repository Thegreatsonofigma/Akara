import { CheckCircle, CircleNotch, Circle } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

type StepState = "done" | "active" | "pending";

const STEPS: { label: string; state: StepState }[] = [
  { label: "Payout details confirmed", state: "done" },
  { label: "Payment marked sent", state: "done" },
  { label: "Receipt uploaded", state: "done" },
  { label: "Awaiting confirmation", state: "active" },
];

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") {
    return (
      <CheckCircle
        size={18}
        weight="fill"
        className="text-brand"
        aria-hidden="true"
      />
    );
  }
  if (state === "active") {
    return (
      <CircleNotch size={18} className="text-acid" aria-hidden="true" />
    );
  }
  return <Circle size={18} className="text-white/25" aria-hidden="true" />;
}

export function TradeTracker({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-hairline bg-surface-3 p-5 shadow-[0_24px_60px_rgba(0,0,0,0.55)]",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-faint">
            Trade
          </p>
          <p className="font-numbers text-base tracking-widest text-white">
            AKR-TRD-104
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-acid/30 bg-acid/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-acid">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-acid" />
          In progress
        </span>
      </div>

      <ol className="flex flex-col">
        {STEPS.map((step, i) => (
          <li key={step.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <StepIcon state={step.state} />
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "my-0.5 w-px flex-1",
                    step.state === "done" ? "bg-brand/40" : "bg-white/10",
                  )}
                />
              )}
            </div>
            <p
              className={cn(
                "pb-4 text-[13px]",
                step.state === "done" && "text-white/85",
                step.state === "active" && "font-medium text-acid",
                step.state === "pending" && "text-faint",
              )}
            >
              {step.label}
              {step.state === "active" && (
                <span className="sr-only"> (current step)</span>
              )}
            </p>
          </li>
        ))}
      </ol>

      <p className="border-t border-hairline pt-3 text-[11px] text-faint">
        Both sides confirm before the trade closes.
      </p>
    </div>
  );
}
