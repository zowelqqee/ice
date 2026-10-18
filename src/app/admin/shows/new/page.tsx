import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { allTracks } from "@/lib/content";
import { saveShowAction } from "../../content-actions";
import { SetupNotice, setupProblems } from "../../ui";
import { ShowForm } from "../ShowForm";

export const metadata: Metadata = { title: "Add show" };

export default async function NewShowPage() {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const tracks = await allTracks();
  return (
    <>
      <h1 className="mb-6 text-xl font-medium">Add show</h1>
      <ShowForm
        action={saveShowAction.bind(null, null)}
        creating
        tracks={tracks.map((t) => ({ value: t.id, label: t.title }))}
        initial={{
          slug: "",
          title: "",
          subtitle: "",
          logline: "",
          synopsis: "",
          highlights: "",
          duration: "",
          age: "",
          status: "coming",
          accent: "#5cf2ff",
          track: "",
          published: false,
          media: {},
        }}
      />
    </>
  );
}
