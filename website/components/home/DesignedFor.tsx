import {
  GraduationCap,
  Laptop,
  AirplaneTilt,
  Globe,
  UsersFour,
  Briefcase,
} from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/Container";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/motion/Reveal";

const AUDIENCES = [
  {
    icon: GraduationCap,
    title: "Nigerian students in Rwanda",
    copy: "Cover fees and living costs without chasing strangers for rates.",
  },
  {
    icon: Laptop,
    title: "Freelancers receiving across borders",
    copy: "Turn cross-border earnings into local value with a verified counterparty.",
  },
  {
    icon: AirplaneTilt,
    title: "Travelers who need local currency",
    copy: "Land with a coordinated swap instead of airport guesswork.",
  },
  {
    icon: Globe,
    title: "Expats and migrant communities",
    copy: "Swap within a verified community, with every step recorded.",
  },
  {
    icon: UsersFour,
    title: "Community currency groups",
    copy: "Give existing exchange groups structure, records, and dispute review.",
  },
  {
    icon: Briefcase,
    title: "Cross-border workers",
    copy: "Coordinate recurring swaps between the currencies you earn and spend.",
  },
];

export function DesignedFor() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="Designed for"
          title="Made for people who already swap across borders."
          copy="Akara is built around real corridors and real communities — not hypothetical traders."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((audience, i) => (
            <Reveal key={audience.title} delay={i * 0.06} className="h-full">
              <div className="flex h-full flex-col gap-3 rounded-2xl border border-hairline bg-surface-2 p-6 transition-colors duration-300 hover:border-brand/35">
                <span className="flex size-10 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.07]">
                  <audience.icon
                    size={20}
                    className="text-brand"
                    aria-hidden="true"
                  />
                </span>
                <p className="text-base font-semibold text-white">
                  {audience.title}
                </p>
                <p className="text-sm leading-relaxed text-faint">
                  {audience.copy}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
