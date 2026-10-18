import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { adminSiteSettings } from "@/lib/content";
import { storageMode } from "@/lib/storage";
import { saveSiteAction } from "../content-actions";
import { Flash, SetupNotice, setupProblems } from "../ui";
import { SettingsForm } from "./SettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const { done } = await searchParams;
  const s = await adminSiteSettings();
  return (
    <>
      {done === "saved" && <Flash>Settings saved.</Flash>}
      <h1 className="mb-6 text-xl font-medium">Settings</h1>
      <SettingsForm
        action={saveSiteAction}
        initial={{ booking: s.contact.booking, press: s.contact.press, youtube: s.social.youtube, instagram: s.social.instagram, ogImage: s.ogImage }}
      />
      <section className="mt-12 max-w-2xl rounded-lg border border-[#1c2738] p-4 text-sm text-[#8fa3b8]">
        <h2 className="mb-2 font-medium text-[#c9d6e3]">This server</h2>
        <p>
          Uploads:{" "}
          {{ local: "stored on this server's disk", blob: "stored in Vercel Blob", none: "off: connect a Vercel Blob store (README, “Media uploads”)" }[storageMode()]}
          .
        </p>
        <p className="mt-1">The site address, the logo and the 3D skater are part of the code; see the README.</p>
      </section>
    </>
  );
}
