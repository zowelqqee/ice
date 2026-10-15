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
  lat: number;
  lon: number;
  tickets: string | null;
  placeholder: boolean;
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
export const tour = (tourJson.dates as TourDate[]).slice().sort((a, b) => a.date.localeCompare(b.date));
export const tracks = musicJson.tracks as Track[];

export const getShow = (slug: string) => shows.find((s) => s.slug === slug);
export const datesFor = (slug: string) => tour.filter((d) => d.show === slug);
export const trackFor = (id: string | null) => (id ? tracks.find((t) => t.id === id) : undefined);
