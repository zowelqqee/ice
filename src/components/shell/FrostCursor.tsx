"use client";

import { useEffect, useRef } from "react";

/**
 * The cursor is a conductor's baton made of ice: the tip is the pointer (it clicks exactly there),
 * the shaft sways behind the movement, the tip brightens over anything clickable and the baton
 * flicks on a click. It leaves a short trail of frost: tiny six-point crystals that melt in ~0.7 s.
 * Fine pointers only, and not under reduced motion (the system cursor stays then). One 2D canvas
 * for the frost, one small SVG for the baton; no layout work.
 */
export function FrostCursor() {
  const ref = useRef<HTMLCanvasElement>(null);
  const baton = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const c = ref.current;
    const b = baton.current;
    if (!c || !b || !fine || reduced) return;
    document.documentElement.classList.add("baton-cursor");
    const ctx = c.getContext("2d")!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      c.width = innerWidth * dpr;
      c.height = innerHeight * dpr;
    };
    resize();
    addEventListener("resize", resize);

    type P = { x: number; y: number; vx: number; vy: number; life: number; size: number; rot: number };
    const ps: P[] = [];
    let lx = -1, ly = -1;
    // baton state: tip position, sway angle (follows the motion with a lag), hover glow, flick
    let x = -100, y = -100, sway = 0, swayV = 0, glow = 0, flick = 0, shown = false, over = false;
    const BASE = 38; // degrees: the tip points up-left like an arrow, the grip rests down-right
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!shown) {
        shown = true;
        b.style.opacity = "1";
      }
      const t = e.target as Element | null;
      over = !!t?.closest?.('a, button, [role="button"], input, select, textarea, label, summary, [tabindex]:not([tabindex="-1"])');
      if (lx < 0) { lx = x; ly = y; }
      const dx = x - lx, dy = y - ly;
      swayV += dx * 0.06; // moving right swings the shaft left behind the tip, and back
      const dist = Math.hypot(dx, dy);
      const n = Math.min(4, Math.floor(dist / 9));
      for (let i = 0; i < n; i++) {
        const k = i / Math.max(1, n);
        ps.push({
          x: lx + dx * k + (Math.random() - 0.5) * 6,
          y: ly + dy * k + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.25,
          vy: 0.15 + Math.random() * 0.35,
          life: 1,
          size: 1.2 + Math.random() * 2.4,
          rot: Math.random() * Math.PI,
        });
      }
      if (ps.length > 220) ps.splice(0, ps.length - 220);
      lx = x; ly = y;
    };
    const onDown = () => {
      flick = 1;
      // a small burst of frost from the tip
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * Math.PI * 2;
        ps.push({ x, y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, life: 1, size: 1.5 + Math.random() * 2.5, rot: Math.random() * Math.PI });
      }
    };
    const onLeave = () => {
      shown = false;
      b.style.opacity = "0";
    };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);

    let raf = 0, last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // baton: a damped spring for the sway, a quick decay for the flick
      swayV += (-sway * 60 - swayV * 9) * dt;
      sway = Math.max(-28, Math.min(28, sway + swayV * dt * 10));
      glow += ((over ? 1 : 0) - glow) * (1 - Math.exp(-dt * 12));
      flick = Math.max(0, flick - dt * 4);
      const angle = BASE - sway - Math.sin(flick * Math.PI) * 26;
      b.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`;
      b.style.setProperty("--glow", glow.toFixed(3));

      // frost trail
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.globalCompositeOperation = "lighter";
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt * 1.4;
        if (p.life <= 0) { ps.splice(i, 1); continue; }
        p.x += p.vx; p.y += p.vy;
        const a = p.life * p.life;
        const s = p.size * (0.6 + p.life * 0.4);
        ctx.strokeStyle = `rgba(200,245,255,${a * 0.85})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const ang = p.rot + (k * Math.PI) / 3;
          const cx = Math.cos(ang) * s, sy = Math.sin(ang) * s;
          ctx.moveTo(p.x - cx, p.y - sy);
          ctx.lineTo(p.x + cx, p.y + sy);
        }
        ctx.stroke();
        ctx.fillStyle = `rgba(92,242,255,${a * 0.25})`;
        ctx.fillRect(p.x - 0.6, p.y - 0.6, 1.2, 1.2);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      removeEventListener("pointermove", onMove);
      removeEventListener("pointerdown", onDown);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.documentElement.classList.remove("baton-cursor");
    };
  }, []);

  return (
    <>
      <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[80] h-full w-full" />
      {/* the baton: drawn pointing right from its tip at (0,0), rotated into a held position */}
      <div
        ref={baton}
        aria-hidden
        data-baton
        className="pointer-events-none fixed left-0 top-0 z-[90] opacity-0 transition-opacity duration-200"
        style={{ transformOrigin: "0 0", willChange: "transform" }}
      >
        <svg
          width="78"
          height="20"
          viewBox="0 0 78 20"
          className="block -translate-y-1/2 overflow-visible"
          style={{ filter: "drop-shadow(0 1px 1.4px rgba(5, 20, 35, 0.6))" }}
        >
          <defs>
            <linearGradient id="baton-shaft" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.45" stopColor="#d9f8ff" stopOpacity="0.95" />
              <stop offset="1" stopColor="#8fe9ff" stopOpacity="0.85" />
            </linearGradient>
            <radialGradient id="baton-grip" cx="0.4" cy="0.35" r="0.7">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.5" stopColor="#bdf3ff" />
              <stop offset="1" stopColor="#5cc9e6" />
            </radialGradient>
          </defs>
          {/* glow along the shaft */}
          <path d="M0 10 L60 8.2 L60 11.8 Z" fill="#5cf2ff" opacity="0.35" style={{ filter: "blur(2.5px)" }} />
          {/* shaft: a long, thin cone of clear ice */}
          <path d="M0 10 L60 8.6 Q61.5 10 60 11.4 Z" fill="url(#baton-shaft)" stroke="#ffffff" strokeOpacity="0.6" strokeWidth="0.4" />
          {/* a frozen highlight line */}
          <path d="M6 9.75 L56 8.95" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="0.5" strokeLinecap="round" />
          {/* grip: a frosted bulb */}
          <ellipse cx="66.5" cy="10" rx="8.5" ry="5.2" fill="url(#baton-grip)" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="0.5" />
          <path d="M61 7.8 Q66 6.2 71.5 7.6" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="0.6" fill="none" strokeLinecap="round" />
          {/* the tip: a spark that flares over anything clickable */}
          <g style={{ transformOrigin: "0px 10px", transform: "scale(calc(0.7 + var(--glow, 0) * 0.6))" }}>
            <circle cx="0" cy="10" r="3.2" fill="#5cf2ff" style={{ filter: "blur(2px)", opacity: "calc(0.35 + var(--glow, 0) * 0.5)" }} />
            <path d="M0 4.5 L0.9 9.1 L5.5 10 L0.9 10.9 L0 15.5 L-0.9 10.9 L-5.5 10 L-0.9 9.1 Z" fill="#ffffff" />
          </g>
        </svg>
      </div>
    </>
  );
}
