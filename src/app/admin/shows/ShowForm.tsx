"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { MediaRef } from "@/lib/data";
import type { FormState } from "../content-actions";
import { CheckField, FormErrors, SelectField, TextArea, TextField } from "../fields";
import { ShowMediaField } from "../MediaFields";
import { btnGhost, btnPrimary, errorText, field, fieldError, hint, label } from "../styles";

export interface ShowFormValues {
  slug: string;
  title: string;
  subtitle: string;
  logline: string;
  synopsis: string; // paragraphs separated by a blank line
  highlights: string; // one per line
  duration: string;
  age: string;
  status: string;
  accent: string;
  track: string;
  published: boolean;
  media: Partial<Record<"card" | "hero" | "extra", MediaRef>>;
}

const slugify = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export function ShowForm({
  action,
  initial,
  creating,
  tracks,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial: ShowFormValues;
  creating: boolean;
  tracks: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.errors ?? {};
  const typed = state?.values;
  const v = (k: Exclude<keyof ShowFormValues, "published" | "media">) => typed?.[k] ?? initial[k];
  const media = typed?.media ? (JSON.parse(typed.media) as ShowFormValues["media"]) : initial.media;
  const [slug, setSlug] = useState(v("slug"));
  const [slugTouched, setSlugTouched] = useState(!creating || Boolean(typed?.slug));

  return (
    <form key={state?.at ?? 0} action={formAction} className="max-w-3xl space-y-5">
      <FormErrors errors={e} />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="title" className={label}>
            Title
          </label>
          <input
            id="title"
            name="title"
            required
            maxLength={80}
            defaultValue={v("title")}
            onChange={(ev) => !slugTouched && setSlug(slugify(ev.target.value))}
            className={`${field} ${e.title ? fieldError : ""}`}
          />
          {e.title && <p className={errorText}>{e.title}</p>}
        </div>
        <TextField name="subtitle" label="Subtitle" defaultValue={v("subtitle")} maxLength={120} error={e.subtitle} />
      </div>

      <div>
        <label htmlFor="slug" className={label}>
          Page address
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#8fa3b8]">/shows/</span>
          <input
            id="slug"
            name="slug"
            value={slug}
            readOnly={!creating}
            onChange={(ev) => {
              setSlugTouched(true);
              setSlug(ev.target.value.toLowerCase());
            }}
            className={`${field} ${e.slug ? fieldError : ""} ${creating ? "" : "opacity-60"}`}
          />
        </div>
        {e.slug ? <p className={errorText}>{e.slug}</p> : <p className={hint}>{creating ? "Made from the title; it cannot be changed later." : "Fixed once the show exists (links point to it)."}</p>}
      </div>

      <TextArea name="logline" label="One-line pitch" rows={2} defaultValue={v("logline")} maxLength={240} error={e.logline} hint="Shown on the card in the shows list." />
      <TextArea name="synopsis" label="Story" rows={7} defaultValue={v("synopsis")} error={e.synopsis} hint="Leave an empty line between paragraphs." />
      <TextArea name="highlights" label="On the ice" rows={4} defaultValue={v("highlights")} error={e.highlights} hint="One highlight per line, e.g. “Aerial silks over the ice”." />

      <div className="grid gap-5 sm:grid-cols-3">
        <TextField name="duration" label="Duration" defaultValue={v("duration")} placeholder="1 h 30 min" error={e.duration} />
        <TextField name="age" label="Age" defaultValue={v("age")} placeholder="6+" error={e.age} />
        <SelectField
          name="status"
          label="Status"
          defaultValue={v("status")}
          error={e.status}
          options={[
            { value: "touring", label: "Now touring" },
            { value: "coming", label: "Coming soon" },
            { value: "tba", label: "To be announced" },
          ]}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <label htmlFor="accent" className={label}>
            Colour
          </label>
          <input id="accent" name="accent" type="color" defaultValue={v("accent")} className="h-11 w-full cursor-pointer rounded-md border border-[#2a3a52] bg-[#0c121b] p-1" />
          {e.accent ? <p className={errorText}>{e.accent}</p> : <p className={hint}>The show&apos;s single accent colour.</p>}
        </div>
        <SelectField name="track" label="Music (Listen button)" defaultValue={v("track")} error={e.track} options={[{ value: "", label: "None" }, ...tracks]} />
        <div className="sm:pt-7">
          <CheckField name="published" label="Shown on the site" sub="Untick to hide the show and its page" defaultChecked={typed ? typed.published === "on" : initial.published} />
        </div>
      </div>

      <ShowMediaField initial={media} owner={slug || "new"} error={e.media} />

      <div className="flex flex-wrap gap-3 pt-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : creating ? "Add show" : "Save changes"}
        </button>
        <Link href="/admin/shows" className={btnGhost}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
