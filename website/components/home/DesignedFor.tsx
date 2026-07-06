import Image from "next/image";
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
import { IMAGES, type StockImage } from "@/lib/images";

const TILE_TONES = {
  brand: "bg-brand text-black",
  electric: "bg-electric text-white",
  acid: "bg-acid text-black",
  pink: "bg-pink text-white",
} as const;

const AUDIENCES: Array<{
  icon: typeof GraduationCap;
  tone: keyof typeof TILE_TONES;
  title: string;
  copy: string;
  image: StockImage;
}> = [
  {
    icon: GraduationCap,
    tone: "brand",
    title: "Students abroad",
    copy: "Fees and rent, sorted from home.",
    image: IMAGES.students,
  },
  {
    icon: Laptop,
    tone: "electric",
    title: "Freelancers",
    copy: "Earn in one currency, live in another.",
    image: IMAGES.freelancer,
  },
  {
    icon: AirplaneTilt,
    tone: "acid",
    title: "Travelers",
    copy: "Land with local money lined up.",
    image: IMAGES.traveler,
  },
  {
    icon: Globe,
    tone: "pink",
    title: "Expats & migrants",
    copy: "Swap inside a verified community.",
    image: IMAGES.community,
  },
  {
    icon: UsersFour,
    tone: "electric",
    title: "Community groups",
    copy: "Your exchange circle, with structure.",
    image: IMAGES.team,
  },
  {
    icon: Briefcase,
    tone: "brand",
    title: "Cross-border workers",
    copy: "Recurring swaps, always on record.",
    image: IMAGES.worker,
  },
];

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
              <div className="group relative aspect-[4/5] overflow-hidden rounded-[1.75rem] shadow-[0_2px_8px_rgba(0,0,0,0.08)] transition-shadow duration-500 hover:shadow-[0_24px_64px_rgba(0,0,0,0.22)]">
                <Image
                  src={audience.image.src}
                  alt={audience.image.alt}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
                />
                <span
                  className={`absolute left-4 top-4 flex size-11 items-center justify-center rounded-xl ${TILE_TONES[audience.tone]}`}
                >
                  <audience.icon size={22} weight="duotone" aria-hidden="true" />
                </span>
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <p className="text-lg font-bold text-white">
                    {audience.title}
                  </p>
                  <p className="mt-1 text-[13px] leading-snug text-white/75">
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
