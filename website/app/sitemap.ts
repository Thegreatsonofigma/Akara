import type { MetadataRoute } from "next";
import { LEGAL_DOCS } from "@/lib/legal-content";
import { SITE } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ["", "/trust", "/support", "/legal"].map((path) => ({
    url: `${SITE.url}${path}`,
    changeFrequency: "monthly" as const,
    priority: path === "" ? 1 : 0.7,
  }));

  const legalRoutes = LEGAL_DOCS.map((doc) => ({
    url: `${SITE.url}/legal/${doc.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.5,
  }));

  return [...staticRoutes, ...legalRoutes];
}
