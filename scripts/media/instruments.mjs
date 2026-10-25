// Ice orchestra models, step 2: the GLBs from scripts/instruments/prepare.py (geometry only) →
// public/models/instruments/<name>.glb, welded, pruned, meshopt-compressed (decoded in the browser
// by three's MeshoptDecoder), with a neutral asset block and no extras.
//   node scripts/media/instruments.mjs [build-dir]   (default ~/ice/instruments-build)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, weld, meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const SRC = process.argv[2] ?? join(homedir(), "ice/instruments-build");
const OUT = join(ROOT, "public/models/instruments");
mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

for (const f of readdirSync(SRC).filter((f) => f.endsWith(".glb"))) {
  const doc = await io.read(join(SRC, f));
  const root = doc.getRoot();
  root.getAsset().generator = "musical-on-ice";
  delete root.getAsset().copyright;
  for (const n of root.listNodes()) { n.setName("ice"); n.setExtras({}); }
  for (const m of root.listMeshes()) { m.setName("ice"); m.setExtras({}); }
  root.setExtras({});
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  await io.write(join(OUT, f), doc);
  console.log(`${f}: ${(statSync(join(SRC, f)).size / 1024).toFixed(0)} KB → ${(statSync(join(OUT, f)).size / 1024).toFixed(0)} KB`);
}
