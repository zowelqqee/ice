# Ice orchestra models

Five instruments of the ice orchestra are shaped from free 3D models released into the public
domain (CC0 / "Creative Commons — Public Domain"): no attribution is required, and none is shown on
the site. The licence was checked on each model's own page before download (October 2026).

| Instrument | Source | Author | Licence on the page |
|---|---|---|---|
| Grand piano | [OpenGameArt: 3D Piano Model](https://opengameart.org/content/3d-piano-model) (`piano_0.blend`; its floor plane and a text label are dropped) | pickentcode | CC0 |
| Concert harp | [Printables: Harp](https://www.printables.com/model/456824-harp) (`harp.stl`) | Lars Zon | Creative Commons — Public Domain |
| Violin + bow | [Printables: Violin](https://www.printables.com/model/447457-violin) (`violin-full.stl`, `violin-bow.stl`; BlendSwap original by Bey, CC0) | Bey / uploaded by Books | Creative Commons — Public Domain |
| Cello + bow | [OpenGameArt: Cello and Bow](https://opengameart.org/content/cello-and-bow) (`celloOld.blend`) | MNDV.ecb | CC0 (also offered as CC-BY 4.0 / GPL 3.0; CC0 is used) |
| French horn | [Printables: French Horn](https://www.printables.com/model/447474-french-horn) (`French_Horn_Blendswap.stl`; BlendSwap original by GuillaumeCote, CC0) | GuillaumeCote / uploaded by Books | Creative Commons — Public Domain |

No CC0 model exists for the flute, timpani and glockenspiel; those stay code-built
(`src/components/music/instruments.ts`), as does any instrument whose model fails to load.

## Rebuilding

1. Download the source files above (no account needed) into a folder outside the repo.
2. For each, run headless Blender with scripts disabled (a .blend can carry code); the last numbers
   are triangle budgets, small on purpose (the instruments are seen from across the stage):

   ```bash
   B=/Applications/Blender.app/Contents/MacOS/Blender
   P="$B -b --factory-startup --disable-autoexec --python scripts/instruments/prepare.py --"
   $P piano_0.blend ~/ice/instruments-build/piano.glb 10000 "Text,Plane"
   $P celloOld.blend ~/ice/instruments-build/cello.glb 6000
   $P harp.stl ~/ice/instruments-build/harp.glb 12000
   $P violin-full.stl ~/ice/instruments-build/violin.glb 7000
   $P violin-bow.stl ~/ice/instruments-build/bow.glb 1200
   $P French_Horn_Blendswap.stl ~/ice/instruments-build/horn.glb 9000
   ```
3. `node scripts/media/instruments.mjs` → `public/models/instruments/*.glb`: turned upright, scaled
   to real size and set on the origin (`SPECS` there; the bow goes into the violin file), meshopt,
   no metadata. About 330 KB for the five; the browser only unpacks them.
4. Pedestals and floor pools per instrument: `MODEL_SPECS` in `src/components/music/models.ts`.
