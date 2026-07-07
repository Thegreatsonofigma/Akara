import Image from "next/image";
import {
  Bank,
  DeviceMobile,
  ArrowRight,
  ArrowDown,
  Eye,
  ShieldCheck,
  ListMagnifyingGlass,
  UsersThree,
  CreditCard,
  Receipt,
  CheckCircle,
  Scales,
} from "@phosphor-icons/react/dist/ssr";

const COORDINATION_STEPS = [
  { label: "Verification", icon: ShieldCheck },
  { label: "Listing", icon: ListMagnifyingGlass },
  { label: "Match", icon: UsersThree },
  { label: "Payout details", icon: CreditCard },
  { label: "Receipt", icon: Receipt },
  { label: "Confirmation", icon: CheckCircle },
  { label: "Dispute record", icon: Scales },
];

function UserNode({
  name,
  detail,
  badge,
  badgeTone,
  icon: Icon,
}: {
  name: string;
  detail: string;
  badge: string;
  badgeTone: "white" | "brand";
  icon: typeof Bank;
}) {
  return (
    <div className="flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-surface-2 p-5 sm:w-auto">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black">
        <Icon size={22} weight="duotone" className="text-white/80" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-bold text-white">{name}</p>
        <p className="text-xs text-faint">{detail}</p>
        <p
          className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 font-numbers text-[11px] tracking-wider ${
            badgeTone === "brand"
              ? "bg-brand text-black"
              : "border border-white/15 bg-white/[0.04] text-white/80"
          }`}
        >
          {badge}
        </p>
      </div>
    </div>
  );
}

export function NoCustodyDiagram() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center">
      {/* Akara node — hovering above the money, never in it */}
      <div className="relative">
        <span
          aria-hidden="true"
          className="ring-pulse absolute inset-0 rounded-full border-2 border-brand/50"
        />
        <span className="relative flex size-16 items-center justify-center rounded-full border border-brand/40 bg-black shadow-[0_0_56px_rgba(157,255,30,0.3)]">
          <Image src="/akara-logo-mark.webp" alt="" width={30} height={31} />
        </span>
      </div>
      <p className="mt-4 text-sm font-bold text-brand">
        Akara: coordination layer
      </p>

      <ul className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2.5">
        {COORDINATION_STEPS.map((step) => (
          <li
            key={step.label}
            className="flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-3.5 py-1.5 text-xs text-white/75"
          >
            <step.icon
              size={14}
              weight="duotone"
              className="text-brand"
              aria-hidden="true"
            />
            {step.label}
          </li>
        ))}
      </ul>

      {/* dashed beam down to the checkpoint */}
      <div
        aria-hidden="true"
        className="mt-5 h-9 w-px border-l border-dashed border-brand/40"
      />
      <div className="flex items-center gap-2.5 rounded-full border border-brand/25 bg-black/70 px-4 py-2">
        <Eye size={16} weight="duotone" className="text-brand" aria-hidden="true" />
        <p className="text-xs text-white/70">
          Watches every step.{" "}
          <span className="font-semibold text-white">
            Never touches the money.
          </span>
        </p>
      </div>
      <div
        aria-hidden="true"
        className="mb-7 mt-5 h-9 w-px border-l border-dashed border-brand/40"
      />

      {/* the direct payment rail */}
      <div className="grid w-full items-center gap-4 sm:grid-cols-[auto_1fr_auto] sm:gap-6">
        <UserNode
          name="User A"
          detail="Own bank / mobile money"
          badge="Sends 350,000 NGN"
          badgeTone="white"
          icon={Bank}
        />

        {/* desktop rail with traveling pulse */}
        <div className="relative hidden h-10 sm:block" aria-hidden="true">
          <p className="absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
            Direct payment
          </p>
          <div className="absolute left-0 right-5 top-1/2 h-px translate-y-2 bg-gradient-to-r from-brand/25 via-brand/70 to-brand/25" />
          <span className="rail-pulse absolute top-1/2 size-2.5 translate-y-[3px] rounded-full bg-brand shadow-[0_0_18px_rgba(157,255,30,0.95)]" />
          <ArrowRight
            size={16}
            className="absolute right-0 top-1/2 translate-y-[0px] text-brand"
          />
        </div>

        {/* mobile connector */}
        <div
          className="flex flex-col items-center gap-1.5 sm:hidden"
          aria-hidden="true"
        >
          <span className="h-6 w-px border-l border-dashed border-brand/50" />
          <span className="flex items-center gap-2 rounded-full border border-brand/30 bg-brand/10 px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand">
            Direct payment
            <ArrowDown size={12} />
          </span>
          <span className="h-6 w-px border-l border-dashed border-brand/50" />
        </div>

        <UserNode
          name="User B"
          detail="Own bank / mobile money"
          badge="Gets 350,000 NGN"
          badgeTone="brand"
          icon={DeviceMobile}
        />
      </div>

      <p className="mt-8 text-center text-sm text-faint">
        Money moves once, directly between users.{" "}
        <span className="text-white/85">It never enters an Akara account.</span>
      </p>
    </div>
  );
}
