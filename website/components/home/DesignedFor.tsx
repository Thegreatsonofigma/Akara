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

const TILE_TONES = {
  brand: "bg-brand text-black",
  electric: "bg-electric text-white",
  acid: "bg-acid text-black",
  pink: "bg-pink text-white",
} as const;

const AUDIENCES = [
  {
    icon: GraduationCap,
    tone: "brand",
    title: "Students abroad",
    copy: "Fees and rent, sorted from home.",
  },
  {
    icon: Laptop,
    tone: "electric",
    title: "Freelancers",
    copy: "Earn in one currency, live in another.",
  },
  {
    icon: AirplaneTilt,
    tone: "acid",
    title: "Travelers",
    copy: "Land with local money lined up.",
  },
  {
    icon: Globe,
    tone: "pink",
    title: "Expats & migrants",
    copy: "Swap inside a verified community.",
  },
  {
    icon: UsersFour,
    tone: "electric",
    title: "Community groups",
    copy: "Your exchange circle, with structure.",
  },
  {
    icon: Briefcase,
    tone: "brand",
    title: "Cross-border workers",
    copy: "Recurring swaps, always on record.",
  },
] as const;

export function DesignedFor() {
  return (
    <section className="border-t border-black/10 bg-[#F2F2ED] py-20 text-black sm:py-28">
      <Container>
        <SectionHeader
          light
          eyebrow="Designed for"
          title="Built for how money really moves."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((audience, i) => (
            <Reveal key={audience.title} delay={i * 0.06} className="h-full">
              <div className="flex h-full items-center gap-4 rounded-2xl border border-black/[0.08] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
                <span
                  className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${TILE_TONES[audience.tone]}`}
                >
                  <audience.icon size={21} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-black">
                    {audience.title}
                  </p>
                  <p className="mt-0.5 text-[13px] text-black/50">
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
