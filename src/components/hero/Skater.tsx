"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { J, JOINT_COUNT, skaterFragment, skaterVertex } from "./shaders/skater";
import { skirtFragment, skirtVertex } from "./shaders/skirt";
import { spin } from "@/lib/spin";
import type { StageUniforms } from "./uniforms";

type V3 = [number, number, number];

// Three key poses along the spin: arms open (entry), rounded in front, overhead (fast scratch spin).
const POSE: Record<string, [V3, V3, V3]> = {
  elR: [[0.41, 1.335, 0.07], [0.33, 1.3, 0.22], [0.17, 1.665, 0.05]],
  wrR: [[0.645, 1.335, 0.12], [0.12, 1.35, 0.35], [0.055, 1.895, 0.035]],
  tipR: [[0.82, 1.34, 0.14], [0.01, 1.37, 0.43], [0.02, 2.06, 0.03]],
  elL: [[-0.41, 1.31, 0.05], [-0.33, 1.3, 0.22], [-0.17, 1.665, 0.05]],
  wrL: [[-0.645, 1.27, 0.1], [-0.12, 1.35, 0.35], [-0.055, 1.895, 0.035]],
  tipL: [[-0.82, 1.25, 0.12], [-0.01, 1.37, 0.43], [-0.02, 2.06, 0.03]],
  kneeF: [[-0.28, 0.685, -0.12], [-0.1, 0.665, 0.22], [0.028, 0.635, 0.15]],
  ankleF: [[-0.46, 0.455, -0.26], [-0.03, 0.455, 0.17], [0.05, 0.345, 0.08]],
  toeF: [[-0.53, 0.37, -0.35], [-0.02, 0.33, 0.27], [0.055, 0.2, 0.125]],
};
// palm-normal hints per pose: palms down in the open pose, toward the body when rounded,
// facing each other overhead
const PALM: Record<"L" | "R", [V3, V3, V3]> = {
  R: [[0, -1, 0.3], [0, 0, -1], [-1, 0, 0]],
  L: [[0, -1, 0.3], [0, 0, -1], [1, 0, 0]],
};

const FIXED: Partial<Record<keyof typeof J, V3>> = {
  pelvis: [0, 0.97, 0],
  waist: [0, 1.11, 0],
  chest: [0, 1.28, 0.008],
  neck: [0, 1.505, 0.0],
  head: [0, 1.635, 0.012],
  shL: [-0.15, 1.41, 0],
  shR: [0.15, 1.41, 0],
  hipS: [0.075, 0.965, 0],
  kneeS: [0.04, 0.565, 0.012],
  ankleS: [0.012, 0.168, 0],
  toeS: [0.012, 0.168, 0.15],
  hipF: [-0.075, 0.965, 0],
};

/** World positions other hero parts follow (light trails). Written by the visible dancer. */
export const skaterPoints = {
  tipL: new THREE.Vector3(),
  tipR: new THREE.Vector3(),
  toeF: new THREE.Vector3(),
};

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmp3 = new THREE.Vector3();

function ease(t: number) {
  return t * t * (3 - 2 * t);
}
function lerp3([a, b, c]: [V3, V3, V3], t: number, out: THREE.Vector3) {
  const s = ease(t);
  const [p, q, k] = s < 0.5 ? [a, b, s * 2] : [b, c, (s - 0.5) * 2];
  return out.set(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k);
}

/** Orthonormal frame: columns (side, along, normal). */
function frame(along: THREE.Vector3, hint: THREE.Vector3, out: THREE.Matrix3) {
  const y = along.clone().normalize();
  const z = hint.clone().sub(y.clone().multiplyScalar(hint.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return out.set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z);
}
/** Foot frame: columns (side, up the shin, toward the toe). */
function footFrame(ankle: THREE.Vector3, toe: THREE.Vector3, knee: THREE.Vector3, out: THREE.Matrix3) {
  const z = toe.clone().sub(ankle).normalize();
  const shin = knee.clone().sub(ankle).normalize();
  const y = shin.sub(z.clone().multiplyScalar(shin.dot(z))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return out.set(x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z);
}

function skirtGeometry(segU: number, segV: number) {
  const g = new THREE.PlaneGeometry(1, 1, segU, segV);
  // remap plane uv so v runs waist(0) -> hem(1); positions are rebuilt in the vertex shader
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 0.9);
  return g;
}

const proxyGeo = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 48, 1, false);
  g.translate(0, 0.5, 0);
  return g;
})();

