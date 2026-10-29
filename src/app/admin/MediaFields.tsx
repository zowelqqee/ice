"use client";

import { useRef, useState } from "react";
import type { MediaRef } from "@/lib/data";
import { uploadFor, type UploadSlot } from "./upload";
import { btnDanger, btnGhost, errorText, hint } from "./styles";

// Upload fields for the admin forms. Each keeps its value in a hidden input, so the file is only
// attached to the show / track / settings when the form is saved.

type Slot = "card" | "hero" | "extra" | "posterWide" | "posterSquare" | "posterTall";
const SLOTS: { slot: Slot; label: string; size: string; aspect: string; poster?: true }[] = [
  { slot: "card", label: "Card in the shows list", size: "portrait, cropped to 720 × 900", aspect: "aspect-[4/5]" },
  { slot: "hero", label: "Header of the show page", size: "landscape, cropped to 1280 × 720", aspect: "aspect-video" },
  { slot: "extra", label: "Extra loop on the show page", size: "landscape, cropped to 1280 × 720", aspect: "aspect-video" },
  { slot: "posterWide", label: "16:9: showcase tiles (computers, tablets)", size: "landscape, cropped to 1280 × 720", aspect: "aspect-video", poster: true },
  { slot: "posterSquare", label: "1:1: showcase list on phones", size: "square, cropped to 720 × 720", aspect: "aspect-square", poster: true },
  { slot: "posterTall", label: "9:16: beside the story on the show page", size: "portrait, cropped to 720 × 1280", aspect: "aspect-[9/16]", poster: true },
];

/** What the site shows when a slot is empty. */
function emptyNote(slot: Slot) {
  if (slot === "card") return "No picture: the site draws a light-and-ice card in the show's colour";
  if (slot === "posterTall") return "No poster on the show page";
  if (slot === "posterWide" || slot === "posterSquare") return "Not set: the showcase uses the other cut, or the card";
  return "No picture";
}

