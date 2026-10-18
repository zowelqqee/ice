import type { NextConfig } from "next";

// Uploaded media is served at /u/* on the site's own domain. With Vercel Blob (a public store,
// BLOB_READ_WRITE_TOKEN set when the store is connected) these requests are proxied to the store;
// otherwise src/app/u/[...path]/route.ts serves them from this server's disk. Same rule as
// blobOrigin() in src/lib/storage.ts (the store id is the fourth part of the token).
const blobStore = process.env.BLOB_READ_WRITE_TOKEN?.trim().split("_")[3];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // database drivers, image and video tools stay plain Node modules (native bindings, binaries)
  serverExternalPackages: ["@libsql/client", "libsql", "postgres", "sharp", "ffmpeg-static"],
  // the ffmpeg binary is not imported, only run: ship it with the media route
  outputFileTracingIncludes: { "/admin/api/media": ["./node_modules/ffmpeg-static/ffmpeg"] },
  async rewrites() {
    return {
      beforeFiles: blobStore ? [{ source: "/u/:path*", destination: `https://${blobStore}.public.blob.vercel-storage.com/u/:path*` }] : [],
      afterFiles: [],
      fallback: [],
    };
  },
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
