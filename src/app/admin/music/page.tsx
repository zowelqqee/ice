import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { allShows, allTracks } from "@/lib/content";
import { deleteTrackAction, moveTrackAction } from "../content-actions";
import { ConfirmButton } from "../ConfirmButton";
import { btnGhost, btnPrimary } from "../styles";
import { Flash, SetupNotice, setupProblems } from "../ui";

export const metadata: Metadata = { title: "Music" };

const DONE: Record<string, string> = { added: "Track added.", saved: "Changes saved.", deleted: "Track deleted." };
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export default async function MusicPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const sp = await searchParams;
  const [tracks, shows] = await Promise.all([allTracks(), allShows()]);
  return (
    <>
      {sp.done && DONE[sp.done] && <Flash>{DONE[sp.done]}</Flash>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium">Music</h1>
        <Link href="/admin/music/new" className={btnPrimary}>
          Add track
        </Link>
      </div>
      <p className="mb-4 text-sm text-[#8fa3b8]">
        The player in “Our music”, in this order. The first track is the one selected when the page opens. (The ice orchestra
        below it is built into the site.)
      </p>
      {tracks.length === 0 && <p className="rounded-lg border border-dashed border-[#2a3a52] p-8 text-center text-[#8fa3b8]">No tracks yet.</p>}
      <ol className="space-y-3">
        {tracks.map((t, i) => {
          const show = shows.find((s) => s.slug === t.show);
          return (
            <li key={t.id} className={`flex flex-wrap items-center gap-4 rounded-lg border border-[#1c2738] bg-[#0a0f17] p-3 ${t.published ? "" : "opacity-60"}`}>
              <div className="flex flex-col gap-1">
                {(["up", "down"] as const).map((d) => (
                  <form key={d} action={moveTrackAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="dir" value={d} />
                    <button
                      type="submit"
                      disabled={d === "up" ? i === 0 : i === tracks.length - 1}
                      aria-label={`Move ${t.title} ${d}`}
                      className="h-7 w-7 rounded border border-[#2a3a52] text-[#8fa3b8] hover:text-white disabled:opacity-30"
                    >
                      {d === "up" ? "↑" : "↓"}
                    </button>
                  </form>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.title}</p>
                <p className="text-sm text-[#8fa3b8]">{[show?.title ?? "No show", t.note, mmss(t.duration)].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-xs">
                  {t.published ? (
                    <span className="rounded border border-[#1f5b4a] px-1.5 py-0.5 text-[#9ff0d2]">On the site</span>
                  ) : (
                    <span className="rounded border border-[#2a3a52] px-1.5 py-0.5 text-[#8fa3b8]">Hidden</span>
                  )}
                </p>
              </div>
              <audio controls preload="none" src={`${t.src}.m4a`} className="h-9 w-full sm:max-w-[260px]" />
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Link href={`/admin/music/${t.id}`} className={btnGhost}>
                  Edit
                </Link>
                <ConfirmButton action={deleteTrackAction} name="id" value={t.id} confirm={`Delete the track “${t.title}”?\nThe recording is deleted too.`}>
                  Delete
                </ConfirmButton>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
