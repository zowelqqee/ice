import showsJson from "@/data/shows.json";
import tourJson from "@/data/tour.json";
import musicJson from "@/data/music.json";

export type ShowStatus = "touring" | "coming" | "tba";
export interface MediaRef {
  video?: string; // path without extension: .webm + .mp4 (uploads: .mp4 only, see formats)
  poster: string; // path without extension: .avif + .webp + .jpg
  formats?: ("webm" | "mp4")[]; // video files that exist (default: both)
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
  copyStatus?: string; // in shows.json only (draft copy awaiting approval)
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
  show: string | null;
  title: string;
  note: string;
  src: string;
  duration: number;
}

// The files in src/data/: the first fill of the admin's database, and what the site shows when no
// database is set up. The site reads content through src/lib/content.ts, never from here directly.
export const fileShows = showsJson.shows as Show[];
export const tour: TourDate[] = tourJson.dates
  .map((d) => ({ ...d, status: "on_sale" as const }))
  .sort((a, b) => a.date.localeCompare(b.date));
export const fileTracks = musicJson.tracks as Track[];
