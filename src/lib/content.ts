import "server-only";
import { cache } from "react";
import { asc, count, eq, max } from "drizzle-orm";
import { fileShows, fileTracks, type MediaRef, type Show, type Track } from "@/lib/data";
import { dbStatus, getDb } from "@/lib/db";
import { SHOW_STATUSES, type ShowRow, type ShowStatus, type TrackRow } from "@/lib/db/schema";
import en, { type Dictionary } from "@/i18n/en";
import { getDictionary, mergeDictionary } from "@/i18n";
import { site } from "@/lib/site";
import { deleteFiles } from "@/lib/storage";
import { storedFiles } from "@/lib/media";

// The site's content (shows, music, interface texts, contacts) from the admin's database, with
// the files in src/data/, src/i18n/en.ts and src/lib/site.ts as the first fill and as the
// fallback when no database is set up (or it fails). Tour dates live in src/lib/events.ts.

export interface AdminShow extends Show {
  published: boolean;
  position: number;
  updatedAt: number;
}
export interface AdminTrack extends Track {
  published: boolean;
  position: number;
  updatedAt: number;
}
export interface SiteSettings {
  contact: { booking: string; press: string };
  social: { youtube: string; instagram: string };
  ogImage: string | null; // path without extension; the .jpg is used for link previews
}

