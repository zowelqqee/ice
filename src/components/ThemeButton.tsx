"use client";

import { useSyncExternalStore } from "react";
import { jingle } from "@/lib/audio/jingle";
import { BrandLogo } from "./brand/BrandLogo";

/** The logo's treble clef plays the Musical on Ice theme (the jingle); again to stop it. */
export function ThemeButton({ play, stop }: { play: string; stop: string }) {
  const playing = useSyncExternalStore(jingle.subscribe, jingle.getPlaying, () => false);
  return (
    <button
      type="button"
      onClick={() => void jingle.toggle()}
      onPointerEnter={() => jingle.preload()}
      onFocus={() => jingle.preload()}
      aria-pressed={playing}
      aria-label={playing ? stop : play}
      className="group flex items-center gap-4 text-left"
    >
      <BrandLogo
        className="block h-auto w-[84px] text-ice opacity-80 transition-opacity group-hover:opacity-100"
        clefClassName={`transition-[filter] duration-500 ${playing ? "animate-pulse [filter:drop-shadow(0_0_16px_rgba(92,242,255,0.95))]" : "group-hover:[filter:drop-shadow(0_0_12px_rgba(92,242,255,0.85))]"}`}
      />
      <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-frost group-hover:text-ice">{playing ? stop : play}</span>
    </button>
  );
}
