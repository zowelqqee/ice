"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import {
  allShows,
  allTracks,
  createShow,
  createTrack,
  deleteShow,
  deleteTrack,
  isSlug,
  moveShow,
  moveTrack,
  parseShow,
  parseSite,
  parseTexts,
  parseTrack,
  saveSiteSettings,
  saveTexts,
  updateShow,
  updateTrack,
  type Errors,
} from "@/lib/content";

// Server actions for the admin's Shows, Music, Texts and Settings sections. Every save refreshes
// the public pages straight away.

/** On a failed save the typed values come back, so the form can show them again. */
export type FormState = { errors?: Errors; values?: Record<string, string>; at?: number } | undefined;

function failed(errors: Errors, form: FormData): FormState {
  const values: Record<string, string> = {};
  for (const [k, v] of form) if (!k.startsWith("$") && typeof v === "string") values[k] = v;
  return { errors, values, at: Date.now() };
}

const refreshPublic = () => revalidatePath("/", "layout");
const dir = (form: FormData) => (form.get("dir") === "up" ? -1 : 1);

// ---------------------------------------------------------------- shows
export async function saveShowAction(slug: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  if (slug !== null && !isSlug(slug)) redirect("/admin/shows");
  if (slug) form.set("slug", slug); // the address of an existing show does not change
  const parsed = parseShow(form, { trackIds: (await allTracks()).map((t) => t.id) });
  if (!parsed.ok) return failed(parsed.errors, form);
  if (slug) await updateShow(slug, parsed.value);
  else {
    const r = await createShow(parsed.value);
    if (r.error) return failed(r.error, form);
  }
  refreshPublic();
  redirect(`/admin/shows?done=${slug ? "saved" : "added"}`);
}

export async function deleteShowAction(form: FormData) {
  await requireAdmin();
  const slug = form.get("slug");
  if (!isSlug(slug)) redirect("/admin/shows");
  const r = await deleteShow(slug);
  if (r.error) redirect(`/admin/shows?blocked=${slug}`);
  refreshPublic();
  redirect("/admin/shows?done=deleted");
}

export async function moveShowAction(form: FormData) {
  await requireAdmin();
  const slug = form.get("slug");
  if (isSlug(slug)) await moveShow(slug, dir(form));
  refreshPublic();
  redirect("/admin/shows");
}

// ---------------------------------------------------------------- music
export async function saveTrackAction(id: string | null, _prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  if (id !== null && !isSlug(id)) redirect("/admin/music");
  if (id) form.set("id", id);
  const parsed = parseTrack(form, { showSlugs: (await allShows()).map((s) => s.slug) });
  if (!parsed.ok) return failed(parsed.errors, form);
  if (id) await updateTrack(id, parsed.value);
  else {
    const r = await createTrack(parsed.value);
    if (r.error) return failed(r.error, form);
  }
  refreshPublic();
  redirect(`/admin/music?done=${id ? "saved" : "added"}`);
}

export async function deleteTrackAction(form: FormData) {
  await requireAdmin();
  const id = form.get("id");
  if (!isSlug(id)) redirect("/admin/music");
  await deleteTrack(id);
  refreshPublic();
  redirect("/admin/music?done=deleted");
}

export async function moveTrackAction(form: FormData) {
  await requireAdmin();
  const id = form.get("id");
  if (isSlug(id)) await moveTrack(id, dir(form));
  refreshPublic();
  redirect("/admin/music");
}

// ---------------------------------------------------------------- texts and settings
export async function saveTextsAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseTexts(form);
  if (!parsed.ok) return failed(parsed.errors, form);
  await saveTexts(parsed.value);
  refreshPublic();
  redirect("/admin/texts?done=saved");
}

export async function saveSiteAction(_prev: FormState, form: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = parseSite(form);
  if (!parsed.ok) return failed(parsed.errors, form);
  await saveSiteSettings(parsed.value);
  refreshPublic();
  redirect("/admin/settings?done=saved");
}
