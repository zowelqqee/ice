// Ice orchestra models, step 2: the GLBs from scripts/instruments/prepare.py (geometry only) →
// public/models/instruments/<name>.glb, ready to draw: turned upright, scaled to real size in metres,
// base centred on the origin (all baked in, so the browser does no geometry work), welded, pruned,
// meshopt-compressed (decoded by three's MeshoptDecoder), neutral asset block, no extras.
//   node scripts/media/instruments.mjs [build-dir]   (default ~/ice/instruments-build)
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, getBounds, meshopt, prune, transformMesh, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("../..", import.meta.url).pathname;
const SRC = process.argv[2] ?? join(homedir(), "ice/instruments-build");
const OUT = join(ROOT, "public/models/instruments");

// rot: Euler XYZ in degrees (glTF Y-up) that stands the model up; then height or longest horizontal
// length in metres. Files listed together share one transform (the violin and its bow).
const SPECS = {
  piano: { files: ["piano"], rot: [0, 0, 0], length: 1.95 },
  harp: { files: ["harp"], rot: [90, 0, 0], height: 1.75 },
  cello: { files: ["cello"], rot: [0, 0, 90], height: 1.25 },
  violin: { files: ["violin", "bow"], rot: [-90, 0, 0], height: 0.75 },
  horn: { files: ["horn"], rot: [0, 0, 0], length: 0.62 },
};

mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder });

const rad = Math.PI / 180;
function rotation([x, y, z]) {
  // column-major 4x4 for R = Rz * Ry * Rx (three.js Euler "XYZ")
  const [a, b, c, d, e, f] = [Math.cos(x * rad), Math.sin(x * rad), Math.cos(y * rad), Math.sin(y * rad), Math.cos(z * rad), Math.sin(z * rad)];
  return [
    c * e, c * f, -d, 0,
    e * d * b - a * f, f * d * b + a * e, c * b, 0,
    e * d * a + b * f, f * d * a - b * e, c * a, 0,
    0, 0, 0, 1,
  ];
}

// content fingerprints: the page asks for <name>.glb?v=<hash>, so a rebuilt file is never served
// from a browser's cache of the old one (model files are cached for a day)
const manifest = {};
for (const [name, spec] of Object.entries(SPECS)) {
  // gather the spec's files into one document, one node per mesh
  const doc = new Document();
  const scene = doc.createScene();
  doc.createBuffer();
  for (const f of spec.files) {
    const src = await io.read(join(SRC, `${f}.glb`));
    for (const node of src.getRoot().listNodes()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const m = doc.createMesh("ice");
      for (const p of mesh.listPrimitives()) {
        const prim = doc.createPrimitive();
        for (const sem of ["POSITION", "NORMAL"]) {
          const a = p.getAttribute(sem);
          if (a) prim.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(doc.getRoot().listBuffers()[0]));
        }
        const idx = p.getIndices();
        if (idx) prim.setIndices(doc.createAccessor().setType("SCALAR").setArray(idx.getArray().slice()).setBuffer(doc.getRoot().listBuffers()[0]));
        m.addPrimitive(prim);
      }
      transformMesh(m, node.getWorldMatrix());
      scene.addChild(doc.createNode("ice").setMesh(m));
    }
  }
  const meshes = doc.getRoot().listMeshes();
  for (const m of meshes) transformMesh(m, rotation(spec.rot));
  const { min, max } = getBounds(scene);
  const s = spec.height ? spec.height / (max[1] - min[1]) : spec.length / Math.max(max[0] - min[0], max[2] - min[2]);
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  const fit = [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, -cx * s, -min[1] * s, -cz * s, 1];
  for (const m of meshes) transformMesh(m, fit);

  const root = doc.getRoot();
  root.getAsset().generator = "musical-on-ice";
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  await io.write(join(OUT, `${name}.glb`), doc);
  const tris = meshes.reduce((t, m) => t + m.listPrimitives().reduce((u, p) => u + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
  manifest[name] = createHash("sha256").update(readFileSync(join(OUT, `${name}.glb`))).digest("hex").slice(0, 12);
  console.log(`${name}.glb: ${Math.round(tris)} tris, ${(statSync(join(OUT, `${name}.glb`)).size / 1024).toFixed(0)} KB`);
}
writeFileSync(join(ROOT, "src/components/music/models-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
