import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAt, textEntries, textOverrides } from "@/lib/content";
import { saveTextsAction } from "../content-actions";
import { Flash, SetupNotice, setupProblems } from "../ui";
import { TextsForm } from "./TextsForm";

export const metadata: Metadata = { title: "Texts" };

export default async function TextsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const { done } = await searchParams;
  const overrides = await textOverrides();
  const rows = textEntries().map((e) => {
    const saved = getAt(overrides, e.path);
    return { path: e.path, group: e.group, original: e.value, current: typeof saved === "string" ? saved : e.value };
  });
  return (
    <>
      {done === "saved" && <Flash>Texts saved. The site shows them now.</Flash>}
      <h1 className="mb-2 text-xl font-medium">Texts</h1>
      <p className="mb-5 text-sm text-[#8fa3b8]">
        Every line of the site&apos;s interface, in English. The story of each show is edited under Shows.
      </p>
      <TextsForm action={saveTextsAction} rows={rows} />
    </>
  );
}
