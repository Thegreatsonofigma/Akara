import Image from "next/image";
import { Container } from "@/components/ui/Container";
import { Reveal } from "@/components/motion/Reveal";
import { IMAGES } from "@/lib/images";

const BAND_PHOTOS = [
  { image: IMAGES.market, rotate: "-rotate-6", offset: "translate-y-6" },
  { image: IMAGES.community, rotate: "rotate-2", offset: "-translate-y-2" },
  { image: IMAGES.traveler, rotate: "rotate-6", offset: "translate-y-8" },
];

/** Dark editorial beat mid-page: statement type + layered photography. */
export function PhotoBand() {
  return (
    <section className="relative overflow-hidden bg-black py-24 text-white sm:py-32">
      <div aria-hidden="true" className="absolute inset-0 bg-grid" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_20%_50%,rgba(157,255,30,0.08),transparent_65%)]"
      />
      <Container className="relative">
        <div className="grid items-center gap-14 lg:grid-cols-[1fr_1fr]">
          <Reveal>
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-brand"
                />
                Why this matters
              </p>
              <h2 className="text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                Money moves where{" "}
                <span className="text-brand">people move.</span>
              </h2>
              <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-white/60 sm:text-lg">
                Lagos to Kigali. Accra to Nairobi. Douala to everywhere.
                Millions already swap peer to peer — Akara gives that trust a
                structure.
              </p>
            </div>
          </Reveal>

          <div className="flex items-center justify-center gap-4 sm:gap-5">
            {BAND_PHOTOS.map((photo, i) => (
              <Reveal key={photo.image.src} delay={0.1 + i * 0.12}>
                <div
                  className={`relative h-56 w-40 overflow-hidden rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:h-72 sm:w-52 ${photo.rotate} ${photo.offset} transition-transform duration-500 hover:scale-[1.04] hover:rotate-0`}
                >
                  <Image
                    src={photo.image.src}
                    alt={photo.image.alt}
                    fill
                    sizes="208px"
                    className="object-cover"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"
                  />
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
