import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { readLocal, storageMode } from "@/lib/storage";

// Uploaded media on this server's disk (storage "local"). With Vercel Blob, next.config.ts sends
// /u/* to the store before this route is reached. File names carry a random part and never change,
// so they are cached for a year. Byte ranges are served for audio and video (Safari needs them).

const TYPES: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpg: "image/jpeg",
  mp4: "video/mp4",
  m4a: "audio/mp4",
  webm: "audio/webm",
};

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (storageMode() !== "local") return new Response("Not found", { status: 404 });
  const { path } = await params;
  const key = `u/${path.join("/")}`;
  const ext = key.split(".").pop() ?? "";
  const type = TYPES[ext];
  const file = type ? await readLocal(key) : null;
  if (!file) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : file.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : file.size - 1;
    start = Math.max(0, start);
    end = Math.min(end, file.size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    const body = Readable.toWeb(createReadStream(file.path, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${file.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(createReadStream(file.path)) as ReadableStream;
  return new Response(body, { headers: { ...headers, "Content-Length": String(file.size) } });
}
