/**
 * Central stock photography registry (Unsplash, free license).
 *
 * Every photo on the site resolves through this file, so swapping imagery
 * is a one-line change. URLs are bare — sizing/quality params are applied
 * by next/image. Review each photo before launch and replace any that
 * don't fit the brand by changing its `id`.
 */

const unsplash = (id: string) => `https://images.unsplash.com/${id}`;

export type StockImage = {
  src: string;
  alt: string;
};

export const IMAGES = {
  heroPortrait: {
    src: unsplash("photo-1531384441138-2736e62e0919"),
    alt: "Young man smiling while looking at his phone",
  },
  students: {
    src: unsplash("photo-1523050854058-8df90110c9f1"),
    alt: "Graduates celebrating and throwing their caps",
  },
  freelancer: {
    src: unsplash("photo-1573164713988-8665fc963095"),
    alt: "Freelancer working on a laptop",
  },
  traveler: {
    src: unsplash("photo-1488646953014-85cb44e25828"),
    alt: "Traveler with a backpack looking out at the journey ahead",
  },
  community: {
    src: unsplash("photo-1529156069898-49953e39b3ac"),
    alt: "Friends laughing together outdoors",
  },
  team: {
    src: unsplash("photo-1521737604893-d14cc237f11d"),
    alt: "A team joining hands over a workspace",
  },
  worker: {
    src: unsplash("photo-1560250097-0b93528c311a"),
    alt: "Professional in a suit, portrait",
  },
  market: {
    src: unsplash("photo-1522202176988-66273c2fd55f"),
    alt: "People working together around a table",
  },
} satisfies Record<string, StockImage>;