const parseJson = <T,>(s: string, fallback: T): T => {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

function toShow(r: ShowRow): AdminShow {
  return {
    slug: r.slug,
    status: r.status,
    title: r.title,
    subtitle: r.subtitle,
    logline: r.logline,
    synopsis: parseJson<string[]>(r.synopsis, []),
    highlights: parseJson<string[]>(r.highlights, []),
    facts: { duration: r.duration || undefined, age: r.age || undefined },
    accent: r.accent,
    media: parseJson<Show["media"]>(r.media, {}),
    track: r.track,
    published: r.published,
    position: r.position,
    updatedAt: Number(r.updatedAt),
  };
}

function toTrack(r: TrackRow): AdminTrack {
  return {
    id: r.id,
    show: r.show,
    title: r.title,
    note: r.note,
    src: r.src,
    duration: Number(r.duration),
    published: r.published,
    position: r.position,
    updatedAt: Number(r.updatedAt),
  };
}

async function withDb<T>(read: () => Promise<T>, fallback: () => T): Promise<T> {
  if (!dbStatus().ok) return fallback();
  try {
    return await read();
  } catch (e) {
    console.error("[content] database unavailable, using the files in src/", e);
    return fallback();
  }
}

const SITE_DEFAULTS: SiteSettings = { contact: { ...site.contact }, social: { ...site.social }, ogImage: null };

// ================================================================ public site
/** Shows on the site, in order (hidden ones left out). */
export const getShows = cache(() =>
  withDb<Show[]>(async () => (await allShows()).filter((s) => s.published), () => fileShows),
);
export const getShowBySlug = async (slug: string) => (await getShows()).find((s) => s.slug === slug);

/** Music tracks on the site, in order. */
export const getTracks = cache(() =>
  withDb<Track[]>(async () => (await allTracks()).filter((t) => t.published), () => fileTracks),
);

export const getSiteSettings = cache(() =>
  withDb<SiteSettings>(async () => {
    const saved = await readSetting<Partial<SiteSettings>>("site");
    return {
      contact: { ...SITE_DEFAULTS.contact, ...saved?.contact },
      social: { ...SITE_DEFAULTS.social, ...saved?.social },
      ogImage: saved?.ogImage ?? null,
    };
  }, () => SITE_DEFAULTS),
);

/** Interface texts: src/i18n/en.ts with the admin's changes on top. */
export const getDict = cache(async (): Promise<Dictionary> => {
  const overrides = await withDb(() => textOverrides(), () => ({}));
  return mergeDictionary(getDictionary(), overrides);
});

/** When the public content last changed (for the sitemap). */
export async function lastContentChange(): Promise<Date | null> {
  return withDb(async () => {
    const { db, shows, tracks, settings } = await getDb();
    const stamps = await Promise.all([
      db.select({ t: max(shows.updatedAt) }).from(shows),
      db.select({ t: max(tracks.updatedAt) }).from(tracks),
      db.select({ t: max(settings.updatedAt) }).from(settings),
    ]);
    const t = Math.max(...stamps.map(([r]) => Number(r?.t ?? 0)));
    return t ? new Date(t) : null;
  }, () => null);
}

// ================================================================ admin: reading
export async function allShows(): Promise<AdminShow[]> {
  const { db, shows } = await getDb();
  return (await db.select().from(shows).orderBy(asc(shows.position), asc(shows.slug))).map(toShow);
}
export async function getAdminShow(slug: string) {
  if (!SLUG.test(slug)) return undefined;
  const { db, shows } = await getDb();
  const [row] = await db.select().from(shows).where(eq(shows.slug, slug));
  return row ? toShow(row) : undefined;
}
export async function allTracks(): Promise<AdminTrack[]> {
  const { db, tracks } = await getDb();
  return (await db.select().from(tracks).orderBy(asc(tracks.position), asc(tracks.id))).map(toTrack);
}
export async function getAdminTrack(id: string) {
  if (!SLUG.test(id)) return undefined;
  const { db, tracks } = await getDb();
  const [row] = await db.select().from(tracks).where(eq(tracks.id, id));
  return row ? toTrack(row) : undefined;
}

async function readSetting<T>(key: string): Promise<T | null> {
  const { db, settings } = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row ? parseJson<T | null>(row.value, null) : null;
}
async function writeSetting(key: string, value: unknown) {
  const { db, settings } = await getDb();
  const now = Date.now();
  const json = JSON.stringify(value);
  const [row] = await db.select({ key: settings.key }).from(settings).where(eq(settings.key, key));
  if (row) await db.update(settings).set({ value: json, updatedAt: now }).where(eq(settings.key, key));
  else await db.insert(settings).values({ key, value: json, updatedAt: now });
}

export async function textOverrides(): Promise<Record<string, unknown>> {
  return (await readSetting<Record<string, unknown>>("texts")) ?? {};
}
export async function adminSiteSettings(): Promise<SiteSettings> {
  const saved = await readSetting<Partial<SiteSettings>>("site");
  return {
    contact: { ...SITE_DEFAULTS.contact, ...saved?.contact },
    social: { ...SITE_DEFAULTS.social, ...saved?.social },
    ogImage: saved?.ogImage ?? null,
  };
}

// ================================================================ validation
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CYRILLIC = /[\u0400-\u052F\u1C80-\u1C8F\u2DE0-\u2DFF\uA640-\uA69F]/;
const MEDIA_PATH = /^\/(media|u)\/[A-Za-z0-9][A-Za-z0-9/_.-]{0,200}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;
const EMAIL = /^[^\s@<>"']{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

export type Errors = Record<string, string>;
type Parsed<T> = { ok: true; value: T } | { ok: false; errors: Errors };

const clean = (v: FormDataEntryValue | null) => String(v ?? "").replace(/\r\n/g, "\n").trim();
const oneLine = (v: FormDataEntryValue | null) => clean(v).replace(/\s+/g, " ");

/** Check one text value; returns an error message or null. */
function checkText(value: string, { label, max, required = false }: { label: string; max: number; required?: boolean }) {
  if (!value) return required ? `${label} is required.` : null;
  if (value.length > max) return `${label} is too long (max ${max} characters).`;
  if (CYRILLIC.test(value)) return "Use Latin characters.";
  return null;
}

const isMediaPath = (p: unknown): p is string => typeof p === "string" && MEDIA_PATH.test(p) && !p.includes("..");

export function parseMediaRef(raw: unknown): MediaRef | null {
  if (!raw || typeof raw !== "object") return null;
  const m = raw as Record<string, unknown>;
  if (!isMediaPath(m.poster)) return null;
  if (m.video !== undefined && !isMediaPath(m.video)) return null;
  const formats = Array.isArray(m.formats) ? m.formats.filter((f): f is "webm" | "mp4" => f === "webm" || f === "mp4") : undefined;
  return { poster: m.poster, ...(m.video ? { video: m.video as string } : {}), ...(formats?.length ? { formats } : {}) };
}

export interface ShowInput {
  slug: string;
  title: string;
  subtitle: string;
  logline: string;
  synopsis: string[];
  highlights: string[];
  duration: string;
  age: string;
  status: ShowStatus;
  accent: string;
  track: string | null;
  published: boolean;
  media: Show["media"];
}

export function parseShow(form: FormData, { trackIds }: { trackIds: string[] }): Parsed<ShowInput> {
  const errors: Errors = {};
  const slug = oneLine(form.get("slug")).toLowerCase();
  const title = oneLine(form.get("title"));
  const subtitle = oneLine(form.get("subtitle"));
  const logline = oneLine(form.get("logline"));
  const synopsis = clean(form.get("synopsis")).split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const highlights = clean(form.get("highlights")).split("\n").map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const duration = oneLine(form.get("duration"));
  const age = oneLine(form.get("age"));
  const status = oneLine(form.get("status")) as ShowStatus;
  const accent = oneLine(form.get("accent"));
  const track = oneLine(form.get("track")) || null;
  const published = form.get("published") === "on";

  if (!SLUG.test(slug) || slug.length < 2 || slug.length > 40)
    errors.slug = "Use 2–40 lowercase Latin letters, digits and dashes (e.g. snow-queen).";
  const e = (k: string, msg: string | null) => msg && (errors[k] = msg);
  e("title", checkText(title, { label: "Title", max: 80, required: true }));
  e("subtitle", checkText(subtitle, { label: "Subtitle", max: 120 }));
  e("logline", checkText(logline, { label: "One-line pitch", max: 240, required: true }));
  if (synopsis.length > 8) errors.synopsis = "At most 8 paragraphs.";
  for (const p of synopsis) e("synopsis", checkText(p, { label: "A paragraph", max: 1200 }));
  if (highlights.length > 12) errors.highlights = "At most 12 lines.";
  for (const h of highlights) e("highlights", checkText(h, { label: "A line", max: 80 }));
  e("duration", checkText(duration, { label: "Duration", max: 40 }));
  e("age", checkText(age, { label: "Age", max: 40 }));
  if (!SHOW_STATUSES.includes(status)) errors.status = "Choose a status.";
  if (!HEX.test(accent)) errors.accent = "Pick a colour (#rrggbb).";
  if (track && !trackIds.includes(track)) errors.track = "Choose a track from the list.";

  const media: Show["media"] = {};
  const rawMedia = parseJson<Record<string, unknown>>(String(form.get("media") ?? "{}"), {});
  for (const slot of ["card", "hero", "extra", "posterWide", "posterSquare", "posterTall"] as const) {
    if (rawMedia[slot] == null) continue;
    const ref = parseMediaRef(rawMedia[slot]);
    if (!ref || (slot.startsWith("poster") && ref.video)) errors.media = "A picture reference is invalid; upload it again.";
    else media[slot] = ref;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { slug, title, subtitle, logline, synopsis, highlights, duration, age, status, accent: accent.toLowerCase(), track, published, media },
  };
}

export interface TrackInput {
  id: string;
  title: string;
  note: string;
  show: string | null;
  published: boolean;
  src: string;
  duration: number;
}

export function parseTrack(form: FormData, { showSlugs }: { showSlugs: string[] }): Parsed<TrackInput> {
  const errors: Errors = {};
  const id = oneLine(form.get("id")).toLowerCase();
  const title = oneLine(form.get("title"));
  const note = oneLine(form.get("note"));
  const show = oneLine(form.get("show")) || null;
  const published = form.get("published") === "on";
  const src = oneLine(form.get("src"));
  const duration = Number(form.get("duration"));
  if (!SLUG.test(id) || id.length < 2 || id.length > 40) errors.id = "Use 2–40 lowercase Latin letters, digits and dashes.";
  const t = checkText(title, { label: "Title", max: 80, required: true });
  if (t) errors.title = t;
  const n = checkText(note, { label: "Note", max: 140 });
  if (n) errors.note = n;
  if (show && !showSlugs.includes(show)) errors.show = "Choose a show from the list.";
  if (!isMediaPath(src) || !Number.isFinite(duration) || duration <= 0 || duration > 3600) errors.src = "Upload the audio file.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { id, title, note, show, published, src, duration: Math.round(duration * 10) / 10 } };
}

// ---- interface texts: every string of src/i18n/en.ts, addressed by its path ("hero.tagline")
export interface TextEntry {
  path: string;
  group: string;
  value: string; // default from en.ts
}
export function textEntries(node: unknown = en, prefix = ""): TextEntry[] {
  const out: TextEntry[] = [];
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push({ path, group: path.split(".")[0], value: v });
    else if (v && typeof v === "object") out.push(...textEntries(v, path));
  }
  return out;
}
export function getAt(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}
function setAt(obj: Record<string, unknown>, path: string, value: string) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
  o[keys[keys.length - 1]] = value;
}

