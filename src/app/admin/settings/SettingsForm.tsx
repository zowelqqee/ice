"use client";

import { useActionState } from "react";
import type { FormState } from "../content-actions";
import { FormErrors, TextField } from "../fields";
import { ShareImageField } from "../MediaFields";
import { btnPrimary } from "../styles";

export interface SettingsValues {
  booking: string;
  press: string;
  youtube: string;
  instagram: string;
  ogImage: string | null;
}

export function SettingsForm({ action, initial }: { action: (s: FormState, f: FormData) => Promise<FormState>; initial: SettingsValues }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const e = state?.errors ?? {};
  const typed = state?.values;
  const v = (k: Exclude<keyof SettingsValues, "ogImage">) => typed?.[k] ?? initial[k];
  const og = typed?.ogImage ? (JSON.parse(typed.ogImage) as { poster: string } | null)?.poster ?? null : initial.ogImage;
  return (
    <form key={state?.at ?? 0} action={formAction} className="max-w-2xl space-y-8">
      <FormErrors errors={e} />
      <fieldset className="space-y-5">
        <legend className="mb-3 font-medium">Contacts in the footer</legend>
        <TextField name="booking" label="Booking and promoters (email)" type="email" inputMode="email" defaultValue={v("booking")} error={e.booking} hint="Leave empty to hide it." />
        <TextField name="press" label="Press (email)" type="email" inputMode="email" defaultValue={v("press")} error={e.press} hint="Leave empty to hide it." />
      </fieldset>
      <fieldset className="space-y-5">
        <legend className="mb-3 font-medium">Social networks</legend>
        <TextField name="youtube" label="YouTube page" type="url" inputMode="url" placeholder="https://www.youtube.com/@MUSICALONICE-f3b" defaultValue={v("youtube")} error={e.youtube} />
        <TextField name="instagram" label="Instagram page" type="url" inputMode="url" placeholder="https://instagram.com/musicalonice" defaultValue={v("instagram")} error={e.instagram} />
      </fieldset>
      <ShareImageField initial={og} error={e.ogImage} />
      <button type="submit" disabled={pending} className={btnPrimary}>
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
