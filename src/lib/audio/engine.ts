// Single Web Audio graph for the whole site. Sound is on by default and nobody is asked (client,
// October 2026). Most browsers only let it start from a gesture: entering on the Enter screen, or,
// without it, the visitor's first click, tap or key anywhere; where the browser allows it without
// one, the Enter screen starts by itself. A visitor who turns it off with the sound button keeps it
// off on that visit's pages (the next visit's Enter screen starts with sound again).
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
const CHORDS = [
  [45, 52, 59, 60, 64], // Am(add9)
  [41, 48, 57, 60, 64], // Fmaj7
  [43, 50, 55, 59, 62], // G6
  [40, 47, 55, 59, 62], // Em7
];
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  bus!: GainNode;
  reverbSend!: GainNode;
  private analyser!: AnalyserNode;
  private freq!: Uint8Array<ArrayBuffer>;
  private listeners = new Set<Listener>();
  private _muted = true;
  private _enabled = false;

  // ambient
  private pad: { osc: OscillatorNode[]; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private hiss: { gain: GainNode; filter: BiquadFilterNode } | null = null;
  private chordIdx = 0;
  private chordTimer = 0;
  private lastBell = 0;
  private ambientLevel = 1;

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

  private build() {
    // iPhone: without this, Web Audio is muted by the ringer switch (Safari 17+)
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
    const ctx = new AudioContext({ latencyHint: "interactive" });
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

    this.buildAmbient();
  }

  private buildAmbient() {
    const ctx = this.ctx!;
    // pad
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 380;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.11, ctx.currentTime, 2.5);
    const osc: OscillatorNode[] = [];
    CHORDS[0].forEach((m, i) => {
      for (const [type, det] of [["triangle", -6], ["sine", 7]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = mtof(m);
        o.detune.value = det + (i % 2 ? 3 : -3);
        const g = ctx.createGain();
        g.gain.value = type === "sine" ? 0.5 : 0.22;
        o.connect(g).connect(filter);
        o.start();
        osc.push(o);
      }
    });
    filter.connect(gain);
    gain.connect(this.bus);
    gain.connect(this.reverbSend);
    this.pad = { osc, gain, filter };

    // blade hiss: band-passed noise, loudness follows spin speed
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer(ctx, 3);
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 4200;
    bp.Q.value = 0.9;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    noise.connect(bp).connect(hg);
    hg.connect(this.bus);
    hg.connect(this.reverbSend);
    noise.start();
    this.hiss = { gain: hg, filter: bp };
  }

  /** Scale the generated ambient (the music section ducks it when real stems play). */
  setAmbientLevel(v: number) {
    this.ambientLevel = v;
    if (this.pad && this.ctx) this.pad.gain.gain.setTargetAtTime(0.11 * v, this.ctx.currentTime, 0.6);
  }

  /** Per-frame from the hero scene: speed in rad/s. */
  setSpin(speed: number, dt: number) {
    if (!this.ctx || this._muted || !this.hiss || !this.pad) return;
    const now = this.ctx.currentTime;
    const s = Math.min(1, Math.max(0, (speed - 0.9) / 12));
    this.hiss.gain.gain.setTargetAtTime(s * s * 0.16 * this.ambientLevel, now, 0.08);
    this.hiss.filter.frequency.setTargetAtTime(3000 + s * 5000, now, 0.1);

    this.chordTimer += dt;
    if (this.chordTimer > 9) {
      this.chordTimer = 0;
      this.chordIdx = (this.chordIdx + 1) % CHORDS.length;
      const chord = CHORDS[this.chordIdx];
      this.pad.osc.forEach((o, i) => o.frequency.setTargetAtTime(mtof(chord[i >> 1]), now, 1.4));
    }

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

function noiseBuffer(ctx: AudioContext, seconds: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function impulse(ctx: AudioContext, seconds: number, decay: number) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
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
function soundRefused() {
  try {
    return localStorage.getItem(PREF_KEY) === "off";
  } catch {
    return false;
  }
}

export const audio = new AudioEngine();

// sound on by default: start on the first gesture the browser accepts for it (not while the Enter
// screen is up: entering starts it; not from the sound button itself: it toggles on its own)
if (typeof window !== "undefined") {
  const events = ["pointerdown", "keydown", "touchend", "click"] as const;
  const stop = () => events.forEach((e) => window.removeEventListener(e, start, true));
  const start = (e: Event) => {
    if (audio.enabled || soundRefused()) return stop();
    if ("gate" in document.documentElement.dataset) return;
    if ((e.target as Element | null)?.closest?.("[data-sound-toggle]")) return stop();
    stop();
    void audio.enable();
  };
  events.forEach((e) => window.addEventListener(e, start, { capture: true, passive: true }));
}
