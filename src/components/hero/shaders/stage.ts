import { noiseGLSL } from "./common";

export const worldVertex = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// Black ice: translucent enough to show the reflection, with the light pool from the back light,
// blade scratches traced by the spin, frost from the spray and hard pin-point glints.
export const iceFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uFrost;
uniform float uAngle;
uniform vec3 uRimColor;
uniform vec3 uPoolCenter;
varying vec3 vWorld;
${noiseGLSL}

void main() {
  vec2 p = vWorld.xz;
  float r = length(p);
  vec3 V = normalize(cameraPosition - vWorld);
  float graze = 1.0 - clamp(V.y, 0.0, 1.0);

  vec3 col = vec3(0.006, 0.011, 0.02);

  // pool of the back light on the ice, behind the dancer
  vec2 q = (p - uPoolCenter.xz) * vec2(0.42, 0.75);
  float pool = exp(-dot(q, q) * 1.4);
  col += vec3(0.16, 0.42, 0.55) * pool * 0.55;
  col += uRimColor * pow(pool, 6.0) * 0.35;

  // long skating traces across the rink
  float n = fbm(p * 0.35 + 3.0);
  float traces = smoothstep(0.985, 1.0, sin(n * 70.0)) * 0.18;
  // tight scratches carved by the spin
  float ang = atan(p.y, p.x);
  float ring = sin(r * 260.0 + vnoise(vec2(ang * 3.0, r * 8.0)) * 6.0);
  float scratches = smoothstep(0.93, 1.0, ring) * exp(-r * 3.2) * 0.9;
  col += vec3(0.7, 0.9, 1.0) * (traces * (0.4 + pool) + scratches * (0.3 + pool));

  // frost thrown by the blade, a ring that builds while she spins fast
  float frost = smoothstep(0.15, 0.4, r) * (1.0 - smoothstep(0.5, 1.4, r)) * fbm(p * 9.0 + ang);
  col += vec3(0.6, 0.85, 1.0) * frost * uFrost * 0.45;

  // pin-point glints; they twinkle as the camera moves
  vec2 cell = floor(p * 70.0);
  float h = hash12(cell);
  vec2 f = fract(p * 70.0) - 0.5;
  float dotMask = smoothstep(0.18, 0.0, length(f));
  float tw = pow(0.5 + 0.5 * sin(uTime * 2.0 + h * 60.0 + (cameraPosition.x + cameraPosition.y) * 9.0), 8.0);
  float glint = step(0.993, h) * dotMask * tw * (0.25 + pool * 2.5) * exp(-r * 0.12);
  col += vec3(0.9, 0.97, 1.0) * glint * 3.0;

  // fresnel: grazing angles look glossier
  col += vec3(0.03, 0.06, 0.09) * pow(graze, 6.0);

  float alpha = mix(0.52, 0.94, smoothstep(0.4, 3.5, r));
  alpha = max(alpha, pool * 0.6);
  // the rink dissolves into the arena far away
  float far = 1.0 - smoothstep(9.0, 17.0, length(vWorld - vec3(0.0, 0.0, -2.0)));
  gl_FragColor = vec4(col, alpha * far);
}
`;

// Additive volumetric cone from the lighting rig behind and above the dancer.
export const beamVertex = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormal;
varying float vH;
void main() {
  vH = uv.y;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
export const beamFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uIntensity;
uniform vec3 uRimColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vH;
${noiseGLSL}
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = pow(abs(dot(normalize(vNormal), V)), 2.2);
  float along = smoothstep(0.0, 0.35, vH) * smoothstep(1.0, 0.75, vH);
  float haze = 0.6 + 0.4 * fbm(vec2(vWorld.x * 0.8 + uTime * 0.05, vWorld.y * 0.6 - uTime * 0.08));
  float a = facing * along * haze * uIntensity;
  gl_FragColor = vec4(mix(vec3(0.75, 0.9, 1.0), uRimColor, 0.35) * a, 1.0);
}
`;

