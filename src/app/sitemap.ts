import type { MetadataRoute } from "next";
import { shows } from "@/lib/data";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${site.url}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    ...shows.map((s) => ({
      url: `${site.url}/shows/${s.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: s.status === "touring" ? 0.8 : 0.4,
    })),
  ];
}
