import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { datesFor, getShow, shows, trackFor } from "@/lib/data";
import { ShowPage } from "@/components/shows/ShowPage";
import { eventsJsonLd } from "@/components/tour/TourSection";
import { getDictionary } from "@/i18n";

export const dynamicParams = false;

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
  const dates = datesFor(show.slug);
  const events = eventsJsonLd(dates);
  return (
    <>
      <ShowPage show={show} next={next} dates={dates} track={trackFor(show.track)} t={t.shows} tTour={t.tour} />
      {events.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(events) }} />}
    </>
  );
}
