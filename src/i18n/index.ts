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

function merge<T extends object>(base: T, over: DeepPartial<T>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = v && typeof v === "object" && b && typeof b === "object" ? merge(b as object, v as object) : v;
  }
  return out as T;
}

export function getDictionary(locale: Locale = defaultLocale): Dictionary {
  return merge(en, overrides[locale] ?? {});
}

export type { Dictionary };
