"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "../content-actions";
import { CheckField, FormErrors, SelectField, TextField } from "../fields";
import { AudioField } from "../MediaFields";
import { btnGhost, btnPrimary } from "../styles";

export interface TrackFormValues {
  id: string;
  title: string;
  note: string;
  show: string;
  published: boolean;
  src: string;
  duration: string;
}

export function TrackForm({
  action,
  initial,
  creating,
  shows,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  initial: TrackFormValues;
  creating: boolean;
  shows: { value: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.errors ?? {};
  const typed = state?.values;
  const v = (k: Exclude<keyof TrackFormValues, "published">) => typed?.[k] ?? initial[k];
  return (
    <form key={state?.at ?? 0} action={formAction} className="max-w-2xl space-y-5">
      <FormErrors errors={e} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField name="title" label="Title" required maxLength={80} defaultValue={v("title")} error={e.title} />
        <TextField
          name="id"
          label="Id"
          defaultValue={v("id")}
          readOnly={!creating}
          maxLength={40}
          placeholder="snow-queen-theme"
          error={e.id}
          hint={creating ? "Lowercase Latin letters, digits, dashes. Cannot be changed later." : "Fixed once the track exists."}
        />
      </div>
      <TextField name="note" label="Note" maxLength={140} defaultValue={v("note")} placeholder="Orchestral, ballroom" error={e.note} hint="A few words under the title in the player." />
      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField name="show" label="Show" defaultValue={v("show")} error={e.show} options={[{ value: "", label: "No show" }, ...shows]} />
        <div className="sm:pt-7">
          <CheckField name="published" label="In the player on the site" defaultChecked={typed ? typed.published === "on" : initial.published} />
        </div>
      </div>
      <AudioField initialSrc={v("src")} initialDuration={v("duration")} owner={v("id") || "new"} ownerInput="id" error={e.src} />
      <div className="flex flex-wrap gap-3 pt-2">
        <button type="submit" disabled={pending} className={btnPrimary}>
          {pending ? "Saving…" : creating ? "Add track" : "Save changes"}
        </button>
        <Link href="/admin/music" className={btnGhost}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
