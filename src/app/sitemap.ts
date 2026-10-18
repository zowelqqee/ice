import type { MetadataRoute } from "next";
import { getShows, lastContentChange } from "@/lib/content";
import { lastEventChange } from "@/lib/events";
import { site } from "@/lib/site";

// Regenerated with the pages when the admin saves anything (and hourly); the admin is never listed.
export const revalidate = 3600;
const BUILT = new Date();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [shows, events, content] = await Promise.all([getShows(), lastEventChange(), lastContentChange()]);
  const lastModified = new Date(Math.max(BUILT.getTime(), events?.getTime() ?? 0, content?.getTime() ?? 0));
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
