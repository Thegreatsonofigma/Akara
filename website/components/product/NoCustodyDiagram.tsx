import {
  Bank,
  DeviceMobile,
  ArrowRight,
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

function UserAccount({
  name,
  detail,
  icon: Icon,
}: {
  name: string;
  detail: string;
  icon: typeof Bank;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-2 px-5 py-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black">
        <Icon size={20} className="text-white/80" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-semibold text-white">{name}</p>
        <p className="text-xs text-faint">{detail}</p>
      </div>
    </div>
  );
}

export function NoCustodyDiagram() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* Coordination layer — dotted, because no money passes through it */}
      <div className="relative rounded-3xl border border-hairline-strong/60 bg-surface p-6 sm:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-brand">
            Akara — coordination layer
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
            No custody
          </span>
        </div>
        <ul className="flex flex-wrap gap-2.5">
          {COORDINATION_STEPS.map((step) => (
            <li
              key={step.label}
              className="flex items-center gap-2 rounded-full border border-dashed border-white/20 bg-black/40 px-3.5 py-1.5 text-xs text-white/80"
            >
              <step.icon size={14} className="text-brand" aria-hidden="true" />
              {step.label}
            </li>
          ))}
        </ul>
      </div>

      {/* Dotted connectors from the coordination layer down to both users */}
      <div
        aria-hidden="true"
        className="mx-auto grid h-10 max-w-2xl grid-cols-2 px-10"
      >
        <span className="h-full w-px justify-self-center border-l border-dashed border-white/25" />
        <span className="h-full w-px justify-self-center border-l border-dashed border-white/25" />
      </div>

      {/* Direct payment lane — the only solid line, user to user */}
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr] sm:gap-0">
        <UserAccount
          name="User A"
          detail="Own bank / mobile money account"
          icon={Bank}
        />
        <div className="flex items-center justify-center px-2 py-1 sm:px-4">
          <div className="flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-4 py-2">
            <span
              aria-hidden="true"
              className="hidden h-px w-6 bg-brand sm:block"
            />
            <span className="whitespace-nowrap text-xs font-semibold text-brand">
              Direct payment
            </span>
            <ArrowRight size={14} className="text-brand" aria-hidden="true" />
            <span
              aria-hidden="true"
              className="hidden h-px w-6 bg-brand sm:block"
            />
          </div>
        </div>
        <UserAccount
          name="User B"
          detail="Own bank / mobile money account"
          icon={DeviceMobile}
        />
      </div>

      <p className="mt-6 text-center text-sm text-faint">
        Money moves once, directly between users.{" "}
        <span className="text-white/80">
          It never enters an Akara account.
        </span>
      </p>
    </div>
  );
}
