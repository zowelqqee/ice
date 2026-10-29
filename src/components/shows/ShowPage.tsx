"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { gsap } from "gsap";
import type { Show, TourDate, Track } from "@/lib/data";
import { ticketState } from "@/lib/ticket";
import { ShowVisual } from "./ShowVisual";
import { LoopVideo, Still } from "../media/Media";
import { BladeLink } from "../shell/Transition";
import { IceButton } from "../ui/IceButton";
import { player } from "@/lib/audio/music";
import type { Dictionary } from "@/i18n";

const fmt = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

function ListenButton({ track, accent, label }: { track: Track; accent: string; label: string }) {
  const st = useSyncExternalStore(player.subscribe, player.getState, player.getState);
  const playing = st.playing && st.track?.id === track.id;
  return (
    <button
      type="button"
      onClick={() => player.toggle(track)}
      aria-pressed={playing}
      className="group inline-flex items-center gap-4 border border-ice/60 py-3 pl-3 pr-6 transition-colors hover:border-[var(--a)]"
      style={{ "--a": accent } as React.CSSProperties}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: accent }}>
        {playing ? (
          <span aria-hidden className="flex gap-[3px]">
            <span className="h-3 w-[2px] bg-ink" />
            <span className="h-3 w-[2px] bg-ink" />
          </span>
        ) : (
          <span aria-hidden className="ml-[2px] h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-ink" />
        )}
      </span>
      <span className="text-left">
        <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-frost">{label}</span>
        <span className="display block text-[22px] leading-tight">{track.title}</span>
      </span>
    </button>
  );
}