export function Skater({ stage, steps, mirror = false }: { stage: StageUniforms; steps: number; mirror?: boolean }) {
  const bodyMat = useMemo(() => {
    const joints = Array.from({ length: JOINT_COUNT }, () => new THREE.Vector3());
    return new THREE.ShaderMaterial({
      vertexShader: skaterVertex,
      fragmentShader: skaterFragment,
      transparent: mirror,
      depthWrite: !mirror,
      uniforms: {
        ...stage,
        uJ: { value: joints },
        uHandL: { value: new THREE.Matrix3() },
        uHandR: { value: new THREE.Matrix3() },
        uFootS: { value: new THREE.Matrix3() },
        uFootF: { value: new THREE.Matrix3() },
        uAngle: { value: 0 },
        uMirror: { value: mirror ? 1 : 0 },
        uDetail: { value: mirror ? 0 : 1 },
        uSpan: { value: 3 },
        uSteps: { value: mirror ? Math.round(steps * 0.45) : steps },
      },
    });
  }, [stage, steps, mirror]);

  const skirtMats = useMemo(
    () =>
      [0, 1, 2].map(
        (layer) =>
          new THREE.ShaderMaterial({
            vertexShader: skirtVertex,
            fragmentShader: skirtFragment,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            uniforms: {
              ...stage,
              uFlare: { value: 0 },
              uLag: { value: 0 },
              uLayer: { value: layer },
              uMirror: { value: mirror ? 1 : 0 },
            },
          }),
      ),
    [stage, mirror],
  );

  const skirtGeo = useMemo(() => skirtGeometry(mirror ? 96 : 220, mirror ? 20 : 40), [mirror]);
  const skirtGroup = useRef<THREE.Group>(null);
  const proxy = useRef<THREE.Mesh>(null);
  const lag = useRef(0);
  const flare = useRef(0);

  useFrame((_, dt) => {
    const u = bodyMat.uniforms;
    const jt = u.uJ.value as THREE.Vector3[];
    for (const [k, v] of Object.entries(FIXED)) jt[J[k as keyof typeof J]].set(v[0], v[1], v[2]);
    for (const k of Object.keys(POSE)) lerp3(POSE[k], spin.tuck, jt[J[k as keyof typeof J]]);

    // breathing and a slight lean back when spinning hard
    const breathe = Math.sin(performance.now() * 0.0011) * 0.004;
    const lean = spin.tuck * 0.03;
    for (const k of ["chest", "neck", "head", "shL", "shR"] as const) {
      const j = jt[J[k]];
      const h = j.y - 0.97;
      j.y += breathe * (h / 0.6);
      j.z -= lean * (h / 0.65);
    }
    tmp.set(0, breathe, -lean * 0.65);
    for (const k of ["elL", "wrL", "tipL", "elR", "wrR", "tipR"] as const) jt[J[k]].add(tmp);

    // hand and foot frames
    frame(tmp.copy(jt[J.tipL]).sub(jt[J.wrL]), lerp3(PALM.L, spin.tuck, tmp2), u.uHandL.value);
    frame(tmp.copy(jt[J.tipR]).sub(jt[J.wrR]), lerp3(PALM.R, spin.tuck, tmp2), u.uHandR.value);
    footFrame(jt[J.ankleS], jt[J.toeS], jt[J.kneeS], u.uFootS.value);
    footFrame(jt[J.ankleF], jt[J.toeF], jt[J.kneeF], u.uFootF.value);

    // proxy cylinder fitted to the pose (no pixels are marched outside the dancer's reach)
    let R = 0.3;
    let H = 0;
    for (const j of jt) {
      R = Math.max(R, Math.hypot(j.x, j.z));
      H = Math.max(H, j.y);
    }
    R += 0.2;
    H += 0.1;
    proxy.current?.scale.set(R, H, R);
    u.uSpan.value = Math.hypot(2 * R, H) + 0.1;

    const angle = stage.uAngle.value;
    u.uAngle.value = angle;

    if (!mirror) {
      const c = Math.cos(angle), s = Math.sin(angle);
      const world = (v: THREE.Vector3, out: THREE.Vector3) => out.set(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
      // fingertips: wrist + 0.16 m along the hand
      world(tmp3.copy(jt[J.tipL]).sub(jt[J.wrL]).normalize().multiplyScalar(0.16).add(jt[J.wrL]), skaterPoints.tipL);
      world(tmp3.copy(jt[J.tipR]).sub(jt[J.wrR]).normalize().multiplyScalar(0.16).add(jt[J.wrR]), skaterPoints.tipR);
      world(tmp3.copy(jt[J.toeF]).sub(jt[J.ankleF]).normalize().multiplyScalar(0.17).add(jt[J.ankleF]), skaterPoints.toeF);
    }

    // skirt follows speed; the hem trails the turn
    const targetFlare = Math.min(1, Math.max(0, (spin.speed - 0.8) / 10));
    flare.current += (targetFlare - flare.current) * (1 - Math.exp(-dt * 3.5));
    const targetLag = Math.min(1.4, spin.speed * 0.09);
    lag.current += (targetLag - lag.current) * (1 - Math.exp(-dt * 3));
    for (const m of skirtMats) {
      m.uniforms.uFlare.value = flare.current;
      m.uniforms.uLag.value = lag.current;
    }
    if (skirtGroup.current) skirtGroup.current.rotation.y = angle;
  });

  return (
    <group scale={mirror ? [1, -1, 1] : [1, 1, 1]}>
      <mesh ref={proxy} geometry={proxyGeo} material={bodyMat} renderOrder={mirror ? 1 : 3} frustumCulled={false} />
      <group ref={skirtGroup}>
        {/* inner layer first: the sheer layers stack without depth writes */}
        {[2, 1, 0].map((layer, i) => (
          <mesh key={layer} geometry={skirtGeo} material={skirtMats[layer]} renderOrder={(mirror ? 2 : 4) + i * 0.1} frustumCulled={false} />
        ))}
      </group>
    </group>
  );
}
