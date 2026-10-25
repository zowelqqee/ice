import * as THREE from "three";

export interface IceUniforms {
  uCrack: { value: number }; // 0..1 how far the light-cracks have spread
  uOrigin: { value: THREE.Vector3 }; // local point where the crack started
  uLevel: { value: number }; // band loudness 0..1
  uActive: { value: number }; // 0..1 awake
  uTime: { value: number };
}

/**
 * Carved ice, not glass or silver. Clear cyan depth where you look straight in, deepening where the
 * ice is thick; white frosted rims where the surface turns away; milky wisps and air bubbles inside
 * that shift with the view; frosted patches and the soft ripple of hand-carved, slightly melted
 * ice; light entering from the base. Veins of light crack outward from where the instrument was
 * touched, then breathe with its layer of the music (they appear only while it is awake).
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
    color: new THREE.Color("#d2f1ff"),
    roughness: 0.12, // clear ice; the frosted patches raise it in the shader
    envMapIntensity: 1.5,
    specularIntensity: 1,
    metalness: 0,
    ior: 1.31,
    clearcoat: 0.6, // the wet skin on carved ice
    clearcoatRoughness: 0.12,
    emissive: new THREE.Color("#5cf2ff"),
    emissiveIntensity: 0,
    ...(cheap
      ? { transparent: true, opacity: 0.72, transmission: 0, depthWrite: false }
      : {
          transmission: 0.84, // not glass: part of the light scatters in the ice and lights it up
          thickness: 0.55,
          attenuationColor: new THREE.Color("#6fd0f2"), // thick ice turns deep cyan
          attenuationDistance: 0.7,
        }),
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocalPos;\nvarying vec3 vLocalView;")
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvLocalPos = position;\nvLocalView = position - (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vLocalPos;
varying vec3 vLocalView;
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
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float frost = smoothstep(0.6, 0.9, vn3(vLocalPos * 12.0 + 4.0)) * (0.5 + 0.5 * vn3(vLocalPos * 40.0));
roughnessFactor = mix(roughnessFactor, 0.32, frost);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
{
  // ice is never optically flat: ripples and melt dimples bend the highlights
  vec3 q = vLocalPos * 30.0;
  vec3 bump = vec3(vn3(q), vn3(q + 3.1), vn3(q + 7.7)) - 0.5;
  bump += (vec3(vn3(q * 2.7 + 1.7), vn3(q * 2.7 + 5.3), vn3(q * 2.7 + 9.1)) - 0.5) * 0.6;
  normal = normalize(normal + bump * 0.09);
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
  // ice, not glass or silver: clear cyan depth where you look straight in, white frosted rims
  // where the surface turns away (light caught inside), milky wisps and air bubbles within
  float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
  totalEmissiveRadiance += vec3(0.03, 0.26, 0.44) * (1.0 - fr) * (0.11 + 0.05 * vn3(vLocalPos * 3.0));
  totalEmissiveRadiance += vec3(0.72, 0.92, 1.0) * fr * (0.3 + uActive * 0.3 + uLevel * 0.4);

  // what is inside, seen through the depth (parallax: it shifts as the view moves). March a few
  // steps from the surface along the line of sight, in the instrument's own space.
  {
    vec3 rd = normalize(vLocalView);
    float cloud = 0.0, bubbles = 0.0;
    for (int i = 1; i <= 3; i++) {
      float d = float(i) * 0.025;
      vec3 q = vLocalPos + rd * d;
      float w = exp(-d * 16.0);
      // soft white wisps, stretched like the streaks frozen into block ice
      float n = vn3(q * vec3(4.0, 8.0, 4.0) + 5.0) * 0.65 + vn3(q * 17.0 + 2.0) * 0.35;
      cloud += smoothstep(0.5, 0.9, n) * w;
      vec3 cq = q * 70.0;
      vec3 hb = h33(floor(cq) + 31.0);
      bubbles += step(0.975, hb.x) * smoothstep(0.26, 0.05, length(fract(cq) - 0.5 - 0.3 * (hb.yzx - 0.5))) * w;
    }
    totalEmissiveRadiance += vec3(0.85, 0.96, 1.0) * (min(cloud, 1.5) * 0.09 + min(bubbles, 1.0) * 0.6);
    // lit from its base like a festival ice sculpture: cyan light enters at the bottom and fades
    // upward, brightest along the edges
    float base = exp(-max(vLocalPos.y, 0.0) * 1.8);
    totalEmissiveRadiance += vec3(0.2, 0.66, 1.0) * base * (0.16 + fr * 0.35) * (0.8 + uActive * 0.6);
  }
  // fine frost reads white and soft
  totalEmissiveRadiance += vec3(0.82, 0.94, 1.0) * frost * 0.16;
}`,
      );
  };
  return { mat, uniforms };
}
