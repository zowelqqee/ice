import en, { type Dictionary } from "./en";

export const locales = ["en", "de", "fr", "es", "it"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

// Translations are added here as they arrive; untranslated keys fall back to English.
const overrides: Record<Locale, DeepPartial<Dictionary>> = {
  en: {},
  de: {},
  fr: {},
  es: {},
  it: {},
};

/** Deep merge: keys of `over` replace those of `base`; keys unknown to `base` are ignored (texts
 *  saved in the admin for a key that en.ts no longer has). Only strings replace strings. */
export function mergeDictionary<T extends object>(base: T, over: DeepPartial<T> | Record<string, unknown>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k];
    if (b === undefined) continue;
    if (v && typeof v === "object" && b && typeof b === "object") out[k] = mergeDictionary(b as object, v as object);
    else if (typeof v === "string" && typeof b === "string") out[k] = v;
  }
  return out as T;
}

/** The texts in the files (en.ts plus the translations here). The site uses getDict() from
 *  src/lib/content.ts, which adds the texts changed in the admin. */
export function getDictionary(locale: Locale = defaultLocale): Dictionary {
  return mergeDictionary(en, overrides[locale] ?? {});
}

export type { Dictionary };
