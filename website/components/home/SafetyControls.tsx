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
  { icon: FileMagnifyingGlass, title: "Fake receipt detection", tone: "pink" },
  { icon: UserSwitch, title: "Name mismatch review", tone: "electric" },
  { icon: ArrowsCounterClockwise, title: "Cancellation monitoring", tone: "acid" },
  { icon: HourglassMedium, title: "Abandoned trade tracking", tone: "brand" },
  { icon: Copy, title: "Duplicate listing checks", tone: "electric" },
  { icon: TrendUp, title: "High-value review", tone: "acid" },
  { icon: Detective, title: "Bypass detection", tone: "pink" },
  { icon: Gavel, title: "Admin review & restriction", tone: "brand" },
] as const;

export function SafetyControls() {
  return (
    <section
      id="safety"
      className="relative scroll-mt-20 overflow-hidden border-t border-hairline py-20 sm:py-28"
    >
      <Container className="relative">
        <SectionHeader
          eyebrow="Safety"
          title="Eight ways Akara watches your back."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CONTROLS.map((control, i) => (
            <SafetyCard
              key={control.title}
              icon={control.icon}
              title={control.title}
              tone={control.tone}
              delay={i * 0.05}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
