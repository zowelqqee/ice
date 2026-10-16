"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import type { MapStop } from "@/lib/map";
import type { TourDate } from "@/lib/data";
import { ticketState } from "@/lib/ticket";
import { IceButton } from "../ui/IceButton";
import { BladeLink } from "../shell/Transition";
import type { Dictionary } from "@/i18n";

interface ShowInfo {
  slug: string;
  title: string;
  subtitle: string;
  accent: string;
}

const fmt = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    day: d.toLocaleDateString("en-GB", { day: "2-digit", timeZone: "UTC" }),
    month: d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    year: d.getUTCFullYear(),
    weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
  };
};

export function TourView({
  t,
  dates,
  shows,
  map,
  width,
  height,
}: {
  t: Dictionary["tour"];
  dates: TourDate[];
  shows: ShowInfo[];
  map: { stops: MapStop[]; route: string[] };
  width: number;
  height: number;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const byShow = useMemo(() => Object.fromEntries(shows.map((s) => [s.slug, s])), [shows]);
  const touringShows = shows.filter((s) => dates.some((d) => d.show === s.slug));
  const visible = dates.filter((d) => !filter || d.show === filter);
  const anyPlaceholder = dates.some((d) => d.placeholder);

  // draw the route as the section scrolls into view
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const segs = el.querySelectorAll<SVGPathElement>("[data-route]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return segs.forEach((s) => (s.style.strokeDashoffset = "0"));
    const ctx = gsap.context(() => {
      gsap.fromTo(
        segs,
        { strokeDashoffset: 1 },
        {
          strokeDashoffset: 0,
          ease: "none",
          stagger: 0.5,
          scrollTrigger: { trigger: el, start: "top 70%", end: "center 40%", scrub: 0.6 },
        },
      );
      gsap.from("[data-stop]", {
        scale: 0,
        transformOrigin: "center",
        stagger: 0.05,
        ease: "back.out(3)",
        scrollTrigger: { trigger: el, start: "top 65%" },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  const active = hover;
  return (
    <div ref={root} className="grid gap-12 lg:grid-cols-12 lg:gap-10">
      {/* map */}
      <div className="relative lg:sticky lg:top-24 lg:col-span-7 lg:self-start">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Map of the tour route">
          <defs>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* land layer: static SVG served separately (keeps geodata out of the page) */}
          <image href="/media/tour-map.svg" width={width} height={height} />
          <g filter="url(#glow)">
            {map.route.map((d, i) => (
              <path
                key={i}
                data-route
                d={d}
                pathLength={1}
                fill="none"
                stroke="#5cf2ff"
                strokeWidth="1.2"
                strokeDasharray="1"
                strokeDashoffset="1"
                strokeLinecap="round"
                opacity={filter ? 0.25 : 0.9}
              />
            ))}
          </g>
          {map.stops.map((s) => {
            const show = byShow[s.show];
            const dim = filter && s.show !== filter;
            const on = active === s.id;
            return (
              <g key={s.id} data-stop transform={`translate(${s.x} ${s.y})`} opacity={dim ? 0.2 : 1} className="transition-opacity duration-500">
                <circle r={on ? 14 : 8} fill={show?.accent} opacity="0.18" className="transition-all duration-300" />
                <circle r={on ? 4.5 : 3} fill={on ? "#fff" : show?.accent} className="transition-all duration-300" />
                {on && (
                  <text x="12" y="-10" className="fill-ice font-mono text-[13px] uppercase tracking-[0.18em]">
                    {s.city}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {anyPlaceholder && (
          <p className="mt-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-frost">
            <span className="border border-accent/60 px-2 py-1 text-accent">{t.sample}</span>
            {t.sampleNote}
          </p>
        )}
      </div>

      {/* dates */}
      <div className="lg:col-span-5">
        <div role="group" aria-label={t.filter} className="mb-8 flex flex-wrap gap-2">
          {[{ slug: null, title: t.all, accent: "#eaf6ff" }, ...touringShows].map((s) => (
            <button
              key={s.slug ?? "all"}
              type="button"
              aria-pressed={filter === s.slug}
              onClick={() => setFilter(s.slug)}
              className="flex items-center gap-2 border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors"
              style={{
                borderColor: filter === s.slug ? s.accent : "rgba(147,166,187,0.35)",
                color: filter === s.slug ? s.accent : "#93a6bb",
              }}
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: s.accent }} />
              {s.title}
            </button>
          ))}
        </div>

        <h3 className="sr-only">{t.list}</h3>
        {dates.length === 0 && <p className="max-w-[46ch] border-y border-deep py-8 text-frost">{t.empty}</p>}
        <ol className="divide-y divide-deep border-y border-deep">
          {visible.map((d) => {
            const f = fmt(d.date);
            const show = byShow[d.show];
            const state = ticketState(d);
            return (
              <li
                key={d.id}
                onMouseEnter={() => setHover(d.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(d.id)}
                onBlur={() => setHover(null)}
                className="group grid grid-cols-[4.5rem_1fr_auto] items-center gap-4 py-5 transition-colors hover:bg-abyss/60 sm:grid-cols-[5.5rem_1fr_auto]"
              >
                <time dateTime={`${d.date}T${d.time}`} className="font-mono uppercase leading-none">
                  <span className="block text-[30px] text-ice sm:text-[36px]">{f.day}</span>
                  <span className="mt-1 block text-[11px] tracking-[0.2em] text-frost">
                    {f.month} {String(f.year).slice(2)} · {f.weekday}
                  </span>
                </time>
                <div className="min-w-0">
                  <p className={`display truncate text-[30px] leading-none sm:text-[38px] ${state === "cancelled" ? "text-frost line-through decoration-1" : ""}`}>
                    {d.city}
                  </p>
                  <p className="mt-1.5 truncate text-[13px] text-frost">
                    {d.venue} · {d.time}
                  </p>
                  {show && (
                    <BladeLink
                      href={`/shows/${show.slug}`}
                      accent={show.accent}
                      className="relative z-[1] mt-1.5 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] hover:underline"
                      style={{ color: show.accent }}
                    >
                      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: show.accent }} />
                      {show.title} {show.subtitle}
                    </BladeLink>
                  )}
                </div>
                <IceButton
                  href={state === "tickets" ? d.tickets : null}
                  seed={d.id}
                  accent={show?.accent}
                  disabled={state !== "tickets"}
                  ariaLabel={`${d.city}, ${f.day} ${f.month}`}
                >
                  {t[state]}
                </IceButton>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
