// PLACEHOLDER values are marked; replace before launch.

/** Canonical origin: NEXT_PUBLIC_SITE_URL when set; on Vercel, the project's production domain
 *  (the custom domain once one is attached, otherwise *.vercel.app); else the placeholder. */
function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return "https://musicalonice.example"; // PLACEHOLDER domain
}

export const site = {
  name: "Musical on Ice",
  url: siteUrl(),
  social: {
    youtube: "https://www.youtube.com/@MUSICALONICE-f3b",
    instagram: "https://instagram.com/musicalonice",
  },
  contact: {
    booking: "booking@musicalonice.example", // PLACEHOLDER
    press: "press@musicalonice.example", // PLACEHOLDER
  },
};
