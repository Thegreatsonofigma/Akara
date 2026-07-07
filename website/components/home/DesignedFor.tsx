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

const TONES = {
  brand: { tile: "bg-brand text-black", wash: "bg-brand/50" },
  electric: { tile: "bg-electric text-white", wash: "bg-electric/50" },
  acid: { tile: "bg-acid text-black", wash: "bg-acid/40" },
  pink: { tile: "bg-pink text-white", wash: "bg-pink/45" },
} as const;

const AUDIENCES: Array<{
  icon: typeof GraduationCap;
  tone: keyof typeof TONES;
  title: string;
  copy: string;
  image: StockImage;
}> = [
  {
    icon: GraduationCap,
    tone: "brand",
    title: "Students abroad",
    copy: "School fees from home, in the right currency.",
    image: IMAGES.students,
  },
  {
    icon: Laptop,
    tone: "electric",
    title: "Freelancers",
    copy: "Get paid abroad. Spend it where you live.",
    image: IMAGES.freelancer,
  },
  {
    icon: AirplaneTilt,
    tone: "acid",
    title: "Travelers",
    copy: "Touch down with the local currency ready.",
    image: IMAGES.traveler,
  },
  {
    icon: Globe,
    tone: "pink",
    title: "Expats & migrants",
    copy: "Swap with someone heading the other way.",
    image: IMAGES.community,
  },
  {
    icon: UsersFour,
    tone: "electric",
    title: "Community groups",
    copy: "Turn your trusted circle into a real market.",
    image: IMAGES.team,
  },
  {
    icon: Briefcase,
    tone: "brand",
    title: "Cross-border workers",
    copy: "Paid in one country. Living in another.",
    image: IMAGES.worker,
  },
];

export function DesignedFor() {
  return (
    <section className="border-t border-hairline py-20 sm:py-28">
      <Container>
        <SectionHeader
          eyebrow="Designed for"
          title="Built for how money really moves."
          copy="Six lives Akara was made to fit. Hover a card — this is who it's for."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((audience, i) => {
            const tone = TONES[audience.tone];
            return (
              <Reveal key={audience.title} delay={i * 0.06} className="h-full">
                <div className="group relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-surface-2 ring-1 ring-white/10 transition-all duration-500 hover:ring-white/25 hover:shadow-[0_24px_64px_rgba(0,0,0,0.6)]">
                  <Image
                    src={audience.image.src}
                    alt={audience.image.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover grayscale transition-all duration-700 ease-out group-hover:scale-[1.04] group-hover:grayscale-0"
                  />
                  {/* duotone wash — fades out on hover to reveal true color */}
                  <div
                    aria-hidden="true"
                    className={`absolute inset-0 mix-blend-multiply transition-opacity duration-700 group-hover:opacity-0 ${tone.wash}`}
                  />
                  {/* black bed for the layered text */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent"
                  />
                  <span
                    className={`absolute left-5 top-5 flex size-11 items-center justify-center rounded-xl ${tone.tile}`}
                  >
                    <audience.icon
                      size={22}
                      weight="duotone"
                      aria-hidden="true"
                    />
                  </span>
                  <div className="absolute inset-x-0 bottom-0 p-6">
                    <p className="text-xl font-bold text-white">
                      {audience.title}
                    </p>
                    <p className="mt-1.5 text-[13.5px] leading-snug text-white/80">
                      {audience.copy}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
