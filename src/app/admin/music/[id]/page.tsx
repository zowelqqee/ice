import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { allShows, getAdminTrack } from "@/lib/content";
import { deleteTrackAction, saveTrackAction } from "../../content-actions";
import { ConfirmButton } from "../../ConfirmButton";
import { SetupNotice, setupProblems } from "../../ui";
import { TrackForm } from "../TrackForm";

export const metadata: Metadata = { title: "Edit track" };

export default async function EditTrackPage({ params }: { params: Promise<{ id: string }> }) {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const { id } = await params;
  const [track, shows] = await Promise.all([getAdminTrack(id), allShows()]);
  if (!track) notFound();
  return (
    <>
      <h1 className="mb-6 text-xl font-medium">{track.title}</h1>
      <TrackForm
        action={saveTrackAction.bind(null, track.id)}
        creating={false}
        shows={shows.map((s) => ({ value: s.slug, label: `${s.title} ${s.subtitle}`.trim() }))}
        initial={{
          id: track.id,
          title: track.title,
          note: track.note,
          show: track.show ?? "",
          published: track.published,
          src: track.src,
          duration: String(track.duration),
        }}
      />
      <div className="mt-10 max-w-2xl border-t border-[#1c2738] pt-6">
        <ConfirmButton action={deleteTrackAction} name="id" value={track.id} confirm={`Delete the track “${track.title}”?\nThe recording is deleted too.`}>
          Delete this track
        </ConfirmButton>
      </div>
    </>
  );
}
