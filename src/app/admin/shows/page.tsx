import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { allShows } from "@/lib/content";
import { listEvents } from "@/lib/events";
import { deleteShowAction, moveShowAction } from "../content-actions";
import { ConfirmButton } from "../ConfirmButton";
import { btnGhost, btnPrimary } from "../styles";
import { Flash, SetupNotice, setupProblems } from "../ui";

export const metadata: Metadata = { title: "Shows" };

const DONE: Record<string, string> = { added: "Show added.", saved: "Changes saved.", deleted: "Show deleted." };
const STATUS = { touring: "Now touring", coming: "Coming soon", tba: "To be announced" } as const;

export default async function ShowsPage({ searchParams }: { searchParams: Promise<{ done?: string; blocked?: string }> }) {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const sp = await searchParams;
  const [shows, events] = await Promise.all([allShows(), listEvents()]);
  const datesOf = (slug: string) => events.filter((e) => e.show === slug).length;
  const blocked = shows.find((s) => s.slug === sp.blocked);

  return (
    <>
      {sp.done && DONE[sp.done] && <Flash>{DONE[sp.done]}</Flash>}
      {blocked && (
        <Flash tone="warn">
          “{blocked.title}” still has {datesOf(blocked.slug)} tour date(s), so it was not deleted. Delete those dates first, or
          hide the show (untick “Shown on the site”).
        </Flash>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium">Shows</h1>
        <Link href="/admin/shows/new" className={btnPrimary}>
          Add show
        </Link>
      </div>
      <p className="mb-4 text-sm text-[#8fa3b8]">In the order they appear on the site. Use the arrows to move a show.</p>

      <ol className="space-y-3">
        {shows.map((s, i) => (
          <li key={s.slug} className={`flex flex-wrap items-center gap-4 rounded-lg border border-[#1c2738] bg-[#0a0f17] p-3 ${s.published ? "" : "opacity-60"}`}>
            <div className="flex flex-col gap-1">
              {(["up", "down"] as const).map((d) => (
                <form key={d} action={moveShowAction}>
                  <input type="hidden" name="slug" value={s.slug} />
                  <input type="hidden" name="dir" value={d} />
                  <button
                    type="submit"
                    disabled={d === "up" ? i === 0 : i === shows.length - 1}
                    aria-label={`Move ${s.title} ${d}`}
                    className="h-7 w-7 rounded border border-[#2a3a52] text-[#8fa3b8] hover:text-white disabled:opacity-30"
                  >
                    {d === "up" ? "↑" : "↓"}
                  </button>
                </form>
              ))}
            </div>
            <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded" style={{ background: s.accent }}>
              {(s.media.posterSquare ?? s.media.card) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${(s.media.posterSquare ?? s.media.card)!.poster}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {s.title} <span className="text-[#8fa3b8]">{s.subtitle}</span>
              </p>
              <p className="text-sm text-[#8fa3b8]">
                {STATUS[s.status]} · {datesOf(s.slug)} tour date(s) · /shows/{s.slug}
              </p>
              <p className="mt-1 text-xs">
                {s.published ? (
                  <span className="rounded border border-[#1f5b4a] px-1.5 py-0.5 text-[#9ff0d2]">On the site</span>
                ) : (
                  <span className="rounded border border-[#2a3a52] px-1.5 py-0.5 text-[#8fa3b8]">Hidden</span>
                )}
              </p>
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <Link href={`/admin/shows/${s.slug}`} className={btnGhost}>
                Edit
              </Link>
              <ConfirmButton action={deleteShowAction} name="slug" value={s.slug} confirm={`Delete the show “${s.title}”?\nIts page and pictures go too. This cannot be undone.`}>
                Delete
              </ConfirmButton>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