function Preview({ media, className }: { media: MediaRef; className: string }) {
  if (media.video) {
    const mp4 = (media.formats ?? ["webm", "mp4"]).includes("mp4");
    return (
      <video className={className} muted loop autoPlay playsInline poster={`${media.poster}.jpg`} src={`${media.video}.${mp4 ? "mp4" : "webm"}`} />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={className} src={`${media.poster}.jpg`} alt="" />;
}

function useUpload<T>() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (file: File, slot: UploadSlot, owner: string): Promise<T | null> => {
    setError(null);
    try {
      return await uploadFor<T>(file, slot, owner, (stage, pct) =>
        setBusy(stage === "uploading" ? `Uploading… ${pct ?? 0}%` : "Processing… (a video can take a minute)"),
      );
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

function PickButton({ accept, disabled, onFile, children }: { accept: string; disabled: boolean; onFile: (f: File) => void; children: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className={btnGhost}>
        {children}
      </button>
      <input
        ref={input}
        type="file"
        accept={accept}
        disabled={disabled}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f && !disabled) onFile(f); // nothing is sent before the confirmation
        }}
      />
    </>
  );
}

/** The confirmation the brand rules ask for before anything visual is published. */
export function Consent({ checked, onChange, text }: { checked: boolean; onChange: (v: boolean) => void; text: string }) {
  return (
    <label className="mb-4 flex items-start gap-3 rounded-md border border-[#5b4a1f] bg-[#1d180b] px-3 py-2.5 text-sm text-[#f0d99f]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#5cf2ff]" />
      <span>{text}</span>
    </label>
  );
}

const VISUAL_CONSENT =
  "I have checked what I upload: no recognisable faces of real people, no watermarks, nothing from the previous brand or its market; lettering and logos only on posters, in English.";

function SlotEditor({
  slot,
  label,
  size,
  aspect,
  poster,
  value,
  owner,
  allowed,
  onChange,
}: (typeof SLOTS)[number] & { value?: MediaRef; owner: string; allowed: boolean; onChange: (v: MediaRef | undefined) => void }) {
  const { busy, error, run } = useUpload<{ media: MediaRef }>();
  return (
    <div className="rounded-md border border-[#1c2738] p-3">
      <p className="text-sm text-[#c9d6e3]">{label}</p>
      <p className={`${hint} mb-2`}>{poster ? `Image, ${size}.` : `Image or video, ${size}. Video: first 15 seconds, without sound.`}</p>
      <div className={`relative mb-3 w-full max-w-[240px] overflow-hidden rounded bg-[#0c121b] ${aspect}`}>
        {value ? (
          <Preview media={value} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center p-2 text-center text-xs text-[#5d7088]">
            {emptyNote(slot)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PickButton
          accept={poster ? "image/*" : "image/*,video/*"}
          disabled={!allowed || !!busy}
          onFile={async (f) => {
            const r = await run(f, slot, owner);
            if (r) onChange(r.media);
          }}
        >
          {value ? "Replace" : "Upload"}
        </PickButton>
        {value && (
          <button type="button" disabled={!!busy} onClick={() => onChange(undefined)} className={btnDanger}>
            Remove
          </button>
        )}
        {busy && <span className="text-sm text-[#8fa3b8]">{busy}</span>}
      </div>
      {error && <p className={errorText}>{error}</p>}
    </div>
  );
}

/** The pictures of a show (card, header, extra loop, and the poster in three cuts), saved with
 *  the show as one JSON field ("media"). */
export function ShowMediaField({ initial, owner, error }: { initial: Partial<Record<Slot, MediaRef>>; owner: string; error?: string }) {
  const [media, setMedia] = useState(initial);
  const [allowed, setAllowed] = useState(false);
  const editors = (poster: boolean) =>
    SLOTS.filter((s) => !!s.poster === poster).map((s) => (
      <SlotEditor
        key={s.slot}
        {...s}
        value={media[s.slot]}
        owner={owner}
        allowed={allowed}
        onChange={(v) => setMedia((m) => {
          const next = { ...m };
          if (v) next[s.slot] = v;
          else delete next[s.slot];
          return next;
        })}
      />
    ));
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm text-[#c9d6e3]">Pictures and video</legend>
      <Consent checked={allowed} onChange={setAllowed} text={VISUAL_CONSENT} />
      <input type="hidden" name="media" value={JSON.stringify(media)} />
      <div className="grid gap-3 md:grid-cols-3">{editors(false)}</div>
      <p className="pt-3 text-sm text-[#c9d6e3]">Poster</p>
      <p className={hint}>The same poster in three cuts. Each is cropped to fill, so upload each cut at its own shape.</p>
      <div className="grid gap-3 md:grid-cols-3">{editors(true)}</div>
      <p className={hint}>New files replace the old ones when you save; removed files are deleted then.</p>
      {error && <p className={errorText}>{error}</p>}
    </fieldset>
  );
}

/** The share picture for link previews (Settings). */
export function ShareImageField({ initial, error }: { initial: string | null; error?: string }) {
  const [poster, setPoster] = useState(initial);
  const [allowed, setAllowed] = useState(false);
  const { busy, error: uploadError, run } = useUpload<{ media: MediaRef }>();
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-[#c9d6e3]">Share picture</legend>
      <p className={`${hint} mb-3`}>Shown when a link to the site is posted in a messenger or social network. Image, cropped to 1200 × 630.</p>
      <Consent checked={allowed} onChange={setAllowed} text={VISUAL_CONSENT} />
      <input type="hidden" name="ogImage" value={JSON.stringify(poster ? { poster } : null)} />
      <div className="relative mb-3 aspect-[1200/630] w-full max-w-[360px] overflow-hidden rounded bg-[#0c121b]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="absolute inset-0 h-full w-full object-cover" src={poster ? `${poster}.jpg` : "/og.jpg"} alt="" />
        {!poster && <span className="absolute bottom-1 right-2 text-xs text-[#c9d6e3]">default</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PickButton
          accept="image/*"
          disabled={!allowed || !!busy}
          onFile={async (f) => {
            const r = await run(f, "og", "site");
            if (r) setPoster(r.media.poster);
          }}
        >
          {poster ? "Replace" : "Upload"}
        </PickButton>
        {poster && (
          <button type="button" onClick={() => setPoster(null)} className={btnDanger}>
            Use the default
          </button>
        )}
        {busy && <span className="text-sm text-[#8fa3b8]">{busy}</span>}
      </div>
      {(uploadError || error) && <p className={errorText}>{uploadError || error}</p>}
    </fieldset>
  );
}

/** The recording of a music track: hidden src + duration, filled by the upload. */
export function AudioField({
  initialSrc,
  initialDuration,
  owner,
  ownerInput,
  error,
}: {
  initialSrc: string;
  initialDuration: string;
  owner: string;
  ownerInput?: string; // id of the form field whose value names the files (the track id being typed)
  error?: string;
}) {
  const [src, setSrc] = useState(initialSrc);
  const [duration, setDuration] = useState(initialDuration);
  const [allowed, setAllowed] = useState(false);
  const { busy, error: uploadError, run } = useUpload<{ src: string; duration: number }>();
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-[#c9d6e3]">Recording</legend>
      <p className={`${hint} mb-3`}>MP3, WAV, M4A, FLAC… The site makes two versions (AAC and Opus) at a steady loudness.</p>
      <Consent checked={allowed} onChange={setAllowed} text="We have the rights to publish this recording on the website, and it has no speech in another language." />
      <input type="hidden" name="src" value={src} />
      <input type="hidden" name="duration" value={duration} />
      {src && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <audio controls preload="none" src={`${src}.m4a`} className="h-10 max-w-full" />
          {Number(duration) > 0 && <span className="text-sm text-[#8fa3b8]">{mmss(Number(duration))}</span>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <PickButton
          accept="audio/*,.m4a,.flac,.aiff"
          disabled={!allowed || !!busy}
          onFile={async (f) => {
            const typed = ownerInput ? (document.getElementById(ownerInput) as HTMLInputElement | null)?.value.trim().toLowerCase() : "";
            const r = await run(f, "audio", typed && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(typed) ? typed : owner);
            if (r) {
              setSrc(r.src);
              setDuration(String(r.duration));
            }
          }}
        >
          {src ? "Replace the recording" : "Upload the recording"}
        </PickButton>
        {busy && <span className="text-sm text-[#8fa3b8]">{busy}</span>}
      </div>
      {(uploadError || error) && <p className={errorText}>{uploadError || error}</p>}
    </fieldset>
  );
}
