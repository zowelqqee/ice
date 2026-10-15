"use client";

// The hero dancer as a sculpted model: "Ballerina" by LollyPoly (sketchfab.com, CC BY 4.0), a
// ballerina en pointe in a high arabesque, pleated tutu. She spins on her pointe on the ice.
// Her sculpted detail is kept; the lighting is the site's contre-jour (crisp double rim from
// behind, no front light on the upper body, so the face stays in shadow), with crystal glints
// on the tutu.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { skaterPoints } from "./Skater";
import type { StageUniforms } from "./uniforms";

export const SKATER_MODEL = "/models/skater.glb";
const HEIGHT = 1.82; // pointe to raised foot (m); head top lands near 1.75 m
const MODEL_YAW = Math.PI; // turn her to face the audience at the start pose

/** Contre-jour shading injected into a standard material. */
function contreJour(stage: StageUniforms, extra: Record<string, { value: unknown }>, mirror: boolean) {
  const m = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.45, metalness: 0, side: THREE.DoubleSide });
  if (mirror) {
    m.transparent = true;
    m.depthWrite = false;
  }
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, extra, { uRimColor: stage.uRimColor, uRim: stage.uRim, uGlitter: stage.uGlitter });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWorldP;\nvarying vec3 vLocalP;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLocalP = transformed;",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vWorldP;
varying vec3 vLocalP;
uniform vec3 uL1; uniform vec3 uL2; uniform vec3 uS;   // view-space light directions
uniform vec3 uRimColor; uniform float uRim; uniform float uGlitter; uniform float uMirrorPass;
uniform float uScale; uniform vec2 uTutu;               // tutu height band (m)
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
  vec3 N = normalize(normal);
  vec3 V = normalize(vViewPosition);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 1.0 - ndv;
  float rim1 = pow(fres, 3.0) * clamp(dot(N, uL1) * 1.3 + 0.3, 0.0, 1.0);
  float rim2 = pow(fres, 4.0) * clamp(dot(N, uL2) * 1.3 + 0.2, 0.0, 1.0);
  float edge = smoothstep(0.8, 0.975, fres) * clamp(dot(N, uL1) + 0.4, 0.0, 1.0);
  float kick = pow(fres, 5.0) * clamp(dot(N, uS), 0.0, 1.0) * 0.4;
  float y = abs(vWorldP.y);
  // front fill only on the legs and tutu: the upper body (and face) stays a silhouette
  float fillMask = 1.0 - smoothstep(1.05, 1.15, y);
  vec3 H = normalize(uL1 + V);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), 60.0) * 0.5;
  vec3 col = vec3(0.008, 0.011, 0.02) + vec3(0.012, 0.022, 0.04) * ndv * ndv * fillMask;
  col += uRimColor * (rim1 * uRim + kick);
  col += vec3(0.75, 0.85, 1.0) * rim2 * 1.05;
  col += mix(uRimColor, vec3(1.0), 0.6) * edge * 0.55;
  col += vec3(0.9, 0.97, 1.0) * spec;
  // crystals on the tutu and bodice: tiny tilted mirrors that flicker as she turns
  float band = smoothstep(uTutu.x - 0.03, uTutu.x, y) * (1.0 - smoothstep(uTutu.y, uTutu.y + 0.03, y));
  vec3 cell = floor(vLocalP * uScale * 420.0);
  float hs = h13(cell);
  vec3 jit = vec3(h13(cell + 7.1), h13(cell + 3.7), h13(cell + 1.3)) - 0.5;
  vec3 fn = normalize(N + jit * 0.9);
  float g = pow(clamp(dot(reflect(-uL1, fn), V), 0.0, 1.0), 90.0) + 0.7 * pow(clamp(dot(reflect(-uL2, fn), V), 0.0, 1.0), 90.0);
  col += vec3(1.0, 1.05, 1.1) * g * step(0.88, hs) * band * uGlitter * 5.0;
  outgoingLight = col;
  if (uMirrorPass > 0.5) diffuseColor.a *= 0.5 * exp(-y * 1.15);
}
#include <opaque_fragment>`,
      );
  };
  return m;
}

interface Fit {
  scale: number;
  cellScale: number; // mesh-local units → metres (meshopt quantization puts a scale on the node)
  offset: THREE.Vector3; // places the pointe on the spin axis, on the ice
  anchors: THREE.Vector3[]; // raised foot, hand, hand (model space, scaled and offset)
  tutu: [number, number];
}

