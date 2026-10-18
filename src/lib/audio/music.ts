// Show music player: the show soundtracks (from the admin's Music section). Routed through the
// shared engine so the analyser (hero rim light, spectrum) hears it. The ice orchestra is separate
// (orchestra.ts); starting one pauses the other. The page hands over the track list (setTracks).

import { audio } from "./engine";
import { orchestra } from "./orchestra";
import type { Track } from "../data";

type Listener = () => void;

export interface PlayerState {
  track: Track | null;
  playing: boolean;
  time: number;
  duration: number;
}

class MusicPlayer {
  private el: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private tracks: Track[] = [];
  state: PlayerState = { track: null, playing: false, time: 0, duration: 0 };

  constructor() {
    orchestra.onStart(() => this.state.playing && this.pause());
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  /** The list "next" walks through; the first track is the default selection. */
  setTracks(list: Track[]) {
    this.tracks = list;
    const keep = this.state.track && list.some((t) => t.id === this.state.track!.id);
    if (!keep && !this.state.playing) this.set({ track: list[0] ?? null, time: 0, duration: list[0]?.duration ?? 0 });
  }
  private set(p: Partial<PlayerState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  private async ensure() {
    if (!audio.enabled) await audio.enable();
    else if (audio.muted) audio.setMuted(false);
    if (this.el) return;
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    el.addEventListener("timeupdate", () => this.set({ time: el.currentTime }));
    el.addEventListener("loadedmetadata", () => this.set({ duration: el.duration }));
    el.addEventListener("ended", () => this.next());
    el.addEventListener("pause", () => this.set({ playing: false }));
    this.el = el;
    audio.ctx!.createMediaElementSource(el).connect(audio.bus);
  }

  async play(which?: Track | string) {
    const track =
      typeof which === "object" ? which : which ? this.tracks.find((t) => t.id === which) ?? this.state.track : this.state.track;
    if (!track) return;
    await this.ensure();
    orchestra.stopAll();
    const el = this.el!;
    if (track.id !== this.state.track?.id || !el.src) {
      const webm = el.canPlayType('audio/webm; codecs="opus"') !== "";
      el.src = `${track.src}.${webm ? "webm" : "m4a"}`;
      this.set({ track, time: 0, duration: track.duration });
    }
    audio.setAmbientLevel(0);
    try {
      await el.play();
      this.set({ playing: true });
    } catch {
      this.set({ playing: false });
    }
  }

  pause() {
    this.el?.pause();
    audio.setAmbientLevel(1);
    this.set({ playing: false });
  }

  toggle(which?: Track | string) {
    const id = typeof which === "object" ? which.id : which;
    if (this.state.playing && (!id || id === this.state.track?.id)) this.pause();
    else this.play(which);
  }

  seek(t: number) {
    if (this.el && isFinite(t)) this.el.currentTime = t;
    this.set({ time: t });
  }

  next() {
    if (!this.tracks.length) return this.pause();
    const i = this.tracks.findIndex((t) => t.id === this.state.track?.id);
    this.play(this.tracks[(i + 1) % this.tracks.length]);
  }
}

export const player = new MusicPlayer();
