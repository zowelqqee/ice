#!/usr/bin/env node
// Ice orchestra samples: real instrument recordings from VS Chamber Orchestra 2 Community Edition
// (Versilian Studios, CC0 public domain: https://github.com/sgossner/VSCO-2-CE).
// Trims leading silence, caps length, peak-normalises, encodes mono Opus (.webm) + AAC (.m4a),
// strips all metadata and names every file by the MIDI note it actually sounds (pitches were
// measured: several sub-libraries label octaves one lower than scientific pitch).
//
//   usage: node scripts/media/orchestra.mjs <vsco-download-dir>
//   (the dir holds one folder per instrument with the original .wav files)

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync, rmSync, readFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const SRC = process.argv[2];
if (!SRC) throw new Error("usage: orchestra.mjs <vsco-download-dir>");
const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = join(ROOT, "public/media/orchestra");

const NOTE = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const named = (offset) => (f) => {
  const m = f.match(/_([A-G]#?)(-?\d)_/);
  return m ? NOTE[m[1]] + 12 * (+m[2] + 1) + offset : null;
};

// per instrument: how to read the true MIDI note, max length (s), fade-out (s)
const INSTRUMENTS = {
  violin: { midi: named(0), len: 4.5, fade: 0.5 },
  cello: { midi: named(12), len: 5, fade: 0.6 },
  flute: { midi: named(12), len: 4.5, fade: 0.5 },
  horn: { midi: named(12), len: 5, fade: 0.6 },
  harp: { midi: named(0), len: 4, fade: 0.8 },
  piano: { midi: (f) => 21 + 2 * +f.match(/_(\d{3})\.wav$/)[1], len: 4.5, fade: 0.8 },
  glock: { midi: (f) => named(12)(f.replace("glock_medium_", "_").replace(".wav", "_")), len: 3, fade: 0.6 },
  // timpani: measured principal tones (fractional MIDI); playback retunes to the wanted note
  timpani: {
    midi: (f) => ({ Timpani1: 41.46, Timpani2: 46.81, Timpani3: 49.5, Timpani4: 52.42, Timpani5: 54.58 })[f.split("_")[0]],
    len: 4.5,
    fade: 1,
  },
};

const ff = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
const STRIP = ["-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact"];

const manifest = {};
rmSync(OUT, { recursive: true, force: true });
for (const [inst, cfg] of Object.entries(INSTRUMENTS)) {
  const dir = join(SRC, inst);
  mkdirSync(join(OUT, inst), { recursive: true });
  manifest[inst] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".wav")).sort()) {
    const midi = cfg.midi(f);
    if (midi == null || Number.isNaN(midi)) continue;
    const id = String(Math.round(midi * 100) / 100).replace(".", "_");
    const tmp = join(OUT, inst, `${id}.wav`);
    const fadeStart = Math.max(0.2, cfg.len - cfg.fade);
    // mono, trim silence before the attack, cap, fade
    ff(["-i", join(dir, f), ...STRIP, "-ac", "1", "-ar", "48000", "-af",
      `silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.005,atrim=0:${cfg.len},afade=t=out:st=${fadeStart}:d=${cfg.fade}`, tmp]);
    // peak-normalise to -1 dBFS
    // ffmpeg prints the volumedetect report on stderr
    const vd = spawnSync("ffmpeg", ["-hide_banner", "-i", tmp, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }).stderr;
    const m = /max_volume: (-?[\d.]+) dB/.exec(vd);
    if (!m) throw new Error(`volumedetect failed for ${inst}/${f}`);
    const gain = -1 - parseFloat(m[1]);
    ff(["-i", tmp, ...STRIP, "-af", `volume=${gain.toFixed(2)}dB`, "-c:a", "libopus", "-b:a", "80k", join(OUT, inst, `${id}.webm`)]);
    ff(["-i", tmp, ...STRIP, "-af", `volume=${gain.toFixed(2)}dB`, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", join(OUT, inst, `${id}.m4a`)]);
    rmSync(tmp);
    // content-hashed names: a changed recording always gets a new URL (no stale caches)
    const hash = createHash("sha1").update(readFileSync(join(OUT, inst, `${id}.webm`))).update(readFileSync(join(OUT, inst, `${id}.m4a`))).digest("hex").slice(0, 8);
    for (const ext of ["webm", "m4a"]) renameSync(join(OUT, inst, `${id}.${ext}`), join(OUT, inst, `${id}-${hash}.${ext}`));
    manifest[inst].push({ midi, file: `${id}-${hash}` });
  }
  manifest[inst].sort((a, b) => a.midi - b.midi);
  console.log(inst.padEnd(8), manifest[inst].map((s) => s.midi).join(" "));
}
writeFileSync(join(ROOT, "src/data/orchestra-samples.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("manifest → src/data/orchestra-samples.json");
