import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { upcomingEvents } from "@/lib/events";
import { getDict, getShowBySlug, getShows, getSiteSettings, getTracks } from "@/lib/content";
import { ShowPage } from "@/components/shows/ShowPage";
import { eventsJsonLd } from "@/components/tour/TourSection";

// Dates come from the admin; a save refreshes the page at once, this is the safety net.
// (No `dynamicParams = false`: with it, Next 15 answers 404 for these pages after a revalidation.
// Unknown slugs still get a 404 from notFound() below.)
export const revalidate = 3600;

export async function generateStaticParams() {
  return (await getShows()).map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const show = await getShowBySlug(slug);
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
  const [shows, tracks, t, settings] = await Promise.all([getShows(), getTracks(), getDict(), getSiteSettings()]);
  const show = shows.find((s) => s.slug === slug);
  if (!show) notFound();
  const i = shows.indexOf(show);
  const next = shows[(i + 1) % shows.length];
  const dates = (await upcomingEvents()).filter((d) => d.show === show.slug);
  const events = eventsJsonLd(dates, shows, settings.ogImage);
  const track = show.track ? tracks.find((tr) => tr.id === show.track) : undefined;
  return (
    <>
      <ShowPage show={show} next={next} dates={dates} track={track} t={t.shows} tTour={t.tour} />
      {events.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(events) }} />}
    </>
  );
}
