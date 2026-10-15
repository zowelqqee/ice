import { buildTourMap, MAP_H, MAP_W } from "@/lib/map";
import { shows, tour, type TourDate } from "@/lib/data";
import { site } from "@/lib/site";
import { TourView } from "./TourView";
import type { Dictionary } from "@/i18n";

/** schema.org events for confirmed dates only (placeholders are never published as events). */
export function eventsJsonLd(dates: TourDate[]) {
  return dates
    .filter((d) => !d.placeholder)
    .map((d) => {
      const show = shows.find((s) => s.slug === d.show);
      return {
        "@context": "https://schema.org",
        "@type": "TheaterEvent",
        name: `${show?.title ?? ""} ${show?.subtitle ?? ""}: Musical on Ice`.trim(),
        startDate: `${d.date}T${d.time}`,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: { "@type": "Place", name: d.venue, address: { "@type": "PostalAddress", addressLocality: d.city, addressCountry: d.country } },
        image: [`${site.url}/og.jpg`],
        description: show?.logline,
        performer: { "@type": "PerformingGroup", name: site.name },
        organizer: { "@type": "Organization", name: site.name, url: site.url },
        ...(d.tickets ? { offers: { "@type": "Offer", url: d.tickets, availability: "https://schema.org/InStock" } } : {}),
      };
    });
}

export function TourSection({ t }: { t: Dictionary["tour"] }) {
  const { stops, route } = buildTourMap(tour);
  const info = shows.map(({ slug, title, subtitle, accent }) => ({ slug, title, subtitle, accent }));
  const events = eventsJsonLd(tour);
  return (
    <section id="tour" aria-labelledby="tour-title" className="relative px-[var(--gutter)] py-28 md:py-40">
      <p className="eyebrow mb-6">{t.eyebrow}</p>
      <h2 id="tour-title" className="display mb-16 text-[16vw] md:mb-24 md:text-[8.8vw]">
        {t.title} <em className="text-accent">{t.titleItalic}</em>
      </h2>
      <TourView t={t} dates={tour} shows={info} map={{ stops, route }} width={MAP_W} height={MAP_H} />
      {events.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(events) }} />
      )}
    </section>
  );
}
