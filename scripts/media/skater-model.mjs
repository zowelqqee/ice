#!/usr/bin/env node
// Hero skater model (built by scripts/skater/: MakeHuman CC0 body, our costume, skates and hair).
// Step 1 (Blender, headless): scripts/skater/build.sh, then scripts/skater/run.sh export_web.py
//   writes the posed, trimmed model with neutral part names (skater_web_raw.glb).
// Step 2 (this script): pruned, deduplicated, WebP textures, meshopt-compressed geometry (decoded
//   locally, no CDN), no extras, and a minimal asset block.
//
//   usage: node scripts/media/skater-model.mjs [~/ice/skater-build/out/skater_web_raw.glb]

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const src = process.argv[2] ?? join(homedir(), "ice/skater-build/out/skater_web_raw.glb");
const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = join(ROOT, "public/models/skater.glb");
mkdirSync(dirname(OUT), { recursive: true });

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });
const doc = await io.read(src);
const root = doc.getRoot();

// names are the part names the site picks materials by; anything else (or non-ASCII) is neutralised
let i = 0;
for (const prop of [...root.listNodes(), ...root.listMeshes(), ...root.listMaterials(), ...root.listTextures(), ...root.listScenes()]) {
  prop.setExtras({});
  if (!/^[a-z][a-z0-9_]*$/.test(prop.getName())) prop.setName(`${prop.propertyType.toLowerCase()}_${i++}`);
}
for (const t of root.listTextures()) t.setURI("");
root.getAsset().generator = "musical-on-ice";
root.getAsset().copyright = "Figure from MakeHuman assets (CC0); costume, skates and hair: Musical on Ice";
delete root.getAsset().extras;

console.log("meshes", root.listMeshes().length, "materials", root.listMaterials().map((m) => m.getName()).join(" "));
await doc.transform(
  prune({ keepLeaves: true }), // keep the anchor empties (spin pivot, trail points)
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: "webp", resize: [2048, 2048], quality: 86 }),
  meshopt({ encoder: MeshoptEncoder, level: "medium" }),
);
await io.write(OUT, doc);
console.log(`→ ${OUT} (${(statSync(OUT).size / 1e6).toFixed(2)} MB)`);
