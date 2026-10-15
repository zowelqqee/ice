# Musical on Ice: promo site

A showcase for the touring ice-musical repertoire, built with Next.js (App Router), TypeScript,
Three.js / React Three Fiber, GSAP + ScrollTrigger, Lenis and the Web Audio API.

- **Hero**: a sculpted ballerina ("Ballerina" by LollyPoly, CC BY 4.0) lit from behind, spinning on her pointe over real arena footage. Scroll scrubs the spin, drag or swipe spins her, and she turns slowly at rest. The first paint is a frame rendered from the scene itself, so she is the first thing on screen.
- **Shows**: a pinned horizontal journey through all eight productions, each with its own accent light. Every show has its own page, reached through a blade-cut transition.
- **Tour**: route map, schedule, filters, ice-break ticket buttons, and schema.org events for confirmed dates.
- **Our music**: a player for the show soundtracks, plus the ice orchestra: eight detailed ice instruments (violin, cello, harp, grand piano, flute, horn, timpani, glockenspiel) each playing its own part of an original theme with real CC0 recordings. Keys press, bars light and strings vibrate with each note.
- **Footer**: booking and press contacts, socials, language switch (EN; other languages to come).

See [MATERIALS.md](MATERIALS.md) (source inventory), [DECISIONS.md](DECISIONS.md) (choices and
alternatives) and [AUDIT.md](AUDIT.md) (brand-separation audit).

## Run

```bash
npm install
npm run dev            # http://localhost:3000
```

Production:

```bash
npm run build && npm start
```

To build beside a running dev server (separate output folder):

```bash
NEXT_DIST_DIR=.next-build npm run build
```

Audit (run after any content or media change; exits non-zero on failure):

```bash
npm run audit          # add -- --sheets for contact sheets of every shipped video in .audit/
```

## Content

### Add or edit a show

1. Add an entry to `src/data/shows.json`. Fields:
   - `slug`, `status` (`touring` | `coming` | `tba`), `title`, `subtitle`, `logline`
   - `synopsis[]`, `highlights[]`, `facts`
   - `accent`: the show's single colour
   - `media`, `track`
2. Footage: add a `clip` line to `scripts/media/shows.sh`. Give the source, start time, length, slow-down, crop and output name, pick a face-safe shot (wide, back, skates, costume) and re-run:

   ```bash
   scripts/media/shows.sh [path-to-materials]
   ```

   It writes `public/media/shows/<slug>/{card,hero}.{webm,mp4,avif,webp,jpg}` with metadata stripped.
3. Without footage, leave `media` empty: the card gets the light-and-ice composition in the show's accent.
4. Check every frame of new loops (`npm run audit -- --sheets`), then run the audit.

The show page `/shows/<slug>` is generated automatically, and so is its sitemap entry.

### Add tour dates

Edit `src/data/tour.json`:

- `date` (ISO), local `time`, `city`, `country` (ISO-2), `venue`
- `lat` / `lon`
- `tickets`: the URL, or `null` to show "Soon"
- `placeholder`

The map is regenerated before every `dev` and `build` (`scripts/build-map.mjs`).

Only entries with `placeholder: false` are published as schema.org `TheaterEvent`s. **Every date in the file today is a placeholder.**

### Add a music track

1. Add a `track` line to `scripts/media/music.sh` and run it. It writes `public/media/music/<id>.{webm,m4a}`, loudness-normalised and metadata-free.
2. Add the track to `src/data/music.json`, and set `track` on the show in `shows.json` to give its page a Listen button.

Dedicated stems (separate violin, piano, cello and harp recordings) would make the orchestra exact. Today each instrument is a frequency band of the full mix (see DECISIONS D8).

### Replace the hero dancer

1. Export the model as GLB. Run `scripts/media/skater-prep.py` in Blender (headless) to drop any base, bake transforms and smooth, then `node scripts/media/skater-model.mjs <figure.glb>` → `public/models/skater.glb`.
2. Adjust `HEIGHT` and `MODEL_YAW` in `src/components/hero/SkaterModel.tsx`, and update the credit in the footer if the licence asks for one.
3. Re-render the instant first frame: capture `/?still` (landscape 1920x1080 @1.5x, portrait 390x844 @3x) and run `scripts/media/hero-poster.sh`.

### Text and languages