/** Only the texts that differ from en.ts are stored; an empty field means "the original". */
export function parseTexts(form: FormData): Parsed<Record<string, unknown>> {
  const errors: Errors = {};
  const overrides: Record<string, unknown> = {};
  for (const { path, value: original } of textEntries()) {
    const raw = form.get(`t:${path}`);
    if (raw === null) continue;
    const value = clean(raw).replace(/[ \t]+/g, " ");
    if (!value || value === original) continue;
    const msg = checkText(value, { label: "This text", max: 600 });
    if (msg) errors[path] = msg;
    else setAt(overrides, path, value);
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: overrides };
}

export function parseSite(form: FormData): Parsed<SiteSettings> {
  const errors: Errors = {};
  const booking = oneLine(form.get("booking"));
  const press = oneLine(form.get("press"));
  const youtube = oneLine(form.get("youtube"));
  const instagram = oneLine(form.get("instagram"));
  const og = parseJson<unknown>(String(form.get("ogImage") ?? "null"), null);
  for (const [k, v] of [["booking", booking], ["press", press]] as const)
    if (v && (!EMAIL.test(v) || CYRILLIC.test(v))) errors[k] = "Enter an email address, or leave it empty.";
  for (const [k, v, host] of [["youtube", youtube, /(^|\.)youtube\.com$/], ["instagram", instagram, /(^|\.)instagram\.com$/]] as const) {
    if (!v) continue;
    try {
      const u = new URL(v);
      if (u.protocol !== "https:" || !host.test(u.hostname)) errors[k] = `Enter the full https:// link to the ${k === "youtube" ? "YouTube" : "Instagram"} page.`;
    } catch {
      errors[k] = "Enter a full link starting with https://";
    }
  }
  let ogImage: string | null = null;
  if (og !== null) {
    const ref = parseMediaRef(og);
    if (!ref) errors.ogImage = "Upload the share image again.";
    else ogImage = ref.poster;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { contact: { booking, press }, social: { youtube, instagram }, ogImage } };
}

