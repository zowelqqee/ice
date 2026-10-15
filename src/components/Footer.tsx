import Image from "next/image";
import { site } from "@/lib/site";
import { locales } from "@/i18n";
import type { Dictionary } from "@/i18n";

export function Footer({ t }: { t: Dictionary["footer"] }) {
  const year = new Date().getFullYear();
  return (
    <footer className="relative overflow-hidden border-t border-deep px-[var(--gutter)] pb-10 pt-24 md:pt-36" aria-labelledby="footer-title">
      {/* a single blade trace across the footer */}
      <svg aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 w-full opacity-60" viewBox="0 0 1000 160" preserveAspectRatio="none">
        <path d="M-10 120 C 260 40, 540 150, 1010 30" fill="none" stroke="url(#ft)" strokeWidth="1" />
        <defs>
          <linearGradient id="ft" x1="0" x2="1">
            <stop offset="0" stopColor="#5cf2ff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#5cf2ff" stopOpacity="0.9" />
            <stop offset="1" stopColor="#eaf6ff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <h2 id="footer-title" className="display max-w-[14ch] text-[15vw] leading-[0.86] md:text-[9.5vw]">
        {t.title} <em className="text-accent">{t.titleItalic}</em>
      </h2>

      <div className="mt-16 grid gap-12 md:mt-24 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="eyebrow mb-3">{t.booking}</p>
          <a href={`mailto:${site.contact.booking}`} className="display break-all text-[8vw] italic leading-none text-ice hover:text-accent md:break-normal md:text-[3.4vw]">
            {site.contact.booking}
          </a>
        </div>
        <div className="md:col-span-4">
          <p className="eyebrow mb-3">{t.press}</p>
          <a href={`mailto:${site.contact.press}`} className="display break-all text-[8vw] italic leading-none text-ice hover:text-accent md:break-normal md:text-[2.4vw]">
            {site.contact.press}
          </a>
        </div>
        <div className="md:col-span-3">
          <p className="eyebrow mb-3">{t.follow}</p>
          <ul className="space-y-2">
            <li>
              <a href={site.social.youtube} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-3 text-[17px] text-ice hover:text-accent">
                YouTube <span aria-hidden className="transition-transform group-hover:translate-x-1">↗</span>
              </a>
            </li>
            <li>
              <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" className="group inline-flex items-center gap-3 text-[17px] text-ice hover:text-accent">
                Instagram <span aria-hidden className="transition-transform group-hover:translate-x-1">↗</span>
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-20 flex flex-col gap-8 border-t border-deep pt-8 md:flex-row md:items-end md:justify-between">
        <div className="flex items-center gap-6">
          <Image src="/brand/logo-white.webp" alt="Musical on Ice" width={1323} height={1005} className="h-auto w-[84px] opacity-80" />
          <p className="max-w-[30ch] text-[13px] text-frost">{t.privacy}</p>
        </div>
        <nav aria-label={t.language} className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.2em]">
          {locales.map((l) =>
            l === "en" ? (
              <span key={l} aria-current="true" className="text-ice">
                {l}
              </span>
            ) : (
              <span key={l} className="text-mist" title={`${l.toUpperCase()}: ${t.soon}`} aria-disabled="true">
                {l}
              </span>
            ),
          )}
        </nav>
        <div className="flex flex-col gap-1 md:items-end">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-mist">
            © {year} Musical on Ice. {t.rights}
          </p>
          {/* required by the model's CC BY 4.0 licence */}
          <p className="text-[11px] text-mist">
            3D dancer:{" "}
            <a href="https://sketchfab.com/3d-models/ballerina-0a219f9c7dad439ca804d925e66dedbb" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-ice hover:underline">
              &ldquo;Ballerina&rdquo; by LollyPoly
            </a>
            ,{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-ice hover:underline">
              CC BY 4.0
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
