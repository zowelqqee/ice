# Materials inventory

Source: `~/ice/materials/` (4.3 GB, two Google Drive exports + one loose PSD).
No "Hong Kong" folder was present, so there was nothing to exclude.
Nothing from the source folder is published directly. Every file used on the site goes through
`scripts/media/` (rename to neutral Latin names, strip metadata, re-encode).

## Summary

| Show | Posters / key art | Video | Text | Usable for site |
|---|---|---|---|---|
| Aladdin & 1001 Nights on Ice | 16:9, 9:16, 1:1, A-format print (3508x4962), title lettering PNG | 1 master cut 89 s 1080p + 7 social cuts (15–60 s) | Press release (EN, .docx) | **Yes, best footage** (bright, varied, single skaters) |
| Dracula on Ice | 16:9, 9:16, 1:1, castle plate, couple cut-out, logo | Master 88 s, "Stage" master 88 s, ~25 social cuts (arena / stage, with / without logo) | Taglines only ("The story of eternal love") | **Yes**, dark cinematic footage, see exclusions |
| Alice in Wonderland on Ice | 16:9, 9:16, 1:1 | none | none | Key art only (no footage) |
| Princess Anastasia on Ice | 1 Italian print poster (TIF, non-Latin filename prefix) | 1 promo 66 s 1080p | none | Video only, partially, see exclusions |
| The Little Prince / Alice Through the Looking-Glass | — | — | — | Placeholders (coming later) |
| Shows 7–8 | — | — | — | Unnamed placeholders |

Brand: `Musical-on-ice_LOGO_03.png` (1920x1080 RGBA, white lettering with treble clef, mostly
empty canvas, so it gets cropped) and `Musical-on-ice_LOGO_04.eps` (6 MB vector, no EPS rasteriser on this
machine, so the PNG is used and the EPS is an open item for a clean SVG).

## Video (all H.264 + AAC stereo, 25 or 29.97 fps)

| File (source) | Res | Dur | Notes |
|---|---|---|---|
| `ALADDIN ON ICE_MOI.mp4` | 1920x1080 | 88.9 s | Live arena footage, projection-mapped ice, single skaters, spins (≈50–52 s), lifts, aerial silk, fire. "Musical on Ice" bug top-right. Title card at start, MOI end card. |
| `ALLADIN_(…)_01…05.mp4` | 1080² / 1080x1350 / 1920x1080 / 1080x1920 | 15–60 s | Social re-edits of the same footage. Vertical 1080x1920 cut is useful for mobile. |
| `DRACULA ON ICE_MOI.mp4` | 1920x1080 | 88.3 s | Arena footage, dark red/blue, fog. **One shot has a burned-in local-language subtitle** at ≈22 s. |
| `DRACULA ON ICE. STAGE. SYTHNETIC_MOI.mp4` | 1920x1080 | 87.9 s | Theatre-stage version (not ice-focused: on-stage, green chalkboard scene). Low priority. |
| `DRACULA … ICE ARENA … no_logo_01.mp4` (several sizes) | 1920x1080, 1080x1920, 1080x1350, 1200x628 | 26.8 s | No MOI bug. **Contains handwritten non-Latin text projected on the screen (≈10–11 s) and burned-in local-language subtitles (≈12–14 s)**, so those segments are excluded. Beautiful red-cape spin (≈13–15 s), aerial silk, gothic street. |
| `DRACULA … STAGE … marsh_*` | various | 28 s | Same stage footage, alternative music ("marsh"). |
| `Anastasia_PROMO_2026_1920x1080_1min_01.mp4` | 1920x1080 | 65.8 s | Older, darker footage, MOI bug. **Contains military-uniform scenes, a tank, and a throne; title card typo "TRON".** Only neutral ice shots are usable (ballroom glide, fog duet). |

Footage has **recognisable faces in most shots**. Every frame used goes through the face policy
(contre-jour grade, crop to skates/hands/costume, blur, or back-facing shots). See DECISIONS.md.

