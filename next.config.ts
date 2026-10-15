import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // lets a production build run beside `next dev` without sharing .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/media/:path*",
        // a day, refreshed in the background (orchestra samples carry content hashes in their names)
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
