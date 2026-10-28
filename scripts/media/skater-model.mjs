#!/usr/bin/env node
// Hero skater model (built by scripts/skater/: MakeHuman CC0 body, our costume, skates and hair).
// Step 1 (Blender, headless): scripts/skater/build.sh, then scripts/skater/run.sh export_web.py
//   writes the posed, trimmed model with neutral part names (skater_web_raw.glb).
// Step 2 (this script): only what the site draws (no textures or UVs: every part is redrawn in
//   glass; no brows, lashes or sheer), deduplicated, meshopt-compressed geometry with 8-bit
//   octahedral normals (decoded locally, no CDN), no extras, and a minimal asset block.
//
//   usage: node scripts/media/skater-model.mjs [~/ice/skater-build/out/skater_web_raw.glb]

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
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
// the site redraws every part in glass: no textures, no UVs, and not the parts it never shows
const UNSHOWN = new Set(["brows", "lashes", "sheer"]);
for (const n of root.listNodes()) if (UNSHOWN.has(n.getMesh()?.getName() ?? "")) n.dispose();
for (const t of root.listTextures()) t.dispose();
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setAttribute("TEXCOORD_0", null);
root.getAsset().generator = "musical-on-ice";
root.getAsset().copyright = "Figure from MakeHuman assets (CC0); costume, skates and hair: Musical on Ice";
delete root.getAsset().extras;

console.log("meshes", root.listMeshes().length, "materials", root.listMaterials().map((m) => m.getName()).join(" "));
await doc.transform(
  prune({ keepLeaves: true }), // keep the anchor empties (spin pivot, trail points)
  dedup(),
  meshopt({ encoder: MeshoptEncoder, level: "high" }),
);
await io.write(OUT, doc);
console.log(`→ ${OUT} (${(statSync(OUT).size / 1e6).toFixed(2)} MB)`);
