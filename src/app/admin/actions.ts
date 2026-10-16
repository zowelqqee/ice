"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  authConfig,
  checkLogin,
  clearFailures,
  clientAddress,
  createSession,
  destroySession,
  lockedFor,
  recordFailure,
  requireAdmin,
} from "@/lib/auth";
import { dbStatus } from "@/lib/db";
import { createEvent, deleteEvent, duplicateEvent, parseEvent, updateEvent, type FieldErrors } from "@/lib/events";

export type LoginState = { error?: string } | undefined;
/** On a failed save the typed values come back, so the form shows them again (React resets
 *  uncontrolled fields to their defaults after an action). */
export type EventFormState = { errors?: FieldErrors; values?: Record<string, string>; at?: number } | undefined;

/** The public pages (tour list, show pages, sitemap) pick up the change straight away. */
function refreshPublic() {
  revalidatePath("/", "layout");
}

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!authConfig().ok) return { error: "Sign-in is not configured on this server." };
  const db = dbStatus();
  if (!db.ok) return { error: db.reason };
  const user = String(form.get("user") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const ip = await clientAddress();
  const wait = await lockedFor(ip, user);
  if (wait > 0) return { error: `Too many attempts. Try again in ${Math.ceil(wait / 60000)} min.` };
  if (!user || !password || !checkLogin(user, password)) {
    await recordFailure(ip, user);
    await new Promise((r) => setTimeout(r, 400));
    return { error: "Wrong login or password." };
  }
  await clearFailures(ip, user);
  await createSession(user);
  redirect("/admin");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}

export async function saveEventAction(id: string | null, _prev: EventFormState, form: FormData): Promise<EventFormState> {
  await requireAdmin();
  const parsed = parseEvent(form);
  if (!parsed.ok) {
    const values: Record<string, string> = {};
    for (const [k, v] of form) if (!k.startsWith("$") && typeof v === "string") values[k] = v;
    return { errors: parsed.errors, values, at: Date.now() };
  }
  if (id) await updateEvent(id, parsed.value);
  else await createEvent(parsed.value);
  refreshPublic();
  redirect(`/admin?done=${id ? "saved" : "added"}`);
}

export async function deleteEventAction(form: FormData) {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  if (id) await deleteEvent(id);
  refreshPublic();
  redirect("/admin?done=deleted");
}

export async function duplicateEventAction(form: FormData) {
  await requireAdmin();
  const copy = await duplicateEvent(String(form.get("id") ?? ""));
  redirect(copy ? `/admin/events/${copy}?copied=1` : "/admin");
}
