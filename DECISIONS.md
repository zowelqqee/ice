# Decisions

Forks that change the result. Each lists the choice, why, and the alternative to switch to.

## D1. Accent colour: electric ice cyan `#5CF2FF`
Cyan is the colour of light passing through ice and of a blade edge catching a spotlight. It is also
already present in the real footage: the projection-mapped rinks in the Aladdin and Dracula
cuts glow cyan and blue, so the site and the show look like the same world.
Cold magnesium pink was rejected because next to deep blue it drifts toward the purple-pink
gradient the brief bans, and it collides with Dracula's blood red.
**Alternative:** `#FF5FA8` (cold magnesium pink). It is one token in `src/app/globals.css`.

## D2. Hero pirouette: a sculpted dancer model in contre-jour + real arena footage behind

**Update 2 (client choice, 2026-10-16):** the dancer is our own figure skater, built from the client's costume sketch. The pose: on the left skate, right leg in passé, arms rounded overhead. The costume: velvet bodice, sheer sleeves, three-layer chiffon skirt, crystals, laced skates and a bun with loose strands.

- **Construction.** Everything is built by script in Blender (`scripts/skater/`, see its README) on a MakeHuman CC0 body, so no credit is needed. The earlier "Ballerina" by LollyPoly (CC BY) and its footer credit are gone.
- **Look.** In the hero she is shown as a glass figure, by the client's choice: the model gives the form, with no colours.
  - Clear through the middle, bright at the edges, with reflections and glints from the stage lights, the site's cyan rim and a faint thin-film shimmer.
  - Hair as spun-glass strands; crystals as sparkle points.
  - The body glass writes depth like cast glass, so the bun and the far arm do not show through the face and torso; its inner surfaces are drawn first.
- **Motion.** She spins on her blade (the spin axis and the trail points are anchors in the model).
- **Pipeline.** `scripts/skater/build.sh` → `export_web.py` → `scripts/media/skater-model.mjs`.

The raymarched figure described below remains the automatic fallback if the model file is missing.

**Update 1 (superseded):** "Ballerina" by LollyPoly (CC BY 4.0) in contre-jour.

### Original rationale
There is no usable pirouette shot. The only spins (Aladdin ≈50–52 s, Dracula arena ≈13–15 s)
last 1–2 s, use a handheld moving camera, and show faces. Scrubbing them by scroll would stutter
and could not be matted cleanly without a segmentation pipeline.
So the dancer is a **raymarched signed-distance figure**: smooth-unioned limbs, so no
mannequin joints. She is lit only from behind, a dark silhouette with a bright ice rim, so a face
cannot exist by construction. Her arms pull in as she speeds up and her skirt flares, which is
the physics of a real spin. Behind her, as the backdrop, plays **real arena footage** from
the live show (a wide shot, performers far away, graded and softened), so the visitor sees a real
production while the graphics only light the stage.
**Alternative (B):** once a locked-off 4K spin of one skater is filmed against a dark rink, matte it,
render it as a video texture inside the same scene, and keep all light, ice and particle layers.
The scene API (`spin` store, `Skater` slot) is built so the figure can be swapped.

## D3. Key art (posters) is not used as-is
The supplied posters are AI-generated illustrations with gold, gloss and painted faces. They
conflict with the brief's visual language and its rule of no AI faces and no recognisable faces.
Show cards use processed real footage frames (faces cropped or graded into silhouette) plus
typographic titles. The Alice in Wonderland card has no footage, so it gets a typographic and
light treatment until footage arrives.

## D4. Typography: Instrument Serif (display) + Geist (text) + Geist Mono (data)
Instrument Serif's narrow, high-contrast italic reads cinematic and editorial (A24 territory),
not theatrical gold. Geist is a clean grotesk for text, Geist Mono for dates and venues. All
three are OFL, self-hosted from `src/fonts/` (Latin + Latin-Ext subsets only), with no third-party
font service.
**Alternative display faces:** "Fraunces" (softer) or a condensed grotesk such as "Big Shoulders"
(colder, louder).

## D5. Excluded footage segments
- Dracula arena cuts ≈10–14 s: handwritten non-Latin text projected on screen, burned-in subtitles.
- Dracula master ≈22 s: burned-in subtitle.
- Anastasia promo: uniform, tank and throne scenes, title card (typo "TRON").
- All end cards and title cards (they show the old corner bug and lettering).
- Any shot where a face is large and lit, unless it is cropped to skates, hands or costume, or turned into silhouette.

## D6. Language: English only, i18n-ready
Dictionaries live in `src/i18n/` (en complete; de, fr, es, it are stubs that fall back to en).
There are no locale routes yet. Adding `/[locale]` is a mechanical step once translations exist.

