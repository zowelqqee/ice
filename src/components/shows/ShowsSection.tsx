"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Show } from "@/lib/data";
import { ShowVisual } from "./ShowVisual";
import { BladeLink } from "../shell/Transition";
import { useLenis } from "../SmoothScroll";
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
  const lenis = useLenis();
  const lenisRef = useRef(lenis);
  useEffect(() => {
    lenisRef.current = lenis;
  }, [lenis]);

  useEffect(() => {
    const el = section.current;
    const tr = track.current;
    if (!el || !tr) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
      const distance = () => tr.scrollWidth - window.innerWidth;
      const extras: (gsap.core.Tween | ScrollTrigger)[] = [];
      let released = false;
      // filled in below; the callbacks may fire while the tween is still being created
      const ref: { move?: gsap.core.Tween } = {};
      // The sideways travel happens once. After the visitor has scrolled through all the shows,
      // the section stops being pinned: the strip stays where it ended, as an ordinary row that
      // can be swiped sideways, and scrolling back up is plain vertical scrolling.
      const release = () => {
        const move = ref.move;
        if (released || !move?.scrollTrigger) return;
        released = true;
        const st = move.scrollTrigger;
        const pinned = st.end - st.start;
        const y = window.scrollY;
        move.progress(1);
        const x = distance();
        extras.forEach((e) => e.kill());
        st.kill(true);
        move.kill();
        gsap.set(tr, { clearProps: "transform" });
        tr.style.overflowX = "auto";
        tr.scrollLeft = x;
        if (progress.current) progress.current.style.transform = "scaleX(1)";
        // the page is now shorter by the pinned distance: keep the same content in view
        const target = Math.max(0, y - pinned);
        if (lenisRef.current) lenisRef.current.scrollTo(target, { immediate: true, force: true });
        else window.scrollTo(0, target);
        ScrollTrigger.refresh();
      };
      const move = (ref.move = gsap.to(tr, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            if (progress.current) progress.current.style.transform = `scaleX(${self.progress})`;
          },
          onLeave: () => release(),
        },
      }));
      // footage drifts against the travel; the section light takes the colour of the show in front
      gsap.utils.toArray<HTMLElement>("[data-panel]", el).forEach((panel) => {
        const media = panel.querySelector("[data-parallax]");
        if (media)
          extras.push(
            gsap.fromTo(media, { xPercent: 7 }, {
              xPercent: -7,
              ease: "none",
              scrollTrigger: { trigger: panel, containerAnimation: move, start: "left right", end: "right left", scrub: true },
            }),
          );
        extras.push(ScrollTrigger.create({
          trigger: panel,
          containerAnimation: move,
          start: "left 60%",
          end: "right 60%",
          onToggle: (self) => self.isActive && el.style.setProperty("--glow", panel.dataset.accent ?? "#5cf2ff"),
        }));
      });
      // arriving with the page already scrolled past the shows (back button, a #tour link): no travel
      requestAnimationFrame(() => {
        const st = move.scrollTrigger;
        if (st && st.scroll() > st.end) release();
      });
    });
    return () => mm.revert();
  }, []);

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
        className="relative flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-6 overflow-x-auto px-[var(--gutter)] pb-14 pt-28 [scrollbar-width:none] md:h-full md:snap-none md:gap-0 md:overflow-visible md:p-0 md:motion-reduce:snap-x md:motion-reduce:overflow-x-auto [&::-webkit-scrollbar]:hidden"
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
          <div key={s.slug} className="w-[84vw] shrink-0 snap-center md:w-auto">
            <Panel show={s} i={i} t={t} />
          </div>
        ))}
        <div aria-hidden className="w-[8vw] shrink-0" />
      </div>

      {/* travel progress */}
      <div aria-hidden className="absolute bottom-8 left-[var(--gutter)] right-[var(--gutter)] hidden h-px bg-deep md:block">
        <span ref={progress} className="block h-full origin-left scale-x-0 bg-ice" />
      </div>
    </section>
  );
}
