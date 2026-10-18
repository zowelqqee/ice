import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { currentAdmin, sameOrigin } from "@/lib/auth";
import { LIMITS, type MediaKind } from "@/lib/media";
import { storageMode } from "@/lib/storage";

// Upload, step 1 with Vercel Blob: gives the signed-in admin's browser a short-lived token to send
// one file straight to the store, under incoming/, of an allowed type and size.

export const runtime = "nodejs";

const TYPES: Record<MediaKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif", "image/tiff", "image/gif"],
  video: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo", "video/mpeg", "video/3gpp", "video/x-m4v"],
  audio: ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/wav", "audio/x-wav", "audio/wave", "audio/flac", "audio/x-flac", "audio/ogg", "audio/webm", "audio/aiff", "audio/x-aiff"],
};

export async function POST(req: Request) {
  if (!sameOrigin(req) || !(await currentAdmin())) return Response.json({ error: "Sign in again." }, { status: 401 });
  if (storageMode() !== "blob") return Response.json({ error: "Vercel Blob is not connected." }, { status: 400 });
  try {
    const body = (await req.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const kind = clientPayload as MediaKind;
        if (!pathname.startsWith("incoming/") || !(kind in TYPES)) throw new Error("Bad upload.");
        return {
          allowedContentTypes: TYPES[kind],
          maximumSizeInBytes: LIMITS[kind],
          addRandomSuffix: true,
          validUntil: Date.now() + 30 * 60 * 1000,
        };
      },
    });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
