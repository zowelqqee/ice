import "server-only";
import { COUNTRIES } from "@/lib/countries";
import { allShows } from "@/lib/content";
import { knownPlaces, STATUS_LABEL } from "@/lib/events";
import { EVENT_STATUSES } from "@/lib/db/schema";

/** Choices for the event form; the shows come from src/data/shows.json. */
export async function formOptions() {
  return {
    shows: (await allShows()).map((s) => ({ slug: s.slug, label: `${s.title} ${s.subtitle}`.trim() + (s.published ? "" : " (hidden)") })),
    countries: COUNTRIES,
    statuses: EVENT_STATUSES.map((value) => ({ value, label: STATUS_LABEL[value] })),
    places: await knownPlaces(),
  };
}
