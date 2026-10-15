// GLSL shared by the hero materials.

export const noiseGLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
`;

/** Contre-jour lighting: near-black body, a cold rim where the surface turns toward the back light. */
export const rimGLSL = /* glsl */ `
uniform vec3 uLightPos;   // main back light (behind the dancer)
uniform vec3 uSidePos;    // weak cold kicker from the side
uniform vec3 uRimColor;
uniform float uRim;       // rim intensity (pulses with the music)

vec3 contreJour(vec3 N, vec3 V, vec3 P, out float rimOut) {
  vec3 L = normalize(uLightPos - P);
  vec3 S = normalize(uSidePos - P);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 1.0 - ndv;
  float rim = pow(fres, 2.1) * smoothstep(-0.35, 0.5, dot(N, L));
  float kick = pow(fres, 4.0) * smoothstep(0.0, 0.8, dot(N, S)) * 0.35;
  float top = pow(max(N.y, 0.0), 8.0) * 0.06;
  rimOut = rim;
  vec3 col = vec3(0.008, 0.012, 0.022);
  col += vec3(0.008, 0.015, 0.028) * ndv * ndv;          // faint fill so the form reads
  col += uRimColor * (rim * uRim + kick);
  col += vec3(0.55, 0.75, 1.0) * top;
  return col;
}
`;
