import type { Metadata, Viewport } from "next";
import "./globals.css";
import { display, mono, sans } from "./fonts";
import { getDictionary } from "@/i18n";
import { site } from "@/lib/site";

const t = getDictionary();

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: t.meta.title, template: `%s · ${site.name}` },
  description: t.meta.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: t.meta.title,
    description: t.meta.description,
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "A skater in silhouette on glowing ice" }],
  },
  twitter: { card: "summary_large_image", title: t.meta.title, description: t.meta.description },
  icons: { icon: "/icon.svg" },
};

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
