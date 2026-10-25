import { useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { pedestal, type InstrumentModel } from "./instruments";
import manifest from "./models-manifest.json";
import type { Instrument } from "@/lib/audio/orchestra";

// Detailed instrument shapes from CC0 models (sources and licences: scripts/instruments/README.md).
// The files arrive ready to draw: upright, real size in metres, base on the origin, smooth normals
// (all baked by scripts/media/instruments.mjs), so the browser only unpacks them; no geometry work
// on the main thread. The flute, timpani and glockenspiel (no CC0 model exists), and any model that
// fails to load, stay code-built.

interface Spec {
  lift?: number; // raised off the floor on an ice pedestal
  radius: number; // footprint, for the light pool on the floor
}

export const MODEL_SPECS: Partial<Record<Instrument, Spec>> = {
  piano: { radius: 1.2 },
  harp: { radius: 0.6 },
  cello: { radius: 0.5 },
  violin: { lift: 0.85, radius: 0.45 },
  horn: { lift: 0.85, radius: 0.5 },
};

// the content fingerprint makes every rebuilt model a new address: never an old file from the cache
export const modelUrl = (name: string) => `/models/instruments/${name}.glb?v=${(manifest as Record<string, string>)[name] ?? "0"}`;

/** Plain float copies of the file's meshes, in metres (the file stores quantized attributes and
 *  the scale to undo them on the node). */
function meshesOf(scene: THREE.Object3D, lift: number) {
  const out: THREE.BufferGeometry[] = [];
  scene.updateMatrixWorld(true);
  const m4 = new THREE.Matrix4().makeTranslation(0, lift, 0);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = new THREE.BufferGeometry();
    const world = new THREE.Matrix4().multiplyMatrices(m4, m.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(world);
    const v = new THREE.Vector3();
    for (const k of ["position", "normal"]) {
      const a = m.geometry.getAttribute(k);
      if (!a) continue;
      const arr = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) {
        v.set(a.getX(i), a.getY(i), a.getZ(i));
        if (k === "position") v.applyMatrix4(world);
        else v.applyMatrix3(normalMatrix).normalize();
        arr[i * 3] = v.x;
        arr[i * 3 + 1] = v.y;
        arr[i * 3 + 2] = v.z;
      }
      g.setAttribute(k, new THREE.BufferAttribute(arr, 3));
    }
    if (m.geometry.index) g.setIndex(m.geometry.index);
    out.push(g);
  });
  return out;
}

/** The instrument body from its model (suspends while it loads). */
export function useModelInstrument(name: Instrument): InstrumentModel | null {
  const spec = MODEL_SPECS[name];
  const gltf = useGLTF(modelUrl(spec ? name : "piano"), false, true) as unknown as { scene: THREE.Object3D };
  return useMemo(() => {
    if (!spec) return null;
    const [ice, ...extra] = meshesOf(gltf.scene, spec.lift ?? 0);
    if (spec.lift) extra.push(pedestal(ice));
    const box = new THREE.Box3();
    for (const g of [ice, ...extra]) {
      g.computeBoundingBox();
      box.union(g.boundingBox!);
    }
    return { ice, extra, glow: null, strings: [], parts: [], height: box.max.y, radius: spec.radius };
  }, [gltf.scene, spec]);
}
