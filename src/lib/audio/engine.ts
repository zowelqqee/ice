// Single Web Audio graph for the whole site. Sound is on by default and nobody is asked (client,
// October 2026). Where the browser lets it start on its own, the intro plays with the jingle;
// elsewhere it starts with the visitor's first click, tap or key anywhere. A visitor who turns it
// off with the sound button is remembered, and then it waits for the button.
//
//   sources ─► bus ─► master (mute) ─► analyser ─► destination
//                └──► reverb send
//
// The analyser is read by visuals (hero rim pulse, music section) through `levels()`.

type Listener = () => void;

export interface Levels {
  low: number;
  mid: number;
  high: number;
  overall: number;
}

const PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]; // A minor pentatonic, MIDI
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  /** Set once the whole graph is wired. */
  ctx: AudioContext | null = null;
  private early: AudioContext | null = null; // made ahead of time, not wired yet
  private master!: GainNode;
  bus!: GainNode;
  reverbSend!: GainNode;
  private analyser!: AnalyserNode;
  private freq!: Uint8Array<ArrayBuffer>;
  private listeners = new Set<Listener>();
  private _muted = true;
  private _enabled = false;

  private lastBell = 0;

  get enabled() {
    return this._enabled;
  }
  get muted() {
    return this._muted;
  }

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private emit() {
    this.listeners.forEach((l) => l());
  }

  /** Call from a user gesture. */
  async enable() {
    if (!this.ctx) this.build();
    await this.ctx!.resume();
    this._enabled = true;
    this.setMuted(false);
  }

  /** Build the graph and wake it without a sound (the master stays at zero). From a gesture this
   *  unlocks sound for later; without one, it tells whether the browser lets sound play at all. */
  async unlock(wait = 400): Promise<boolean> {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    if (ctx.state === "running") return true;
    // where sound needs a gesture, resume() stays pending (or fails) until there is one
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), wait));
    return Promise.race([ctx.resume().then(() => ctx.state === "running", () => false), timeout]);
  }

  setMuted(m: boolean) {
    this._muted = m;
    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, now, m ? 0.08 : 0.35);
    }
    this.emit();
  }

  toggle() {
    const on = !this._enabled || this._muted;
    rememberSound(on);
    if (!this._enabled) return this.enable();
    this.setMuted(!on);
  }

  /** Make the graph ahead of time, in two quiet moments: opening an AudioContext alone is a long
   *  task on a phone, and the reverb another, so neither lands on the click or on the intro. It
   *  stays silent and suspended until the first gesture, as before. */
  prepare() {
    if (this.ctx || this.early) return;
    idle(() => {
      if (this.ctx || this.early) return;
      this.early = newContext();
      idle(() => {
        if (!this.ctx) this.build();
      });
    });
  }

  private build() {
    const ctx = this.early ?? newContext();
    this.early = null;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.78;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.bus = ctx.createGain();

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 3;

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 4.5, 2.8);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;

    this.bus.connect(comp);
    this.reverbSend.connect(reverb).connect(comp);
    comp.connect(this.master).connect(this.analyser).connect(ctx.destination);
  }

  /** Per-frame from the hero scene: occasional glass bells, without background audio. */
  setSpin(speed: number) {
    if (!this.ctx || this._muted) return;
    const now = this.ctx.currentTime;
    const s = Math.min(1, Math.max(0, (speed - 0.9) / 12));

    if (s > 0.35 && now - this.lastBell > 0.32 - s * 0.18 && Math.random() < 0.5) {
      this.lastBell = now;
      this.bell(PENTA[Math.floor(Math.random() * PENTA.length)] + 12, 0.05 + s * 0.06);
    }
  }

  /** Glassy FM bell, used for spin sparkles and UI ticks. */
  bell(midi: number, level = 0.08, when = 0) {
    if (!this.ctx || this._muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const f = mtof(midi);
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    const g = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * 3.51;
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 1.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    mod.connect(mg).connect(car.frequency);
    car.connect(g);
    g.connect(this.bus);
    g.connect(this.reverbSend);
    car.start(t);
    mod.start(t);
    car.stop(t + 2.3);
    mod.stop(t + 2.3);
  }

  levels(): Levels {
    if (!this.ctx || this._muted) return { low: 0, mid: 0, high: 0, overall: 0 };
    this.analyser.getByteFrequencyData(this.freq);
    const n = this.freq.length;
    const band = (a: number, b: number) => {
      let s = 0;
      const i0 = Math.floor(a * n);
      const i1 = Math.max(i0 + 1, Math.floor(b * n));
      for (let i = i0; i < i1; i++) s += this.freq[i];
      return s / ((i1 - i0) * 255);
    };
    const low = band(0, 0.03);
    const mid = band(0.03, 0.18);
    const high = band(0.18, 0.6);
    return { low, mid, high, overall: (low + mid + high) / 3 };
  }

  frequencyData() {
    if (this.ctx) this.analyser.getByteFrequencyData(this.freq);
    return this.freq;
  }
}

function newContext() {
  // iPhone: without this, Web Audio is muted by the ringer switch (Safari 17+)
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = "playback";
  return new AudioContext({ latencyHint: "interactive" });
}

function idle(fn: () => void) {
  if ("requestIdleCallback" in window) requestIdleCallback(fn, { timeout: 2500 });
  else setTimeout(fn, 300);
}

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  // the decay is smooth: worked out once per 64 samples (a Math.pow per sample made this the
  // longest task on a phone, right as the intro starts)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i += 64) {
      const env = Math.pow(1 - i / len, decay);
      const end = Math.min(len, i + 64);
      for (let j = i; j < end; j++) d[j] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

const PREF_KEY = "moi.sound";
/** The visitor's own choice, kept across visits: "off" means wait for the sound button. */
export function rememberSound(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {}
}
export function soundRefused() {
  try {
    return localStorage.getItem(PREF_KEY) === "off";
  } catch {
    return false;
  }
}

export const audio = new AudioEngine();

// sound on by default: start on the first gesture the browser accepts for it (not from the sound
// button itself: it toggles on its own)
if (typeof window !== "undefined") {
  const events = ["pointerdown", "keydown", "touchend", "click"] as const;
  const stop = () => events.forEach((e) => window.removeEventListener(e, start, true));
  const start = (e: Event) => {
    if (audio.enabled || soundRefused()) return stop();
    if ((e.target as Element | null)?.closest?.("[data-sound-toggle]")) return stop();
    stop();
    void audio.enable();
  };
  events.forEach((e) => window.addEventListener(e, start, { capture: true, passive: true }));
  // and the graph is made once the page has loaded, unless the visitor turned sound off
  const ready = () => soundRefused() || audio.prepare();
  if (document.readyState === "complete") ready();
  else window.addEventListener("load", ready, { once: true });
}
