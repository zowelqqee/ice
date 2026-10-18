import { randomUUID } from "node:crypto";
import { currentAdmin, sameOrigin } from "@/lib/auth";
import { kindOf, LIMITS, MAX_VIDEO_SECONDS } from "@/lib/media";
import { putIncomingStream, storageMode } from "@/lib/storage";

// Upload, step 1. GET: how this server takes uploads. POST (storage "local" only): the raw file in
// the request body, written to incoming/. With Vercel Blob the browser sends the file straight to
// the store instead (route ../blob), because Vercel limits request bodies to 4.5 MB.

export const runtime = "nodejs";

const EXT: Record<string, string> = { image: "img", video: "vid", audio: "aud" };

export async function GET() {
  if (!(await currentAdmin())) return Response.json({ error: "Sign in again." }, { status: 401 });
  return Response.json({ mode: storageMode(), limits: LIMITS, maxVideoSeconds: MAX_VIDEO_SECONDS });
}

export async function POST(req: Request) {
  if (!sameOrigin(req) || !(await currentAdmin())) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (storageMode() !== "local") return Response.json({ error: "This server takes uploads through Vercel Blob." }, { status: 400 });
  const type = (req.headers.get("x-file-type") ?? "").toLowerCase();
  const kind = kindOf(type);
  if (!kind || !req.body) return Response.json({ error: "Choose an image, video or audio file." }, { status: 400 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > LIMITS[kind]) return Response.json({ error: "The file is too large." }, { status: 413 });
  const key = `incoming/${randomUUID()}.${EXT[kind]}`;
  try {
    await putIncomingStream(key, req.body, LIMITS[kind]);
  } catch (e) {
    const tooLarge = (e as Error).message === "TOO_LARGE";
    return Response.json({ error: tooLarge ? "The file is too large." : "The upload did not finish." }, { status: tooLarge ? 413 : 400 });
  }
  return Response.json({ incoming: key, kind });
}