## D7. Sound off until the visitor chooses
The Enter screen asks "with sound / in silence". Nothing plays before that gesture, and the mute button
stays in the header. Until licensed stems exist, the hero runs a small Web Audio ambient: an ice pad,
blade hiss that follows spin speed, and glass bells on fast spins. Show music is extracted from the
supplied videos' soundtracks (rights: open question).

## D8. Ice orchestra plays frequency bands of the real soundtrack
There are no stems. Each instrument owns a band of the same track:

- cello: < 240 Hz
- piano: 240 Hz–1.1 kHz
- violin: 1.1–4.6 kHz
- harp: > 4.6 kHz

These are 24 dB/oct crossovers. With nothing awake you hear the full mix; wake instruments and only their layers play, always in sync. It is real music and genuinely layered, but a band is not the instrument itself.
If a track fails to load, a small Web Audio arrangement (A minor, 84 BPM) takes over, so the feature always works.
**Alternative:** real stems per show. The player API (`toggleLayer`) stays the same, and each chain gets its own file instead of a filter.

## D9. Soft depth of field dropped from the hero
DOF cost about 15 fps at 1440×900 @2x on an M1 Pro. Bloom and the volumetric haze already soften the frame, so the frame budget went to 60 fps. Chromatic aberration and grain stay on the high tier.
**Alternative:** re-enable `DepthOfField` in `HeroCanvas.tsx` on the high tier at reduced resolution.

## D10. Tour as a route map, not a globe
The tour is Europe-centred with one Gulf date. A conic map framed around the stops reads the route at a glance, and a globe would spend most of the screen on empty ocean. The land layer is pre-rendered to a static SVG; only the stops and route are in the page.
**Alternative:** a three.js globe if the schedule becomes truly worldwide.

## D11. Three micro-interactions, all ice
- Ticket buttons: hairline cracks race out on hover, and the pane shatters with a glass chime on press.
- Page transitions: a blade slices the screen on a diagonal and the two sheets part.
- Cursor: leaves a short trail of frost crystals (fine pointers only).

Nothing else was added, to keep the effects in proportion.

## D12. Orchestra plays real recordings, not frequency bands (supersedes D8)
Each ice instrument plays its own part of an original 16-bar theme in D minor, sampled from VS Chamber Orchestra 2 Community Edition (Versilian Studios, CC0: no rights question). Eight instruments: violin, cello, harp, piano, flute, French horn, timpani, glockenspiel ("ice bells"). Parts are scheduled on the audio clock, so any combination stays in time; piano keys, glock bars, harp strings and timpani heads react to each note. The show soundtracks remain in the player above.

## D13. Client review, October 2026: ice blue, upright type, the logo's lettering
- **Title.** The first screen shows "Musical on Ice" in the logo's own letterforms: the shapes are
  taken from the logo artwork (`src/components/hero/wordmark.ts`), one line above the skater,
  sized so it never covers her.
- **No italics anywhere.** Only the upright cut of Instrument Serif ships; `em`/`i` are upright and
  emphasis is colour only (supersedes the italic part of D4).
- **Not black.** The page is a deep ice blue (`--ink: #0b1d2e`), and so are the 3D scenes; contrast
  for text stays AA.
- **First screen.** The skater stands on a lit rink with her reflection and skate marks. Behind her,
  real footage of a skater jumping across blue ice (D5-safe, see MATERIALS), small in a soft
  window, with a blurred copy of it filling the rest of the frame edge to edge, on any screen.
- **Shows strip.** The sideways travel happens once; after it, the section is an ordinary row and
  scrolling back up is vertical.
- **Ice orchestra.** Carved ice, not glass and not a bare mesh: rounded, hand-carved edges; a
  mostly clear, slightly milky body that refracts a lit backdrop, with a thin rainbow at the edges
  (dispersion), glowing rims and fine frost; light veins only while an instrument is awake. On
  capable machines it renders at up to 1.75x pixels with anti-aliasing; phones keep lighter settings.
- **Cursor.** On desktop the cursor is a conductor's baton made of ice; its tip is the hotspot and it
  keeps the frost trail of D11 (fine pointers only, not under reduced motion).

## D14. The jingle: the brand theme for logo moments
The client's jingle (17.6 s, a working version) is the sound of the brand, not background music:
- **Enter screen = the brand intro.** "Enter with sound" (or the logo's treble clef) plays it, and
  the screen is timed to it: a line of light cuts across, on the opening sweep (1.75 s) the halves
  part like a door into the rink with a burst of light and frost, and the treble clef flies down
  into the skater and dissolves into her; the hero is open by the musical peak (5–6 s).
- **The skater spins to it**: a push on the sweep and on each bright chime; her rim light follows
  the sound through the shared analyser.
- **The treble clef plays it** again from the footer ("Play our theme").
- **Not a background loop**: 17 s on repeat tires fast, would clash with the show tracks and the
  orchestra, and browsers allow no sound before a click anyway. The jingle stops when a show track
  or the orchestra starts, and they stop it.
