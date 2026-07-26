import type { MetadataRoute } from "next";
import { LEGAL_DOCS } from "@/lib/legal-content";
import { SEO_GUIDES } from "@/lib/seo-guides";
import { SEO_CORRIDORS, SITE } from "@/lib/site";

const corridorSlug = (from: string, to: string) =>
  `${from.toLowerCase()}-${to.toLowerCase()}`;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const staticRoutes = [
    { path: "", priority: 1, changeFrequency: "weekly" as const },
    { path: "/exchange", priority: 0.84, changeFrequency: "weekly" as const },
    { path: "/guides", priority: 0.82, changeFrequency: "weekly" as const },
    { path: "/trust", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/support", priority: 0.7, changeFrequency: "monthly" as const },
    { path: "/legal", priority: 0.7, changeFrequency: "monthly" as const },
  ].map(({ path, priority, changeFrequency }) => ({
    url: `${SITE.url}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));

  const legalRoutes = LEGAL_DOCS.map((doc) => ({
    url: `${SITE.url}/legal/${doc.slug}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  const corridorRoutes = SEO_CORRIDORS.map((corridor) => ({
    url: `${SITE.url}/exchange/${corridorSlug(corridor.from, corridor.to)}`,
    lastModified,
    changeFrequency: "weekly" as const,
    priority: 0.75,
  }));

  const guideRoutes = SEO_GUIDES.map((guide) => ({
    url: `${SITE.url}/guides/${guide.slug}`,
    lastModified,
    changeFrequency: "monthly" as const,
    priority: 0.72,
  }));

  return [...staticRoutes, ...corridorRoutes, ...guideRoutes, ...legalRoutes];
}
