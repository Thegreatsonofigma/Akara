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
  brand: { tile: "bg-brand text-black", wash: "bg-brand/25" },
  electric: { tile: "bg-electric text-white", wash: "bg-electric/25" },
  acid: { tile: "bg-acid text-black", wash: "bg-acid/20" },
  pink: { tile: "bg-pink text-white", wash: "bg-pink/20" },
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
    <section className="relative overflow-hidden border-t border-hairline py-20 sm:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(157,255,30,0.075),transparent_68%)]"
      />
      <Container>
        <SectionHeader
          eyebrow="Designed for"
          title="Built for how money really moves."
          copy="Six lives Akara was made to fit. Meet them."
          align="left"
          className="relative max-w-3xl"
        />
        <div className="relative grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((audience, i) => {
            const tone = TONES[audience.tone];
            return (
              <Reveal key={audience.title} delay={i * 0.06} className="h-full">
                <article className="group relative min-h-[360px] overflow-hidden rounded-[1.75rem] bg-surface-2 shadow-[0_20px_56px_rgba(0,0,0,0.3)] ring-1 ring-inset ring-white/10 transition duration-500 hover:-translate-y-1 hover:ring-white/25 md:aspect-[4/3] md:min-h-0">
                  <Image
                    src={audience.image.src}
                    alt={audience.image.alt}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
                  />
                  <div
                    aria-hidden="true"
                    className={`absolute inset-0 mix-blend-color transition-opacity duration-700 group-hover:opacity-0 ${tone.wash}`}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/5"
                  />
                  <span
                    className={`absolute left-5 top-5 flex size-11 items-center justify-center rounded-[0.9rem] shadow-[0_10px_24px_rgba(0,0,0,0.25)] ${tone.tile}`}
                  >
                    <audience.icon
                      size={22}
                      weight="duotone"
                      aria-hidden="true"
                    />
                  </span>
                  <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
                    <p className="text-xl font-bold tracking-[-0.02em] text-white sm:text-2xl">
                      {audience.title}
                    </p>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/75">
                      {audience.copy}
                    </p>
                  </div>
                </article>
              </Reveal>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
