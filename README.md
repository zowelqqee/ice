# Musical on Ice: promo site

A showcase for the touring ice-musical repertoire, built with Next.js (App Router), TypeScript,
Three.js / React Three Fiber, GSAP + ScrollTrigger, Lenis and the Web Audio API.

- **Hero**: a glass figure skater, our own model built from the costume sketch, spinning on her blade on a glossy rink, seen past red stage curtains: the page opens on them shut, they part onto the logo's glass treble clef, which turns into her and back, over the logo's blade trace carved in the ice. Scroll scrubs the spin, drag or swipe spins her, and she turns slowly at rest. The first paint is a frame rendered from the scene itself, so she is the first thing on screen.
- **Shows**: a row of all eight productions, each with its own accent light, browsed sideways with arrows or a swipe (never forced). Every show has its own page, reached through a blade-cut transition.
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

## Deploy (Vercel)

The GitHub repository is connected to a Vercel project, which picks up Next.js on its own. There is no `vercel.json`. The site itself needs no environment variables; the tour admin does (see [Admin](#admin)).

- **Production:** every push to `main` deploys to production.
- **Previews:** other branches get preview deployments. Their `robots.txt` blocks indexing.
- **Domain:** the canonical URL, used for Open Graph, the sitemap and schema.org, is `NEXT_PUBLIC_SITE_URL` when set. Otherwise it is the project's production domain on Vercel: the custom domain once attached, `*.vercel.app` until then.
- **Build:** the build runs `prebuild` (the tour map) and then `next build`. Everything it needs is in the repository.
- **Not in the repository:** the source footage and the 3D build tools (`~/ice/materials`, `~/ice/tools`). They are only needed to regenerate media.

## Admin

`/admin` manages the site's content. Sections:

| Section | What it edits |
|---|---|
| **Tour dates** | Dates: show, date and time, city, country, venue, ticket link, status, published. Add, edit, duplicate, delete. |
| **Shows** | The repertoire: title, subtitle, pitch, story, highlights, duration, age, status, colour, music, shown/hidden, order. Pictures and video for the card, the show page header and the extra loop. Add and delete shows; each new show gets its page `/shows/<address>` and a sitemap entry. |
| **Music** | The player in “Our music”: upload a recording, title, note, show, order, shown/hidden. |
| **Texts** | Every line of the interface (menu, first screen, section titles, buttons, footer, page title and description for search engines). |
| **Settings** | Booking and press emails, YouTube and Instagram links, the share picture for link previews. |

Not in the admin, because they are code: the site address (`NEXT_PUBLIC_SITE_URL` or the Vercel domain),
the logo, the 3D skater, the ice orchestra, the tour map's frame, and the translations (see below).

- Sign-in: one login and password, set by environment variables. No outside service or account.
- The session is a signed, httpOnly cookie, valid for 8 hours. After 5 wrong attempts within 15 minutes, sign-in is locked for 15 minutes for that address and that login.
- The admin is not linked from the site, not in `robots.txt` or the sitemap, and is sent with `noindex`. It has no analytics.
- Only events marked **Published** appear on the site. Past events drop off by themselves the day after. Saving an event refreshes the tour, the show pages, the schema.org events and the sitemap at once.
- On first start the database is filled from the files: `src/data/tour.json` (as unpublished drafts: review them, set real venues and ticket links, publish), `src/data/shows.json`, `src/data/music.json`, the texts of `src/i18n/en.ts` and the contacts of `src/lib/site.ts` (as they are on the site). From then on the admin is the place to edit; the files stay as the fallback.
- Without a working database the public site shows the content of those files. Every save in the admin refreshes the public pages at once.

### 1. Set the password

In a terminal, go to the project folder first (npm looks for `package.json` there), then run the script:

```bash
cd ~/ice/musical-on-ice
npm run admin:hash
```

It asks for the password twice (10+ characters; nothing is shown while you type) and prints two lines,
`ADMIN_PASSWORD_HASH=…` and `SESSION_SECRET=…`.
Put them, together with the login, in `.env.local` (on your machine or a server) or in Vercel → Settings → Environment Variables:

```
ADMIN_USER=tour
ADMIN_PASSWORD_HASH=scrypt:32768:8:1:…
SESSION_SECRET=…
```

The password itself is never stored, only its hash. To change it, run the command again and replace both lines;
a new `SESSION_SECRET` also signs out every open session.

### 2. Choose the database

Set by environment variables only. Switching needs no code change; the tables are created on first use.

| Where the site runs | Variables |
|---|---|
| Your own server (VPS, Docker with a volume) | `DB_DRIVER=sqlite` and `DATABASE_URL=file:./data/musical-on-ice.db` (both are the default) |
| Vercel (no persistent disk) | hosted libSQL, e.g. Turso: `DB_DRIVER=libsql`, `DATABASE_URL=libsql://…`, `DATABASE_AUTH_TOKEN=…` |
| Vercel or a server, with Postgres | `DB_DRIVER=postgres`, `DATABASE_URL=postgres://user:pass@host:5432/db` |

On Vercel a SQLite file would be lost on every deploy, so the admin refuses `sqlite` there and says so on `/admin`.

Easiest on Vercel: Storage → Create Database → **Neon** (in the marketplace list), connected to the project.
Neon adds its own variables; without `DATABASE_URL` the site reads `POSTGRES_URL` from them, so only
`DB_DRIVER=postgres` has to be added by hand. (Likewise `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN` for
Turso's integration.) Options in a hosted address that the Postgres driver would pass on to the server
and get refused, such as Neon's `channel_binding`, are dropped.

### 3. Deploy

- **Vercel:** add the variables from steps 1 and 2 to the project (Production) and redeploy. Then open `https://<domain>/admin`.
- **Own server:** `npm ci && npm run build && npm start` behind a reverse proxy with HTTPS. Keep `data/` on a persistent disk. The proxy must pass the client address in `X-Forwarded-For`, which the sign-in lockout counts by.

Local try-out: put the variables in `.env.local`, run `npm run dev` and open http://localhost:3000/admin.

### 4. Media uploads

Pictures, video and recordings uploaded in the admin are processed on the server, like the original
footage was by `scripts/media/`:

- **Images** (JPEG, PNG, WebP, AVIF, HEIC…) are cropped to the slot around the most interesting part, saved as AVIF, WebP and JPEG, with metadata removed.
- **Video** (MP4, MOV, WebM…) is cut to its first 15 seconds, without sound, cropped to the slot, and saved as H.264 MP4 with a still for the poster. Metadata is removed.
- **Audio** (MP3, WAV, M4A, FLAC…) is brought to a steady loudness and saved as AAC and Opus, with metadata removed.

Faces, logos and watermarks cannot be checked automatically. Before uploading, the admin asks you to confirm
you checked them. Limits: images 40 MB, video 400 MB, audio 80 MB.

Where the files go:

| Where the site runs | Storage |
|---|---|
| Own server | the folder `data/uploads` (or `UPLOADS_DIR`), served at `/u/…`. Keep it on the persistent disk and in the backups. |
| Vercel | **Vercel Blob**. In the project: Storage → Create Database → **Blob**, access **Public**, connect it to the project. Vercel adds `BLOB_READ_WRITE_TOKEN`; then **Redeploy**. Files are still served from the site's own domain (`/u/…`). |

Without Blob on Vercel, uploads are switched off and the admin says so; everything else works.

Video and audio need `ffmpeg`. It comes with the project (`ffmpeg-static`, allowed in `package.json`
under `allowScripts`); `FFMPEG_PATH` can point to another binary.

### 5. Backups

- **SQLite:**

  ```bash
  npm run db:backup
  ```

  This writes `backups/events-YYYY-MM-DD-HHMM.db` (UTC time), a consistent copy made with `VACUUM INTO` that is safe while the site runs. Run it from cron, e.g. daily, and copy `backups/` off the server.
  To restore, stop the site, put the copy in place of the file named by `DATABASE_URL`, and start the site again.
- **Turso:** `turso db shell <name> .dump > events.sql`, plus the provider's point-in-time restore.
- **Postgres:** `pg_dump "$DATABASE_URL" -t events > events.sql`; restore with `psql "$DATABASE_URL" < events.sql`.

`data/` and `backups/` are git-ignored: content never goes into the repository.

Uploaded files are not in the database. On your own server, back up `data/uploads` too, e.g.
`tar czf backups/uploads-$(date +%F).tgz data/uploads`. Vercel Blob keeps its files itself.

### Rules the admin enforces

- Tour dates: a show (from the Shows section), a real calendar date, a time (HH:MM), city, country and venue.
- The ticket link is optional and must start with `https://`. Status is one of On sale, Sold out or Cancelled; sold-out and cancelled dates show that label instead of a ticket button.
- Latin characters only, everywhere (dates, shows, music, texts). The previous market's countries are not offered.
- Shows: title and pitch required; a page address of lowercase Latin letters, digits and dashes, fixed once created. A show with tour dates cannot be deleted (hide it, or delete the dates first).
- Music: a recording is required. Settings: emails must be addresses, social links must be `https://` links to YouTube and Instagram.
- `npm run audit` also checks everything in the database (dates, shows, music, texts, settings) for Cyrillic and for previous-brand or previous-market words, and the uploaded files for metadata.

### SQL injection

Every query is built with Drizzle (`select`, `insert`, `update`, `delete` with `eq`, `inArray`, …), which sends
values as bound parameters, separately from the SQL text: whatever is typed into a form, a URL or the
sign-in field stays plain data. On top of that:

- The only raw SQL is the fixed table definitions in `src/lib/db/schema.ts`. They run through a helper
  whose type accepts nothing else.
- Lint rules (`eslint.config.mjs`) reject `sql.raw`, SQL assembled from template strings or `+`,
  `unsafe()`, and database clients imported outside `src/lib/db`. `next build` runs lint, so such code
  cannot be deployed.
- Event ids from URLs and forms are checked against the id format before any query; anything else gets
  a 404 or is ignored.

When adding a query, use Drizzle's builders or the `` sql`… ${value}` `` template (it binds `value`).
For a query outside Drizzle, use `{ sql: "… ? …", args: [value] }`, never string building.

## Content

Shows, music, texts and contacts are edited in [the admin](#admin). The files below are the first fill of
its database and the fallback without one; changing them later does not change a site that has a database.

### Add or edit a show (in files)

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

### Tour dates

Managed in [the admin](#admin). `src/data/tour.json` is only the first fill of the database and
the fallback when there is none; every date in it is a placeholder (shown with a "sample" badge and never
published as a schema.org event).

The map frame is fixed (Europe, the Mediterranean and the Gulf). A date outside it, or without a map
position, is listed but not drawn. The land layer is pre-rendered before every `dev` and `build`
(`scripts/build-map.mjs`).

### The jingle (brand theme)

Plays on the Enter screen (the intro is timed to it) and from the treble clef in the footer. To
replace it with the final version, run `scripts/media/jingle.sh <file>`; if its opening sweep is no
longer at 1.75 s, update `JINGLE_SWEEP` and the chime times in `src/lib/audio/jingle.ts`.

### Add a music track (in files)

1. Add a `track` line to `scripts/media/music.sh` and run it. It writes `public/media/music/<id>.{webm,m4a}`, loudness-normalised and metadata-free.
2. Add the track to `src/data/music.json`, and set `track` on the show in `shows.json` to give its page a Listen button.

The ice orchestra does not use these tracks: it plays an original theme with CC0 instrument recordings (VSCO 2 CE, see DECISIONS D12). To rebuild its samples run `node scripts/media/orchestra.mjs`; file names carry content hashes, so browsers pick up new samples at once.

### Replace the hero dancer

1. The model is built by script (see `scripts/skater/README.md`). Run `scripts/skater/build.sh`, then `scripts/skater/run.sh export_web.py`, then `node scripts/media/skater-model.mjs` → `public/models/skater.glb`. The site picks materials by part name and reads the anchor empties (spin pivot, free blade, fingertips).
2. `MODEL_YAW` in `src/components/hero/SkaterModel.tsx` turns her start pose. A model under a licence that asks for credit needs a line in the footer (the current one is CC0 plus our own work).
3. Re-render the instant first frame: capture `/?still` (landscape 1920x1080 @1.5x, portrait 390x844 @3x) and run `scripts/media/hero-poster.sh`.

### Text and languages

The interface texts are edited in the admin (Texts); `src/i18n/en.ts` holds the originals, and a new text
key added there shows up in the admin by itself. German, French, Spanish and Italian are wired in
`src/i18n/index.ts` and fall back to English key by key; the site has no language switch yet.

### Contacts and domain

Contacts and social links are edited in the admin (Settings); `src/lib/site.ts` holds the defaults (the
emails there are placeholders). The site URL is `NEXT_PUBLIC_SITE_URL`, or the Vercel production domain.

## Architecture

```
src/app/(site)/             public routes: / , /shows/[slug] (site shell + footer)
src/app/admin/              tour admin: sign-in, events list, add/edit form, server actions
src/app/                    root layout, sitemap, robots, 404
src/lib/db/                 Drizzle schema (SQLite + Postgres) and connection by DB_DRIVER
src/lib/events.ts, auth.ts  events repository + validation; admin sign-in, session, lockout
src/lib/content.ts          shows, music, texts, settings: reading (with file fallback), validation, saving
src/lib/storage.ts, media.ts uploads: disk or Vercel Blob; processing with sharp and ffmpeg
src/app/u/[...path]/        serves uploaded files from disk (Vercel Blob: proxied in next.config.ts)
src/components/hero/        hero DOM + canvas; shaders/ (skater SDF, skirt, ice, beam, snow, spray)
src/components/shows/       shows row with arrows, show visual, show page
src/components/tour/        server section (map projection, JSON-LD) + client view
src/components/music/       player UI, ice orchestra (procedural instruments, ice/crack material)
src/components/shell/       transitions (blade cut), frost trail behind the cursor, providers
src/components/ui/          IceButton (cracks on hover, shatters on press)
src/lib/audio/              engine.ts (single Web Audio graph), music.ts (show-track player), orchestra.ts (sampler + score)
src/lib/                    spin state, quality tiers, data accessors, map projection
src/data/                   shows.json, tour.json, music.json
scripts/media/              hero-poster.sh, shows.sh, music.sh: source → web assets, metadata stripped
scripts/build-map.mjs       pre-renders the map land layer
scripts/audit.mjs           brand-separation audit → AUDIT.md
```

**Sound.** On by default, nothing to press: the intro plays by itself once the hero is ready, with the jingle where the browser allows sound without a click; elsewhere sound starts with the visitor's first click, tap or key. After that:

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
- `prefers-reduced-motion`: static figure, no scroll spin, no pin, instant (not smooth) arrow steps in Shows, stills instead of loops, no frost trail behind the cursor.
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
8. **Hero skater.** She is our own glass figure, in the pose from the costume sketch. The build keeps a full rig, so a second pose (arms pulling in as she speeds up) is a script change, not a new model.
9. **Translations** for DE, FR, ES and IT.
10. **Hosting.** Any platform that runs Next.js works. The site makes no third-party requests.
