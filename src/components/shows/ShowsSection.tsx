import type { Posters, Show } from "@/lib/data";
import { ShowVisual } from "./ShowVisual";
import { BladeLink } from "../shell/Transition";
import type { Dictionary } from "@/i18n";

const pad = (n: number) => String(n).padStart(2, "0");

function statusLabel(s: Show, t: Dictionary["shows"]) {
  return s.status === "touring" ? t.touring : s.status === "coming" ? t.coming : t.tba;
}

/** The poster: the square cut in the phone list, the wide cut from tablets up (one image, the
 *  browser picks the file). The title is in the caption, so the picture itself has no alt text. */
function PosterImage({ posters, className }: { posters: Posters; className: string }) {
  const wide = "(min-width: 768px)";
  return (
    <picture>
      <source media={wide} srcSet={`${posters.wide}.avif`} type="image/avif" />
      <source media={wide} srcSet={`${posters.wide}.webp`} type="image/webp" />
      <source media={wide} srcSet={`${posters.wide}.jpg`} />
      <source srcSet={`${posters.square}.avif`} type="image/avif" />
      <source srcSet={`${posters.square}.webp`} type="image/webp" />
      <img src={`${posters.square}.jpg`} alt="" width={480} height={480} loading="lazy" decoding="async" className={className} />
    </picture>
  );
}

/** One show in the showcase: on phones a row (square poster, then the caption), from tablets up a
 *  tile (wide poster, the caption under it). A show without a poster gets its light-and-ice
 *  composition in the same place. The whole card opens the show. */
function Card({ show, i, t }: { show: Show; i: number; t: Dictionary["shows"] }) {
  const released = show.status === "touring";
  const zoom = "transition-transform duration-[1200ms] ease-[var(--ease-glide)] group-hover:scale-[1.04]";
  return (
    <article
      className="group relative flex items-center gap-4 md:flex-col md:items-stretch md:gap-0"
      style={{ "--a": show.accent } as React.CSSProperties}
      aria-labelledby={`show-${show.slug}`}
    >
      <BladeLink href={`/shows/${show.slug}`} accent={show.accent} className="absolute inset-0 z-10" aria-label={`${show.title} ${show.subtitle}: ${t.open}`}>
        <span className="sr-only">{t.open}</span>
      </BladeLink>

      <div className="relative aspect-square w-[30%] max-w-32 shrink-0 overflow-hidden bg-abyss md:aspect-video md:w-full md:max-w-none">
        {show.posters ? (
          <PosterImage posters={show.posters} className={`absolute inset-0 h-full w-full object-cover ${zoom}`} />
        ) : (
          <ShowVisual show={show} className={`h-full w-full ${zoom}`} />
        )}
        {/* accent edge light */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-[var(--a)] opacity-70 shadow-[0_0_18px_2px_var(--a)]" />
      </div>

      <div className="pointer-events-none relative min-w-0 flex-1 md:pt-4 lg:pt-3">
        <p className="mb-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-frost">
          <span className="text-ice">{pad(i + 1)}</span>
          <span aria-hidden className="h-px w-6 bg-[var(--a)] transition-[width] duration-500 group-hover:w-10" />
          <span style={{ color: released ? show.accent : undefined }}>{statusLabel(show, t)}</span>
        </p>
        <h3 id={`show-${show.slug}`} className="display text-[30px] md:text-[clamp(24px,2vw,36px)]">
          {show.title}
        </h3>
        <p className="display mt-1 text-[17px] text-frost md:text-[clamp(15px,1.15vw,20px)]">{show.subtitle}</p>
        <p className="mt-3 inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ice md:hidden">
          {t.open}
          <span aria-hidden className="inline-block h-px w-8 bg-ice" />
        </p>
      </div>
    </article>
  );
}

/** Tiles to a row on a wide screen, for any number of shows: four or three, whichever leaves fewer
 *  empty places (eight: two rows of four, six: two rows of three). A short last row is centred. */
function columns(n: number) {
  const empty = (c: number) => (c - (n % c)) % c;
  return n <= 4 ? Math.max(n, 1) : empty(3) < empty(4) ? 3 : 4;
}

/** The repertoire as a showcase right after the hero: every show in view at once. Phones get a
 *  list to swipe down through, tablets two columns, wider screens rows of three or four that fit
 *  one screen together (up to eight shows). */
export function ShowsSection({ t, shows }: { t: Dictionary["shows"]; shows: Show[] }) {
  return (
    <section
      id="shows"
      aria-labelledby="shows-title"
      className="relative flex flex-col px-[var(--gutter)] pb-20 pt-24 md:pt-28 lg:min-h-svh lg:justify-center lg:pb-[var(--gutter)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(50% 50% at 50% 65%, color-mix(in oklab, #5cf2ff 9%, transparent), transparent 70%)" }}
      />

      <header className="relative mb-7 flex flex-col gap-5 md:mb-10 lg:mb-6 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
        <div>
          <p className="eyebrow mb-4">{t.eyebrow}</p>
          <h2 id="shows-title" className="display text-[11vw] md:text-[7vw] lg:text-[4.6vw]">
            {t.title} <em className="text-accent">{t.titleItalic}</em>
          </h2>
        </div>
        <p className="hidden max-w-[40ch] text-[15px] leading-relaxed text-frost md:block lg:mb-1 lg:shrink-0">{t.intro}</p>
      </header>

      <ol
        className="relative flex flex-col gap-4 md:flex-row md:flex-wrap md:justify-center md:gap-y-8 lg:gap-y-5"
        style={{ "--cols": columns(shows.length) } as React.CSSProperties}
      >
        {shows.map((s, i) => (
          <li key={s.slug} className="md:w-[calc(50%_-_0.5rem)] lg:w-[calc((100%_-_(var(--cols)_-_1)_*_1rem)_/_var(--cols))]">
            <Card show={s} i={i} t={t} />
          </li>
        ))}
      </ol>
    </section>
  );
}