// Soft glow behind the dancer (what makes her a silhouette) with a faint anamorphic streak.
export const glowFragment = /* glsl */ `
precision highp float;
uniform float uIntensity;
uniform float uPulse;
uniform vec3 uRimColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p * vec2(1.0, 1.15));
  float core = exp(-d * d * 7.0);
  float halo = exp(-d * 3.2) * 0.35;
  float streak = exp(-abs(p.y) * 90.0) * exp(-abs(p.x) * 1.8) * 0.35;
  vec3 c = vec3(0.92, 0.95, 0.97) * core + vec3(0.55, 0.62, 0.68) * halo + mix(vec3(1.0), uRimColor, 0.5) * streak;
  gl_FragColor = vec4(c * uIntensity * (1.0 + uPulse * 0.6), 1.0);
}
`;

// Real arena footage far behind the stage, graded down and dissolved at the edges.
export const plateFragment = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  vec3 c = texture2D(uMap, uv).rgb;
  // match the site grade: crush toward ink, keep the cyan of the ice
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l) * vec3(0.5, 0.78, 1.0), c, 0.35);
  c = pow(c, vec3(1.35)) * 0.55;
  vec2 e = smoothstep(vec2(0.0), vec2(0.18, 0.22), uv) * smoothstep(vec2(1.0), vec2(0.82, 0.7), uv);
  gl_FragColor = vec4(c * uOpacity * e.x * e.y, 1.0);
}
`;

// Falling snow in the air; brighter where it crosses the light beam.
export const snowVertex = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
uniform vec3 uBeamTop;
uniform vec3 uBeamBottom;
varying float vAlpha;
void main() {
  vec3 p = position;
  float speed = 0.18 + aSeed * 0.25;
  p.y = mod(p.y - uTime * speed, 6.5);
  p.x += sin(uTime * 0.4 + aSeed * 30.0) * 0.25;
  p.z += cos(uTime * 0.3 + aSeed * 17.0) * 0.2;
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // distance to beam axis
  vec3 ab = uBeamBottom - uBeamTop;
  float t = clamp(dot(p - uBeamTop, ab) / dot(ab, ab), 0.0, 1.0);
  float dBeam = length(p - (uBeamTop + ab * t));
  float inBeam = exp(-dBeam * dBeam * 1.2);
  float tw = 0.6 + 0.4 * sin(uTime * 3.0 + aSeed * 50.0);
  vAlpha = (0.18 + inBeam * 0.9) * tw * smoothstep(6.5, 5.5, p.y) * smoothstep(0.0, 0.4, p.y);
  gl_PointSize = uSize * uPixelRatio * (0.5 + aSeed) / -mv.z;
}
`;
export const snowFragment = /* glsl */ `
precision highp float;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vec3(0.85, 0.95, 1.0) * a * vAlpha, 1.0);
}
`;

// Ice spray from the blade: CPU-simulated, drawn as soft sparks.
export const sprayVertex = /* glsl */ `
attribute float aLife;
attribute float aSeed;
uniform float uSize;
uniform float uPixelRatio;
uniform float uTime;
varying float vA;
void main() {
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float life = clamp(aLife, 0.0, 1.0);
  float tw = 0.65 + 0.35 * sin(uTime * 25.0 + aSeed * 40.0);
  vA = life * life * tw;
  gl_PointSize = uSize * uPixelRatio * (0.35 + aSeed * 0.9) * (0.4 + life * 0.6) / -mv.z;
}
`;
export const sprayFragment = /* glsl */ `
precision highp float;
uniform vec3 uRimColor;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.05, d);
  float core = smoothstep(0.18, 0.0, d);
  vec3 col = mix(uRimColor * 0.8, vec3(1.0), core);
  gl_FragColor = vec4(col * a * vA * 1.4, 1.0);
}
`;
