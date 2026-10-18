import { HomeIntro } from "@/components/HomeIntro";
import { ShowsSection } from "@/components/shows/ShowsSection";
import { TourSection } from "@/components/tour/TourSection";
import { MusicSection } from "@/components/music/MusicSection";
import { getDict, getShows, getSiteSettings, getTracks } from "@/lib/content";
import { site } from "@/lib/site";

// content comes from the admin; a save refreshes the page at once, this is the safety net
export const revalidate = 3600;

export default async function Page() {
  const [t, shows, tracks, settings] = await Promise.all([getDict(), getShows(), getTracks(), getSiteSettings()]);
  const org = {
    "@context": "https://schema.org",
    "@type": "PerformingGroup",
    name: site.name,
    url: site.url,
    logo: `${site.url}/brand/logo-white.png`,
    sameAs: [settings.social.youtube, settings.social.instagram].filter(Boolean),
  };
  return (
    <main>
      <HomeIntro t={t} />
      <ShowsSection t={t.shows} shows={shows} />
      <TourSection t={t.tour} />
      <MusicSection
        t={t.music}
        tracks={tracks}
        shows={shows.map(({ slug, title, subtitle, accent }) => ({ slug, title, subtitle, accent }))}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
    </main>
  );
}
