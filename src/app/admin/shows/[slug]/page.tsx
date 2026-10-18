import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { allTracks, getAdminShow } from "@/lib/content";
import { deleteShowAction, saveShowAction } from "../../content-actions";
import { ConfirmButton } from "../../ConfirmButton";
import { SetupNotice, setupProblems } from "../../ui";
import { ShowForm } from "../ShowForm";

export const metadata: Metadata = { title: "Edit show" };

export default async function EditShowPage({ params }: { params: Promise<{ slug: string }> }) {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const { slug } = await params;
  const [show, tracks] = await Promise.all([getAdminShow(slug), allTracks()]);
  if (!show) notFound();
  return (
    <>
      <h1 className="mb-1 text-xl font-medium">{show.title}</h1>
      <p className="mb-6 text-sm text-[#8fa3b8]">
        <a href={`/shows/${show.slug}`} target="_blank" rel="noopener" className="hover:text-white">
          Open the page on the site ↗
        </a>
      </p>
      <ShowForm
        action={saveShowAction.bind(null, show.slug)}
        creating={false}
        tracks={tracks.map((t) => ({ value: t.id, label: t.title }))}
        initial={{
          slug: show.slug,
          title: show.title,
          subtitle: show.subtitle,
          logline: show.logline,
          synopsis: show.synopsis.join("\n\n"),
          highlights: show.highlights.join("\n"),
          duration: show.facts.duration ?? "",
          age: show.facts.age ?? "",
          status: show.status,
          accent: show.accent,
          track: show.track ?? "",
          published: show.published,
          media: show.media,
        }}
      />
      <div className="mt-10 max-w-3xl border-t border-[#1c2738] pt-6">
        <ConfirmButton action={deleteShowAction} name="slug" value={show.slug} confirm={`Delete the show “${show.title}”?\nIts page and pictures go too. This cannot be undone.`}>
          Delete this show
        </ConfirmButton>
      </div>
    </>
  );
}
