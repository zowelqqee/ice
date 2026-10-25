"use client";

import { useEffect, useRef } from "react";

/**
 * The cursor leaves a short trail of frost: tiny six-point crystals that melt in ~0.7 s.
 * Fine pointers only; off under reduced motion. One 2D canvas, no layout work.
 */
export function FrostCursor() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const c = ref.current;
    if (!c || !fine || reduced) return;
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
    const onMove = (e: PointerEvent) => {
      if (lx < 0) { lx = e.clientX; ly = e.clientY; }
      const dx = e.clientX - lx, dy = e.clientY - ly;
      const dist = Math.hypot(dx, dy);
      const n = Math.min(4, Math.floor(dist / 9));
      for (let i = 0; i < n; i++) {
        const t = i / Math.max(1, n);
        ps.push({
          x: lx + dx * t + (Math.random() - 0.5) * 6,
          y: ly + dy * t + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 0.25,
          vy: 0.15 + Math.random() * 0.35,
          life: 1,
          size: 1.2 + Math.random() * 2.4,
          rot: Math.random() * Math.PI,
        });
      }
      if (ps.length > 220) ps.splice(0, ps.length - 220);
      lx = e.clientX; ly = e.clientY;
    };
    addEventListener("pointermove", onMove, { passive: true });

    let raf = 0, last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
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
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[80] h-full w-full" />;
}
