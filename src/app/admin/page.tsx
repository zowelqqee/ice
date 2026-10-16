import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { countryName } from "@/lib/countries";
import { shows } from "@/lib/data";
import { cutoffDate, listEvents, STATUS_LABEL, type EventRow } from "@/lib/events";
import { duplicateEventAction } from "./actions";
import { DeleteButton } from "./DeleteButton";
import { Flash, SetupNotice, setupProblems } from "./ui";
import { btnGhost, btnPrimary } from "./styles";

const DONE: Record<string, string> = { added: "Event added.", saved: "Changes saved.", deleted: "Event deleted." };

const showTitle = (slug: string) => {
  const s = shows.find((x) => x.slug === slug);
  return s ? `${s.title}` : slug;
};

const when = (r: EventRow) =>
  new Date(`${r.date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

type Visibility = "live" | "draft" | "past";
function visibility(r: EventRow, cutoff: string): Visibility {
  if (r.date < cutoff) return "past";
  return r.published ? "live" : "draft";
}
const VIS: Record<Visibility, { text: string; cls: string }> = {
  live: { text: "On the site", cls: "border-[#1f5b4a] text-[#9ff0d2]" },
  draft: { text: "Draft", cls: "border-[#2a3a52] text-[#8fa3b8]" },
  past: { text: "Past", cls: "border-[#2a3a52] text-[#5d7088]" },
};
const STATUS_CLS = { on_sale: "text-[#c9d6e3]", sold_out: "text-[#f0d99f]", cancelled: "text-[#ff9aa8]" } as const;

function Badge({ v }: { v: Visibility }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${VIS[v].cls}`}>{VIS[v].text}</span>;
}

function Actions({ r }: { r: EventRow }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/admin/events/${r.id}`} className={btnGhost}>
        Edit
      </Link>
      <form action={duplicateEventAction}>
        <input type="hidden" name="id" value={r.id} />
        <button type="submit" className={btnGhost}>
          Duplicate
        </button>
      </form>
      <DeleteButton id={r.id} what={`${showTitle(r.show)} in ${r.city} on ${when(r)}`} />
    </div>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; view?: string; done?: string }>;
}) {
  const problems = setupProblems();
  if (problems) return <SetupNotice problems={problems} />;
  await requireAdmin();
  const sp = await searchParams;
  const order = sp.order === "desc" ? "desc" : "asc";
  const view = sp.view === "all" ? "all" : "upcoming";
  const cutoff = cutoffDate();
  const all = await listEvents(order);
  const rows = view === "all" ? all : all.filter((r) => r.date >= cutoff);
  const pastCount = all.length - all.filter((r) => r.date >= cutoff).length;
  const q = (o: string, v: string) => `/admin?order=${o}&view=${v}`;

  return (
    <>
      {sp.done && DONE[sp.done] && <Flash>{DONE[sp.done]}</Flash>}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-medium">Events</h1>
        <Link href="/admin/events/new" className={btnPrimary}>
          Add event
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#8fa3b8]">
        <nav aria-label="Which events" className="flex overflow-hidden rounded-md border border-[#2a3a52]">
          {(["upcoming", "all"] as const).map((v) => (
            <Link
              key={v}
              href={q(order, v)}
              aria-current={view === v ? "page" : undefined}
              className={`px-3 py-1.5 ${view === v ? "bg-[#16202e] text-white" : "hover:text-white"}`}
            >
              {v === "upcoming" ? "Upcoming" : `All (incl. ${pastCount} past)`}
            </Link>
          ))}
        </nav>
        <Link href={q(order === "asc" ? "desc" : "asc", view)} className="hover:text-white">
          Date: {order === "asc" ? "earliest first ↑" : "latest first ↓"}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#2a3a52] p-8 text-center text-[#8fa3b8]">
          No {view === "upcoming" ? "upcoming " : ""}events yet. Add the first one.
        </p>
      ) : (
        <>
          {/* phone: cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => {
              const v = visibility(r, cutoff);
              return (
                <li key={r.id} className={`rounded-lg border border-[#1c2738] bg-[#0a0f17] p-4 ${v === "past" ? "opacity-60" : ""}`}>
                  <div className="mb-1 flex items-start justify-between gap-3">
                    <p className="font-medium">
                      {when(r)} · {r.time}
                    </p>
                    <Badge v={v} />
                  </div>
                  <p className="text-[17px]">
                    {r.city}, {countryName(r.country)}
                  </p>
                  <p className="mb-1 text-sm text-[#8fa3b8]">{r.venue}</p>
                  <p className="mb-3 text-sm">
                    {showTitle(r.show)} · <span className={STATUS_CLS[r.status]}>{STATUS_LABEL[r.status]}</span>
                    {!r.tickets && r.status === "on_sale" && <span className="text-[#5d7088]"> · no ticket link</span>}
                  </p>
                  <Actions r={r} />
                </li>
              );
            })}
          </ul>

          {/* wider screens: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-[#1c2738] md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#0c121b] text-[#8fa3b8]">
                <tr>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    <Link href={q(order === "asc" ? "desc" : "asc", view)} className="hover:text-white">
                      Date {order === "asc" ? "↑" : "↓"}
                    </Link>
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Show</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">City</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Venue</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Tickets</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Site</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2738]">
                {rows.map((r) => {
                  const v = visibility(r, cutoff);
                  return (
                    <tr key={r.id} className={v === "past" ? "opacity-60" : ""}>
                      <td className="whitespace-nowrap px-3 py-3">
                        {when(r)}
                        <span className="block text-[#8fa3b8]">{r.time}</span>
                      </td>
                      <td className="px-3 py-3">{showTitle(r.show)}</td>
                      <td className="px-3 py-3">
                        {r.city}
                        <span className="block text-[#8fa3b8]">{countryName(r.country)}</span>
                      </td>
                      <td className="max-w-[14rem] px-3 py-3">{r.venue}</td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <span className={STATUS_CLS[r.status]}>{STATUS_LABEL[r.status]}</span>
                        {!r.tickets && r.status === "on_sale" && <span className="block text-[#5d7088]">no link</span>}
                      </td>
                      <td className="px-3 py-3">
                        <Badge v={v} />
                      </td>
                      <td className="px-3 py-3">
                        <Actions r={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="mt-6 text-xs text-[#5d7088]">
        Only events marked “published” appear on the site. Past events drop off the site by themselves the day after.
      </p>
    </>
  );
}
