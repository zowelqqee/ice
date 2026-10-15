import { HomeIntro } from "@/components/HomeIntro";
import { ShowsSection } from "@/components/shows/ShowsSection";
import { TourSection } from "@/components/tour/TourSection";
import { MusicSection } from "@/components/music/MusicSection";
import { getDictionary } from "@/i18n";
import { site } from "@/lib/site";

export default function Page() {
  const t = getDictionary("en");
  const org = {
    "@context": "https://schema.org",
    "@type": "PerformingGroup",
    name: site.name,
    url: site.url,
    logo: `${site.url}/brand/logo-white.png`,
    sameAs: [site.social.youtube, site.social.instagram],
  };
  return (
    <main>
      <HomeIntro t={t} />
      <ShowsSection t={t.shows} />
      <TourSection t={t.tour} />
      <MusicSection t={t.music} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />
    </main>
  );
}
