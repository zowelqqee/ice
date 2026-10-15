import * as THREE from "three";

export interface IceUniforms {
  uCrack: { value: number }; // 0..1 how far the light-cracks have spread
  uOrigin: { value: THREE.Vector3 }; // local point where the crack started
  uLevel: { value: number }; // band loudness 0..1
  uActive: { value: number }; // 0..1 awake
  uTime: { value: number };
}

/**
 * Clear ice (physical transmission) with veins of light that crack outward from where the
 * instrument was touched, then breathe with its layer of the music.
 */
export function createIceMaterial(cheap: boolean) {
  const uniforms: IceUniforms = {
    uCrack: { value: 0 },
    uOrigin: { value: new THREE.Vector3() },
    uLevel: { value: 0 },
    uActive: { value: 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color("#eefaff"),
    roughness: 0.06,
    envMapIntensity: 2.6,
    specularIntensity: 1,
    metalness: 0,
    ior: 1.31,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: new THREE.Color("#5cf2ff"),
    emissiveIntensity: 0,
    ...(cheap
      ? { transparent: true, opacity: 0.58, transmission: 0, depthWrite: false }
      : { transmission: 1, thickness: 0.35, attenuationColor: new THREE.Color("#a6f0ff"), attenuationDistance: 2.4 }),
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocalPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocalPos = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vLocalPos;
uniform float uCrack;
uniform vec3 uOrigin;
uniform float uLevel;
uniform float uActive;
uniform float uTime;
vec3 h33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float crackEdge(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 r = g + h33(i + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(d2) - sqrt(d1);
}`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
{
  float e = crackEdge(vLocalPos * 7.5);
  float vein = 1.0 - smoothstep(0.0, 0.026 + uLevel * 0.02, e);
  float radius = uCrack * 2.6;
  float dist = distance(vLocalPos, uOrigin);
  float reveal = 1.0 - smoothstep(radius - 0.25, radius, dist);
  float fd = (dist - radius) * 9.0; // squared by hand: pow() of a negative base is NaN in GLSL
  float front = exp(-fd * fd) * step(0.001, uCrack) * (1.0 - uCrack);
  vec3 ice = vec3(0.36, 0.95, 1.0);
  totalEmissiveRadiance += ice * vein * reveal * uActive * (0.22 + uLevel * 2.4);
  totalEmissiveRadiance += vec3(1.0) * vein * front * 3.0;
  totalEmissiveRadiance += ice * uActive * uLevel * 0.22;
  // resting glow: the ice holds a little light even when asleep, brightest at grazing edges
  float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
  totalEmissiveRadiance += ice * vein * 0.05 + ice * fr * (0.16 + uActive * 0.25 + uLevel * 0.4);
}`,
      );
  };
  return { mat, uniforms };
}
