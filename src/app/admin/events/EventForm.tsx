"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import type { EventFormState } from "../actions";
import { btnGhost, btnPrimary, errorText, field, fieldError, hint, label } from "../styles";

export interface EventFormValues {
  show: string;
  date: string;
  time: string;
  city: string;
  country: string;
  venue: string;
  tickets: string;
  status: string;
  published: boolean;
  lat: string;
  lon: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const range = (from: number, to: number, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);

/** Date as day / month / year selects. A native date field would show the browser's own
 *  placeholder (in the browser's language, possibly Cyrillic); selects stay English and are easy
 *  on a phone. The server checks the combined value (e.g. 30 Feb is refused). */
function DateSelects({ value, invalid }: { value: string; invalid: boolean }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const [y, setY] = useState(m?.[1] ?? "");
  const [mo, setMo] = useState(m?.[2] ?? "");
  const [d, setD] = useState(m?.[3] ?? "");
  const now = new Date().getFullYear();
  const years = [...new Set([...range(now - 1, now + 3), ...(m ? [Number(m[1])] : [])])].sort();
  const cls = `${field} ${invalid ? fieldError : ""} px-2`;
  const aria = invalid ? { "aria-invalid": true as const, "aria-describedby": "date-error" } : {};
  return (
    <div className="grid grid-cols-[1fr_1.3fr_1.3fr] gap-2">
      <select id="date" aria-label="Day" required value={d} onChange={(e) => setD(e.target.value)} className={cls} {...aria}>
        <option value="">Day</option>
        {range(1, 31).map((n) => (
          <option key={n} value={pad(n)}>
            {n}
          </option>
        ))}
      </select>
      <select aria-label="Month" required value={mo} onChange={(e) => setMo(e.target.value)} className={cls} {...aria}>
        <option value="">Month</option>
        {MONTHS.map((name, i) => (
          <option key={name} value={pad(i + 1)}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label="Year" required value={y} onChange={(e) => setY(e.target.value)} className={cls} {...aria}>
        <option value="">Year</option>
        {years.map((n) => (
          <option key={n} value={String(n)}>
            {n}
          </option>
        ))}
      </select>
      <input type="hidden" name="date" value={y && mo && d ? `${y}-${mo}-${d}` : ""} />
    </div>
  );
}

/** Start time as hour / minute selects (24 h, 5-minute steps), for the same reason. */
function TimeSelects({ value, invalid }: { value: string; invalid: boolean }) {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  const [h, setH] = useState(m?.[1] ?? "");
  const [min, setMin] = useState(m?.[2] ?? "");
  const minutes = [...new Set([...range(0, 55, 5).map(pad), ...(m ? [m[2]] : [])])].sort();
  const cls = `${field} ${invalid ? fieldError : ""} px-2`;
  const aria = invalid ? { "aria-invalid": true as const, "aria-describedby": "time-error" } : {};
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <select id="time" aria-label="Hour" required value={h} onChange={(e) => setH(e.target.value)} className={cls} {...aria}>
        <option value="">Hour</option>
        {range(0, 23).map((n) => (
          <option key={n} value={pad(n)}>
            {pad(n)}
          </option>
        ))}
      </select>
      <span aria-hidden>:</span>
      <select aria-label="Minute" required value={min} onChange={(e) => setMin(e.target.value)} className={cls} {...aria}>
        <option value="">Min</option>
        {minutes.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <input type="hidden" name="time" value={h && min ? `${h}:${min}` : ""} />
    </div>
  );
}

interface Place {
  city: string;
  country: string;
  lat: number | null;
  lon: number | null;
}

export function EventForm({
  action,
  initial,
  shows,
  countries,
  statuses,
  places,
  submitLabel,
}: {
  action: (state: EventFormState, form: FormData) => Promise<EventFormState>;
  initial: EventFormValues;
  shows: { slug: string; label: string }[];
  countries: { code: string; name: string }[];
  statuses: { value: string; label: string }[];
  places: Place[];
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const countryRef = useRef<HTMLSelectElement>(null);
  const latRef = useRef<HTMLInputElement>(null);
  const lonRef = useRef<HTMLInputElement>(null);
  const errors = state?.errors ?? {};
  const typed = state?.values;
  const v = (k: Exclude<keyof EventFormValues, "published">) => typed?.[k] ?? initial[k];
  const published = typed ? typed.published === "on" : initial.published;

  // a city already on the list fills in its country and map position
  const onCity = (city: string) => {
    const hit = places.find((p) => p.city.toLowerCase() === city.trim().toLowerCase());
    if (!hit) return;
    if (countryRef.current) countryRef.current.value = hit.country;
    if (hit.lat !== null && hit.lon !== null && latRef.current && lonRef.current && !latRef.current.value && !lonRef.current.value) {
      latRef.current.value = String(hit.lat);
      lonRef.current.value = String(hit.lon);
    }
  };

  const err = (k: keyof typeof errors) =>
    errors[k] ? (
      <p id={`${k}-error`} className={errorText}>
        {errors[k]}
      </p>
    ) : null;
  const aria = (k: keyof typeof errors) =>
    errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${k}-error` } : {};
  const cls = (k: keyof typeof errors) => `${field} ${errors[k] ? fieldError : ""}`;

  return (
    // remount after a failed save so every field shows what was typed
    <form key={state?.at ?? 0} action={formAction} className="max-w-2xl space-y-5">
      {Object.keys(errors).length > 0 && (
        <p role="alert" className="rounded-md border border-[#5a2630] bg-[#1d0b10] px-3 py-2 text-sm text-[#ff9aa8]">
          Please fix the marked fields.
        </p>
      )}

      <div>
        <label htmlFor="show" className={label}>
          Show
        </label>
        <select id="show" name="show" required defaultValue={v("show")} className={cls("show")} {...aria("show")}>
          <option value="" disabled>
            Choose a show…
          </option>
          {shows.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.label}
            </option>
          ))}
        </select>
        {err("show")}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="date" className={label}>
            Date
          </label>
          <DateSelects value={v("date")} invalid={Boolean(errors.date)} />
          {err("date")}
        </div>
        <div>
          <label htmlFor="time" className={label}>
            Start time (local)
          </label>
          <TimeSelects value={v("time")} invalid={Boolean(errors.time)} />
          {err("time")}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="city" className={label}>
            City
          </label>
          <input
            id="city"
            name="city"
            required
            maxLength={120}
            list="known-cities"
            autoComplete="off"
            defaultValue={v("city")}
            onChange={(e) => onCity(e.target.value)}
            className={cls("city")}
            {...aria("city")}
          />
          <datalist id="known-cities">
            {places.map((p) => (
              <option key={`${p.city}|${p.country}`} value={p.city} />
            ))}
          </datalist>
          {err("city")}
        </div>
        <div>
          <label htmlFor="country" className={label}>
            Country
          </label>
          <select
            id="country"
            name="country"
            required
            ref={countryRef}
            defaultValue={v("country")}
            className={cls("country")}
            {...aria("country")}
          >
            <option value="" disabled>
              Choose a country…
            </option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {err("country")}
        </div>
      </div>

      <div>
        <label htmlFor="venue" className={label}>
          Venue
        </label>
        <input id="venue" name="venue" required maxLength={120} defaultValue={v("venue")} className={cls("venue")} {...aria("venue")} />
        {err("venue")}
      </div>

      <div>
        <label htmlFor="tickets" className={label}>
          Ticket link <span className="text-[#5d7088]">(optional)</span>
        </label>
        <input
          id="tickets"
          name="tickets"
          type="url"
          inputMode="url"
          placeholder="https://"
          defaultValue={v("tickets")}
          className={cls("tickets")}
          {...aria("tickets")}
        />
        {err("tickets") ?? <p className={hint}>Without a link the site shows “Soon” instead of “Tickets”.</p>}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="status" className={label}>
            Status
          </label>
          <select id="status" name="status" required defaultValue={v("status")} className={cls("status")} {...aria("status")}>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {err("status")}
        </div>
        <div className="sm:pt-7">
          <label className="flex items-center gap-3 rounded-md border border-[#2a3a52] px-3 py-2.5">
            <input name="published" type="checkbox" defaultChecked={published} className="h-5 w-5 accent-[#5cf2ff]" />
            <span>
              Published <span className="block text-xs text-[#8fa3b8]">Shown on the site</span>
            </span>
          </label>
        </div>
      </div>

      <details open={Boolean(errors.lat)} className="rounded-md border border-[#1c2738] px-3 py-2">
        <summary className="cursor-pointer py-1 text-sm text-[#c9d6e3]">Map position (optional)</summary>
        <p className={`${hint} mb-3`}>
          Filled in by itself for a city already on the list. Without it the event is listed but not drawn on the tour map.
        </p>
        <div className="grid grid-cols-2 gap-3 pb-2">
          <div>
            <label htmlFor="lat" className={label}>
              Latitude
            </label>
            <input id="lat" name="lat" inputMode="decimal" ref={latRef} defaultValue={v("lat")} placeholder="48.2082" className={cls("lat")} {...aria("lat")} />
          </div>
          <div>
            <label htmlFor="lon" className={label}>
              Longitude
            </label>
            <input id="lon" name="lon" inputMode="decimal" ref={lonRef} defaultValue={v("lon")} placeholder="16.3738" className={cls("lat")} />
          </div>
        </div>
        {err("lat")}
      </details>

      <div className="flex flex-wrap gap-3 pt-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href="/admin" className={btnGhost}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
