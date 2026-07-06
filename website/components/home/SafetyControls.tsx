import {
  FileMagnifyingGlass,
  UserSwitch,
  ArrowsCounterClockwise,
  HourglassMedium,
  Copy,
  TrendUp,
  Detective,
  Gavel,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SafetyCard } from "@/components/ui/SafetyCard";

const CONTROLS = [
  { icon: FileMagnifyingGlass, title: "Fake receipt detection" },
  { icon: UserSwitch, title: "Payout name mismatch review" },
  { icon: ArrowsCounterClockwise, title: "Repeated cancellation monitoring" },
  { icon: HourglassMedium, title: "Abandoned trade tracking" },
  { icon: Copy, title: "Duplicate listing checks" },
  { icon: TrendUp, title: "High-value activity review" },
  { icon: Detective, title: "Bypass attempt detection" },
  { icon: Gavel, title: "Admin review and account restriction" },
];

export function SafetyControls() {
  return (
    <section
      id="safety"
      className="relative scroll-mt-20 overflow-hidden border-t border-hairline py-20 sm:py-28"
    >
      <Container className="relative">
        <SectionHeader
          eyebrow="Safety controls"
          title="Built to reduce common peer-to-peer risks."
          copy="Coordination only works if the record is trustworthy. These controls run across listings, trades, receipts, and payout details."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CONTROLS.map((control, i) => (
            <SafetyCard
              key={control.title}
              icon={control.icon}
              title={control.title}
              delay={i * 0.05}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