## Images

| File | Res | Notes |
|---|---|---|
| Aladdin / Dracula / Alice posters 16:9, 9:16, 1:1 | 1672x941, 941x1672, 1254² | **AI-generated key art**: illustrated faces, gold, gloss. Conflicts with the brief's visual language and its no-AI-faces rule, so it is **not used as-is**. Used only as heavily processed colour/texture reference for show accents, never showing faces. |
| `Aladdin_Afisha-3_merged.png` / `.psd` | 3508x4962 | Cartoon-style print poster. Not used. |
| Two couple cut-outs (Aladdin folder, non-Latin filenames) | ~1550x1780 | Cartoon and "realistic" couple cut-outs. **Not used.** |
| `…ANASTASIA_BILETITALIA_print_02.tif` (non-Latin filename prefix) | 3508x4961 | Italian print poster with Italian tour dates (03–07.01.2027 Varese, Milano, Bari, Florence). Its backdrop is a recognisable landmark tied to the previous market, so it is **not used**. The dates are used as a tour-data hint (marked placeholder). |
| `Castle_Dracula.png` | 1024x1536 | AI castle plate (no people). Possible as a blurred atmosphere layer for the Dracula show page. |
| `Dracula and Mina_Dracula.png` | 1165x1350 | AI couple cut-out (faces). Not used. |
| `DRACULA_logo_ENG_01.png`, `Name_Dracala.png` | 1403², 2172x724 | Show title lettering (red heart / chrome). Usable as show wordmark on the show page. |
| `Aladdin.png`, `ON ICE.png`, `Layer 113.png` | small RGBA | Gold title lettering; `Layer 113` is a mask fragment. Gold conflicts with the palette, so only a re-tinted wordmark is possible. |
| `DRACULA_<country> creative.psd` | 583 MB | Country-specific creative. Not opened in the pipeline; its filename names a market, so not used. |

## Audio

There are no standalone audio files. **Every video carries a stereo AAC soundtrack.** Speech recognition
(local Whisper) over the master cuts found no voice-over. The Dracula master carries an English-language song
("Eternal Night"); Aladdin and Anastasia are instrumental. Three tracks are used: Dracula master 0–84 s,
Aladdin master 1–86 s and Anastasia promo 0–61.5 s, built by `scripts/media/music.sh`. Rights are an open
question (see README).

## Used on the site

| Asset | Source shot | Why it is safe |
|---|---|---|
| Hero plate | Aladdin master 39.84–41.40 s, a run of jumps over the blue "water" projection (client: active skating, ice-blue, full width) | face under a headdress and motion-blurred; corner bug and audience cropped; shown small in a soft window with a blurred copy around it |
| Aladdin card / page | twirl 53.72 s (cropped below the shoulders) / gold wide arena 56.38 s | no faces |
| Dracula card / page / extra | cape and legs 13.76 s (cropped low) / lone skater on the gothic street 19.36 s / red aerial silk 15.14 s | no faces, no subtitles |
| Anastasia card / page | ballroom wide 0.70 s | figures tiny |
| Alice card | key-art crop: skirt, skates, ice | no face |

## Duplicates

Many files exist 2–3 times across the two exports (`(1)` suffixes, the Alice posters copied into
the Dracula folder). The pipeline references one canonical source per asset.

## Third-party assets (not from the client materials)

| Asset | Source | License | Use |
|---|---|---|---|
| Hero skater | Built by script (`scripts/skater/`): body, eyes and skin from MakeHuman assets via MPFB 2.0.18; costume, skates, hair, crystals our own | CC0 (MakeHuman assets); ours | Posed, trimmed, meshopt and WebP: `public/models/skater.glb` (1.9 MB). Shown as a glass figure. No credit needed |
| Orchestra samples | VS Chamber Orchestra 2 CE (Versilian Studios), github.com/sgossner/VSCO-2-CE | CC0 | 90 notes across 8 instruments, pitch-verified, trimmed, normalised: `public/media/orchestra/` |
