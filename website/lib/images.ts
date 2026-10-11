/**
 * Central photography registry.
 *
 * Audience photography is stored locally so these storytelling cards never
 * collapse when a third-party image host is slow, blocked, or unavailable.
 */

export type StockImage = {
  src: string;
  alt: string;
};

export const IMAGES = {
  heroPortrait: {
    src: "/hero-portrait.jpg",
    alt: "Young man smiling while looking at his phone",
  },
  students: {
    src: "/audiences/students.jpg",
    alt: "Two students working through coursework together",
  },
  freelancer: {
    src: "/audiences/freelancer.jpg",
    alt: "Freelancer working on her laptop",
  },
  traveler: {
    src: "/audiences/traveler.jpg",
    alt: "View of an airplane wing above the clouds through a cabin window",
  },
  community: {
    src: "/audiences/community.jpg",
    alt: "Friends arm in arm looking out at the water",
  },
  team: {
    src: "/audiences/team.jpg",
    alt: "People collaborating around a table with laptops",
  },
  worker: {
    src: "/audiences/worker.jpg",
    alt: "Traveler with a suitcase at an airport gate, plane waiting outside",
  },
} satisfies Record<string, StockImage>;
