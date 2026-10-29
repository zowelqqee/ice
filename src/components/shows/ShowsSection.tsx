import type { Show } from "@/lib/data";
import { ShowVisual } from "./ShowVisual";
import { BladeLink } from "../shell/Transition";
import type { Dictionary } from "@/i18n";

const pad = (n: number) => String(n).padStart(2, "0");

function statusLabel(s: Show, t: Dictionary["shows"]) {
  return s.status === "touring" ? t.touring : s.status === "coming" ? t.coming : t.tba;
}

/** One show in the showcase: a row with a small picture on phones, a tile with the title over the
 *  picture from tablets up. The whole card opens the show. */
function Card({ show, i, t, wide }: { show: Show; i: number; t: Dictionary["shows"]; wide: boolean }) {
  const released = show.status === "touring";
  return (
    <article
      className={`group relative flex h-full gap-4 md:block md:overflow-hidden lg:aspect-auto ${wide ? "md:aspect-[5/2]" : "md:aspect-[5/4]"}`}
      style={{ "--a": show.accent } as React.CSSProperties}
      aria-labelledby={`show-${show.slug}`}
    >
      <BladeLink href={`/shows/${show.slug}`} accent={show.accent} className="absolute inset-0 z-10" aria-label={`${show.title} ${show.subtitle}: ${t.open}`}>
        <span className="sr-only">{t.open}</span>
      </BladeLink>

      <div className="relative aspect-[4/5] w-[30%] max-w-32 shrink-0 overflow-hidden md:absolute md:inset-0 md:aspect-auto md:w-auto md:max-w-none">
        <ShowVisual
          show={show}
          motifClassName="md:pb-[min(40%,8rem)]"
          className="h-full w-full transition-transform duration-[1200ms] ease-[var(--ease-glide)] group-hover:scale-[1.04]"
        />
        {/* accent edge light */}
        <span aria-hidden className="absolute inset-y-0 left-0 w-px bg-[var(--a)] opacity-70 shadow-[0_0_18px_2px_var(--a)]" />
      </div>
      <div aria-hidden className="absolute inset-0 hidden bg-gradient-to-t from-ink/95 via-ink/30 to-transparent to-70% md:block" />

      <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col justify-center md:absolute md:inset-x-0 md:bottom-0 md:block md:p-5 xl:p-6">
        <p className="mb-2 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-frost md:mb-3">
          <span className="text-ice">{pad(i + 1)}</span>
          <span aria-hidden className="h-px w-6 bg-[var(--a)]" />
          <span style={{ color: released ? show.accent : undefined }}>{statusLabel(show, t)}</span>
        </p>
        <h3 id={`show-${show.slug}`} className="display text-[34px] md:text-[clamp(30px,2.7vw,48px)]">
          {show.title}
        </h3>
        <p className="display mt-1 text-[19px] text-frost md:text-[clamp(17px,1.35vw,24px)]">{show.subtitle}</p>
        {/* the logline: none in the phone list (more shows in view), shown on tablets, opens on hover on wider screens */}
        <div className="hidden grid-rows-[1fr] md:grid transition-[grid-template-rows] duration-500 ease-[var(--ease-glide)] lg:grid-rows-[0fr] lg:group-hover:grid-rows-[1fr] lg:group-focus-within:grid-rows-[1fr]">
          <div className="min-h-0 overflow-hidden">
            <p className="line-clamp-2 max-w-[40ch] pt-3 text-[14px] leading-snug text-frost">{show.logline}</p>
          </div>
        </div>
        <p className="mt-3 inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.22em] text-ice md:mt-4">
          {t.open}
          <span aria-hidden className="inline-block h-px w-8 origin-left bg-ice transition-transform duration-500 group-hover:scale-x-[1.8] group-hover:bg-[var(--a)]" />
        </p>
      </div>
    </article>
  );
}

/** How the tiles share a wide screen, for any number of shows: four or three to a row, whichever
 *  leaves fewer empty places (eight: two rows of four, six: two rows of three), and the tiles of a
 *  short last row widen to fill it, so there are never holes. Spans are twelfths of the row. */
function wideLayout(n: number) {
  const empty = (c: number) => (c - (n % c)) % c;
  const cols = n <= 4 ? Math.max(n, 1) : empty(3) < empty(4) ? 3 : 4;
  const last = n % cols || cols;
  return { rows: Math.ceil(n / cols), span: (i: number) => 12 / (i >= n - last ? last : cols) };
}

/** The repertoire as a showcase right after the hero: every show in view at once. Phones get a
 *  list to swipe down through, tablets two columns (an odd last show takes the whole row), wider
 *  screens rows of three or four that fill one screen together (up to eight shows). */
export function ShowsSection({ t, shows }: { t: Dictionary["shows"]; shows: Show[] }) {
  const wide = wideLayout(shows.length);
  return (
    <section
      id="shows"
      aria-labelledby="shows-title"
      className="relative flex flex-col px-[var(--gutter)] pb-20 pt-24 md:pt-28 lg:min-h-svh lg:pb-[var(--gutter)]"
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
        className="relative grid gap-4 md:grid-cols-2 lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:grid-rows-[repeat(var(--rows),minmax(210px,1fr))]"
        style={{ "--rows": wide.rows } as React.CSSProperties}
      >
        {shows.map((s, i) => {
          const alone = shows.length % 2 === 1 && i === shows.length - 1;
          return (
            <li
              key={s.slug}
              className={`lg:[grid-column:span_var(--span)/span_var(--span)] ${alone ? "md:col-span-2" : ""}`}
              style={{ "--span": wide.span(i) } as React.CSSProperties}
            >
              <Card show={s} i={i} t={t} wide={alone} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
