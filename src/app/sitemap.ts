import type { MetadataRoute } from "next";
import { shows } from "@/lib/data";
import { lastEventChange } from "@/lib/events";
import { site } from "@/lib/site";

// Regenerated with the pages when an event is saved (and hourly); the admin is never listed.
export const revalidate = 3600;
const BUILT = new Date();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const changed = await lastEventChange();
  const lastModified = changed && changed > BUILT ? changed : BUILT;
  return [
    { url: `${site.url}/`, lastModified, changeFrequency: "weekly", priority: 1 },
    ...shows.map((s) => ({
      url: `${site.url}/shows/${s.slug}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: s.status === "touring" ? 0.8 : 0.4,
    })),
  ];
}
