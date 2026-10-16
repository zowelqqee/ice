import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  // Vercel preview deployments stay out of search engines; production (or any non-Vercel host) is open
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return { rules: [{ userAgent: "*", allow: "/" }], sitemap: `${site.url}/sitemap.xml`, host: site.url };
}
