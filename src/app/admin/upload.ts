// Browser side of an upload: send the file (to this server, or straight to Vercel Blob), then ask
// the server to process it. Used by the admin's media fields only.

export type UploadSlot = "card" | "hero" | "extra" | "og" | "audio";
type Kind = "image" | "video" | "audio";
interface Config {
  mode: "local" | "blob" | "none";
  limits: Record<Kind, number>;
  maxVideoSeconds: number;
}

const BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", heic: "image/heic", heif: "image/heif", tif: "image/tiff", tiff: "image/tiff", gif: "image/gif",
  mp4: "video/mp4", m4v: "video/x-m4v", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo", mpg: "video/mpeg", mpeg: "video/mpeg",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", oga: "audio/ogg", aif: "audio/aiff", aiff: "audio/aiff",
};

export function fileType(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  // an audio .webm is reported as video/webm by some browsers; the slot decides
  return file.type || BY_EXT[ext] || "";
}

const kindOf = (type: string): Kind | null =>
  type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : null;

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body;
}

function sendLocal(file: File, type: string, onProgress: (pct: number) => void) {
  return new Promise<{ incoming: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/admin/api/upload");
    xhr.setRequestHeader("x-file-type", type);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: { incoming?: string; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.incoming) resolve({ incoming: body.incoming });
      else reject(new Error(body.error || `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("The connection dropped during the upload."));
    xhr.send(file);
  });
}

/** Upload one file for a slot and return what the server made of it. */
export async function uploadFor<T>(
  file: File,
  slot: UploadSlot,
  owner: string,
  onStage: (stage: "uploading" | "processing", pct?: number) => void,
): Promise<T> {
  let type = fileType(file);
  if (slot === "audio" && type === "video/webm") type = "audio/webm";
  const kind = kindOf(type);
  if (!kind) throw new Error("This file type is not supported.");
  if (slot === "audio" ? kind !== "audio" : kind === "audio") throw new Error(slot === "audio" ? "Choose an audio file." : "Choose an image or a video.");
  if (slot === "og" && kind !== "image") throw new Error("Use an image for the share picture.");

  const cfg = await json<Config>(await fetch("/admin/api/upload", { cache: "no-store" }));
  if (cfg.mode === "none")
    throw new Error("Uploads are not set up on this server: connect a Vercel Blob store (see README, “Media uploads”) and redeploy.");
  if (file.size > cfg.limits[kind]) throw new Error(`The file is too large (max ${mb(cfg.limits[kind])}).`);

  onStage("uploading", 0);
  let incoming: string;
  if (cfg.mode === "local") ({ incoming } = await sendLocal(file, type, (p) => onStage("uploading", p)));
  else {
    const { upload } = await import("@vercel/blob/client");
    const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "upload";
    const res = await upload(`incoming/${safe}`, file, {
      access: "public",
      handleUploadUrl: "/admin/api/blob",
      clientPayload: kind,
      contentType: type,
      multipart: file.size > 50 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onStage("uploading", Math.round(percentage)),
    });
    incoming = res.pathname;
  }

  onStage("processing");
  return json<T>(
    await fetch("/admin/api/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ incoming, kind, slot, owner }),
    }),
  );
}
