import { noiseGLSL, rimGLSL } from "./common";

// Sheer layered skirt shaped on the GPU from a (u around, v down) grid. Three layers with petal
// hems; it flares and lifts with spin speed, trails behind the turn, and lets the back light
// through like chiffon.
export const skirtVertex = /* glsl */ `
uniform float uFlare;   // 0 calm .. 1 full spin
uniform float uLag;     // radians the hem trails behind the body
uniform float uTime;
uniform float uLayer;   // 0 outer (longest) .. 2 inner
varying vec3 vWorld;
varying vec3 vNormal;
varying float vV;
varying float vU;

vec3 shape(float u, float v) {
  float phase = uLayer * 1.7;
  float th = u * 6.28318530718 - uLag * v * v * (1.0 + uLayer * 0.15);
  float shrink = 1.0 - uLayer * 0.05;
  float hemR = mix(0.25, 0.57, uFlare) * shrink;
  float hemY = mix(0.72, 0.885, uFlare) + uLayer * 0.028;
  float r = mix(0.1, hemR, pow(v, mix(1.3, 0.82, uFlare)));
  // petals and folds
  r += v * v * v * 0.024 * sin(th * 9.0 + phase);
  r += v * (0.008 + 0.02 * uFlare) * sin(th * 6.0 + uTime * 1.2 + v * 2.5 + phase);
  r += v * 0.004 * sin(th * 13.0 - uTime * 2.1 + phase);
  float y = mix(1.085, hemY, v);
  y += v * v * 0.02 * cos(th * 9.0 + phase);
  y += v * v * (0.01 + 0.045 * uFlare) * sin(th * 5.0 + uTime * 2.4 + phase);
  return vec3(cos(th) * r, y, sin(th) * r * 0.96);
}

void main() {
  float u = uv.x, v = uv.y;
  vec3 p = shape(u, v);
  vec3 du = shape(u + 0.0015, v) - p;
  vec3 dv = shape(u, v + 0.003) - p;
  vec3 n = normalize(cross(dv, du));
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  vV = v;
  vU = u;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const skirtFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uMirror;
uniform float uGlitter;
uniform float uFlare;
uniform float uLayer;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vV;
varying float vU;
${noiseGLSL}
${rimGLSL}

void main() {
  vec3 N = normalize(vNormal);
  vec3 P = vWorld;
  vec3 V = normalize(cameraPosition - vWorld);
  if (!gl_FrontFacing) N = -N;
  // reflection pass: shade in un-mirrored space so it matches the raymarched body's reflection
  vec3 flip = vec3(1.0, -1.0, 1.0);
  if (uMirror > 0.5) { P *= flip; N *= flip; V *= flip; }
  float rim;
  vec3 col = contreJour(N, V, P, rim);
  float fres = 1.0 - clamp(abs(dot(N, V)), 0.0, 1.0);
  col += mix(uRimColor, vec3(1.0), 0.5) * smoothstep(0.86, 0.99, fres) * 0.12;

  // light passing through the fabric toward the viewer
  vec3 L = normalize(uLightPos - P);
  float through = pow(max(dot(-V, L), 0.0), 2.5);
  float fibers = 0.85 + 0.15 * fbm(vec2(vU * 40.0, vV * 14.0) + uLayer * 3.0);
  float sheer = mix(0.2, 1.0, smoothstep(0.15, 1.0, vV));
  col += mix(uRimColor, vec3(0.8, 0.92, 1.0), 0.4) * through * sheer * fibers * (0.34 - uLayer * 0.06);

  // sequins strewn toward the hem: tiny mirrors with their own tilt
  vec2 cellId = floor(vec2(vU * 900.0, vV * 90.0));
  float hsh = hash12(cellId + uLayer * 31.0);
  vec3 jitter = vec3(hash12(cellId + 5.3), hash12(cellId + 9.1), hash12(cellId + 2.2)) - 0.5;
  vec3 fn = normalize(N + jitter);
  float g = pow(max(dot(reflect(-L, fn), V), 0.0), 80.0);
  col += vec3(1.0, 1.05, 1.1) * g * step(0.86 - vV * 0.1, hsh) * smoothstep(0.45, 1.0, vV) * uGlitter * 5.0;

  // the hem edge: the brightest, crispest line of the silhouette
  col += uRimColor * smoothstep(0.955, 1.0, vV) * (0.5 + uFlare * 0.6);

  float alpha = mix(0.95, 0.5, smoothstep(0.25, 1.0, vV)) * (1.0 - uLayer * 0.15);
  if (uMirror > 0.5) {
    alpha *= 0.5 * exp(-abs(vWorld.y) * 1.15);
    col *= vec3(0.75, 0.9, 1.1);
  }
  gl_FragColor = vec4(col, alpha);
}
`;
