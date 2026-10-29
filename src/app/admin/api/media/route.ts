import { currentAdmin, sameOrigin } from "@/lib/auth";
import { imageOnly, isSlot, processAudio, processVisual, type MediaKind } from "@/lib/media";
import { deleteFiles, isKey, storageMode } from "@/lib/storage";
import { isSlug } from "@/lib/content";

// Upload, step 2: turn the file in incoming/ into the site's formats (src/lib/media.ts) and return
// the reference the admin form saves. Video can take a while, hence the long time limit.

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!sameOrigin(req) || !(await currentAdmin())) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (storageMode() === "none") return Response.json({ error: "Uploads are not set up on this server." }, { status: 400 });
  const body = (await req.json().catch(() => null)) as { incoming?: string; kind?: MediaKind; slot?: string; owner?: string } | null;
  const incoming = body?.incoming ?? "";
  const kind = body?.kind;
  const owner = body?.owner || "new";
  if (!incoming.startsWith("incoming/") || !isKey(incoming) || !kind || !["image", "video", "audio"].includes(kind) || !isSlug(owner))
    return Response.json({ error: "Bad request." }, { status: 400 });
  const refuse = async (error: string) => {
    await deleteFiles([incoming]);
    return Response.json({ error }, { status: 400 });
  };
  try {
    if (body?.slot === "audio") {
      if (kind !== "audio") return refuse("Choose an audio file (MP3, WAV, M4A, FLAC…).");
      return Response.json(await processAudio(incoming, owner));
    }
    if (!isSlot(body?.slot)) return refuse("Bad request.");
    if (kind === "audio") return refuse("Choose an image or a video.");
    if (imageOnly(body.slot) && kind !== "image") return refuse(body.slot === "og" ? "Use an image for the share picture." : "Use an image for the poster.");
    const folder = body.slot === "og" ? "site" : `shows/${owner}`;
    return Response.json({ media: await processVisual(incoming, kind, body.slot, folder) });
  } catch (e) {
    console.error("[media]", e);
    return Response.json({ error: (e as Error).message || "The file could not be processed." }, { status: 400 });
  }
}
