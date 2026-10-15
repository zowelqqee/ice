// Show music player: the soundtracks cut from the promo films. Routed through the shared engine so
// the analyser (hero rim light, spectrum) hears it. The ice orchestra is separate (orchestra.ts);
// starting one pauses the other.

import { audio } from "./engine";
import { orchestra } from "./orchestra";
import { tracks, type Track } from "../data";

type Listener = () => void;

export interface PlayerState {
  track: Track;
  playing: boolean;
  time: number;
  duration: number;
}

class MusicPlayer {
  private el: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  state: PlayerState = { track: tracks[0], playing: false, time: 0, duration: tracks[0]?.duration ?? 0 };

  constructor() {
    orchestra.onStart(() => this.state.playing && this.pause());
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
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

  async play(trackId?: string) {
    await this.ensure();
    orchestra.stopAll();
    const track = trackId ? tracks.find((t) => t.id === trackId) ?? this.state.track : this.state.track;
    const el = this.el!;
    if (track.id !== this.state.track.id || !el.src) {
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

  toggle(trackId?: string) {
    if (this.state.playing && (!trackId || trackId === this.state.track.id)) this.pause();
    else this.play(trackId);
  }

  seek(t: number) {
    if (this.el && isFinite(t)) this.el.currentTime = t;
    this.set({ time: t });
  }

  next() {
    const i = tracks.findIndex((t) => t.id === this.state.track.id);
    this.play(tracks[(i + 1) % tracks.length].id);
  }
}

export const player = new MusicPlayer();
