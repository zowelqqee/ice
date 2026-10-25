"use client";

import { useEffect, useRef, useState } from "react";
import type { Show } from "@/lib/data";
import { ShowVisual } from "./ShowVisual";
import { BladeLink } from "../shell/Transition";
import type { Dictionary } from "@/i18n";

const pad = (n: number) => String(n).padStart(2, "0");

function statusLabel(s: Show, t: Dictionary["shows"]) {
  return s.status === "touring" ? t.touring : s.status === "coming" ? t.coming : t.tba;
}

function Panel({ show, i, t }: { show: Show; i: number; t: Dictionary["shows"] }) {
  const released = show.status === "touring";
  return (
    <article
      data-panel
      data-accent={show.accent}
      className="group relative flex h-full shrink-0 snap-center flex-col justify-end md:w-[62vw] md:justify-center md:pr-[6vw]"
      style={{ "--a": show.accent } as React.CSSProperties}
      aria-labelledby={`show-${show.slug}`}
    >
      <BladeLink href={`/shows/${show.slug}`} accent={show.accent} className="absolute inset-0 z-10" aria-label={`${show.title} ${show.subtitle}: ${t.open}`}>
        <span className="sr-only">{t.open}</span>
      </BladeLink>

      <div className="relative h-[62svh] w-full overflow-hidden md:ml-[8vw] md:h-[70vh] md:w-[38vw]">
        <div data-parallax className="absolute inset-[-6%_-12%] will-change-transform">
          <ShowVisual show={show} className="h-full w-full transition-transform duration-[1200ms] ease-[var(--ease-glide)] group-hover:scale-[1.04]" />
        </div>
        {/* accent edge light */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-[var(--a)] opacity-70 shadow-[0_0_18px_2px_var(--a)]" />
      </div>

      <div className="pointer-events-none relative z-[1] mt-6 md:absolute md:bottom-[12vh] md:left-0 md:mt-0">
        <p className="mb-3 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-frost">
          <span className="text-ice">{pad(i + 1)}</span>
          <span aria-hidden className="h-px w-8 bg-[var(--a)]" />
          <span style={{ color: released ? show.accent : undefined }}>{statusLabel(show, t)}</span>
        </p>
        <h3 id={`show-${show.slug}`} className="display text-[16vw] mix-blend-difference md:text-[8.4vw]">
          {show.title}
        </h3>
        <p className="display -mt-1 text-[7vw] text-frost md:text-[2.8vw]">{show.subtitle}</p>
        <p className="mt-4 max-w-[34ch] text-[15px] leading-snug text-frost md:max-w-[30ch]">{show.logline}</p>
        <p className="mt-6 inline-flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.24em] text-ice">
          {t.open}
          <span aria-hidden className="inline-block h-px w-10 origin-left bg-ice transition-transform duration-500 group-hover:scale-x-[1.8] group-hover:bg-[var(--a)]" />
        </p>
      </div>
    </article>
  );
}

export function ShowsSection({ t, shows }: { t: Dictionary["shows"]; shows: Show[] }) {
  const section = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLSpanElement>(null);
  const [ends, setEnds] = useState({ start: true, end: false });

  // An ordinary row: the page scrolls on down past it, and the visitor browses sideways only if
  // they want to (arrows, swipe, trackpad). As it moves, the footage drifts against the travel,
  // the bar shows how far along it is, and the section light takes the colour of the show nearest
  // the middle.
  useEffect(() => {
    const el = section.current;
    const tr = track.current;
    if (!el || !tr) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = tr.scrollWidth - tr.clientWidth;
      const x = tr.scrollLeft;
      if (progress.current) progress.current.style.transform = `scaleX(${max > 0 ? x / max : 0})`;
      setEnds((e) => {
        const next = { start: x < 8, end: x > max - 8 };
        return e.start === next.start && e.end === next.end ? e : next;
      });
      const mid = window.innerWidth * 0.6;
      let best: HTMLElement | null = null;
      let bestD = Infinity;
      tr.querySelectorAll<HTMLElement>("[data-panel]").forEach((panel) => {
        const r = panel.getBoundingClientRect();
        const c = r.left + r.width / 2;
        if (Math.abs(c - mid) < bestD) {
          bestD = Math.abs(c - mid);
          best = panel;
        }
        const media = panel.querySelector<HTMLElement>("[data-parallax]");
        if (media && !reduced) {
          const k = Math.max(-1, Math.min(1, (c - window.innerWidth / 2) / window.innerWidth));
          media.style.transform = `translate3d(${k * 7}%, 0, 0)`;
        }
      });
      const lead = (best as HTMLElement | null)?.dataset.accent;
      el.style.setProperty("--glow", lead && x > 8 ? lead : "#5cf2ff");
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    tr.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      tr.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  /** One show along: to the next snap position past the current one (panels snap to their
   *  centre on phones, to their start on wider screens). */
  const step = (dir: 1 | -1) => {
    const tr = track.current;
    if (!tr) return;
    const items = Array.from(tr.children) as HTMLElement[];
    const pad = parseFloat(getComputedStyle(tr).scrollPaddingLeft) || 0;
    const x = tr.scrollLeft;
    const stops = items
      .map((c) => {
        const align = getComputedStyle(c).scrollSnapAlign;
        if (align.includes("center")) return c.offsetLeft + c.offsetWidth / 2 - tr.clientWidth / 2;
        return align.includes("start") ? c.offsetLeft - pad : NaN;
      })
      .filter((l) => l >= 0);
    const target = dir > 0 ? stops.find((l) => l > x + 8) : [...stops].reverse().find((l) => l < x - 8);
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    tr.scrollTo({ left: target ?? (dir > 0 ? tr.scrollWidth : 0), behavior });
  };

  const arrow = "pointer-events-auto grid h-12 w-12 place-items-center rounded-full border border-mist/60 bg-ink/60 text-ice backdrop-blur transition-[opacity,border-color,background-color] duration-300 hover:border-ice hover:bg-deep/80 disabled:pointer-events-none disabled:opacity-25 md:h-14 md:w-14";

  return (
    <section
      id="shows"
      ref={section}
      aria-labelledby="shows-title"
      className="relative overflow-hidden md:h-svh"
      style={{ "--glow": "#5cf2ff" } as React.CSSProperties}
    >
      {/* ambient light in the colour of the show in front */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[background] duration-1000"
        style={{ background: "radial-gradient(50% 60% at 60% 70%, color-mix(in oklab, var(--glow) 16%, transparent), transparent 70%)" }}
      />

      <div
        ref={track}
        id="shows-track"
        className="relative flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-6 overflow-x-auto overscroll-x-contain px-[var(--gutter)] pb-24 pt-28 [scrollbar-width:none] md:h-full md:snap-proximity md:gap-0 md:p-0 md:scroll-px-0 [&::-webkit-scrollbar]:hidden"
      >
        {/* intro panel */}
        <header className="flex w-[84vw] shrink-0 snap-start flex-col justify-center md:w-[46vw] md:pl-[var(--gutter)] md:pr-[4vw]">
          <p className="eyebrow mb-6">{t.eyebrow}</p>
          <h2 id="shows-title" className="display text-[17vw] md:text-[8.8vw]">
            {t.title}
            <br />
            <em className="text-accent">{t.titleItalic}</em>
          </h2>
          <p className="mt-8 max-w-[34ch] text-[16px] leading-relaxed text-frost">{t.intro}</p>
          <p className="eyebrow mt-10 hidden items-center gap-4 md:flex">
            {t.dragHint}
            <span aria-hidden className="h-px w-16 bg-mist" />
          </p>
        </header>
        {shows.map((s, i) => (
          <div key={s.slug} className="w-[84vw] shrink-0 snap-center md:w-auto md:snap-start">
            <Panel show={s} i={i} t={t} />
          </div>
        ))}
        <div aria-hidden className="w-[8vw] shrink-0" />
      </div>

      {/* arrows and how far along the row is */}
      <div className="pointer-events-none absolute bottom-6 left-[var(--gutter)] right-[var(--gutter)] z-20 flex items-center gap-4 md:bottom-8 md:gap-6">
        <button type="button" className={arrow} onClick={() => step(-1)} disabled={ends.start} aria-label={t.prevShow} aria-controls="shows-track">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <span aria-hidden className="relative block h-px flex-1 bg-deep">
          <span ref={progress} className="absolute inset-0 block origin-left scale-x-0 bg-ice" />
        </span>
        <button type="button" className={arrow} onClick={() => step(1)} disabled={ends.end} aria-label={t.nextShow} aria-controls="shows-track">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
    </section>
  );
}
