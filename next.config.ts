import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // database drivers stay plain Node modules (native SQLite binding, sockets)
  serverExternalPackages: ["@libsql/client", "libsql", "postgres"],
  // lets a production build run beside `next dev` without sharing .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    // a day, refreshed in the background (orchestra samples carry content hashes in their names;
    // the hero posters and model are re-fetched within a day of a change)
    const cache = [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }];
    return [
      { source: "/media/:path*", headers: cache },
      { source: "/models/:path*", headers: cache },
      // the admin never appears in search results (and is not listed in robots.txt or the sitemap)
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }, { key: "Cache-Control", value: "no-store" }] },
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }, { key: "Cache-Control", value: "no-store" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
