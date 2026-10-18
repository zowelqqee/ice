import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import type { MediaRef } from "@/lib/data";
import { deleteFiles, fetchIncoming, putFile } from "@/lib/storage";

// Turns an upload into the files the site plays, the same way the scripts in scripts/media/ do
// for the original footage:
//   image  → .avif / .webp / .jpg at the slot's size (cropped to fill, around the most
//            interesting part), metadata dropped
//   video  → silent H.264 .mp4 loop (first 15 s) at the slot's size + a still for the poster
//   audio  → loudness-normalised .m4a (AAC) and .webm (Opus), metadata dropped
// Nothing of the original file is kept.

const run = promisify(execFile);

export const SLOTS = {
  card: { w: 720, h: 900, label: "Card (portrait, shows list)" },
  hero: { w: 1280, h: 720, label: "Show page header (landscape)" },
  extra: { w: 1280, h: 720, label: "Extra loop on the show page (landscape)" },
  og: { w: 1200, h: 630, label: "Share image (links in messengers and social networks)" },
} as const;
export type Slot = keyof typeof SLOTS;
export const isSlot = (s: unknown): s is Slot => typeof s === "string" && s in SLOTS;

export const LIMITS = {
  image: 40 * 1024 * 1024,
  video: 400 * 1024 * 1024,
  audio: 80 * 1024 * 1024,
};
export const MAX_VIDEO_SECONDS = 15;
export type MediaKind = keyof typeof LIMITS;
export const kindOf = (contentType: string): MediaKind | null =>
  contentType.startsWith("image/") ? "image" : contentType.startsWith("video/") ? "video" : contentType.startsWith("audio/") ? "audio" : null;

function ffmpegPath(): string | null {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv) return fromEnv;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    if (p && existsSync(p)) return p;
  } catch {}
  return "ffmpeg"; // on PATH (e.g. installed with Homebrew or apt)
}

async function ffmpeg(args: string[]) {
  const bin = ffmpegPath();
  if (!bin) throw new Error("Video and audio processing is not available on this server (ffmpeg missing).");
  try {
    return await run(bin, ["-hide_banner", "-nostdin", "-y", ...args], { maxBuffer: 32 * 1024 * 1024, timeout: 240_000 });
  } catch (e) {
    const err = e as { code?: string; stderr?: string };
    if (err.code === "ENOENT") throw new Error("Video and audio processing is not available on this server (ffmpeg missing).");
    const last = (err.stderr ?? "").trim().split("\n").slice(-2).join(" ").slice(0, 300);
    throw new Error(`The file could not be processed${last ? `: ${last}` : "."}`);
  }
}

const durationOf = (stderr: string) => {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
};

const token = () => randomBytes(5).toString("hex");

async function stills(input: string | Buffer, key: string, w: number, h: number) {
  const { default: sharp } = await import("sharp");
  let img;
  try {
    img = sharp(input, { failOn: "error", limitInputPixels: 120_000_000 }).rotate().resize(w, h, { fit: "cover", position: "attention" });
    await img.clone().metadata();
  } catch {
    throw new Error("This file is not an image the site can use (JPEG, PNG, WebP, AVIF, HEIC or TIFF).");
  }
  const [avif, webp, jpg] = await Promise.all([
    img.clone().avif({ quality: 50, effort: 4 }).toBuffer(),
    img.clone().webp({ quality: 76 }).toBuffer(),
    img.clone().jpeg({ quality: 80, mozjpeg: true }).toBuffer(),
  ]);
  // sharp writes no EXIF / XMP / ICC comments unless asked to
  await putFile(`${key}.avif`, avif, "image/avif");
  await putFile(`${key}.webp`, webp, "image/webp");
  await putFile(`${key}.jpg`, jpg, "image/jpeg");
}

/** Process an upload for a picture slot (image or video). `folder` like "shows/aladdin". */
export async function processVisual(incoming: string, kind: MediaKind, slot: Slot, folder: string): Promise<MediaRef> {
  const { w, h } = SLOTS[slot];
  const key = `u/${folder}/${slot}-${token()}`;
  const work = await mkdtemp(join(tmpdir(), "moi-"));
  try {
    const input = await fetchIncoming(incoming, work);
    if (kind === "image") {
      await stills(input, key, w, h);
      return { poster: `/${key}` };
    }
    if (kind !== "video" || slot === "og") throw new Error("Use an image here.");
    const out = join(work, "out.mp4");
    await ffmpeg([
      "-i", input, "-t", String(MAX_VIDEO_SECONDS), "-an", "-sn", "-dn",
      "-vf", `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-profile:v", "high",
      "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact",
      "-movflags", "+faststart", out,
    ]);
    const frame = join(work, "frame.png");
    await ffmpeg(["-i", out, "-vf", "thumbnail=24", "-frames:v", "1", "-update", "1", frame]);
    await putFile(`${key}.mp4`, await readFile(out), "video/mp4");
    await stills(frame, key, w, h);
    return { video: `/${key}`, poster: `/${key}`, formats: ["mp4"] };
  } finally {
    await rm(work, { recursive: true, force: true });
    await deleteFiles([incoming]);
  }
}

/** Process an audio upload for a music track. */
export async function processAudio(incoming: string, id: string): Promise<{ src: string; duration: number }> {
  const key = `u/music/${id}-${token()}`;
  const work = await mkdtemp(join(tmpdir(), "moi-"));
  try {
    const input = await fetchIncoming(incoming, work);
    const common = ["-i", input, "-vn", "-sn", "-dn", "-t", "900", "-map_metadata", "-1", "-map_chapters", "-1", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-fflags", "+bitexact"];
    const m4a = join(work, "out.m4a");
    const webm = join(work, "out.webm");
    await ffmpeg([...common, "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", m4a]);
    await ffmpeg([...common, "-c:a", "libopus", "-b:a", "128k", webm]);
    const probe = await ffmpeg(["-i", m4a, "-f", "null", "-"]);
    const duration = Math.round(durationOf(probe.stderr) * 10) / 10;
    if (!duration) throw new Error("The file has no audio the site can play.");
    await putFile(`${key}.m4a`, await readFile(m4a), "audio/mp4");
    await putFile(`${key}.webm`, await readFile(webm), "audio/webm");
    return { src: `/${key}`, duration };
  } finally {
    await rm(work, { recursive: true, force: true });
    await deleteFiles([incoming]);
  }
}

/** The stored files behind a media path, for deleting replaced uploads. Files that ship with the
 *  site (/media/…) are never deleted. */
export function storedFiles(path: string | undefined | null): string[] {
  if (!path || !path.startsWith("/u/")) return [];
  const key = path.slice(1);
  return ["avif", "webp", "jpg", "mp4", "m4a", "webm"].map((ext) => `${key}.${ext}`);
}
