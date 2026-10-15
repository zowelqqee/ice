"use client";

import { useMemo, useRef, useState } from "react";
import { audio } from "@/lib/audio/engine";

/** Seeded RNG so server and client draw the same cracks. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h) || 1;
}

/**
 * Ticket button made of ice. Hover: hairline cracks race out from the centre.
 * Press: the pane breaks into shards that fly off and re-freeze, with a glass chime.
 */
export function IceButton({
  href,
  children,
  seed = "ice",
  accent = "#5cf2ff",
  external = true,
  disabled = false,
  className = "",
  ariaLabel,
}: {
  href?: string | null;
  children: React.ReactNode;
  seed?: string;
  accent?: string;
  external?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const [broken, setBroken] = useState(0);
  const busy = useRef(false);

  const { cracks, shards } = useMemo(() => {
    const r = rng(hash(seed));
    const cx = 50 + (r() - 0.5) * 20;
    const cy = 50 + (r() - 0.5) * 30;
    const n = 7;
    const angles = Array.from({ length: n }, (_, i) => ((i + r() * 0.6) / n) * Math.PI * 2);
    const cracks = angles.map((a) => {
      let x = cx, y = cy;
      const pts = [`${x.toFixed(1)},${y.toFixed(1)}`];
      for (let k = 0; k < 4; k++) {
        const aa = a + (r() - 0.5) * 0.7;
        const step = 14 + r() * 18;
        x += Math.cos(aa) * step;
        y += Math.sin(aa) * step * 0.6;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      return pts.join(" ");
    });
    // wedge shards between consecutive crack directions (percent coords for clip-path)
    const far = (a: number) => [cx + Math.cos(a) * 160, cy + Math.sin(a) * 160];
    const shards = angles.map((a, i) => {
      const b = angles[(i + 1) % n] + (i === n - 1 ? Math.PI * 2 : 0);
      const m = (a + b) / 2;
      const [x1, y1] = far(a);
      const [x2, y2] = far(m);
      const [x3, y3] = far(b);
      return {
        clip: `polygon(${cx}% ${cy}%, ${x1}% ${y1}%, ${x2}% ${y2}%, ${x3}% ${y3}%)`,
        dx: Math.cos(m) * (26 + r() * 30),
        dy: Math.sin(m) * (18 + r() * 24),
        rot: (r() - 0.5) * 50,
      };
    });
    return { cracks, shards };
  }, [seed]);

  const onClick = (e: React.MouseEvent) => {
    if (disabled || !href) return e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    audio.bell(84, 0.06);
    audio.bell(91, 0.04, 0.05);
    setBroken((b) => b + 1);
    setTimeout(() => (busy.current = false), 800);
    if (!external) return;
  };

  const base =
    "group relative inline-flex select-none items-center justify-center overflow-visible px-6 py-3 font-mono text-[11px] uppercase tracking-[0.24em] transition-colors duration-300";
  const look = disabled
    ? "cursor-not-allowed border border-mist/50 text-mist"
    : "border border-ice/80 text-ice hover:border-[var(--a)] hover:text-ink";

  const content = (
    <>
      {/* frosted pane that fills on hover */}
      <span
        aria-hidden
        className="absolute inset-0 origin-left scale-x-0 bg-[var(--a)] transition-transform duration-500 ease-[var(--ease-blade)] group-hover:scale-x-100"
      />
      {/* cracks */}
      {!disabled && (
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {cracks.map((pts, i) => (
            <polyline
              key={i}
              points={pts}
              fill="none"
              stroke="#eaf6ff"
              strokeWidth="0.8"
              vectorEffect="non-scaling-stroke"
              pathLength={1}
              strokeDasharray="1"
              className="[stroke-dashoffset:1] transition-[stroke-dashoffset] duration-500 ease-out group-hover:[stroke-dashoffset:0]"
              style={{ transitionDelay: `${i * 30}ms` }}
            />
          ))}
        </svg>
      )}
      <span className="relative">
        {children}
        {ariaLabel && <span className="sr-only">, {ariaLabel}</span>}
      </span>
      {/* shards: copies of the pane that fly apart on press, then melt */}
      {broken > 0 &&
        shards.map((s, i) => (
          <span
            key={`${broken}-${i}`}
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[var(--a)] animate-[shard_700ms_var(--ease-glide)_forwards]"
            style={
              {
                clipPath: s.clip,
                "--dx": `${s.dx}px`,
                "--dy": `${s.dy}px`,
                "--rot": `${s.rot}deg`,
              } as React.CSSProperties
            }
          />
        ))}
    </>
  );

  const style = { "--a": accent } as React.CSSProperties;
  if (disabled || !href)
    return (
      <span role="link" aria-disabled="true" className={`${base} ${look} ${className}`} style={style}>
        {content}
      </span>
    );
  return (
    <a
      href={href}
      onClick={onClick}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`${base} ${look} ${className}`}
      style={style}
    >
      {content}
    </a>
  );
}
