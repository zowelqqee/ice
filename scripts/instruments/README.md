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
2. For each, run headless Blender with scripts disabled (a .blend can carry code):

   ```bash
   B=/Applications/Blender.app/Contents/MacOS/Blender
   $B -b --factory-startup --disable-autoexec --python scripts/instruments/prepare.py -- piano_0.blend ~/ice/instruments-build/piano.glb 40000 "Text,Plane"
   $B -b --factory-startup --disable-autoexec --python scripts/instruments/prepare.py -- celloOld.blend ~/ice/instruments-build/cello.glb 40000
   $B -b --factory-startup --disable-autoexec --python scripts/instruments/prepare.py -- harp.stl ~/ice/instruments-build/harp.glb 60000
   $B -b --factory-startup --disable-autoexec --python scripts/instruments/prepare.py -- violin-full.stl ~/ice/instruments-build/violin.glb 50000
   $B -b --factory-startup --disable-autoexec --python scripts/instruments/prepare.py -- violin-bow.stl ~/ice/instruments-build/bow.glb 6000
   $B -b --factory-startup --disable-autoexec --python scripts/instruments/prepare.py -- French_Horn_Blendswap.stl ~/ice/instruments-build/horn.glb 40000
   ```
3. `node scripts/media/instruments.mjs` → `public/models/instruments/*.glb` (meshopt, no metadata).
4. Orientation, size and pedestals per instrument: `MODEL_SPECS` in `src/components/music/models.ts`.
