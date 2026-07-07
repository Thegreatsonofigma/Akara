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
    src: unsplash("photo-1523240795612-9a054b0db644"),
    alt: "Two students working through coursework together",
  },
  freelancer: {
    src: unsplash("photo-1573496359142-b8d87734a5a2"),
    alt: "Freelancer working on her laptop",
  },
  traveler: {
    src: unsplash("photo-1436491865332-7a61a109cc05"),
    alt: "View of an airplane wing above the clouds through a cabin window",
  },
  community: {
    src: unsplash("photo-1529156069898-49953e39b3ac"),
    alt: "Friends arm in arm looking out at the water",
  },
  team: {
    src: unsplash("photo-1522202176988-66273c2fd55f"),
    alt: "People collaborating around a table with laptops",
  },
  worker: {
    src: unsplash("photo-1488085061387-422e29b40080"),
    alt: "Traveler with a suitcase at an airport gate, plane waiting outside",
  },
} satisfies Record<string, StockImage>;