// ================================================================ admin: writing
const mediaPaths = (m: Show["media"]) => Object.values(m ?? {}).flatMap((r) => (r ? [r.poster, r.video] : []));
/** Delete uploaded files that a save no longer uses. */
async function dropUnused(before: (string | undefined | null)[], after: (string | undefined | null)[]) {
  const keep = new Set(after.filter(Boolean));
  const gone = [...new Set(before.filter((p): p is string => !!p && !keep.has(p)))];
  await deleteFiles(gone.flatMap(storedFiles));
}

export async function createShow(input: ShowInput): Promise<{ error?: Errors }> {
  const { db, shows } = await getDb();
  if (await getAdminShow(input.slug)) return { error: { slug: "A show with this address already exists." } };
  const [{ m }] = await db.select({ m: max(shows.position) }).from(shows);
  const now = Date.now();
  await db.insert(shows).values({ ...showColumns(input), slug: input.slug, position: Number(m ?? -1) + 1, createdAt: now, updatedAt: now });
  return {};
}

export async function updateShow(slug: string, input: ShowInput) {
  const before = await getAdminShow(slug);
  if (!before) return;
  const { db, shows } = await getDb();
  await db.update(shows).set({ ...showColumns(input), updatedAt: Date.now() }).where(eq(shows.slug, slug));
  await dropUnused(mediaPaths(before.media), mediaPaths(input.media));
}

