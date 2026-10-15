#!/usr/bin/env node
// Hero dancer model: "Ballerina" by LollyPoly (sketchfab.com, CC BY 4.0).
// Step 1 (Blender, headless): scripts/media/skater-prep.py removes the music-box base, bakes the
//   transforms, drops the stray UV sets, welds and smooth-shades with a 40° crease angle.
// Step 2 (this script): pruned, deduplicated, meshopt-compressed geometry (decoded locally, no CDN),
//   neutral names, no extras, and an asset block carrying only the required CC BY credit.
//
//   usage: node scripts/media/skater-model.mjs <figure.glb from step 1>

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, resample, textureCompress, meshopt, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

const src = process.argv[2];
if (!src) throw new Error("usage: skater-model.mjs <scene.gltf>");
const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = join(ROOT, "public/models/skater.glb");
mkdirSync(dirname(OUT), { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();

// report what came in (bones, meshes, textures) so posing code can be matched to the rig
const skins = root.listSkins();
console.log("meshes", root.listMeshes().length, "skins", skins.length, "joints", skins[0]?.listJoints().length ?? 0, "textures", root.listTextures().length, "animations", root.listAnimations().length);
console.log("joints:", (skins[0]?.listJoints() ?? []).map((j) => j.getName()).join(" "));

// neutral names and no extras anywhere
let i = 0;
for (const prop of [...root.listNodes(), ...root.listMeshes(), ...root.listMaterials(), ...root.listTextures(), ...root.listAnimations(), ...root.listScenes()]) {
  prop.setExtras({});
  const n = prop.getName();
  // keep bone names (needed for posing) when they are plain ASCII; rename everything else
  const isJoint = skins.some((s) => s.listJoints().includes(prop));
  if (!isJoint || /[^\x20-\x7E]/.test(n)) prop.setName(isJoint ? `joint_${i++}` : `${prop.propertyType.toLowerCase()}_${i++}`);
}
for (const t of root.listTextures()) t.setURI("");
root.getAsset().generator = "musical-on-ice";
root.getAsset().copyright = '"Ballerina" by LollyPoly, CC BY 4.0 (sketchfab.com)';
delete root.getAsset().extras;

await doc.transform(
  prune(),
  dedup(),
  weld(),
  resample(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [2048, 2048], quality: 88 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(OUT, doc);
console.log(`→ ${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB)`);
