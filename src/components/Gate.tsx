"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { audio } from "@/lib/audio/engine";
import { jingle, JINGLE_SWEEP } from "@/lib/audio/jingle";
import { useLenis } from "./SmoothScroll";
import { BrandLogo } from "./brand/BrandLogo";
import { LOGO_CLEF, LOGO_VIEWBOX } from "./brand/logo";
import { cueCurtains } from "./hero/morph";
import type { Dictionary } from "@/i18n";

const SEEN_KEY = "moi.entered";

/**
 * Enter screen. Doubles as the preloader: the blade line carves across while the hero loads,
 * then the visitor chooses sound or silence (the logo's treble clef also enters with sound).
 * With sound, leaving is the brand intro, timed to the jingle: a line of light cuts the screen,
 * on the opening sweep the two halves part like a door into the rink, light and frost burst out,
 * the stage curtains behind it part, and the treble clef flies down onto the ice, where the glass
 * clef takes over (and later turns into the skater). In silence the same, quicker.
 */

/** Frost crystals bursting out of a line or a point (one canvas, drawn only during the intro). */
function frostBurst(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  type P = { x: number; y: number; vx: number; vy: number; life: number; size: number; rot: number; spin: number };
  const ps: P[] = [];
  let raf = 0, last = performance.now();
  const draw = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalCompositeOperation = "lighter";
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt * 0.55;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.4; p.vy *= 1 - dt * 1.4;
      p.rot += p.spin * dt;
      const a = Math.min(1, p.life * 1.6) * p.life;
      const s = p.size * (0.7 + (1 - p.life) * 0.6);
      ctx.strokeStyle = `rgba(214,248,255,${a * 0.9})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const ang = p.rot + (k * Math.PI) / 3;
        const cx = Math.cos(ang) * s, sy = Math.sin(ang) * s;
        ctx.moveTo(p.x - cx, p.y - sy);
        ctx.lineTo(p.x + cx, p.y + sy);
        // little side branches make it a crystal, not a star
        const bx = Math.cos(ang) * s * 0.55, by = Math.sin(ang) * s * 0.55;
        const nx = Math.cos(ang + 0.6) * s * 0.3, ny = Math.sin(ang + 0.6) * s * 0.3;
        ctx.moveTo(p.x + bx, p.y + by);
        ctx.lineTo(p.x + bx + nx, p.y + by + ny);
      }
      ctx.stroke();
    }
    raf = ps.length ? requestAnimationFrame(draw) : 0;
  };
  const kick = () => {
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(draw); }
  };
  return {
    /** along the cut, from (x0,y0) to (x1,y1) in px, thrown outward on both sides */
    line(x0: number, y0: number, x1: number, y1: number, n = 220) {
      const nx = -(y1 - y0), ny = x1 - x0, len = Math.hypot(nx, ny);
      for (let i = 0; i < n; i++) {
        const t = Math.random(), side = Math.random() < 0.5 ? -1 : 1, v = 60 + Math.random() * 260;
        ps.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, vx: (nx / len) * v * side + (Math.random() - 0.5) * 60, vy: (ny / len) * v * side + (Math.random() - 0.5) * 60, life: 0.7 + Math.random() * 0.3, size: 2 + Math.random() * 6, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 2 });
      }
      kick();
    },
    point(x: number, y: number, n = 90) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 320;
        ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, size: 2 + Math.random() * 7, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 2 });
      }
      kick();
    },
    stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
export function Gate({ t, ready }: { t: Dictionary["gate"]; ready: boolean }) {
  const [open, setOpen] = useState(true);
  const [progress, setProgress] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const firstBtn = useRef<HTMLButtonElement>(null);
  const lenis = useLenis();

  // skip on revisit in the same session (sound stays off until the mute button is used)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SEEN_KEY)) return setOpen(false);
    } catch {}
    jingle.preload();
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

  const leaving = useRef(false);
  const enter = async (withSound: boolean) => {
    if (leaving.current) return;
    leaving.current = true;
    let music = false;
    if (withSound) {
      await audio.enable();
      music = await jingle.play();
      if (!music) {
        audio.bell(76, 0.07);
        audio.bell(83, 0.05, 0.12);
      }
    }
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    const el = root.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cueCurtains();
      return setOpen(false);
    }

    // timed to the jingle with music; the same shape, quicker, in silence
    const k = music ? 1 : 0.5;
    const sweep = music ? JINGLE_SWEEP : 0.6;
    const W = innerWidth, H = innerHeight;
    const frost = frostBurst(el.querySelector("canvas[data-frost]") as HTMLCanvasElement);

    // the clef leaves the logo as its own layer, to fly down into the skater
    const clef = el.querySelector("[data-content] [data-clef]") as SVGGElement | null;
    const fly = el.querySelector("[data-fly]") as HTMLDivElement;
    const r = clef?.getBoundingClientRect();
    if (clef && r && r.width > 0) {
      // frame the copy on the clef alone, in the logo's own units
      const bb = clef.getBBox();
      fly.querySelector("svg")?.setAttribute("viewBox", `${bb.x} ${bb.y} ${bb.width} ${bb.height}`);
      Object.assign(fly.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, display: "block" });
      clef.style.opacity = "0";
    }
    // where she stands in the hero (the scene frames her a little below the centre)
    const portrait = W < H;
    const target = { x: W / 2, y: H * (portrait ? 0.56 : 0.57), h: H * (portrait ? 0.46 : 0.56) };
    const fx = r ? target.x - (r.left + r.width / 2) : 0;
    const fy = r ? target.y - (r.top + r.height / 2) : 0;
    const scale = r ? target.h / r.height : 1;

    const tl = gsap.timeline({
      onComplete: () => {
        frost.stop();
        setOpen(false);
      },
    });
    tl.to(el.querySelectorAll("[data-ui]"), { autoAlpha: 0, duration: 0.4 * k }, 0)
      .to(el.querySelectorAll("[data-content] [data-letters], [data-content] [data-swoosh]"), { opacity: 0, duration: 1.0 * k, ease: "power1.in" }, 0.3 * k)
      .to(fly, { filter: "drop-shadow(0 0 18px rgba(92,242,255,0.95)) brightness(1.5)", duration: 1.2 * k }, 0.1)
      // a line of light cuts the screen
      .to(el.querySelector("[data-cut]"), { attr: { x2: 100, y2: 38 }, duration: Math.max(0.4, sweep - 0.35), ease: "power2.inOut" }, 0.25 * k)
      // on the sweep: the door opens, light floods out, frost bursts along the cut
      .to(el.querySelector("[data-a]"), { xPercent: -8, yPercent: -112, duration: 1.8 * k, ease: "expo.inOut" }, sweep)
      .to(el.querySelector("[data-b]"), { xPercent: 8, yPercent: 112, duration: 1.8 * k, ease: "expo.inOut" }, sweep)
      .fromTo(el.querySelector("[data-flash]"), { opacity: 0 }, { opacity: 0.9, duration: 0.18, ease: "power2.out" }, sweep)
      .to(el.querySelector("[data-flash]"), { opacity: 0, duration: 1.2 * k, ease: "power2.in" }, sweep + 0.2)
      .to(el.querySelector("[data-cut]"), { autoAlpha: 0, duration: 0.4 }, sweep + 0.15)
      .call(() => frost.line(0, H * 0.62, W, H * 0.38, music ? 240 : 140), [], sweep)
      // the stage curtains behind the door start to part as it opens
      .call(cueCurtains, [], sweep)
      // the clef flies down to where the glass clef stands on the ice, grows to its height and
      // dissolves into it
      .to(fly, { x: fx, y: fy, scale, duration: 1.5 * k, ease: "power3.inOut" }, sweep + 0.1)
      .to(fly, { opacity: 0, duration: 0.7 * k, ease: "power1.in" }, sweep + 0.1 + 1.0 * k)
      .call(() => frost.point(target.x, target.y + target.h * 0.42, music ? 110 : 60), [], sweep + 0.1 + 1.1 * k)
      .to({}, { duration: 0.5 * k });
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
      {/* the light that floods out when the door opens */}
      <div
        data-flash
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 mix-blend-screen"
        style={{ background: "radial-gradient(ellipse 60% 38% at 50% 50%, rgba(214,248,255,0.95), rgba(92,242,255,0.45) 45%, transparent 75%)" }}
      />
      <canvas data-frost aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />
      {/* the treble clef in flight (a copy of the logo's clef, placed over it when the intro starts) */}
      <div data-fly aria-hidden className="pointer-events-none fixed z-10 hidden text-ice" style={{ transformOrigin: "50% 50%" }}>
        <svg viewBox={LOGO_VIEWBOX} className="h-full w-full overflow-visible" preserveAspectRatio="xMidYMid meet">
          <path d={LOGO_CLEF} fill="currentColor" />
        </svg>
      </div>
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
        <button
          type="button"
          onClick={() => loaded && enter(true)}
          tabIndex={-1}
          aria-hidden
          className="group block w-[min(44vw,220px)] select-none text-ice"
          style={{ cursor: loaded ? "pointer" : "default" }}
        >
          <BrandLogo className="block h-auto w-full" clefClassName="transition-[filter] duration-500 group-hover:[filter:drop-shadow(0_0_14px_rgba(92,242,255,0.9))]" />
        </button>
        <p data-ui className="eyebrow">{t.kicker}</p>
        </div>

        <div className="flex flex-col items-center gap-8">

        <div data-ui className="relative h-px w-[min(70vw,360px)] bg-deep" aria-hidden={loaded}>
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
          data-ui
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
        <p data-ui className="eyebrow text-mist" style={{ opacity: loaded ? 1 : 0 }}>
          {t.soundHint}
        </p>
        </div>
      </div>
    </div>
  );
}
