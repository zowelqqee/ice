// The Musical on Ice jingle: the brand theme for logo moments (the Enter screen, the treble clef).
// Played from a decoded buffer through the shared engine, so the analyser hears it (the hero's rim
// light pulses with it); the generated ambient is ducked while it plays. Starting a show track or
// the ice orchestra stops it, and it stops them.

import { audio } from "./engine";
import { orchestra } from "./orchestra";
import { player } from "./music";

const SRC = "/media/brand/jingle";
/** Moments in the theme, in seconds: the opening sweep, then the bright chimes. */
export const JINGLE_ACCENTS = [1.75, 2.7, 5.0, 5.8, 8.0, 8.7, 13.6];
/** The opening sweep: the Enter screen opens on it. */
export const JINGLE_SWEEP = 1.75;
export const JINGLE_LENGTH = 17.6;

type Listener = () => void;

class Jingle {
  private bytes: Promise<ArrayBuffer | null> | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gain: GainNode | null = null;
  private timers: number[] = [];
  private listeners = new Set<Listener>();
  private accentListeners = new Set<(t: number) => void>();
  playing = false;

  constructor() {
    if (typeof window === "undefined") return;
    orchestra.onStart(() => this.stop());
    player.subscribe(() => player.getState().playing && this.stop());
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getPlaying = () => this.playing;
  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Fires at each accent while the theme plays (the hero spins to them). */
  onAccent(fn: (t: number) => void) {
    this.accentListeners.add(fn);
    return () => {
      this.accentListeners.delete(fn);
    };
  }

  /** Fetch the file ahead of time (decoding needs the audio context, made on the first gesture). */
  preload() {
    if (!this.bytes) {
      const a = typeof Audio !== "undefined" ? new Audio() : null;
      const ext = a && a.canPlayType('audio/webm; codecs="opus"') !== "" ? "webm" : "m4a";
      this.bytes = fetch(`${SRC}.${ext}`)
        .then((r) => (r.ok ? r.arrayBuffer() : null))
        .catch(() => null);
    }
    return this.bytes;
  }

  /** Play from the start (call from a user gesture). Resolves once it is sounding, false if not. */
  async play(): Promise<boolean> {
    if (!audio.enabled) await audio.enable();
    else if (audio.muted) audio.setMuted(false);
    const ctx = audio.ctx!;
    if (!this.buffer) {
      const raw = await this.preload();
      if (!raw) return false;
      try {
        this.buffer = await ctx.decodeAudioData(raw.slice(0));
      } catch {
        return false;
      }
    }
    this.stop(true);
    orchestra.stopAll();
    if (player.getState().playing) player.pause();

    const gain = ctx.createGain();
    gain.gain.value = 1;
    gain.connect(audio.bus);
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(gain);
    src.onended = () => {
      if (this.source !== src) return;
      this.finish();
    };
    src.start();
    this.source = src;
    this.gain = gain;
    this.playing = true;
    audio.setAmbientLevel(0);
    this.timers = JINGLE_ACCENTS.map((t) => window.setTimeout(() => this.accentListeners.forEach((l) => l(t)), t * 1000));
    this.emit();
    return true;
  }

  /** Stop with a short fade (or at once). */
  stop(immediate = false) {
    const src = this.source, gain = this.gain;
    if (!src || !gain) return;
    this.source = null;
    this.gain = null;
    const ctx = audio.ctx!;
    const now = ctx.currentTime;
    if (immediate) src.stop();
    else {
      gain.gain.setTargetAtTime(0, now, 0.12);
      src.stop(now + 0.6);
    }
    this.finish();
  }

  toggle() {
    return this.playing ? (this.stop(), Promise.resolve(false)) : this.play();
  }

  private finish() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.playing = false;
    if (!player.getState().playing) audio.setAmbientLevel(1);
    this.emit();
  }
}

export const jingle = new Jingle();
