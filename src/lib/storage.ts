import "server-only";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// Where uploaded media lives. Every stored file has a key under "u/" and is served at "/u/<…>" on
// the site's own domain, whatever the backend:
//   local  a folder on this server's disk (UPLOADS_DIR, default ./data/uploads), served by
//          src/app/u/[...path]/route.ts. For a VPS or Docker with a volume.
//   blob   Vercel Blob (a *public* store; BLOB_READ_WRITE_TOKEN is added when the store is
//          connected to the project). next.config.ts proxies /u/* to the store.
//   none   Vercel without a Blob store: uploads are switched off (the admin says how to fix it).
// Uploads arrive first under "incoming/" (raw, as sent), are processed into the site's formats by
// src/lib/media.ts, and the raw file is deleted.

export type StorageMode = "local" | "blob" | "none";

export function storageMode(): StorageMode {
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim()) return "blob";
  if (process.env.VERCEL) return "none";
  return "local";
}

export const uploadsDir = () => resolve(process.env.UPLOADS_DIR?.trim() || "./data/uploads");

/** The public origin of the Blob store, from the token (same rule as the @vercel/blob SDK). */
export function blobOrigin(token = process.env.BLOB_READ_WRITE_TOKEN?.trim() ?? "") {
  const storeId = token.split("_")[3];
  return storeId ? `https://${storeId}.public.blob.vercel-storage.com` : null;
}

const KEY = /^(u|incoming)\/[A-Za-z0-9][A-Za-z0-9/_.-]{0,200}$/;
export const isKey = (key: string) => KEY.test(key) && !key.includes("..") && !key.includes("//");

/** A key as a path on disk, refusing anything that would leave the uploads folder. */
export function localPath(key: string) {
  if (!isKey(key)) throw new Error("Bad storage key.");
  const root = uploadsDir();
  const p = resolve(root, key);
  if (!p.startsWith(root + sep)) throw new Error("Bad storage key.");
  return p;
}

export async function putFile(key: string, data: Buffer, contentType: string) {
  if (!isKey(key)) throw new Error("Bad storage key.");
  const mode = storageMode();
  if (mode === "local") {
    const p = localPath(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data);
  } else if (mode === "blob") {
    const { put } = await import("@vercel/blob");
    await put(key, data, { access: "public", addRandomSuffix: false, contentType, cacheControlMaxAge: 31536000 });
  } else throw new Error("Uploads are not set up on this server.");
}

/** Write an incoming upload straight from a request body (local mode only). */
export async function putIncomingStream(key: string, body: ReadableStream<Uint8Array>, maxBytes: number) {
  const p = localPath(key);
  await mkdir(dirname(p), { recursive: true });
  let size = 0;
  const limited = Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>).on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > maxBytes) limited.destroy(new Error("TOO_LARGE"));
  });
  try {
    await pipeline(limited, createWriteStream(p));
  } catch (e) {
    await rm(p, { force: true });
    throw e;
  }
  return size;
}

/** Copy an incoming upload to a local file for processing; returns its path. */
export async function fetchIncoming(key: string, into: string): Promise<string> {
  if (!key.startsWith("incoming/") || !isKey(key)) throw new Error("Bad upload reference.");
  const mode = storageMode();
  if (mode === "local") return localPath(key);
  if (mode === "blob") {
    const { head } = await import("@vercel/blob");
    const { url } = await head(key);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Could not read the upload (${res.status}).`);
    const out = join(into, "input");
    await pipeline(Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>), createWriteStream(out));
    return out;
  }
  throw new Error("Uploads are not set up on this server.");
}

export async function deleteFiles(keys: string[]) {
  const valid = keys.filter(isKey);
  if (!valid.length) return;
  const mode = storageMode();
  if (mode === "local") await Promise.all(valid.map((k) => rm(localPath(k), { force: true })));
  else if (mode === "blob") {
    const { del } = await import("@vercel/blob");
    const origin = blobOrigin();
    if (origin) await del(valid.map((k) => `${origin}/${k}`)).catch((e) => console.error("[storage] delete failed", e));
  }
}

/** For the local file route: the bytes of a stored file, or null. */
export async function readLocal(key: string) {
  try {
    const p = localPath(key);
    const s = await stat(p);
    if (!s.isFile()) return null;
    return { path: p, size: s.size, read: () => readFile(p) };
  } catch {
    return null;
  }
}
