import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, max } from "drizzle-orm";
import { shows, tour as tourFile, type TourDate } from "@/lib/data";
import { COUNTRY_CODES } from "@/lib/countries";
import { dbStatus, getDb } from "@/lib/db";
import { EVENT_STATUSES, type EventRow, type EventStatus } from "@/lib/db/schema";

// Tour events: the admin's repository, its validation, and what the public site reads.

export type { EventRow, EventStatus };
export const STATUS_LABEL: Record<EventStatus, string> = { on_sale: "On sale", sold_out: "Sold out", cancelled: "Cancelled" };

export interface EventInput {
  show: string;
  date: string;
  time: string;
  city: string;
  country: string;
  venue: string;
  tickets: string | null;
  status: EventStatus;
  published: boolean;
  lat: number | null;
  lon: number | null;
}

// ---------------------------------------------------------------- validation
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CYRILLIC = /[\u0400-\u052F\u1C80-\u1C8F\u2DE0-\u2DFF\uA640-\uA69F]/;

export type FieldErrors = Partial<Record<keyof EventInput | "form", string>>;

function validDate(s: string) {
  if (!DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim().replace(/\s+/g, " ");
}

/** Parse and check a submitted event form. */
export function parseEvent(form: FormData): { ok: true; value: EventInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const show = text(form, "show");
  const date = text(form, "date");
  const time = text(form, "time");
  const city = text(form, "city");
  const country = text(form, "country").toUpperCase();
  const venue = text(form, "venue");
  const ticketsRaw = text(form, "tickets");
  const status = text(form, "status") as EventStatus;
  const published = form.get("published") === "on";
  const latRaw = text(form, "lat");
  const lonRaw = text(form, "lon");

  if (!shows.some((s) => s.slug === show)) errors.show = "Choose a show.";
  if (!validDate(date)) errors.date = "Enter a valid date.";
  if (!TIME.test(time)) errors.time = "Enter a time as HH:MM (24 h).";
  for (const [key, value, label] of [
    ["city", city, "City"],
    ["venue", venue, "Venue"],
  ] as const) {
    if (!value) errors[key] = `${label} is required.`;
    else if (value.length > 120) errors[key] = `${label} is too long.`;
    else if (CYRILLIC.test(value)) errors[key] = "Use Latin characters.";
  }
  if (!COUNTRY_CODES.includes(country)) errors.country = "Choose a country.";
  let tickets: string | null = null;
  if (ticketsRaw) {
    try {
      const u = new URL(ticketsRaw);
      if (u.protocol !== "https:") errors.tickets = "The ticket link must start with https://";
      else tickets = u.toString();
    } catch {
      errors.tickets = "Enter a full link, starting with https://";
    }
  }
  if (!EVENT_STATUSES.includes(status)) errors.status = "Choose a status.";
  let lat: number | null = null;
  let lon: number | null = null;
  if (latRaw || lonRaw) {
    lat = Number(latRaw);
    lon = Number(lonRaw);
    if (!latRaw || !lonRaw || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      errors.lat = "Give both latitude (-90…90) and longitude (-180…180), or leave both empty.";
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { show, date, time, city, country, venue, tickets, status, published, lat, lon } };
}

// ---------------------------------------------------------------- admin repository
// Event ids are UUIDs (or the slugs of the first fill from tour.json). Anything else coming from a
// URL or a form is refused before it reaches the database (values are bound parameters anyway).
const ID = /^[A-Za-z0-9-]{1,64}$/;
export const isEventId = (id: unknown): id is string => typeof id === "string" && ID.test(id);

export async function listEvents(order: "asc" | "desc" = "asc"): Promise<EventRow[]> {
  const { db, events } = await getDb();
  const dir = order === "asc" ? asc : desc;
  return db.select().from(events).orderBy(dir(events.date), dir(events.time));
}

export async function getEvent(id: string): Promise<EventRow | undefined> {
  if (!isEventId(id)) return undefined;
  const { db, events } = await getDb();
  const [row] = await db.select().from(events).where(eq(events.id, id));
  return row;
}

/** A city already on the list lends its map position to new events there. */
async function withKnownPosition(input: EventInput): Promise<EventInput> {
  if (input.lat !== null) return input;
  const { db, events } = await getDb();
  const rows = await db.select({ city: events.city, country: events.country, lat: events.lat, lon: events.lon }).from(events);
  const hit = rows.find(
    (r) => r.lat !== null && r.lon !== null && r.country === input.country && r.city.toLowerCase() === input.city.toLowerCase(),
  );
  return hit ? { ...input, lat: hit.lat, lon: hit.lon } : input;
}

export async function createEvent(input: EventInput): Promise<string> {
  const { db, events } = await getDb();
  const now = Date.now();
  const id = randomUUID();
  await db.insert(events).values({ id, ...(await withKnownPosition(input)), createdAt: now, updatedAt: now });
  return id;
}

export async function updateEvent(id: string, input: EventInput) {
  if (!isEventId(id)) return;
  const { db, events } = await getDb();
  await db
    .update(events)
    .set({ ...(await withKnownPosition(input)), updatedAt: Date.now() })
    .where(eq(events.id, id));
}

export async function deleteEvent(id: string) {
  if (!isEventId(id)) return;
  const { db, events } = await getDb();
  await db.delete(events).where(eq(events.id, id));
}

/** A copy as an unpublished draft (typically then given a new date). */
export async function duplicateEvent(id: string): Promise<string | null> {
  const src = await getEvent(id);
  if (!src) return null;
  const { db, events } = await getDb();
  const now = Date.now();
  const copy = { ...src, id: randomUUID(), published: false, createdAt: now, updatedAt: now };
  await db.insert(events).values(copy);
  return copy.id;
}

/** Cities already on the list, with country and map position (for the form's suggestions). */
export async function knownPlaces() {
  const rows = await listEvents();
  const seen = new Map<string, { city: string; country: string; lat: number | null; lon: number | null }>();
  for (const r of rows) {
    const k = `${r.city.toLowerCase()}|${r.country}`;
    if (!seen.has(k) || (seen.get(k)!.lat === null && r.lat !== null)) seen.set(k, { city: r.city, country: r.country, lat: r.lat, lon: r.lon });
  }
  return [...seen.values()].sort((a, b) => a.city.localeCompare(b.city, "en"));
}

// ---------------------------------------------------------------- public site
/** Events stay listed through their day, wherever the venue is; then they drop off. */
export function cutoffDate() {
  return new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Upcoming published events, oldest first. Without a usable database (or if it fails), the
 *  dates in src/data/tour.json, as before the admin existed. */
export async function upcomingEvents(): Promise<TourDate[]> {
  const cutoff = cutoffDate();
  if (dbStatus().ok) {
    try {
      const { db, events } = await getDb();
      const rows = await db
        .select()
        .from(events)
        .where(and(eq(events.published, true), gte(events.date, cutoff)))
        .orderBy(asc(events.date), asc(events.time));
      return rows.map((r) => ({
        id: r.id,
        show: r.show,
        date: r.date,
        time: r.time,
        city: r.city,
        country: r.country,
        venue: r.venue,
        lat: r.lat,
        lon: r.lon,
        tickets: r.tickets,
        status: r.status,
        placeholder: false,
      }));
    } catch (e) {
      console.error("[events] database unavailable, using src/data/tour.json", e);
    }
  }
  return tourFile.filter((d) => d.date >= cutoff);
}

/** When the public list last changed (for the sitemap). */
export async function lastEventChange(): Promise<Date | null> {
  if (!dbStatus().ok) return null;
  try {
    const { db, events } = await getDb();
    const [{ t }] = await db.select({ t: max(events.updatedAt) }).from(events).where(eq(events.published, true));
    return t ? new Date(Number(t)) : null;
  } catch {
    return null;
  }
}
