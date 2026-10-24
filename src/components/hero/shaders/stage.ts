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

  // a lit rink: pale blue-grey ice, brighter where the light pools, glossy toward the horizon
  vec3 col = vec3(0.07, 0.16, 0.24);
  col += vec3(0.05, 0.1, 0.14) * smoothstep(1.5, 9.0, -vWorld.z + 2.0);

  // pool of the back light on the ice, behind the dancer
  vec2 q = (p - uPoolCenter.xz) * vec2(0.42, 0.75);
  float pool = exp(-dot(q, q) * 1.4);
  col += vec3(0.3, 0.6, 0.78) * pool * 0.7;
  col += uRimColor * pow(pool, 6.0) * 0.35;
  // the blade's own small circle of light, so she visibly stands on the surface
  float under = exp(-r * r * 9.0);
  col += vec3(0.55, 0.85, 1.0) * under * 0.32;

  // long skate arcs carved across the rink, and a matte frost in the surface
  float traces = 0.0;
  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    vec2 c = vec2(sin(fi * 12.9898) * 7.0, -3.0 + cos(fi * 7.233) * 6.0);
    float R = 2.2 + mod(fi * 3.7, 6.0);
    vec2 d2 = p - c;
    float d = abs(length(d2) - R);
    float w = 0.004 + 0.003 * mod(fi, 3.0);
    float arc = smoothstep(0.1, 0.7, sin(atan(d2.y, d2.x) + fi * 2.1));
    traces += (1.0 - smoothstep(0.0, w, d)) * arc;
  }
  traces = min(traces, 1.0) * 0.42;
  float frostTex = fbm(p * 2.2 + 7.0) * 0.6 + fbm(p * 13.0) * 0.4;
  col += vec3(0.08, 0.13, 0.17) * frostTex;
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

  // fresnel: grazing angles mirror the bright arena behind
  col += vec3(0.16, 0.3, 0.42) * pow(graze, 5.0);

  // translucent near her (her reflection shows through), solid ice further out
  float alpha = mix(0.62, 0.96, smoothstep(0.4, 3.5, r));
  alpha = max(alpha, pool * 0.7);
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
uniform float uAspect;   // frame width / height
uniform vec4 uWin;       // footage window: centre x, centre y, height (frame units), feather
varying vec2 vUv;
const float V = 16.0 / 9.0;

// the footage scaled to cover the whole frame, zoomed a little and blurred: colour and motion only
vec3 coverBlur(vec2 uv) {
  vec2 size = uAspect > V ? vec2(1.0, uAspect / V) : vec2(V / uAspect, 1.0);
  vec2 t = (uv - 0.5) / (size * 1.25) + 0.5;
  vec3 c = vec3(0.0);
  float r = 0.035;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 2.39996;             // golden-angle spiral
    float k = sqrt((float(i) + 0.5) / 12.0);
    c += texture2D(uMap, clamp(t + vec2(cos(a), sin(a)) * r * k * vec2(1.0, V), 0.001, 0.999)).rgb;
  }
  return c / 12.0;
}

void main() {
  vec2 uv = vUv;
  // the real arena in a window: smaller than the frame, so the skaters there read as far away
  vec2 wsize = vec2(uWin.z * V / uAspect, uWin.z);
  vec2 tw = (uv - uWin.xy) / wsize + 0.5;
  vec2 f = vec2(uWin.w) / vec2(1.0, V);
  float m = smoothstep(0.0, f.x, tw.x) * smoothstep(1.0, 1.0 - f.x, tw.x) * smoothstep(0.0, f.y, tw.y) * smoothstep(1.0, 1.0 - f.y, tw.y);
  vec3 sharp = texture2D(uMap, clamp(tw, 0.001, 0.999)).rgb;
  vec3 bg = vec3(0.043, 0.114, 0.18);         // page colour (#0b1d2e)
  vec3 haze = vec3(0.36, 0.62, 0.86);
  // the blurred surround is mostly light and colour: haze takes the shapes out of it
  vec3 c = mix(mix(coverBlur(uv), haze * 0.85, 0.32), sharp, m);

  // kept bright and ice-blue, a step back from the glass skater: a cool haze, softer contrast
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l) * vec3(0.62, 0.84, 1.06), c, 0.7);
  c = mix(c, haze, 0.2 - 0.06 * m) * 0.8;
  // the top edge melts into the page colour
  c = mix(bg, c, smoothstep(1.0, 0.84, uv.y) * uOpacity);
  gl_FragColor = vec4(c, 1.0);
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
