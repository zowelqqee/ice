import type { Metadata, Viewport } from "next";
import "./globals.css";
import { display, mono, sans } from "./fonts";
import { getDict, getSiteSettings } from "@/lib/content";
import { site } from "@/lib/site";

/** Title, description and share image come from the admin (Texts and Settings). */
export async function generateMetadata(): Promise<Metadata> {
  const [t, settings] = await Promise.all([getDict(), getSiteSettings()]);
  const image = settings.ogImage ? `${settings.ogImage}.jpg` : "/og.jpg";
  return {
    metadataBase: new URL(site.url),
    title: { default: t.meta.title, template: `%s · ${site.name}` },
    description: t.meta.description,
    applicationName: site.name,
    openGraph: {
      type: "website",
      siteName: site.name,
      title: t.meta.title,
      description: t.meta.description,
      images: [{ url: image, width: 1200, height: 630, alt: settings.ogImage ? site.name : "A skater in silhouette on glowing ice" }],
    },
    twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description },
    icons: { icon: "/icon.svg" },
  };
}

export const viewport: Viewport = {
  themeColor: "#04060b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
