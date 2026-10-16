#!/usr/bin/env node
// Brand-separation audit. Writes AUDIT.md and exits non-zero on any failure.
//
// Checks:
//   1. Cyrillic characters in file contents and file names (source, public, docs, built output)
//   2. Banned keywords: previous brand, the previous market, its cities and domains
//   3. Metadata left in shipped media (EXIF/XMP/IPTC/comments in images; tags in video/audio)
//   4. Non-ASCII file names in public/ and src/
//   5. Third-party requests: fonts, analytics, trackers, any external URL not on the allow-list
//   6. Tour events typed in the admin: checks 1 and 2 over every row of the events database
//      (the database named by DB_DRIVER / DATABASE_URL in .env.local, .env or the environment)
//
//   usage: node scripts/audit.mjs [--sheets]   (--sheets also writes contact sheets of every
//          shipped video to .audit/ for the manual watermark/face check)

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, extname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SELF = ["scripts/audit.mjs", "AUDIT.md", "package-lock.json"]; // lockfile: third-party package names and registry URLs, never shipped
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".audit"]);
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".css", ".md", ".html", ".svg", ".txt", ".sh", ".xml", ".yml", ".yaml", ".rsc", ".map", ".webmanifest"]);
const MEDIA_IMG = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif"]);
const MEDIA_AV = new Set([".mp4", ".webm", ".m4a", ".mp3", ".ogg", ".mov"]);

