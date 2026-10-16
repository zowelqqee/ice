import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getEvent } from "@/lib/events";
import { duplicateEventAction, saveEventAction } from "../../actions";
import { DeleteButton } from "../../DeleteButton";
import { btnGhost } from "../../styles";
import { Flash, SetupNotice, setupProblems } from "../../ui";
import { EventForm } from "../EventForm";
import { formOptions } from "../options";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ copied?: string }>;
}) {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const { id } = await params;
  const { copied } = await searchParams;
  const e = await getEvent(id);
  if (!e) notFound();
  const changed = new Date(e.updatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
  return (
    <>
      {copied && <Flash tone="warn">This is a copy, saved as an unpublished draft. Set the new date, then publish it.</Flash>}
      <h1 className="mb-1 text-xl font-medium">Edit event</h1>
      <p className="mb-6 text-xs text-[#5d7088]">Last changed {changed} UTC</p>
      <EventForm
        action={saveEventAction.bind(null, e.id)}
        initial={{
          show: e.show,
          date: e.date,
          time: e.time,
          city: e.city,
          country: e.country,
          venue: e.venue,
          tickets: e.tickets ?? "",
          status: e.status,
          published: e.published,
          lat: e.lat === null ? "" : String(e.lat),
          lon: e.lon === null ? "" : String(e.lon),
        }}
        submitLabel="Save changes"
        {...await formOptions()}
      />
      <div className="mt-10 flex max-w-2xl flex-wrap gap-3 border-t border-[#1c2738] pt-6">
        <form action={duplicateEventAction}>
          <input type="hidden" name="id" value={e.id} />
          <button type="submit" className={btnGhost}>
            Duplicate
          </button>
        </form>
        <DeleteButton id={e.id} what={`this event (${e.city}, ${e.date})`} />
      </div>
    </>
  );
}
