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
    title: "Students abroad",
    copy: "Fees and rent, sorted from home.",
  },
  {
    icon: Laptop,
    title: "Freelancers",
    copy: "Earn in one currency, live in another.",
  },
  {
    icon: AirplaneTilt,
    title: "Travelers",
    copy: "Land with local money lined up.",
  },
  {
    icon: Globe,
    title: "Expats & migrants",
    copy: "Swap inside a verified community.",
  },
  {
    icon: UsersFour,
    title: "Community groups",
    copy: "Your exchange circle, with structure.",
  },
  {
    icon: Briefcase,
    title: "Cross-border workers",
    copy: "Recurring swaps, always on record.",
  },
];

export function DesignedFor() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="Designed for"
          title="Built for how money really moves."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((audience, i) => (
            <Reveal key={audience.title} delay={i * 0.06} className="h-full">
              <div className="flex h-full items-center gap-4 rounded-2xl border border-hairline bg-surface-2 p-5 transition-colors duration-300 hover:border-brand/35">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand/[0.07]">
                  <audience.icon
                    size={21}
                    className="text-brand"
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-white">
                    {audience.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-faint">
                    {audience.copy}
                  </p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  );
}
