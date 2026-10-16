import showsJson from "@/data/shows.json";
import tourJson from "@/data/tour.json";
import musicJson from "@/data/music.json";

export type ShowStatus = "touring" | "coming" | "tba";
export interface MediaRef {
  video?: string; // path without extension: .webm + .mp4
  poster: string; // path without extension: .avif + .webp + .jpg
}
export interface Show {
  slug: string;
  status: ShowStatus;
  title: string;
  subtitle: string;
  logline: string;
  synopsis: string[];
  highlights: string[];
  facts: { duration?: string; age?: string };
  accent: string;
  media: { card?: MediaRef; hero?: MediaRef; extra?: MediaRef };
  track: string | null;
  copyStatus: string;
}
export interface TourDate {
  id: string;
  show: string;
  date: string;
  time: string;
  city: string;
  country: string;
  venue: string;
  lat: number | null; // map position; events without one are listed but not drawn
  lon: number | null;
  tickets: string | null;
  status: "on_sale" | "sold_out" | "cancelled";
  placeholder: boolean; // sample dates from tour.json (shown with a "sample" badge, never as schema.org events)
}
export interface Track {
  id: string;
  show: string;
  title: string;
  note: string;
  src: string;
  duration: number;
}

export const shows = showsJson.shows as Show[];
// The tour dates file: the seed for the admin's database, and the fallback when no database is set up.
export const tour: TourDate[] = tourJson.dates
  .map((d) => ({ ...d, status: "on_sale" as const }))
  .sort((a, b) => a.date.localeCompare(b.date));
export const tracks = musicJson.tracks as Track[];

export const getShow = (slug: string) => shows.find((s) => s.slug === slug);
export const trackFor = (id: string | null) => (id ? tracks.find((t) => t.id === id) : undefined);