function showColumns(i: ShowInput) {
  return {
    status: i.status,
    title: i.title,
    subtitle: i.subtitle,
    logline: i.logline,
    synopsis: JSON.stringify(i.synopsis),
    highlights: JSON.stringify(i.highlights),
    duration: i.duration,
    age: i.age,
    accent: i.accent,
    media: JSON.stringify(i.media),
    track: i.track,
    published: i.published,
  };
}

/** Refused while tour dates point at the show (they would lose their show). */
export async function deleteShow(slug: string): Promise<{ error?: string }> {
  const show = await getAdminShow(slug);
  if (!show) return {};
  const { db, shows, events, tracks } = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(events).where(eq(events.show, slug));
  if (Number(n) > 0)
    return { error: `This show has ${n} tour date${Number(n) === 1 ? "" : "s"}. Delete those first, or hide the show instead.` };
  await db.update(tracks).set({ show: null, updatedAt: Date.now() }).where(eq(tracks.show, slug));
  await db.delete(shows).where(eq(shows.slug, slug));
  await dropUnused(mediaPaths(show.media), []);
  return {};
}

async function move<T extends { position: number }>(list: T[], index: number, dir: -1 | 1, save: (item: T, position: number) => Promise<void>) {
  const j = index + dir;
  if (index < 0 || j < 0 || j >= list.length) return;
  // renumber the whole list so positions stay dense and unique
  const order = [...list];
  [order[index], order[j]] = [order[j], order[index]];
  for (const [i, item] of order.entries()) if (item.position !== i) await save(item, i);
}

export async function moveShow(slug: string, dir: -1 | 1) {
  const list = await allShows();
  const { db, shows } = await getDb();
  await move(list, list.findIndex((s) => s.slug === slug), dir, (s, position) =>
    db.update(shows).set({ position, updatedAt: Date.now() }).where(eq(shows.slug, s.slug)).then(() => {}),
  );
}

export async function createTrack(input: TrackInput): Promise<{ error?: Errors }> {
  const { db, tracks } = await getDb();
  if (await getAdminTrack(input.id)) return { error: { id: "A track with this id already exists." } };
  const [{ m }] = await db.select({ m: max(tracks.position) }).from(tracks);
  const now = Date.now();
  await db.insert(tracks).values({ ...input, position: Number(m ?? -1) + 1, createdAt: now, updatedAt: now });
  return {};
}

export async function updateTrack(id: string, input: TrackInput) {
  const before = await getAdminTrack(id);
  if (!before) return;
  const { db, tracks } = await getDb();
  const { title, note, show, published, src, duration } = input;
  await db.update(tracks).set({ title, note, show, published, src, duration, updatedAt: Date.now() }).where(eq(tracks.id, id));
  await dropUnused([before.src], [src]);
}

export async function deleteTrack(id: string) {
  const track = await getAdminTrack(id);
  if (!track) return;
  const { db, tracks, shows } = await getDb();
  await db.update(shows).set({ track: null, updatedAt: Date.now() }).where(eq(shows.track, id));
  await db.delete(tracks).where(eq(tracks.id, id));
  await dropUnused([track.src], []);
}

export async function moveTrack(id: string, dir: -1 | 1) {
  const list = await allTracks();
  const { db, tracks } = await getDb();
  await move(list, list.findIndex((t) => t.id === id), dir, (t, position) =>
    db.update(tracks).set({ position, updatedAt: Date.now() }).where(eq(tracks.id, t.id)).then(() => {}),
  );
}

export async function saveTexts(overrides: Record<string, unknown>) {
  await writeSetting("texts", overrides);
}

export async function saveSiteSettings(next: SiteSettings) {
  const before = await adminSiteSettings();
  await writeSetting("site", next);
  await dropUnused([before.ogImage], [next.ogImage]);
}

export const isSlug = (s: unknown): s is string => typeof s === "string" && SLUG.test(s) && s.length <= 40;
