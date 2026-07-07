"use client";

import { useRef } from "react";
import Image from "next/image";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useReducedMotion } from "motion/react";
import { Reveal } from "@/components/motion/Reveal";
import { IMAGES, type StockImage } from "@/lib/images";

type Slide = {
  eyebrow: string;
  headline: string;
  image: StockImage;
};

const SLIDES: Slide[] = [
  {
    eyebrow: "Students abroad",
    headline: "School fees paid from Lagos, received in Kigali.",
    image: IMAGES.students,
  },
  {
    eyebrow: "Freelancers",
    headline: "Earn in one currency. Live in another.",
    image: IMAGES.freelancer,
  },
  {
    eyebrow: "Travelers",
    headline: "Land with local money already lined up.",
    image: IMAGES.traveler,
  },
  {
    eyebrow: "Expats & communities",
    headline: "Swap inside a circle that's actually verified.",
    image: IMAGES.community,
  },
  {
    eyebrow: "Cross-border workers",
    headline: "Recurring swaps, always on record.",
    image: IMAGES.team,
  },
];

/* Aligns the carousel's first card with the page container edge while
   letting the track bleed to the viewport edge. Inline style (not a
   Tailwind arbitrary value) because calc needs spaces around operators. */
const EDGE_PAD_STYLE: React.CSSProperties = {
  paddingInline: "max(1.25rem, calc((100vw - 72rem) / 2))",
};

export function WhyCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const scrollByCard = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-slide]");
    const width = card ? card.getBoundingClientRect().width + 20 : 600;
    track.scrollBy({
      left: direction * width,
      behavior: reduced ? "auto" : "smooth",
    });
  };

  return (
    <section className="relative overflow-hidden bg-black py-20 text-white sm:py-28">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_50%_at_15%_30%,rgba(157,255,30,0.07),transparent_65%)]"
      />

      <div className="relative" style={EDGE_PAD_STYLE}>
        <Reveal>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-brand"
                />
                Why this matters
              </p>
              <h2 className="max-w-xl text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
                Money moves where{" "}
                <span className="text-brand">people move.</span>
              </h2>
              <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-white/55 sm:text-lg">
                Lagos to Kigali. Accra to Nairobi. Douala to everywhere —
                Akara gives that trust a structure.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                aria-label="Previous story"
                onClick={() => scrollByCard(-1)}
                className="flex size-12 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:border-brand/60 hover:text-brand"
              >
                <CaretLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next story"
                onClick={() => scrollByCard(1)}
                className="flex size-12 items-center justify-center rounded-full border border-white/15 text-white transition-colors hover:border-brand/60 hover:text-brand"
              >
                <CaretRight size={20} aria-hidden="true" />
              </button>
            </div>
          </div>
        </Reveal>
      </div>

      <div
        ref={trackRef}
        role="region"
        aria-label="Who Akara is for"
        tabIndex={0}
        className="no-scrollbar relative flex snap-x snap-mandatory gap-5 overflow-x-auto pb-2"
        style={{
          ...EDGE_PAD_STYLE,
          scrollPaddingInline: "max(1.25rem, calc((100vw - 72rem) / 2))",
        }}
      >
        {SLIDES.map((slide) => (
          <article
            key={slide.eyebrow}
            data-slide
            className="group relative aspect-[4/3] w-[82vw] shrink-0 snap-start overflow-hidden rounded-[2rem] bg-surface-2 ring-1 ring-white/10 sm:aspect-[16/11] sm:w-[560px] lg:w-[640px]"
          >
            <Image
              src={slide.image.src}
              alt={slide.image.alt}
              fill
              sizes="(max-width: 640px) 82vw, 640px"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
            {/* black gradient bed for the layered text */}
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10"
            />
            <p className="absolute left-6 top-6 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 sm:left-8 sm:top-8">
              {slide.eyebrow}
            </p>
            <h3 className="absolute bottom-6 left-6 right-6 max-w-md text-balance text-2xl font-bold leading-snug text-white sm:bottom-8 sm:left-8 sm:text-3xl">
              {slide.headline}
            </h3>
          </article>
        ))}
      </div>
    </section>
  );
}