All interface text lives in `src/i18n/en.ts`. German, French, Spanish and Italian are wired in
`src/i18n/index.ts` and fall back to English key by key. Show copy is in `shows.json`.

### Contacts and domain

`src/lib/site.ts`. Every value marked `PLACEHOLDER` needs replacing. The site URL can also be set with
`NEXT_PUBLIC_SITE_URL`.

## Architecture

```
src/app/                    routes: / , /shows/[slug], sitemap, robots, 404
src/components/hero/        hero DOM + canvas; shaders/ (skater SDF, skirt, ice, beam, snow, spray)
src/components/shows/       horizontal journey, show visual, show page
src/components/tour/        server section (map projection, JSON-LD) + client view
src/components/music/       player UI, ice orchestra (procedural instruments, ice/crack material)
src/components/shell/       transitions (blade cut), frost cursor, providers
src/components/ui/          IceButton (cracks on hover, shatters on press)
src/lib/audio/              engine.ts (single Web Audio graph), music.ts (player + band layers)
src/lib/                    spin state, quality tiers, data accessors, map projection
src/data/                   shows.json, tour.json, music.json
scripts/media/              hero.sh, shows.sh, music.sh: source → web assets, metadata stripped
scripts/build-map.mjs       pre-renders the map land layer
scripts/audit.mjs           brand-separation audit → AUDIT.md
```

**Sound.** Nothing plays until the visitor chooses "with sound" on the Enter screen. After that:

- Mute stays in the header.
- The hero runs a generated ambient: an ice pad, blade hiss that follows spin speed, and glass bells on fast spins.
- Show tracks duck the ambient.
- The analyser drives the hero's rim light, the spectrum and the instruments.

**Performance.** Three device tiers (DPR cap, raymarch steps, particle counts, post-processing), with automatic step-down when frame rate drops. Both 3D scenes stop rendering off-screen. The hero scene builds only after first paint and idle time, behind a poster frame of the same arena. Geodata, three.js and the orchestra all load lazily.

Measured on 2026-10-15:

| Check | Result |
|---|---|
| Real-GPU headless Chrome, M1 Pro, 1440×900 @2x | hero 60 fps (p95 frame 17 ms), orchestra 60 fps |
| Lighthouse mobile, devtools throttling | LCP 2.3 s, TBT ≈0.4 s, CLS 0.02 |
| Lighthouse mobile, simulated throttling (software WebGL) | LCP 4.0 s, performance 85 |
| Lighthouse scores | accessibility 100, best practices 100, SEO 100 |

Real-device testing on mid-range phones is still to do.

**Accessibility.**
- `prefers-reduced-motion`: static figure, no scroll spin, no pin, native horizontal scroll in Shows, stills instead of loops, no frost cursor.
- Skip link.
- Every interactive element is keyboard-reachable:
  - the hero responds to the arrow keys;
  - the orchestra has a button for each instrument with `aria-pressed`.
- Contrast passes AA.

## Open questions

1. **Music rights.** The player tracks are cut from the promo soundtracks: are they cleared for web use? (The orchestra uses CC0 recordings and an original theme, so it needs no clearance; it could play the signature theme instead if stems exist.)
2. **Princess Anastasia.** The story is tied to the previous market. The site currently uses neutral copy and only the ballroom wide shot. Keep it, or hold it back?
3. **Show copy.** Synopses, durations and ages are drafts (`copyStatus: "draft"`). Dracula, Alice and Anastasia facts are TBC.
4. **Productions 7 and 8.** What are their titles? Also, when will footage arrive for Alice in Wonderland, The Little Prince and Alice Through the Looking-Glass?
5. **Tour.** We need the real schedule, venues and ticket links. The Italian January 2027 dates come from a print poster and need confirmation.
6. **Contacts and domain.** We need the booking and press addresses, and the production domain.
7. **Logo.** Is there a clean SVG? The EPS couldn't be rasterised here, so the PNG is used.
8. **Hero dancer.** She is a ballerina model en pointe (not rigged, no skates). A rigged figure-skater model (e.g. "Figure Skater" by qixi, TurboSquid, $79) would let her arms pull in as she speeds up; a locked-off spin filmed against a dark rink would allow a real skater.
9. **Translations** for DE, FR, ES and IT.
10. **Hosting.** Any platform that runs Next.js works. The site makes no third-party requests.
