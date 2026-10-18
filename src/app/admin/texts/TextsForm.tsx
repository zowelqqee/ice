"use client";

import { useActionState, useState } from "react";
import type { FormState } from "../content-actions";
import { FormErrors } from "../fields";
import { btnGhost, btnPrimary, errorText, field, fieldError, hint } from "../styles";

export interface TextRow {
  path: string;
  group: string;
  original: string;
  current: string;
}

const GROUPS: Record<string, string> = {
  meta: "Search engines and link previews",
  nav: "Menu",
  gate: "Entry screen",
  sound: "Sound button",
  hero: "First screen",
  shows: "Shows",
  tour: "Tour",
  music: "Music",
  footer: "Footer",
};

const human = (path: string) =>
  path
    .split(".")
    .slice(1)
    .join(" › ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

export function TextsForm({ action, rows }: { action: (s: FormState, f: FormData) => Promise<FormState>; rows: TextRow[] }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [filter, setFilter] = useState("");
  const e = state?.errors ?? {};
  const typed = state?.values;
  const groups = [...new Set(rows.map((r) => r.group))];
  const q = filter.trim().toLowerCase();
  const visible = (r: TextRow) => !q || r.current.toLowerCase().includes(q) || r.original.toLowerCase().includes(q) || r.path.toLowerCase().includes(q);

  return (
    <form key={state?.at ?? 0} action={formAction} className="max-w-3xl space-y-5">
      <FormErrors errors={e} />
      <input
        type="search"
        value={filter}
        onChange={(ev) => setFilter(ev.target.value)}
        placeholder="Find a text…"
        aria-label="Find a text"
        className={field}
      />
      {groups.map((g) => {
        const list = rows.filter((r) => r.group === g);
        const shown = list.filter(visible);
        const changed = list.filter((r) => r.current !== r.original).length;
        return (
          <details key={g} open={!!q || list.some((r) => e[r.path])} className={`rounded-lg border border-[#1c2738] ${shown.length ? "" : "hidden"}`}>
            <summary className="cursor-pointer px-4 py-3 font-medium">
              {GROUPS[g] ?? g} <span className="text-sm font-normal text-[#8fa3b8]">· {list.length} texts{changed ? `, ${changed} changed` : ""}</span>
            </summary>
            <div className="space-y-4 border-t border-[#1c2738] px-4 py-4">
              {list.map((r) => (
                <TextRowField key={r.path} row={r} hidden={!visible(r)} error={e[r.path]} typed={typed?.[`t:${r.path}`]} />
              ))}
            </div>
          </details>
        );
      })}
      <p className={hint}>An emptied field goes back to the original text.</p>
      <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-[#1c2738] bg-[#070a10]/95 px-4 py-3 backdrop-blur">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : "Save texts"}
        </button>
      </div>
    </form>
  );
}

function TextRowField({ row, hidden, error, typed }: { row: TextRow; hidden: boolean; error?: string; typed?: string }) {
  const [value, setValue] = useState(typed ?? row.current);
  const long = row.original.length > 70;
  const name = `t:${row.path}`;
  const changed = value.trim() !== row.original && value.trim() !== "";
  const cls = `${field} ${error ? fieldError : ""}`;
  return (
    <div className={hidden ? "hidden" : ""}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={name} className="text-sm text-[#c9d6e3]">
          {human(row.path)} {changed && <span className="ml-1 rounded border border-[#1f5b4a] px-1 text-xs text-[#9ff0d2]">changed</span>}
        </label>
        {changed && (
          <button type="button" onClick={() => setValue(row.original)} className={`${btnGhost} px-2 py-1 text-xs`}>
            Original
          </button>
        )}
      </div>
      {long ? (
        <textarea id={name} name={name} rows={3} value={value} onChange={(ev) => setValue(ev.target.value)} className={cls} />
      ) : (
        <input id={name} name={name} value={value} onChange={(ev) => setValue(ev.target.value)} className={cls} />
      )}
      {error ? <p className={errorText}>{error}</p> : changed ? <p className={hint}>Original: {row.original}</p> : null}
    </div>
  );
}
