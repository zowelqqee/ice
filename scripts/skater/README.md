# Skater model

A figure skater in the pose from the reference sheet: standing on the left skate, right leg in passé, arms rounded overhead with crossed wrists. She wears a navy velvet dress with a sheer illusion yoke and sleeves, an open back, frost-vein crystals, and a two-layer chiffon skirt.

Everything is built by script in headless Blender 5.2. No step needs a hand edit.

## Sources and licences

| Part | Source | Licence |
|---|---|---|
| Body, eyes, brows, lashes, teeth, skin texture | MakeHuman assets via MPFB 2.0.18: `makehuman_system_assets`, `skins01` (toigo bronze skin), `eyebrows01`, `eyelashes01` | CC0 |
| Rig | MPFB "game engine" skeleton | CC0 (MPFB output) |
| Costume, skates, hair, crystals | built here (`costume.py`, `skates.py`, `hair.py`, `sparkle.py`) | ours |

MPFB itself is GPL. It is only the tool and is not shipped; the assets it outputs are CC0, so no credit is needed on the site.

MPFB and the asset packs live outside the repo, in `~/ice/tools/blender-user`. `run.sh` points Blender there, so the user's own Blender profile is untouched.

## Build

```bash
scripts/skater/build.sh            # body → costume → skates → hair → sparkle → pose
scripts/skater/build.sh costume    # restart from a step
scripts/skater/run.sh render_sheet.py [--quick] && python3 scripts/skater/compose_sheet.py
```

Outputs go to `~/ice/skater-build/out` (`posed.blend`, `skater_sheet.jpg`, …).

## How it works

- **Body** (`build_body.py`). MakeHuman phenotype: young woman, slim, athletic, long arms and neck. Face targets are tuned, and the shape is baked into the mesh before dressing.
- **Costume** (`costume.py`). One fabric shell with the body's exact topology, offset 1.4–2.2 mm. Two signed-distance attributes cut it with smooth edges:
  - `cover`: scoop neck, open-back V, leg line, wrists
  - `opaque`: velvet bodice with the deep front V; the rest of the covered area is sheer mesh

  Further shell details:
  - The velvet rises in petals toward the shoulders.
  - A sheer band runs along the open-back V.
  - Because the shell has the body's topology, corrective smoothing (which fixes creases from the raised arms) moves skin and fabric identically.

  The skirt is three procedural flared chiffon layers (navy, navy, lavender) with lettuce-edge ruffles and a thin rolled hem. It is bound to the pelvis; a shrinkwrap keeps it outside the raised thigh.
- **Skates** (`skates.py`):
  - Boot: voxel remesh of the lower leg plus a toe hull, offset for the leather. It has a collar, tongue tab, eyelets, hooks and laces.
  - Tan leather sole and heel, plus stitched seams (welt, toe cap, heel counter).
  - Blade: rocker, toe pick and stanchions.

  The heel stack tips the blade by `beta`; the pose lifts the heel by the same angle, so the blade sits flat on the ice.
- **Hair** (`hair.py`). About 27k strands as Blender hair curves, in clumps. They are combed from a soft hairline back over the ear into a slightly untidy twisted bun, over a scalp cap that fades out at the hairline. On top of that:
  - baby hairs along the hairline and flyaways at the nape and bun;
  - the reference's loose face-framing strands, hung under gravity in the final pose and draped around cheek and jaw.

  Everything is parented to the head bone.
- **Sparkle** (`sparkle.py`):
  - Frost veins grown like leaf venation from the V edges, set with crystals.
  - Crystal trims along the neckline and both edges of the back band (zero lines of `cover` and `opaque`, found by marching triangles) and along the waist seam.
  - Scattered crystals over velvet and mesh.
  - Shader glitter (tilted micro-mirrors) mixed into velvet, mesh and chiffon.
- **Stage** (`render_sheet.py`, `turntable.py`, `closeups.py`). Ice floor with skate tracings, a light rig that turns with the camera, and ice spray at the supporting blade. These are presentation only, not part of the model.
- **Pose** (`pose.py`). Bones are aimed directly with an analytic two-bone IK, then the figure is raised onto the blades.

## Still to do for the site

1. Export: apply modifiers, drop the transparent part of the shell, turn hair into cards, bake the fabric masks and glitter into textures, decimate, and run the GLB through `skater-model.mjs`.
2. Re-render the hero poster.
3. Credit: none is needed (CC0).
