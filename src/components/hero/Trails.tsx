"use client";

import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { skaterPoints } from "./Skater";
import { spin } from "@/lib/spin";
import type { StageUniforms } from "./uniforms";

// Ribbons of light trailing the fingertips and the free blade. They lengthen and brighten with
// spin speed, so a fast spin draws rings of light around the dancer.

const vertex = /* glsl */ `
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aAge;
attribute float aSide;
uniform float uWidth;
varying float vAge;
varying float vSide;
void main() {
  vec3 t = normalize(aNext - aPrev + vec3(1e-5));
  vec3 view = normalize(cameraPosition - position);
  vec3 side = normalize(cross(t, view));
  float w = uWidth * (1.0 - aAge) * (0.35 + 0.65 * (1.0 - aAge));
  vec3 p = position + side * aSide * w;
  vAge = aAge;
  vSide = aSide;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const fragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
varying float vAge;
varying float vSide;
void main() {
  float core = 1.0 - abs(vSide);
  float a = pow(1.0 - vAge, 2.2) * (0.35 + 0.65 * core * core);
  vec3 c = mix(uColor, vec3(1.0), core * core * 0.7);
  gl_FragColor = vec4(c * a * uIntensity, 1.0);
}`;

const N = 72;

function Ribbon({ point, stage, width }: { point: THREE.Vector3; stage: StageUniforms; width: number }) {
  const { geo, mat, hist } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3);
    const prev = new Float32Array(N * 2 * 3);
    const next = new Float32Array(N * 2 * 3);
    const age = new Float32Array(N * 2);
    const side = new Float32Array(N * 2);
    const idx: number[] = [];
    for (let i = 0; i < N; i++) {
      age[i * 2] = age[i * 2 + 1] = i / (N - 1);
      side[i * 2] = -1;
      side[i * 2 + 1] = 1;
      if (i < N - 1) {
        const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aPrev", new THREE.BufferAttribute(prev, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aNext", new THREE.BufferAttribute(next, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("aAge", new THREE.BufferAttribute(age, 1));
    geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 3);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uWidth: { value: width }, uColor: { value: stage.uRimColor.value }, uIntensity: { value: 0 } },
    });
    const hist = Array.from({ length: N }, () => new THREE.Vector3());
    return { geo, mat, hist };
  }, [stage, width]);

  useFrame(() => {
    // shift history (newest first) and write the current point
    for (let i = N - 1; i > 0; i--) hist[i].copy(hist[i - 1]);
    hist[0].copy(point);
    if (hist[N - 1].lengthSq() === 0) hist.forEach((h) => h.copy(point)); // first frame
    const pos = geo.attributes.position.array as Float32Array;
    const prev = geo.attributes.aPrev.array as Float32Array;
    const next = geo.attributes.aNext.array as Float32Array;
    for (let i = 0; i < N; i++) {
      const p = hist[i], a = hist[Math.max(0, i - 1)], b = hist[Math.min(N - 1, i + 1)];
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 3;
        pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
        prev[o] = b.x; prev[o + 1] = b.y; prev[o + 2] = b.z;
        next[o] = a.x; next[o + 1] = a.y; next[o + 2] = a.z;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aPrev.needsUpdate = true;
    geo.attributes.aNext.needsUpdate = true;
    const k = Math.min(1, Math.max(0, (spin.speed - 1.4) / 7));
    mat.uniforms.uIntensity.value += (k * 1.6 - mat.uniforms.uIntensity.value) * 0.12;
  });

  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={9} />;
}

export function Trails({ stage }: { stage: StageUniforms }) {
  return (
    <>
      <Ribbon point={skaterPoints.tipL} stage={stage} width={0.012} />
      <Ribbon point={skaterPoints.tipR} stage={stage} width={0.012} />
      <Ribbon point={skaterPoints.toeF} stage={stage} width={0.009} />
    </>
  );
}
