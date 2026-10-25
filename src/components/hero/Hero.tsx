"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { impulse, spin } from "@/lib/spin";
import { heroScroll } from "@/lib/pointer";
import { useInView } from "@/lib/hooks/useInView";
import type { Dictionary } from "@/i18n";
import { audio } from "@/lib/audio/engine";
import { jingle, JINGLE_SWEEP } from "@/lib/audio/jingle";
import { WORDMARK_LETTERS, WORDMARK_VIEWBOX } from "./wordmark";
import { cueCurtains, onCurtainCue } from "./morph";

const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

const TURNS_PER_HERO = 4.5;
// bump when the poster frames are re-rendered (they keep their names)
const POSTER_V = "?v=8";

/** The title in the logo's own letterforms (vector shapes from the logo artwork), one group per
 *  letter so the scroll can pull them apart. */
function Wordmark({ className }: { className?: string }) {
  return (
    <svg data-wordmark viewBox={WORDMARK_VIEWBOX} className={className} aria-hidden focusable="false">
      {WORDMARK_LETTERS.map((d, i) => (
        <g key={i} data-l>
          <path d={d} fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

export function Hero({ t, onReady }: { t: Dictionary["hero"]; onReady: () => void }) {
  const section = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [boot, setBoot] = useState(false);
  const [cued, setCued] = useState(false);
  const visible = useInView(section, "10% 0px");

  // build the WebGL scene only after the first paint has landed and the main thread is idle,
  // so the poster frame (LCP) is never held up by shader compilation
  useEffect(() => {
    const ric: (cb: () => void, o?: { timeout: number }) => number =
      (window as Window & { requestIdleCallback?: typeof requestIdleCallback }).requestIdleCallback ??
      ((cb) => window.setTimeout(cb, 200));
    const start = () => ric(() => setBoot(true), { timeout: 900 });
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
  }, []);

  // the curtains part on the Enter screen's door opening (or below, once the scene is ready)
  useEffect(() => onCurtainCue(() => setCued(true)), []);

  // she spins to the jingle: a push on the opening sweep and on each bright chime
  useEffect(() => jingle.onAccent((t) => impulse(t === JINGLE_SWEEP ? 9 : 5)), []);

  // the scene stops rendering off-screen: silence the blade hiss it was driving
  useEffect(() => {
    if (!visible) audio.setSpin(0, 0);
  }, [visible]);

  const ready = () => {
    setLive(true);
    onReady();
    // no Enter screen (a revisit): the curtains part as soon as the stage is there
    if (!("gate" in document.documentElement.dataset)) cueCurtains();
  };

  // scroll: scrubs the turn, sinks the camera, pulls the title apart
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        onUpdate: (self) => {
          heroScroll.progress = self.progress;
          if (!spin.reduced) spin.scrollTarget = self.progress * TURNS_PER_HERO * Math.PI * 2;
        },
      });
      if (spin.reduced) return;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: el, start: "top top", end: "bottom bottom", scrub: 0.6 },
      });
      // letters drift apart and up, in the logo's units (the lettering is ~2230 units wide)
      tl.to("[data-wordmark] [data-l]", { y: -220, x: (i) => (i - 5.5) * 70, opacity: 0, stagger: 0.012, duration: 0.42, ease: "power2.in" }, 0)
        .to("[data-tagline]", { opacity: 0, y: -30, duration: 0.25, ease: "none" }, 0)
        .fromTo("[data-mid]", { opacity: 0, y: 40 }, { opacity: 1, y: 0, ease: "power2.out" }, 0.5)
        .to("[data-mid]", { opacity: 0, y: -40, ease: "power2.in" }, 0.82)
        .to("[data-fade]", { opacity: 1, ease: "none" }, 0.9);
    }, el);
    return () => ctx.revert();
  }, []);

  // drag (or horizontal swipe) to spin her; keyboard arrows do the same
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let lastX = 0;
    let down = false;
    const onDown = (e: PointerEvent) => {
      down = true;
      lastX = e.clientX;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      impulse(dx * 0.05);
    };
    const onUp = () => (down = false);
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") impulse(4);
    else if (e.key === "ArrowLeft") impulse(-4);
    else return;
    e.preventDefault();
  };

  return (
    <section id="top" ref={section} className="relative h-[240svh] md:h-[280vh]" aria-label="Musical on Ice">
      <div className="sticky top-0 h-svh w-full overflow-hidden">
        {/* instant first paint: a frame rendered from the 3D scene at its start pose, so the
            skater is the very first thing on screen; the live scene takes over invisibly */}
        <picture>
          <source media="(orientation: portrait)" srcSet={`/media/hero/skater-portrait.avif${POSTER_V}`} type="image/avif" />
          <source media="(orientation: portrait)" srcSet={`/media/hero/skater-portrait.webp${POSTER_V}`} type="image/webp" />
          <source media="(orientation: portrait)" srcSet={`/media/hero/skater-portrait.jpg${POSTER_V}`} />
          <source srcSet={`/media/hero/skater-landscape.avif${POSTER_V}`} type="image/avif" />
          <source srcSet={`/media/hero/skater-landscape.webp${POSTER_V}`} type="image/webp" />
          <img
            src={`/media/hero/skater-landscape.jpg${POSTER_V}`}
            alt=""
            width={1920}
            height={1080}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: live ? 0 : 1, transition: "opacity 0.9s ease 0.3s" }}
          />
        </picture>
        {/* the page opens on closed curtains (the same frame, rendered shut); they part in the live
            scene, or, without it, this layer fades to the parted frame below */}
        <picture className="motion-reduce:hidden">
          <source media="(orientation: portrait)" srcSet={`/media/hero/curtain-portrait.avif${POSTER_V}`} type="image/avif" />
          <source media="(orientation: portrait)" srcSet={`/media/hero/curtain-portrait.webp${POSTER_V}`} type="image/webp" />
          <source media="(orientation: portrait)" srcSet={`/media/hero/curtain-portrait.jpg${POSTER_V}`} />
          <source srcSet={`/media/hero/curtain-landscape.avif${POSTER_V}`} type="image/avif" />
          <source srcSet={`/media/hero/curtain-landscape.webp${POSTER_V}`} type="image/webp" />
          <img
            src={`/media/hero/curtain-landscape.jpg${POSTER_V}`}
            alt=""
            width={1920}
            height={1080}
            fetchPriority="high"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ opacity: live || cued ? 0 : 1, transition: live ? "opacity 0.9s ease 0.3s" : "opacity 1.6s ease" }}
          />
        </picture>

        <div
          ref={stageRef}
          tabIndex={0}
          role="img"
          aria-label={`${t.drag}. Past red stage curtains, a glass treble clef spins on the ice and turns into a skater, and back. Left and right arrow keys spin her.`}
          onKeyDown={onKey}
          className="absolute inset-0 cursor-grab touch-pan-y outline-none active:cursor-grabbing"
          style={{ opacity: live ? 1 : 0, transition: "opacity 0.5s ease" }}
        >
          {boot && <HeroCanvas onReady={ready} active={visible} />}
        </div>

        {/* title: the logo's lettering, one line above the skater (never over her) */}
        <h1 data-hero-ui className="pointer-events-none absolute inset-x-0 top-[12svh] flex select-none justify-center md:top-[11.5vh]">
          <span className="sr-only">Musical on Ice</span>
          <Wordmark className="block h-auto w-[84vw] overflow-visible text-ice drop-shadow-[0_0_22px_rgba(92,242,255,0.28)] md:w-[clamp(340px,40vw,700px)]" />
        </h1>

        <p
          data-hero-ui
          data-tagline
          className="absolute bottom-[8svh] left-[var(--gutter)] max-w-[22ch] text-[15px] leading-snug text-frost md:bottom-[9vh] md:max-w-[26ch] md:text-[17px]"
        >
          {t.tagline}
        </p>

        <p
          data-hero-ui
          data-mid
          className="display pointer-events-none absolute inset-x-[var(--gutter)] top-[18svh] text-center text-[11vw] text-ice opacity-0 drop-shadow-[0_2px_16px_rgba(6,20,34,0.75)] md:top-[16vh] md:text-[6.5vw]"
          aria-hidden
        >
          {t.mid}
        </p>

        <div data-hero-ui className="absolute bottom-[3svh] left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 md:flex motion-reduce:!hidden" aria-hidden>
          <span className="eyebrow text-[10px] text-mist">{t.scroll}</span>
          <span className="relative block h-10 w-px overflow-hidden bg-deep">
            <span className="absolute inset-x-0 top-0 h-3 animate-[blade_2.2s_var(--ease-blade)_infinite] bg-accent" />
          </span>
        </div>

        <div data-fade className="pointer-events-none absolute inset-0 bg-ink opacity-0" />
      </div>
    </section>
  );
}
