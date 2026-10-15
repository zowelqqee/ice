"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { player } from "@/lib/audio/music";
import { INSTRUMENTS, orchestra, type Instrument } from "@/lib/audio/orchestra";
import { focus } from "./focus";
import { audio } from "@/lib/audio/engine";
import { shows, tracks } from "@/lib/data";
import type { Dictionary } from "@/i18n";
import { useInView } from "@/lib/hooks/useInView";

const Orchestra = dynamic(() => import("./Orchestra"), { ssr: false });

const accentOf = (show: string) => shows.find((s) => s.slug === show)?.accent ?? "#5cf2ff";
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

function usePlayer() {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}

/** Frost ridge: the spectrum drawn as a mirrored line of ice shards. */
function Spectrum({ accent }: { accent: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const data = audio.frequencyData();
      const n = 72;
      const mid = h / 2;
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        const bin = Math.floor(Math.pow(i / n, 1.7) * (data?.length ?? 1) * 0.7);
        const v = data && player.state.playing ? data[bin] / 255 : 0.02;
        const x = (i / n) * w;
        const y = mid - v * mid * 0.9 * (i % 2 ? 1 : 0.55);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let i = n; i >= 0; i--) {
        const bin = Math.floor(Math.pow(i / n, 1.7) * (data?.length ?? 1) * 0.7);
        const v = data && player.state.playing ? data[bin] / 255 : 0.02;
        ctx.lineTo((i / n) * w, mid + v * mid * 0.6 * (i % 2 ? 0.55 : 1));
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "rgba(234,246,255,0.05)");
      g.addColorStop(0.5, accent + "cc");
      g.addColorStop(1, "rgba(234,246,255,0.05)");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "rgba(234,246,255,0.5)";
      ctx.lineWidth = 0.6;
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [accent]);
  return <canvas ref={ref} aria-hidden className="h-16 w-full" />;
}

function Meter({ name }: { name: Instrument }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (ref.current) ref.current.style.transform = `scaleX(${Math.min(1, orchestra.level(name) * 1.3)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [name]);
  return (
    <span aria-hidden className="mt-2 block h-px w-full bg-deep">
      <span ref={ref} className="block h-full origin-left scale-x-0 bg-accent" />
    </span>
  );
}

export function MusicSection({ t }: { t: Dictionary["music"] }) {
  const st = usePlayer();
  const orch = useSyncExternalStore(orchestra.subscribe, orchestra.getState, orchestra.getState);
  const muted = useSyncExternalStore(audio.subscribe, () => audio.muted, () => true);
  const stageRef = useRef<HTMLDivElement>(null);
  const [mountStage, setMountStage] = useState(false);
  const accent = accentOf(st.track.show);
  const stageVisible = useInView(stageRef, "15% 0px");

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setMountStage(true), { rootMargin: "60% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="music" aria-labelledby="music-title" className="relative overflow-hidden py-28 md:py-40" style={{ "--a": accent } as React.CSSProperties}>
      <div className="grid gap-12 px-[var(--gutter)] lg:grid-cols-12">
        <div className="lg:col-span-6">
          <p className="eyebrow mb-6">{t.eyebrow}</p>
          <h2 id="music-title" className="display text-[19vw] md:text-[10vw]">
            {t.title}
            <br />
            <em className="text-accent">{t.titleItalic}</em>
          </h2>
          <p className="mt-8 max-w-[44ch] text-[16px] leading-relaxed text-frost">{t.intro}</p>
        </div>

        {/* player */}
        <div className="self-end lg:col-span-5 lg:col-start-8">
          <ol className="border-t border-deep">
            {tracks.map((tr, i) => {
              const current = st.track.id === tr.id;
              const playing = current && st.playing;
              const show = shows.find((s) => s.slug === tr.show);
              return (
                <li key={tr.id} className="border-b border-deep">
                  <button
                    type="button"
                    onClick={() => player.toggle(tr.id)}
                    aria-pressed={playing}
                    className="group grid w-full grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-5 text-left"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border transition-colors" style={{ borderColor: current ? accentOf(tr.show) : "rgba(147,166,187,0.4)" }}>
                      {playing ? (
                        <span aria-hidden className="flex gap-[3px]">
                          <span className="h-3 w-[2px] bg-ice" />
                          <span className="h-3 w-[2px] bg-ice" />
                        </span>
                      ) : (
                        <span aria-hidden className="ml-[2px] h-0 w-0 border-y-[6px] border-l-[9px] border-y-transparent border-l-ice" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="sr-only">{playing ? t.pause : t.play}: </span>
                      <span className="display block truncate text-[28px] leading-none transition-colors group-hover:text-[var(--a)] md:text-[34px]" style={current ? { color: accentOf(tr.show) } : undefined}>
                        {tr.title}
                      </span>
                      <span className="mt-1.5 block font-mono text-[10px] uppercase tracking-[0.2em] text-frost">
                        {String(i + 1).padStart(2, "0")} · {show?.title} {show?.subtitle} · {tr.note}
                      </span>
                    </span>
                    <span className="font-mono text-[11px] text-frost">{mmss(current ? st.duration : tr.duration)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-6">
            <Spectrum accent={accent} />
            <div className="mt-3 flex items-center gap-4 font-mono text-[11px] text-frost">
              <span className="w-10">{mmss(st.time)}</span>
              <input
                type="range"
                min={0}
                max={st.duration || 1}
                step={0.1}
                value={st.time}
                onChange={(e) => player.seek(+e.target.value)}
                aria-label={`${t.nowPlaying}: ${st.track.title}`}
                className="ice-range h-px flex-1"
                style={{ "--p": `${(st.time / (st.duration || 1)) * 100}%` } as React.CSSProperties}
              />
              <span className="w-10 text-right">{mmss(st.duration)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* the ice orchestra */}
      <div className="mt-24 px-[var(--gutter)] md:mt-32">
        <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <h3 className="display text-[11vw] italic md:text-[4.6vw]">{t.orchestra}</h3>
          <p className="max-w-[40ch] text-[14px] text-frost">{muted && audio.enabled ? t.soundOff : t.orchestraHint}</p>
        </div>
        <div ref={stageRef} className="relative h-[62svh] w-full overflow-hidden border border-deep md:h-[72vh]">
          {mountStage && <Orchestra active={stageVisible} />}
        </div>
        <div role="group" aria-label={t.orchestra} className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {INSTRUMENTS.map((n) => {
            const on = orch.awake.includes(n);
            const loading = orch.loading.includes(n);
            return (
              <button
                key={n}
                type="button"
                aria-pressed={on}
                aria-busy={loading}
                onClick={() => {
                  focus.set(INSTRUMENTS.indexOf(n));
                  orchestra.toggle(n);
                }}
                className="group border px-4 py-3 text-left transition-colors"
                style={{ borderColor: on ? "var(--accent)" : "rgba(86,103,123,0.5)" }}
              >
                <span className="flex items-center justify-between">
                  <span className={`display text-[26px] ${on ? "text-accent" : "text-ice"}`}>{t.instruments[n]}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-frost">{loading ? "…" : on ? "on" : "off"}</span>
                </span>
                <Meter name={n} />
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
