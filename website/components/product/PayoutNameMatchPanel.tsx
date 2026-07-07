import {
  SealCheck,
  Bank,
  DeviceMobile,
  Password,
  UserFocus,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

const FEATURES = [
  {
    icon: Bank,
    text: "Bank and mobile money payout support",
  },
  {
    icon: DeviceMobile,
    text: "Up to 2 payout accounts per currency at launch",
  },
  {
    icon: Password,
    text: "6-digit passcode required for payout edits",
  },
  {
    icon: UserFocus,
    text: "Selfie or admin review for risky changes",
  },
];

export function PayoutNameMatchPanel({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="rounded-3xl border border-hairline bg-surface-2 p-6">
        <p className="mb-4 text-[10px] uppercase tracking-[0.2em] text-faint">
          Name match check
        </p>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-white/[0.07] bg-black/50 px-4 py-3">
            <p className="text-[11px] text-faint">Verified legal name</p>
            <p className="text-sm font-semibold tracking-wide text-white">
              ADA CHIAMAKA OKAFOR
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/50 px-4 py-3">
            <p className="text-[11px] text-faint">Payout account name</p>
            <p className="text-sm font-semibold tracking-wide text-white">
              ADA C. OKAFOR
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-brand/25 bg-brand/[0.07] px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-white">
              <SealCheck
                size={17}
                weight="fill"
                className="text-brand"
                aria-hidden="true"
              />
              Name match confirmed
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-electric/45 bg-electric/15 px-2.5 py-1 text-[10px] font-medium text-[#a9b4ff]">
              <span aria-hidden="true" className="size-1 rounded-full bg-[#7b8cff]" />
              Minor variants → admin review
            </span>
          </div>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <li
            key={f.text}
            className="flex items-start gap-3 rounded-2xl border border-hairline bg-surface p-4"
          >
            <f.icon size={19} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
            <span className="text-sm leading-relaxed text-white/80">
              {f.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