function fitModel(scene: THREE.Object3D): Fit {
  scene.updateMatrixWorld(true);
  const pts: THREE.Vector3[] = [];
  const v = new THREE.Vector3();
  let meshScale = 1;
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshScale = mesh.matrixWorld.getMaxScaleOnAxis();
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 2) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld).clone());
  });
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const scale = HEIGHT / (maxY - minY);
  // the pointe: average of the lowest few millimetres
  const low = pts.filter((p) => p.y < minY + (maxY - minY) * 0.004);
  const toe = low.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(low.length);
  const offset = new THREE.Vector3(-toe.x * scale, 0.004 - minY * scale, -toe.z * scale);
  const world = (p: THREE.Vector3) => p.clone().multiplyScalar(scale).add(offset);
  // trail anchors: raised foot (highest point) and the two hands (farthest out in the upper body)
  const top = pts.reduce((a, p) => (p.y > a.y ? p : a), pts[0]);
  const upper = pts.map(world).filter((p) => p.y > 1.0 && p.y < 1.75);
  const dist = (p: THREE.Vector3) => Math.hypot(p.x, p.z);
  const handA = upper.reduce((a, p) => (dist(p) > dist(a) ? p : a), upper[0]);
  const handB = upper.filter((p) => p.distanceTo(handA) > 0.35).reduce((a, p) => (dist(p) > dist(a) ? p : a), upper[0]);
  // tutu band: the widest slice of the figure between 0.8 m and 1.3 m
  let best = 0, bestY = 1.0;
  for (let y = 0.8; y < 1.3; y += 0.02) {
    const slice = pts.map(world).filter((p) => Math.abs(p.y - y) < 0.01);
    const w = slice.reduce((m, p) => Math.max(m, dist(p)), 0);
    if (w > best) {
      best = w;
      bestY = y;
    }
  }
  return { scale, cellScale: meshScale * scale, offset, anchors: [world(top), handA, handB], tutu: [bestY - 0.12, bestY + 0.1] };
}

export function SkaterModel({ stage, mirror = false }: { stage: StageUniforms; mirror?: boolean }) {
  const gltf = useGLTF(SKATER_MODEL, false, true);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const fit = useMemo(() => fitModel(scene), [scene]);
  const extra = useMemo(
    () => ({
      uL1: { value: new THREE.Vector3() },
      uL2: { value: new THREE.Vector3() },
      uS: { value: new THREE.Vector3() },
      uMirrorPass: { value: mirror ? 1 : 0 },
      uScale: { value: fit.cellScale },
      uTutu: { value: new THREE.Vector2(...fit.tutu) },
    }),
    [mirror, fit],
  );
  useMemo(() => {
    const mat = contreJour(stage, extra, mirror);
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = mat;
      mesh.frustumCulled = false;
      mesh.renderOrder = mirror ? 1 : 3;
    });
  }, [scene, stage, extra, mirror]);

  const figure = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const center = useMemo(() => new THREE.Vector3(0, 1.1, 0), []);

  useFrame((state) => {
    const f = figure.current;
    if (!f) return;
    f.rotation.y = stage.uAngle.value + MODEL_YAW;
    const view = state.camera.matrixWorldInverse;
    extra.uL1.value.copy(stage.uLightPos.value).sub(center).normalize().transformDirection(view);
    extra.uL2.value.set(3.2, 2.4, -2.6).sub(center).normalize().transformDirection(view);
    extra.uS.value.copy(stage.uSidePos.value).sub(center).normalize().transformDirection(view);
    if (!mirror) {
      f.updateMatrixWorld();
      skaterPoints.toeF.copy(tmp.copy(fit.anchors[0]).applyMatrix4(f.matrixWorld));
      skaterPoints.tipL.copy(tmp.copy(fit.anchors[1]).applyMatrix4(f.matrixWorld));
      skaterPoints.tipR.copy(tmp.copy(fit.anchors[2]).applyMatrix4(f.matrixWorld));
    }
  });

  return (
    <group scale={mirror ? [1, -1, 1] : [1, 1, 1]}>
      <group ref={figure}>
        <group position={fit.offset} scale={fit.scale}>
          <primitive object={scene} />
        </group>
      </group>
    </group>
  );
}
