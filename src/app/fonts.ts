import localFont from "next/font/local";

// Self-hosted, OFL. Latin + Latin-Ext only (EN/DE/FR/ES/IT). Upright only: the site uses no italics.
export const display = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "../fonts/instrument-serif-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/instrument-serif-latin-ext-400-normal.woff2", weight: "400", style: "normal" },
  ],
});

export const sans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "../fonts/geist-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/geist-latin-ext-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
});

export const mono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [{ path: "../fonts/geist-mono-latin-wght-normal.woff2", weight: "100 900", style: "normal" }],
});
