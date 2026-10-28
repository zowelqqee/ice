// The ice orchestra: eight real instruments (CC0 recordings, VS Chamber Orchestra 2 CE) playing
// an original 16-bar theme in D minor. Every instrument has its own part of the same score, so any
// combination the visitor wakes is a real arrangement, always in time.
//
//   score (events per instrument) ─► lookahead scheduler on the AudioContext clock
//   ─► sampler voice (nearest recorded note, pitch-shifted, enveloped)
//   ─► instrument bus (gain · pan · analyser) ─► engine bus + reverb

import { audio } from "./engine";
import samples from "@/data/orchestra-samples.json";

export const INSTRUMENTS = ["harp", "piano", "glock", "timpani", "violin", "flute", "horn", "cello"] as const;
export type Instrument = (typeof INSTRUMENTS)[number];

interface Voice {
  gain: number; // bus level
  pan: number; // stereo seat, matches the stage layout
  send: number; // reverb amount
  attack: number; // s
  release: number; // s
  sustained: boolean; // bowed/blown: can join mid-note
}
const VOICES: Record<Instrument, Voice> = {
  violin: { gain: 0.95, pan: 0.45, send: 0.5, attack: 0.09, release: 0.35, sustained: true },
  cello: { gain: 0.5, pan: -0.15, send: 0.45, attack: 0.12, release: 0.45, sustained: true },
  flute: { gain: 0.62, pan: 0.25, send: 0.55, attack: 0.08, release: 0.35, sustained: true },
  horn: { gain: 0.5, pan: -0.35, send: 0.6, attack: 0.28, release: 0.6, sustained: true },
  piano: { gain: 0.5, pan: -0.25, send: 0.4, attack: 0.002, release: 0.5, sustained: false },
  harp: { gain: 0.6, pan: -0.6, send: 0.55, attack: 0.002, release: 0.9, sustained: false },
  glock: { gain: 0.7, pan: 0.05, send: 0.65, attack: 0.001, release: 0.8, sustained: false },
  timpani: { gain: 0.6, pan: 0.0, send: 0.5, attack: 0.001, release: 1.2, sustained: false },
};

// ── score ────────────────────────────────────────────────────────────────────────────────────
export const BPM = 72;
const SPB = 60 / BPM;
const BARS = 16;
const LOOP_BEATS = BARS * 4;

type Ev = [beat: number, midi: number, dur: number, vel: number];

// D minor: i – VI – III – VII – iv – VI – V(sus4) – V, twice
const CHORDS: { root: number; tones: number[] }[] = [];
const PROG = [
  [50, [0, 3, 7]], // Dm
  [46, [0, 4, 7]], // Bb
  [41, [0, 4, 7]], // F
  [48, [0, 4, 7]], // C
  [43, [0, 3, 7]], // Gm
  [46, [0, 4, 7]], // Bb
  [45, [0, 5, 7]], // Asus4
  [45, [0, 4, 7]], // A
] as const;
for (let i = 0; i < BARS; i++) {
  const [root, tones] = PROG[i % 8];
  CHORDS.push({ root, tones: [...tones] });
}

/** Write a line as [midi, beats] pairs starting at a bar (0-based); null midi = rest. */
function line(bar: number, notes: [number | null, number][], vel = 0.7): Ev[] {
  const out: Ev[] = [];
  let b = bar * 4;
  for (const [m, d] of notes) {
    if (m != null) out.push([b, m, d, vel]);
    b += d;
  }
  return out;
}

