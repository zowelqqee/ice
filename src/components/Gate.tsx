"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { audio } from "@/lib/audio/engine";
import { useLenis } from "./SmoothScroll";
import type { Dictionary } from "@/i18n";

const SEEN_KEY = "moi.entered";

/**
 * Enter screen. Doubles as the preloader: the blade line carves across while the hero loads,
 * then the visitor chooses sound or silence. Leaving cuts the screen open along a diagonal.
 */
export function Gate({ t, ready }: { t: Dictionary["gate"]; ready: boolean }) {
  const [open, setOpen] = useState(true);
  const [progress, setProgress] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const firstBtn = useRef<HTMLButtonElement>(null);
  const lenis = useLenis();

  // skip on revisit in the same session (sound stays off until the mute button is used)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) setOpen(false);
    } catch {}
  }, []);

  useEffect(() => {
    // hero text stays hidden behind the Enter screen and rises in on entry
    if (open) document.documentElement.dataset.gate = "open";
    else delete document.documentElement.dataset.gate;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    lenis?.stop();
    document.documentElement.style.overflow = "hidden";
    return () => {
      lenis?.start();
      document.documentElement.style.overflow = "";
    };
  }, [open, lenis]);

  // eased fake progress that waits for the real "ready"
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const start = performance.now();
    const step = () => {
      const el = (performance.now() - start) / 1000;
      setProgress((p) => {
        const cap = ready ? 1 : 0.86;
        const target = Math.min(cap, 1 - Math.exp(-el * (ready ? 3 : 0.9)));
        return Math.max(p, target);
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [open, ready]);

  const loaded = progress > 0.995;
  useEffect(() => {
    if (loaded) firstBtn.current?.focus({ preventScroll: true });
  }, [loaded]);

  const enter = async (withSound: boolean) => {
    if (withSound) {
      await audio.enable();
      audio.bell(76, 0.07);
      audio.bell(83, 0.05, 0.12);
    }
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setOpen(false);
    const tl = gsap.timeline({ onComplete: () => setOpen(false) });
    tl.to(el.querySelector("[data-cut]"), { attr: { x2: 100, y2: 38 }, duration: 0.45, ease: "power4.inOut" })
      .to(el.querySelector("[data-content]"), { autoAlpha: 0, duration: 0.25 }, "<0.15")
      .to(el.querySelector("[data-a]"), { xPercent: -8, yPercent: -110, duration: 1.0, ease: "expo.inOut" }, ">-0.05")
      .to(el.querySelector("[data-b]"), { xPercent: 8, yPercent: 110, duration: 1.0, ease: "expo.inOut" }, "<")
      .to(el.querySelector("[data-cut]"), { autoAlpha: 0, duration: 0.3 }, "<0.2");
  };

  if (!open) return null;

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gate-title"
      className="fixed inset-0 z-[100] text-ice"
    >
      {/* two halves of the "ice sheet", split along the blade line on exit */}
      {/* the veil is thin in the middle: the skater is visible behind the Enter screen from the first frame */}
      <div data-a className="absolute inset-0" style={{ clipPath: "polygon(0 0, 100% 0, 100% 38%, 0 62%)", background: "radial-gradient(ellipse 34% 48% at 50% 50%, rgba(11,29,46,0.28), rgba(11,29,46,0.9) 70%, rgba(11,29,46,0.97))" }} />
      <div data-b className="absolute inset-0" style={{ clipPath: "polygon(0 62%, 100% 38%, 100% 100%, 0 100%)", background: "radial-gradient(ellipse 34% 48% at 50% 50%, rgba(11,29,46,0.28), rgba(11,29,46,0.9) 70%, rgba(11,29,46,0.97))" }} />
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ filter: "drop-shadow(0 0 6px rgba(92,242,255,0.9))" }}
      >
        <line
          data-cut
          x1="0"
          y1="62"
          x2="0"
          y2="62"
          stroke="#5cf2ff"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div data-content className="relative flex h-full flex-col items-center justify-between px-[var(--gutter)] pb-[7svh] pt-[8svh]">
        <div className="flex flex-col items-center gap-5">
        <h1 id="gate-title" className="sr-only">
          Musical on Ice
        </h1>
        <Image
          src="/brand/logo-white.webp"
          alt="Musical on Ice"
          width={1323}
          height={1005}
          priority
          className="h-auto w-[min(44vw,220px)] select-none"
        />
        <p className="eyebrow">{t.kicker}</p>
        </div>

        <div className="flex flex-col items-center gap-8">

        <div className="relative h-px w-[min(70vw,360px)] bg-deep" aria-hidden={loaded}>
          <div
            className="absolute inset-y-0 left-0 bg-ice"
            style={{ width: `${progress * 100}%`, boxShadow: "0 0 12px rgba(234,246,255,0.6)" }}
          />
          <div
            className="absolute -top-[3px] h-[7px] w-[2px] bg-accent"
            style={{ left: `${progress * 100}%`, boxShadow: "0 0 10px 2px rgba(92,242,255,0.8)" }}
          />
          <span className="sr-only" role="status">
            {loaded ? "" : t.loading}
          </span>
        </div>

        <div
          className="flex flex-col items-center gap-4 transition-opacity duration-700 sm:flex-row sm:gap-8"
          style={{ opacity: loaded ? 1 : 0, pointerEvents: loaded ? "auto" : "none" }}
        >
          <button
            ref={firstBtn}
            type="button"
            onClick={() => enter(true)}
            className="group relative overflow-hidden border border-ice/70 px-8 py-4 font-mono text-[12px] uppercase tracking-[0.24em] transition-colors duration-500 hover:border-accent hover:text-ink"
          >
            <span className="absolute inset-0 -translate-x-[101%] bg-accent transition-transform duration-500 ease-[var(--ease-blade)] group-hover:translate-x-0" />
            <span className="relative">{t.withSound}</span>
          </button>
          <button
            type="button"
            onClick={() => enter(false)}
            className="px-4 py-4 font-mono text-[12px] uppercase tracking-[0.24em] text-frost underline-offset-8 hover:text-ice hover:underline"
          >
            {t.silent}
          </button>
        </div>
        <p className="eyebrow text-mist" style={{ opacity: loaded ? 1 : 0 }}>
          {t.soundHint}
        </p>
        </div>
      </div>
    </div>
  );
}
