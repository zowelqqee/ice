import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getShow, shows, trackFor } from "@/lib/data";
import { upcomingEvents } from "@/lib/events";
import { ShowPage } from "@/components/shows/ShowPage";
import { eventsJsonLd } from "@/components/tour/TourSection";
import { getDictionary } from "@/i18n";

// Dates come from the admin; a save refreshes the page at once, this is the safety net.
// (No `dynamicParams = false`: with it, Next 15 answers 404 for these pages after a revalidation.
// Unknown slugs still get a 404 from notFound() below.)
export const revalidate = 3600;

export function generateStaticParams() {
  return shows.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const show = getShow(slug);
  if (!show) return {};
  const title = `${show.title} ${show.subtitle}`;
  const image = show.media.hero?.poster ?? show.media.card?.poster;
  return {
    title,
    description: show.logline,
    alternates: { canonical: `/shows/${show.slug}` },
    openGraph: { title, description: show.logline, images: image ? [{ url: `${image}.jpg` }] : undefined },
  };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const show = getShow(slug);
  if (!show) notFound();
  const i = shows.indexOf(show);
  const next = shows[(i + 1) % shows.length];
  const t = getDictionary("en");
  const dates = (await upcomingEvents()).filter((d) => d.show === show.slug);
  const events = eventsJsonLd(dates);
  return (
    <>
      <ShowPage show={show} next={next} dates={dates} track={trackFor(show.track)} t={t.shows} tTour={t.tour} />
      {events.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(events) }} />}
    </>
  );
}
