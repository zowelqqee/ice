import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { merge, pedestal, type InstrumentModel } from "./instruments";
import type { Instrument } from "@/lib/audio/orchestra";

// Detailed instrument shapes from CC0 models (sources and licences: scripts/instruments/README.md),
// prepared by scripts/instruments/prepare.py + scripts/media/instruments.mjs. Each is turned upright,
// scaled to its real size in metres and set on the floor (or on an ice pedestal). The flute, timpani
// and glockenspiel (no CC0 model exists) and any model that fails to load stay code-built.

interface Spec {
  files: string[]; // GLBs in /models/instruments, merged into one body
  rot: [number, number, number]; // Euler XYZ (radians) that stands the model up, front toward +z
  height?: number; // target height in metres (or…)
  length?: number; // …target longest horizontal size
  lift?: number; // raise it off the floor (and add an ice pedestal under it)
  radius: number; // footprint, for the light pool on the floor
}

const D = Math.PI / 180;
export const MODEL_SPECS: Partial<Record<Instrument, Spec>> = {
  piano: { files: ["piano"], rot: [0, 0, 0], length: 1.95, radius: 1.2 },
  harp: { files: ["harp"], rot: [90 * D, 0, 0], height: 1.75, radius: 0.6 },
  cello: { files: ["cello"], rot: [0, 0, 90 * D], height: 1.25, radius: 0.5 },
  violin: { files: ["violin", "bow"], rot: [-90 * D, 0, 0], height: 0.75, lift: 0.85, radius: 0.45 },
  horn: { files: ["horn"], rot: [0, 0, 0], length: 0.62, lift: 0.85, radius: 0.5 },
};

export const modelUrl = (f: string) => `/models/instruments/${f}.glb`;

function geometryOf(scene: THREE.Object3D) {
  const parts: THREE.BufferGeometry[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // the files store quantized (integer) attributes; work in plain floats
    const g = new THREE.BufferGeometry();
    for (const k of ["position", "normal"]) {
      const a = m.geometry.getAttribute(k);
      if (!a) continue;
      const arr = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) {
        arr[i * 3] = a.getX(i);
        arr[i * 3 + 1] = a.getY(i);
        arr[i * 3 + 2] = a.getZ(i);
      }
      g.setAttribute(k, new THREE.BufferAttribute(arr, 3));
    }
    if (m.geometry.index) g.setIndex(Array.from(m.geometry.index.array));
    g.applyMatrix4(m.matrixWorld);
    parts.push(g);
  });
  return parts;
}

/** The instrument body from its models (suspends while they load). */
export function useModelInstrument(name: Instrument): InstrumentModel | null {
  const spec = MODEL_SPECS[name];
  const gltfs = useGLTF(spec ? spec.files.map(modelUrl) : [], false, true) as unknown as { scene: THREE.Object3D }[];
  if (!spec) return null;
  let geo = merge(gltfs.flatMap((g) => geometryOf(g.scene)));
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...spec.rot)));
  geo.computeBoundingBox();
  let b = geo.boundingBox!;
  const size = b.getSize(new THREE.Vector3());
  const s = spec.height ? spec.height / size.y : spec.length! / Math.max(size.x, size.z);
  const c = b.getCenter(new THREE.Vector3());
  geo.translate(-c.x, -b.min.y, -c.z);
  geo.scale(s, s, s);
  if (spec.lift) geo.translate(0, spec.lift, 0);
  geo = mergeVertices(geo, 1e-5);
  geo.computeVertexNormals();
  const ice = spec.lift ? merge([geo, pedestal(geo)]) : geo;
  ice.computeBoundingBox();
  b = ice.boundingBox!;
  return { ice, glow: null, strings: [], parts: [], height: b.max.y, radius: spec.radius };
}