export function ShowPage({
  show,
  next,
  dates,
  track,
  t,
  tTour,
}: {
  show: Show;
  next: Show;
  dates: TourDate[];
  track?: Track;
  t: Dictionary["shows"];
  tTour: Dictionary["tour"];
}) {
  const root = useRef<HTMLElement>(null);
  const released = show.status === "touring";

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from("[data-rise]", { yPercent: 110, duration: 1.3, ease: "expo.out", stagger: 0.08, delay: 0.5 });
      gsap.to("[data-hero-media]", {
        yPercent: 18,
        scale: 1.08,
        ease: "none",
        scrollTrigger: { trigger: "[data-hero]", start: "top top", end: "bottom top", scrub: true },
      });
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((n) =>
        gsap.from(n, { y: 50, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: n, start: "top 85%" } }),
      );
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <main ref={root} style={{ "--a": show.accent } as React.CSSProperties}>
      {/* hero */}
      <section data-hero className="relative h-svh min-h-[560px] overflow-hidden">
        <div data-hero-media className="absolute inset-0">
          <ShowVisual show={show} variant="hero" priority className="h-full w-full" />
        </div>
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink via-ink/20 to-ink/50" />
        <div className="absolute inset-x-[var(--gutter)] bottom-[9svh]">
          <BladeLink href="/#shows" className="eyebrow mb-8 inline-flex items-center gap-3 hover:text-ice">
            <span aria-hidden>←</span> {t.back}
          </BladeLink>
          <p className="mb-4 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em]" style={{ color: show.accent }}>
            <span aria-hidden className="h-px w-10" style={{ background: show.accent }} />
            {show.status === "touring" ? t.touring : show.status === "coming" ? t.coming : t.tba}
          </p>
          <h1 className="overflow-hidden">
            <span data-rise className="display block text-[22vw] md:text-[13vw]">
              {show.title}
            </span>
            <span className="block overflow-hidden">
              <span data-rise className="display block text-[9vw] text-frost md:text-[4.4vw]">
                {show.subtitle}
              </span>
            </span>
          </h1>
        </div>
      </section>

      {/* story */}
      <section className="grid gap-14 px-[var(--gutter)] py-24 md:grid-cols-12 md:py-36">
        <div className="md:col-span-7">
          <p data-reveal className="display text-[10vw] leading-[0.95] md:text-[4.6vw]">
            {show.logline}
          </p>
          <div className="mt-12 space-y-6 md:columns-2 md:gap-10 md:space-y-0">
            {show.synopsis.map((p, i) => (
              <p data-reveal key={i} className="mb-6 break-inside-avoid text-[16px] leading-relaxed text-frost">
                {p}
              </p>
            ))}
          </div>
          {track && (
            <div data-reveal className="mt-10">
              <ListenButton track={track} accent={show.accent} label={t.listen} />
            </div>
          )}
        </div>
        <aside className="md:col-span-4 md:col-start-9">
          {show.media.posterTall && (
            <div data-reveal className="mb-10 max-w-sm md:max-w-none">
              <Still src={show.media.posterTall.poster} alt={`${show.title} ${show.subtitle}: poster`} width={720} height={1280} className="h-auto w-full" />
            </div>
          )}
          {(show.facts.duration || show.facts.age) && (
            <dl data-reveal className="grid grid-cols-2 border-t border-deep">
              {show.facts.duration && (
                <div className="border-b border-deep py-5">
                  <dt className="eyebrow">{t.duration}</dt>
                  <dd className="display mt-2 text-[32px]">{show.facts.duration}</dd>
                </div>
              )}
              {show.facts.age && (
                <div className="border-b border-deep py-5">
                  <dt className="eyebrow">{t.age}</dt>
                  <dd className="display mt-2 text-[32px]">{show.facts.age}</dd>
                </div>
              )}
            </dl>
          )}
          {show.highlights.length > 0 && (
            <div data-reveal className="mt-10">
              <p className="eyebrow mb-4">{t.highlights}</p>
              {/* cues, numbered like a score */}
              <ol className="space-y-3">
                {show.highlights.map((h, i) => (
                  <li key={h} className="flex items-baseline gap-4 border-b border-deep pb-3">
                    <span className="font-mono text-[11px] tracking-[0.2em]" style={{ color: show.accent }}>
                      CUE {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[17px]">{h}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>
      </section>

      {show.media.extra && (
        <section className="px-[var(--gutter)]">
          <div data-reveal className="relative aspect-[16/9] w-full overflow-hidden md:aspect-[21/9]">
            <LoopVideo media={show.media.extra} className="absolute inset-0 h-full w-full object-cover" />
          </div>
        </section>
      )}

      {/* dates */}
      {released && (
        <section className="px-[var(--gutter)] py-24 md:py-36">
          <h2 data-reveal className="display mb-10 text-[14vw] md:text-[7vw]">
            {t.dates}
          </h2>
          {dates.length ? (
            <ol className="divide-y divide-deep border-y border-deep">
              {dates.map((d) => (
                <li key={d.id} className="grid grid-cols-1 items-center gap-3 py-5 sm:grid-cols-[14rem_1fr_auto] sm:gap-6">
                  <time dateTime={`${d.date}T${d.time}`} className="font-mono text-[12px] uppercase tracking-[0.18em] text-frost">
                    {fmt(d.date)} · {d.time}
                  </time>
                  <p>
                    <span className="display text-[34px] leading-none">{d.city}</span>
                    <span className="ml-3 text-[13px] text-frost">{d.venue}</span>
                    {d.placeholder && <span className="ml-3 border border-accent/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-accent">{tTour.sample}</span>}
                  </p>
                  <IceButton
                    href={ticketState(d) === "tickets" ? d.tickets : null}
                    disabled={ticketState(d) !== "tickets"}
                    seed={d.id}
                    accent={show.accent}
                  >
                    {tTour[ticketState(d)]}
                  </IceButton>
                </li>
              ))}
            </ol>
          ) : (
            <p className="max-w-[46ch] text-frost">{t.noDates}</p>
          )}
        </section>
      )}
      {!released && (
        <section className="px-[var(--gutter)] py-24">
          <p className="max-w-[46ch] text-[17px] text-frost">{t.noDates}</p>
        </section>
      )}

      {/* next story */}
      <BladeLink
        href={`/shows/${next.slug}`}
        accent={next.accent}
        className="group relative block overflow-hidden border-t border-deep px-[var(--gutter)] py-24 md:py-32"
      >
        <span className="eyebrow">{t.next}</span>
        <span className="display mt-4 block text-[16vw] transition-colors duration-500 group-hover:text-[var(--n)] md:text-[10vw]" style={{ "--n": next.accent } as React.CSSProperties}>
          {next.title} <em className="text-frost">{next.subtitle}</em>
        </span>
        <span aria-hidden className="absolute bottom-0 left-0 h-px w-full origin-left scale-x-0 transition-transform duration-700 ease-[var(--ease-blade)] group-hover:scale-x-100" style={{ background: next.accent }} />
      </BladeLink>
    </main>
  );
}
