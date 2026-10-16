import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { saveEventAction } from "../../actions";
import { SetupNotice, setupProblems } from "../../ui";
import { EventForm } from "../EventForm";
import { formOptions } from "../options";

export const metadata: Metadata = { title: "Add event" };

export default async function NewEventPage() {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  return (
    <>
      <h1 className="mb-6 text-xl font-medium">Add event</h1>
      <EventForm
        action={saveEventAction.bind(null, null)}
        initial={{ show: "", date: "", time: "19:30", city: "", country: "", venue: "", tickets: "", status: "on_sale", published: false, lat: "", lon: "" }}
        submitLabel="Add event"
        {...await formOptions()}
      />
    </>
  );
}
