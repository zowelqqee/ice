// Small shared pieces for the admin pages (server-safe, no state).
import { authConfig } from "@/lib/auth";
import { dbStatus } from "@/lib/db";

export { btn, btnDanger, btnGhost, btnPrimary } from "./styles";

/** What is missing before the admin can work on this host, or null when it can. */
export function setupProblems(): string[] | null {
  const problems: string[] = [];
  const auth = authConfig();
  if (!auth.ok) problems.push(`Missing environment variables: ${auth.missing.join(", ")}.`);
  const db = dbStatus();
  if (!db.ok) problems.push(db.reason);
  return problems.length ? problems : null;
}

export function SetupNotice({ problems }: { problems: string[] }) {
  return (
    <section className="rounded-lg border border-[#2a3a52] bg-[#0c121b] p-5">
      <h1 className="mb-3 text-lg font-medium">The admin is not set up on this server yet</h1>
      <ul className="mb-4 list-disc space-y-1 pl-5 text-[#c9d6e3]">
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <p className="text-sm text-[#8fa3b8]">
        See the README, section “Admin”: how to create the password hash, which variables to set, and which database to use
        on this host. Until then the site shows the dates from <code>src/data/tour.json</code>.
      </p>
    </section>
  );
}

export function Flash({ children, tone = "ok" }: { children: React.ReactNode; tone?: "ok" | "warn" }) {
  return (
    <p
      role="status"
      className={`mb-5 rounded-md border px-3 py-2 text-sm ${
        tone === "ok" ? "border-[#1f5b4a] bg-[#0b1d18] text-[#9ff0d2]" : "border-[#5b4a1f] bg-[#1d180b] text-[#f0d99f]"
      }`}
    >
      {children}
    </p>
  );
}