// note names → MIDI, for readability of the melody
const N = (n: string) => {
  const m = /^([A-G])(b|#)?(\d)$/.exec(n)!;
  return { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as "C"]! + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12 * (+m[3] + 1);
};
const L = (bar: number, s: string, vel = 0.7) =>
  line(
    bar,
    s.split(/\s+/).map((t) => {
      const [n, d] = t.split(":");
      return [n === "r" ? null : N(n), +d];
    }),
    vel,
  );

const violin: Ev[] = [
  // A: the theme
  ...L(0, "D5:1.5 E5:0.5 F5:1 A5:1"),
  ...L(1, "G5:2 F5:1 D5:1"),
  ...L(2, "C5:1.5 D5:0.5 F5:2"),
  ...L(3, "E5:3 r:1"),
  ...L(4, "D5:1.5 E5:0.5 F5:1 G5:1"),
  ...L(5, "A5:1.5 Bb5:0.5 A5:1 F5:1"),
  ...L(6, "G5:1 F5:1 E5:2"),
  ...L(7, "E5:1 C#5:1 A4:2"),
  // B: the theme lifted
  ...L(8, "A5:1.5 G5:0.5 F5:1 A5:1", 0.8),
  ...L(9, "D6:2 C6:1 Bb5:1", 0.85),
  ...L(10, "A5:1.5 G5:0.5 F5:2", 0.8),
  ...L(11, "G5:2 E5:1 C5:1", 0.75),
  ...L(12, "Bb5:1.5 A5:0.5 G5:1 D6:1", 0.85),
  ...L(13, "D6:1.5 C6:0.5 Bb5:1 A5:1", 0.9),
  ...L(14, "G5:1 F5:1 E5:1 D5:1", 0.8),
  ...L(15, "C#5:2 A4:1 r:1", 0.7),
];

const flute: Ev[] = [
  ...L(0, "F5:4", 0.5),
  ...L(1, "F5:2 D5:2", 0.5),
  ...L(2, "A5:4", 0.5),
  ...L(3, "G5:4", 0.5),
  ...L(4, "Bb5:2 A5:2", 0.55),
  ...L(5, "F5:4", 0.5),
  ...L(6, "A5:2 G5:2", 0.55),
  ...L(7, "E5:4", 0.5),
  ...L(8, "r:2 D6:1 C6:1", 0.6),
  ...L(9, "F6:3 D6:1", 0.6),
  ...L(10, "C6:4", 0.6),
  ...L(11, "C6:2 G5:2", 0.55),
  ...L(12, "D6:2 Bb5:2", 0.6),
  ...L(13, "F6:2 E6:1 D6:1", 0.65),
  ...L(14, "D6:2 C#6:2", 0.6),
  ...L(15, "E6:4", 0.55),
];

const cello: Ev[] = [];
const horn: Ev[] = [];
const piano: Ev[] = [];
const harp: Ev[] = [];
const glock: Ev[] = [];
const timpani: Ev[] = [];

for (let bar = 0; bar < BARS; bar++) {
  const { root, tones } = CHORDS[bar];
  const B = bar * 4;
  const b2 = bar >= 8; // second pass is fuller
  const third = root + tones[1];
  const fifth = root + tones[2];

  // cello: bass line in halves, walking into the turnaround
  const bass = root - 12 + (root - 12 < 38 ? 12 : 0);
  if (bar % 8 === 7) cello.push([B, bass, 2, 0.75], [B + 2, bass + 4, 1, 0.7], [B + 3, bass + 7, 1, 0.72]);
  else if (bar % 8 === 5) cello.push([B, bass, 4, b2 ? 0.8 : 0.7]);
  else cello.push([B, bass, 2, b2 ? 0.8 : 0.7], [B + 2, bass + 7, 2, b2 ? 0.72 : 0.62]);

  // horn: warm pads on the third (fifth in the sus bar), swelling into each phrase end
  const pad = bar % 8 === 6 ? root + 5 : third;
  horn.push([B, pad + (pad < 50 ? 12 : 0), 4, bar % 8 === 7 ? 0.75 : 0.55]);

  // piano: broken chords in eighths
  const voicing = [root, fifth, root + 12, third + 12, fifth + 12];
  const order = [0, 1, 2, 3, 4, 3, 2, 1];
  order.forEach((k, i) => piano.push([B + i * 0.5, voicing[k] + (root < 46 ? 12 : 0), 0.9, i === 0 ? 0.62 : 0.45]));

  // harp: a ripple on every downbeat, a full two-octave sweep into every cadence
  const arp = [0, 1, 2].flatMap((o) => [root + 12 * o, third + 12 * o, fifth + 12 * o]).map((m) => m + 12);
  if (bar % 4 === 3) arp.concat([root + 48]).forEach((m, i) => harp.push([B + i * 0.25, m, 2, 0.5 + i * 0.02]));
  else {
    arp.slice(0, 4).forEach((m, i) => harp.push([B + i * 0.25, m, 2.5, 0.55]));
    if (b2) arp.slice(3, 7).forEach((m, i) => harp.push([B + 2 + i * 0.25, m, 2, 0.5]));
  }

  // glockenspiel: ice sparkles on the chord, then doubling the lifted theme
  if (!b2) glock.push([B, third + 24 + (third + 24 < 79 ? 12 : 0), 1, 0.55], [B + 2.5, fifth + 24 + (fifth + 24 < 79 ? 12 : 0), 1, 0.45]);

  // timpani: roots on the downbeat; a crescendo into each cadence
  const timpNote = root - 12 >= 41 ? root - 12 : root;
  if (bar % 8 === 7) [0, 2, 2.5, 3].forEach((o, i) => timpani.push([B + o, 45, 1.5, 0.45 + i * 0.12]));
  else if (b2 || bar % 2 === 0) timpani.push([B, timpNote, 2, b2 ? 0.7 : 0.6]);
}
for (const [b, m, d, v] of violin.slice(violin.findIndex((e) => e[0] >= 32))) if (Number.isInteger(b)) glock.push([b, m + 12, Math.min(d, 1), v * 0.55]);

export const SCORE: Record<Instrument, Ev[]> = { violin, flute, cello, horn, piano, harp, glock, timpani };

// ── sampler ──────────────────────────────────────────────────────────────────────────────────
type SampleSet = { midi: number; buffer: AudioBuffer }[];
type Listener = () => void;

export interface OrchestraState {
  awake: Instrument[];
  loading: Instrument[];
  playing: boolean;
  beat: number; // position in the loop, for visuals
}

class Orchestra {
  private sets: Partial<Record<Instrument, SampleSet>> = {};
  private loads: Partial<Record<Instrument, Promise<void>>> = {};
  private buses: Partial<Record<Instrument, { gain: GainNode; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer> }>> = {};
  private listeners = new Set<Listener>();
  private timer = 0;
  private t0 = 0; // AudioContext time of loop beat 0
  private scheduledUntil = 0; // absolute beats scheduled so far
  private stopTimer = 0;
  private format: "webm" | "m4a" | null = null;
  state: OrchestraState = { awake: [], loading: [], playing: false, beat: 0 };
  private startHooks = new Set<() => void>();
  private noteHooks = new Set<(name: Instrument, midi: number, when: number, dur: number) => void>();
  /** Every scheduled note (AudioContext time), so visuals can press keys and pluck strings in sync. */
  onNote(fn: (name: Instrument, midi: number, when: number, dur: number) => void) {
    this.noteHooks.add(fn);
    return () => {
      this.noteHooks.delete(fn);
    };
  }
  get time() {
    return audio.ctx?.currentTime ?? 0;
  }
  /** Called whenever an instrument wakes (the track player pauses itself). */
  onStart(fn: () => void) {
    this.startHooks.add(fn);
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;
  private set(p: Partial<OrchestraState>) {
    this.state = { ...this.state, ...p };
    this.listeners.forEach((l) => l());
  }

  private async ensureAudio() {
    if (!audio.enabled) await audio.enable();
    else if (audio.muted) audio.setMuted(false);
  }

  private bus(name: Instrument) {
    let b = this.buses[name];
    if (b) return b;
    const ctx = audio.ctx!;
    const v = VOICES[name];
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    pan.pan.value = v.pan;
    const send = ctx.createGain();
    send.gain.value = v.send;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.5;
    gain.connect(pan);
    pan.connect(audio.bus);
    pan.connect(send).connect(audio.reverbSend);
    gain.connect(analyser);
    b = { gain, analyser, buf: new Float32Array(analyser.fftSize) };
    this.buses[name] = b;
    return b;
  }

  /** Fetch + decode an instrument's recordings (once). */
  load(name: Instrument) {
    if (this.loads[name]) return this.loads[name]!;
    const ctx = audio.ctx!;
    const list = (samples as Record<string, { midi: number; file: string }[]>)[name];
    this.set({ loading: [...this.state.loading, name] });
    const decode = async (file: string) => {
      const fmts: ("webm" | "m4a")[] = this.format ? [this.format] : ["webm", "m4a"];
      for (const f of fmts) {
        try {
          const res = await fetch(`/media/orchestra/${name}/${file}.${f}`);
          if (!res.ok) continue;
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          this.format ??= f;
          return buf;
        } catch {
          /* try the next format */
        }
      }
      throw new Error(`cannot decode ${name}/${file}`);
    };
    this.loads[name] = Promise.all(list.map(async (s) => ({ midi: s.midi, buffer: await decode(s.file) })))
      .then((set) => {
        this.sets[name] = set;
      })
      .catch(() => {
        this.sets[name] = []; // falls back to a synthesised voice
      })
      .finally(() => this.set({ loading: this.state.loading.filter((l) => l !== name) }));
    return this.loads[name]!;
  }

  /** Warm the cache while the section is in view (only after the visitor enabled sound). */
  preload() {
    if (!audio.enabled) return; // the graph is made ahead of time; sound may still be off
    INSTRUMENTS.forEach((n) => this.load(n));
  }

  private note(name: Instrument, midi: number, when: number, durBeats: number, vel: number, offset = 0) {
    const ctx = audio.ctx!;
    const set = this.sets[name];
    const v = VOICES[name];
    const dur = durBeats * SPB;
    const out = this.bus(name).gain;
    this.noteHooks.forEach((h) => h(name, midi, when, dur));
    const g = ctx.createGain();
    const peak = Math.max(0.0001, vel * vel * 1.1);
    const end = when + dur;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + v.attack + (offset ? 0.15 : 0));
    if (v.sustained) {
      g.gain.setValueAtTime(peak, Math.max(when + v.attack, end - 0.02));
      g.gain.exponentialRampToValueAtTime(0.0001, end + v.release);
    } else {
      g.gain.setTargetAtTime(0.0001, end, v.release / 3);
    }
    g.connect(out);
    if (set && set.length) {
      let best = set[0];
      for (const s of set) if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
      const src = ctx.createBufferSource();
      src.buffer = best.buffer;
      src.playbackRate.value = Math.pow(2, (midi - best.midi) / 12);
      src.connect(g);
      src.start(when, Math.min(offset, Math.max(0, best.buffer.duration - 0.6)));
      src.stop(end + v.release + 0.1);
      src.onended = () => g.disconnect();
    } else {
      // fallback voice if recordings could not load
      const o = ctx.createOscillator();
      o.type = v.sustained ? "sawtooth" : "triangle";
      o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      const lp = ctx.createBiquadFilter();
      lp.frequency.value = v.sustained ? 2200 : 4000;
      o.connect(lp).connect(g);
      o.start(when);
      o.stop(end + v.release + 0.1);
    }
  }

  private now() {
    return audio.ctx!.currentTime;
  }
  private beatAt(t: number) {
    return (t - this.t0) / SPB;
  }

  private startTransport() {
    clearTimeout(this.stopTimer);
    if (this.state.playing) return;
    this.t0 = this.now() + 0.08;
    this.scheduledUntil = 0;
    this.set({ playing: true });
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
  }

  private stopTransport() {
    clearInterval(this.timer);
    this.set({ playing: false, beat: 0 });
    audio.setAmbientLevel(1);
  }

  private tick() {
    const horizon = this.beatAt(this.now() + 0.18);
    const from = this.scheduledUntil;
    if (horizon <= from) return;
    for (const name of this.state.awake) {
      if (!this.sets[name]) continue;
      for (const [b, m, d, v] of SCORE[name]) {
        // events repeat every loop: find occurrences inside [from, horizon)
        const k0 = Math.ceil((from - b) / LOOP_BEATS);
        for (let k = k0; b + k * LOOP_BEATS < horizon; k++) {
          const abs = b + k * LOOP_BEATS;
          if (abs >= from) this.note(name, m, this.t0 + abs * SPB, d, v);
        }
      }
    }
    this.scheduledUntil = horizon;
    this.set({ beat: this.beatAt(this.now()) % LOOP_BEATS });
  }

  /** Bowed and blown instruments join the note already sounding in the score. */
  private joinSounding(name: Instrument): boolean {
    if (!VOICES[name].sustained || !this.state.playing) return false;
    const pos = this.beatAt(this.now() + 0.05);
    const loopPos = ((pos % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS;
    for (const [b, m, d, v] of SCORE[name]) {
      const into = loopPos - b;
      if (into > 0 && d - into > 0.6) {
        this.note(name, m, this.now() + 0.05, d - into, v, into * SPB);
        return true;
      }
    }
    return false;
  }

  async toggle(name: Instrument) {
    await this.ensureAudio();
    const awake = this.state.awake.includes(name);
    if (awake) {
      this.set({ awake: this.state.awake.filter((n) => n !== name) });
      const b = this.bus(name);
      b.gain.gain.setTargetAtTime(0, this.now(), 0.25);
      if (!this.state.awake.length) this.stopTimer = window.setTimeout(() => this.stopTransport(), 1800);
      return;
    }
    this.set({ awake: [...this.state.awake, name] });
    this.startHooks.forEach((h) => h());
    audio.setAmbientLevel(0); // the hero drone is in another key: silence it under the orchestra
    await this.load(name);
    if (!this.state.awake.includes(name)) return; // put back to sleep while loading
    const b = this.bus(name);
    b.gain.gain.cancelScheduledValues(this.now());
    b.gain.gain.setTargetAtTime(VOICES[name].gain, this.now(), 0.05);
    const wasPlaying = this.state.playing;
    this.startTransport();
    const joined = wasPlaying && this.joinSounding(name);
    if (!joined) this.accent(name, wasPlaying);
  }

  /** An immediate, audible answer to the tap: a gesture on the chord that is sounding now. */
  private accent(name: Instrument, running: boolean) {
    const pos = this.state.playing ? this.beatAt(this.now() + 0.04) : 0;
    const bar = Math.floor((((pos % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS) / 4);
    const { root, tones } = CHORDS[bar];
    const t = this.now() + 0.03;
    const third = root + tones[1], fifth = root + tones[2];
    const beat = SPB;
    switch (name) {
      case "piano":
        [root + 12, third + 12, fifth + 12, root + 24].forEach((m, i) => this.note(name, m + (root < 46 ? 12 : 0), t + i * 0.06, 2, 0.62));
        break;
      case "harp":
        [root + 12, third + 12, fifth + 12, root + 24, third + 24, fifth + 24].forEach((m, i) => this.note(name, m, t + i * 0.07, 2.5, 0.6));
        break;
      case "glock":
        [fifth + 24, third + 36, root + 36].forEach((m, i) => this.note(name, Math.max(79, m), t + i * 0.12, 1, 0.55));
        break;
      case "timpani":
        this.note(name, root - 12 >= 41 ? root - 12 : root, t, 2, 0.75);
        break;
      default:
        // bowed and blown, between phrases of their part: a short swell on the chord
        // (on a fresh start their part begins on the first beat anyway)
        if (!running) break;
        const m = name === "violin" ? third + 12 : name === "flute" ? fifth + 24 : name === "cello" ? root - 12 + (root - 12 < 38 ? 12 : 0) : third + (third < 50 ? 12 : 0);
        this.note(name, m, t, (beat * 1.5) / SPB, 0.55);
    }
  }

  stopAll() {
    for (const n of [...this.state.awake]) this.toggle(n);
  }

  /** 0..1 loudness of an instrument (drives its glow). */
  level(name: Instrument) {
    const b = this.buses[name];
    if (!b || !this.state.awake.includes(name)) return 0;
    b.analyser.getFloatTimeDomainData(b.buf);
    let s = 0;
    for (let i = 0; i < b.buf.length; i++) s += b.buf[i] * b.buf[i];
    return Math.min(1, Math.sqrt(s / b.buf.length) * 5);
  }
}

export const orchestra = new Orchestra();

// development only: inspect the audio graph from the console
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __moi: unknown }).__moi = { audio, orchestra };
}
