import {
  IdentificationCard,
  WhatsappLogo,
  UserFocus,
  SealCheck,
  TextAa,
  UserGear,
} from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

const CHECKLIST = [
  { label: "Legal name", icon: TextAa, done: true },
  { label: "WhatsApp number", icon: WhatsappLogo, done: true },
  { label: "ID document", icon: IdentificationCard, done: true },
  { label: "Selfie / liveness", icon: UserFocus, done: true },
  { label: "Payout name match", icon: SealCheck, done: true },
  { label: "Admin review for mismatches", icon: UserGear, done: false },
];

export function VerificationPanel({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-hairline bg-surface-2 p-6 sm:p-8",
        className,
      )}
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">
          Verification checklist
        </p>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
          <SealCheck size={13} weight="fill" aria-hidden="true" />
          Verified
        </span>
      </div>

      <ul className="flex flex-col gap-3">
        {CHECKLIST.map((item) => (
          <li
            key={item.label}
            className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/40 px-4 py-3"
          >
            <item.icon
              size={18}
              className={item.done ? "text-brand" : "text-[#8f9dff]"}
              aria-hidden="true"
            />
            <span className="flex-1 text-sm text-white/85">{item.label}</span>
            {item.done ? (
              <span className="text-xs font-medium text-brand">Done</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-electric/45 bg-electric/15 px-2 py-0.5 text-[10px] font-medium text-[#a9b4ff]">
                <span
                  aria-hidden="true"
                  className="size-1 rounded-full bg-[#7b8cff]"
                />
                If needed
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
