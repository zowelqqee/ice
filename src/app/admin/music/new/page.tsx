import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { allShows } from "@/lib/content";
import { saveTrackAction } from "../../content-actions";
import { SetupNotice, setupProblems } from "../../ui";
import { TrackForm } from "../TrackForm";

export const metadata: Metadata = { title: "Add track" };

export default async function NewTrackPage() {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const shows = await allShows();
  return (
    <>
      <h1 className="mb-6 text-xl font-medium">Add track</h1>
      <TrackForm
        action={saveTrackAction.bind(null, null)}
        creating
        shows={shows.map((s) => ({ value: s.slug, label: `${s.title} ${s.subtitle}`.trim() }))}
        initial={{ id: "", title: "", note: "", show: "", published: true, src: "", duration: "" }}
      />
    </>
  );
}
