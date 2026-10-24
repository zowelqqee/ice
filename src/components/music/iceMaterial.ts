import * as THREE from "three";

export interface IceUniforms {
  uCrack: { value: number }; // 0..1 how far the light-cracks have spread
  uOrigin: { value: THREE.Vector3 }; // local point where the crack started
  uLevel: { value: number }; // band loudness 0..1
  uActive: { value: number }; // 0..1 awake
  uTime: { value: number };
}

/**
 * Ice, not glass: a frosted, milky-blue body with an uneven surface, white frost at the edges,
 * faint frozen fractures and air bubbles inside. Veins of light crack outward from where the
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
    color: new THREE.Color("#e2f5ff"),
    roughness: 0.34, // frosted: highlights spread, light through it is soft
    envMapIntensity: 2.1,
    specularIntensity: 0.85,
    metalness: 0,
    ior: 1.31,
    clearcoat: 0.6, // a wet skin on the frost
    clearcoatRoughness: 0.22,
    sheen: 0.7, // frost fuzz catching the light at grazing angles
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color("#d4f1ff"),
    emissive: new THREE.Color("#5cf2ff"),
    emissiveIntensity: 0,
    ...(cheap
      ? { transparent: true, opacity: 0.84, transmission: 0, depthWrite: false }
      : { transmission: 0.86, thickness: 0.9, attenuationColor: new THREE.Color("#9adcf3"), attenuationDistance: 1.05 }),
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
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = h33(i).x, n100 = h33(i + vec3(1, 0, 0)).x, n010 = h33(i + vec3(0, 1, 0)).x, n110 = h33(i + vec3(1, 1, 0)).x;
  float n001 = h33(i + vec3(0, 0, 1)).x, n101 = h33(i + vec3(1, 0, 1)).x, n011 = h33(i + vec3(0, 1, 1)).x, n111 = h33(i + vec3(1, 1, 1)).x;
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
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
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  // ice is never optically flat: ripples and melt dimples bend the highlights
  vec3 q = vLocalPos * 30.0;
  vec3 bump = vec3(vn3(q), vn3(q + 3.1), vn3(q + 7.7)) - 0.5;
  bump += (vec3(vn3(q * 2.7 + 1.7), vn3(q * 2.7 + 5.3), vn3(q * 2.7 + 9.1)) - 0.5) * 0.6;
  normal = normalize(normal + bump * 0.13);
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
  totalEmissiveRadiance += ice * vein * 0.05 + ice * fr * (0.12 + uActive * 0.25 + uLevel * 0.4);
  // what makes it ice: white frost on the edges and in patches, frozen fractures, air bubbles
  vec3 white = vec3(0.78, 0.92, 1.0);
  float patches = smoothstep(0.55, 0.9, vn3(vLocalPos * 15.0 + 4.0)) * (0.55 + 0.45 * vn3(vLocalPos * 48.0));
  totalEmissiveRadiance += white * (patches * 0.045 + fr * 0.16);
  // light lost inside the ice: a faint cold glow from within, so it reads translucent, not stone
  totalEmissiveRadiance += vec3(0.32, 0.72, 0.92) * 0.055;
  float fracture = 1.0 - smoothstep(0.0, 0.018, crackEdge(vLocalPos * 3.1 + 11.0));
  totalEmissiveRadiance += white * fracture * 0.07;
  vec3 cell = floor(vLocalPos * 55.0);
  vec3 hb = h33(cell + 17.0);
  float bubble = step(0.975, hb.x) * smoothstep(0.22, 0.05, length(fract(vLocalPos * 55.0) - 0.25 - 0.5 * hb.yzx));
  totalEmissiveRadiance += white * bubble * 0.5;
}`,
      );
  };
  return { mat, uniforms };
}