const CYRILLIC = /[\u0400-\u052F\u1C80-\u1C8F\u2DE0-\u2DFF\uA640-\uA69F]/;
// word-bounded so "division", "permission", "television" etc. do not trip it
const KEYWORDS = [
  /\bice\s*vision\b/i, /\bicevision(show)?\b/i, /\bvision\b/i,
  /\brussia\b/i, /\brussian\b/i, /\brossi(ya|ia)\b/i, /\bkremlin\b/i,
  /\bmoscow\b/i, /\bmoskva\b/i, /\bpetersburg\b/i, /\bleningrad\b/i, /\bkazan\b/i, /\bnovosibirsk\b/i,
  /\byekaterinburg\b/i, /\bekaterinburg\b/i, /\bsochi\b/i, /\bkrasnodar\b/i, /\bkrasnoyarsk\b/i,
  /\bvoronezh\b/i, /\bvolgograd\b/i, /\brostov\b/i, /\bnizhny\b/i, /\bchelyabinsk\b/i, /\bomsk\b/i,
  /\bsamara\b/i, /\bkaliningrad\b/i, /\bvladivostok\b/i, /\btyumen\b/i, /\bsaratov\b/i,
  /\bmoldova\b/i, /\bchisinau\b/i,
  /https?:\/\/[^\s"'`)]*\.ru\b/i, /\b[a-z0-9-]+\.ru\//i, /\byandex\b/i, /\bvk\.com\b/i, /\bmail\.ru\b/i,
];
const ALLOWED_URL = [
  /^https:\/\/www\.youtube\.com\/@MUSICALONICE-f3b/,
  /^https:\/\/instagram\.com\/musicalonice/,
  /^https:\/\/schema\.org/,
  /^https:\/\/creativecommons\.org\/licenses\/by\/4\.0/,
  /^https?:\/\/[a-z0-9.-]*musicalonice\.example/,
  /^https:\/\/nextjs\.org\/docs/,
  /^http:\/\/www\.w3\.org\//,
  /^https:\/\/github\.com\/(google|vercel|mrdoob|pmndrs)/, // licence headers in vendored files
  /^https:\/\/\$\{vercel\}$/, // src/lib/site.ts: the site's own production domain, read from the host's environment
];
const TRACKERS = [/fonts\.googleapis/i, /fonts\.gstatic/i, /google-analytics/i, /googletagmanager/i, /gtag\(/, /connect\.facebook/i, /hotjar/i, /plausible\.io/i, /segment\.(io|com)/i, /mixpanel/i, /use\.typekit/i];

// Framework internals in the production build that match a pattern but are not site content.
// Listed openly in the report with the reason; anything else in the build is a failure.
const ALLOWED_BUILT = [
  { re: /Slurp\|DuckDuckBot\|baiduspider\|yandex/gi, why: "Next.js list of search-engine bot user agents (server-side SEO handling)" },
  { re: /\byandex\b/gi, file: /^\.next-build\/(server|required-server-files|static\/chunks\/(main|255-))/, why: "Next.js bot user-agent regex (same list, minified)" },
  { re: /https:\/\/(\u0442\u0435\u0441\u0442|a#\u0431)/g, file: /^\.next-build\/static\/chunks\/polyfills-/, why: "core-js URL/IDN self-test in Next's legacy polyfill file (served with nomodule: modern browsers never download it)" },
];
const allowed = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT).filter((f) => !SELF.includes(relative(ROOT, f)));
const rel = (f) => relative(ROOT, f);
const results = [];
const fail = (check, file, detail) => results.push({ check, file, detail, ok: false });

// 1, 2, 5: text content
let textScanned = 0;
for (const f of files) {
  const r = rel(f);
  if (CYRILLIC.test(r)) fail("cyrillic-filename", r, "file name contains Cyrillic");
  if (!TEXT_EXT.has(extname(f).toLowerCase())) continue;
  if (statSync(f).size > 8_000_000) continue;
  const text = readFileSync(f, "utf8");
  textScanned++;
  const built = r.startsWith(".next-build/");
  text.split("\n").forEach((raw, i) => {
    // remove only the allowed substrings; the rest of the line is still checked
    let line = raw;
    if (built)
      for (const a of ALLOWED_BUILT) {
        if (a.file && !a.file.test(r)) continue;
        a.re.lastIndex = 0;
        if (a.re.test(line)) {
          allowed.push({ file: `${r}:${i + 1}`, why: a.why });
          line = line.replace(a.re, "");
        }
      }
    if (CYRILLIC.test(line)) fail("cyrillic-content", `${r}:${i + 1}`, line.trim().slice(0, 100));
    for (const k of KEYWORDS) {
      // built bundles: only brand/market terms, not the generic word "vision"
      if (built && k.source === "\\bvision\\b") continue;
      if (k.test(line)) fail("keyword", `${r}:${i + 1}`, `${k} → ${line.trim().slice(0, 100)}`);
    }
    if (!built && !r.startsWith("scripts/") && /\.(tsx?|css|json|html)$/.test(r)) {
      for (const t of TRACKERS) if (t.test(line)) fail("third-party", `${r}:${i + 1}`, line.trim().slice(0, 100));
      for (const m of line.matchAll(/https?:\/\/[^\s"'`)<>]+/g))
        if (!ALLOWED_URL.some((a) => a.test(m[0]))) fail("external-url", `${r}:${i + 1}`, m[0]);
    }
  });
}

// 6: what the admin put in the database (the admin's code and built pages are covered above)
for (const f of [".env.local", ".env"]) if (existsSync(join(ROOT, f))) process.loadEnvFile(join(ROOT, f));
let dbNote = "";
{
  const driver = (process.env.DB_DRIVER ?? "sqlite").trim().toLowerCase();
  const url = process.env.DATABASE_URL?.trim() || (driver === "sqlite" ? "file:./data/musical-on-ice.db" : "");
  const file = url.startsWith("file:") ? resolve(ROOT, url.slice(5)) : null;
  let rows = null;
  try {
    if (driver === "postgres" && url) {
      const { default: postgres } = await import("postgres");
      const pg = postgres(url, { max: 1 });
      rows = await pg`SELECT * FROM events`;
      await pg.end();
    } else if (url && (!file || existsSync(file))) {
      const { createClient } = await import("@libsql/client");
      const db = createClient({ url: file ? `file:${file}` : url, authToken: process.env.DATABASE_AUTH_TOKEN });
      rows = (await db.execute("SELECT * FROM events")).rows;
    }
  } catch (e) {
    if (!/no such table|does not exist/i.test(String(e))) fail("database", driver, `could not read the events: ${e.message}`);
    rows = [];
  }
  if (rows === null) dbNote = `no events database found (${driver}${file ? `, ${relative(ROOT, file)}` : ""}): nothing to check`;
  else {
    dbNote = `${rows.length} events in the ${driver} database`;
    for (const row of rows) {
      const where = `events:${row.id} (${row.date} ${row.city})`;
      for (const [col, value] of Object.entries(row)) {
        if (typeof value !== "string") continue;
        if (CYRILLIC.test(value)) fail("database", where, `Cyrillic in ${col}: ${value.slice(0, 80)}`);
        for (const k of KEYWORDS) if (k.test(value)) fail("database", where, `${k} in ${col}: ${value.slice(0, 80)}`);
        if (col === "tickets" && !value.startsWith("https://")) fail("database", where, `ticket link is not https: ${value.slice(0, 80)}`);
      }
      if (["RU", "MD"].includes(String(row.country).toUpperCase())) fail("database", where, `country ${row.country}`);
    }
  }
}

// 4: ASCII file names in what ships
for (const f of files) {
  const r = rel(f);
  if ((r.startsWith("public/") || r.startsWith("src/")) && /[^\x20-\x7E]/.test(r)) fail("non-ascii-filename", r, "");
}

// 3: media metadata
function imageMeta(buf, ext) {
  const found = [];
  const s = buf.toString("latin1");
  if (ext === ".jpg" || ext === ".jpeg") {
    let i = 2;
    while (i < buf.length - 4 && buf[i] === 0xff) {
      const m = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      const seg = buf.subarray(i + 4, i + 2 + len).toString("latin1");
      if (m === 0xe1) found.push(seg.startsWith("Exif") ? "EXIF" : seg.includes("xmpmeta") || seg.startsWith("http://ns.adobe.com") ? "XMP" : "APP1");
      if (m === 0xed) found.push("IPTC/APP13");
      if (m === 0xfe) found.push(`COM:${seg.slice(0, 40)}`);
      if (m === 0xda) break;
      i += 2 + len;
    }
  } else if (ext === ".png") {
    let i = 8;
    while (i < buf.length) {
      const len = buf.readUInt32BE(i);
      const type = buf.subarray(i + 4, i + 8).toString("latin1");
      if (["tEXt", "iTXt", "zTXt", "eXIf", "tIME"].includes(type)) found.push(type);
      i += 12 + len;
    }
  } else if (ext === ".webp") {
    if (s.includes("EXIF")) found.push("EXIF");
    if (s.includes("XMP ")) found.push("XMP");
  } else if (ext === ".avif") {
    if (/Exif\0\0/.test(s)) found.push("EXIF");
    if (s.includes("xmpmeta")) found.push("XMP");
  }
  return found;
}
const GENERIC_TAGS = /^(encoder|ENCODER|major_brand|minor_version|compatible_brands|handler_name|language|DURATION|vendor_id)$/;
const GENERIC_VALUE = /^(Lav[fc][\w .-]*|isom|mp42|M4A ?|iso\w*|avc1|mp41|und|VideoHandler|SoundHandler|[0-9:.]+|\[0\]\[0\]\[0\]\[0\]|)$/;
let ffprobe = true;
try {
  execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
} catch {
  ffprobe = false;
}
const media = files.filter((f) => rel(f).startsWith("public/"));
let imgCount = 0, avCount = 0;
for (const f of media) {
  const ext = extname(f).toLowerCase();
  if (MEDIA_IMG.has(ext)) {
    imgCount++;
    const m = imageMeta(readFileSync(f), ext);
    if (m.length) fail("image-metadata", rel(f), m.join(", "));
  } else if (MEDIA_AV.has(ext)) {
    avCount++;
    if (!ffprobe) { fail("av-metadata", rel(f), "ffprobe not available: not checked"); continue; }
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format_tags:stream_tags", "-of", "json", f]).toString();
    const j = JSON.parse(out);
    const tags = [j.format?.tags ?? {}, ...(j.streams ?? []).map((s) => s.tags ?? {})];
    for (const t of tags)
      for (const [k, v] of Object.entries(t)) {
        if (/^(major_brand|minor_version|compatible_brands)$/.test(k)) continue; // container brand ids
        if (!GENERIC_TAGS.test(k) || !GENERIC_VALUE.test(String(v).trim())) fail("av-metadata", rel(f), `${k}=${v}`);
      }
  }
}

// 3D models: the glTF JSON chunk (names, extras, asset block) gets the same scans
let glbCount = 0;
for (const f of media.filter((f) => extname(f).toLowerCase() === ".glb")) {
  glbCount++;
  const buf = readFileSync(f);
  const len = buf.readUInt32LE(12);
  const json = buf.subarray(20, 20 + len).toString("utf8");
  if (CYRILLIC.test(json)) fail("model-metadata", rel(f), "Cyrillic in glTF JSON");
  for (const k of KEYWORDS) if (k.source !== "\\bvision\\b" && k.test(json)) fail("model-metadata", rel(f), `${k}`);
  const asset = JSON.parse(json).asset ?? {};
  const allowedAsset = new Set(["version", "generator", "copyright", "minVersion"]);
  for (const key of Object.keys(asset)) if (!allowedAsset.has(key)) fail("model-metadata", rel(f), `asset.${key}`);
  if (/extras/.test(json) && /"extras":\{[^}]/.test(json)) fail("model-metadata", rel(f), "non-empty extras");
}

// optional contact sheets for the manual watermark / face review
if (process.argv.includes("--sheets") && ffprobe) {
  const dir = join(ROOT, ".audit");
  mkdirSync(dir, { recursive: true });
  for (const f of media.filter((f) => [".mp4"].includes(extname(f)))) {
    const name = rel(f).replace(/[/.]/g, "_") + ".jpg";
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", f, "-vf", "fps=3,scale=240:-2,tile=8x4", "-frames:v", "1", join(dir, name)]);
  }
}

// report
const byCheck = (c) => results.filter((r) => r.check === c);
const checks = [
  ["cyrillic-content", "Cyrillic in file contents"],
  ["cyrillic-filename", "Cyrillic in file names"],
  ["non-ascii-filename", "Non-ASCII file names (public/, src/)"],
  ["keyword", "Previous brand / market keywords"],
  ["image-metadata", "Image metadata (EXIF, XMP, IPTC, comments)"],
  ["av-metadata", "Video/audio metadata beyond generic codec tags"],
  ["model-metadata", "3D model metadata (names, extras, asset block)"],
  ["third-party", "Third-party fonts / analytics / trackers"],
  ["external-url", "External URLs outside the allow-list"],
  ["database", "Tour events typed in the admin (Cyrillic, keywords, https, country)"],
];
const date = new Date().toISOString().slice(0, 10);
let md = `# Brand-separation audit\n\nGenerated by \`node scripts/audit.mjs\` on ${date}. Re-run after any content change.\n\n`;
md += `Scanned: ${files.length} files (${textScanned} text files, including the production build in \`.next-build/\` when present), ${imgCount} images, ${avCount} video/audio files and ${glbCount} 3D models in \`public/\`. Admin data: ${dbNote}.\n\n`;
md += `| Check | Result |\n|---|---|\n`;
for (const [c, label] of checks) md += `| ${label} | ${byCheck(c).length ? `**FAIL** (${byCheck(c).length})` : "pass"} |\n`;
const failures = results.filter((r) => !r.ok);
if (failures.length) {
  md += `\n## Findings\n\n`;
  for (const r of failures.slice(0, 300)) md += `- \`${r.check}\` ${r.file}${r.detail ? `: ${r.detail.replace(/\|/g, "\\|")}` : ""}\n`;
}
if (allowed.length) {
  md += `\n## Allowed exceptions (framework internals, not site content)\n\n`;
  const seen = new Map();
  for (const a of allowed) seen.set(a.why, [...(seen.get(a.why) ?? []), a.file]);
  for (const [why, where] of seen) md += `- ${why}: ${where.length} line(s), e.g. \`${where[0]}\`\n`;
}
md += `
## Manual checks (not automatable; re-confirm when media changes)

- **Watermarks, titles, burned-in text:** every shipped loop was reviewed frame by frame (contact sheets: \`node scripts/audit.mjs --sheets\` writes them to \`.audit/\`). Crops remove the corner bug of the source masters; excluded segments are listed in DECISIONS.md (D5).
- **Faces:** the hero dancer is a procedural silhouette (no face exists). Footage loops are wide shots, backs, skates, costume or aerial work. Two cards were re-cropped below the shoulders after review. The OG image shows only the silhouette and the distant ensemble.
- **Audio:** speech recognition over every source soundtrack found no voice-over; the Dracula track carries an English-language song; no other language.
- **Fonts and requests:** fonts are self-hosted from \`src/fonts/\` (OFL); the site makes no third-party requests at runtime (no analytics, no CDN, no embeds).
- **Source material:** nothing from \`~/ice/materials\` is published directly; every asset is re-encoded by \`scripts/media/*.sh\` with metadata stripped and neutral names.
`;
writeFileSync(join(ROOT, "AUDIT.md"), md);
console.log(md.split("## Manual")[0]);
process.exit(failures.length ? 1 : 0);
