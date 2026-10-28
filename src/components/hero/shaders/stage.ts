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

// A quad straight onto the render target (clip space), for scenes painted into a texture.
export const screenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Shows a painted texture as it is (the arena backdrop).
export const textureFragment = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(uMap, vUv).rgb, 1.0);
}
`;

// The main lighting rig hung far back over the rink, in frame units (height = 1, x scaled by the
// aspect): drawn in the arena and mirrored in the ice, so both use this one layout.
const rigGLSL = /* glsl */ `
#define RIG_LAMPS 11
float rigSpread(float aspect) { return max(aspect, 0.9); }
float rigX(int i, float spread) { return (float(i) - 5.0) * 0.062 * spread; }
float rigY(int i) { return 0.6 + abs(float(i) - 5.0) * 0.006; }
float rigClear(float lx) { return smoothstep(0.07, 0.14, abs(lx)); }
// show colours: each lamp holds a colour from the palette, then changes cue to the next
vec3 showHue(float h) {
  h = fract(h) * 5.0;
  float f = smoothstep(0.72, 1.0, fract(h));
  vec3 a = vec3(0.1, 0.78, 1.0);    // cyan
  vec3 b = vec3(0.55, 0.28, 1.0);   // violet
  if (h >= 1.0) { a = b; b = vec3(1.0, 0.2, 0.62); }    // magenta
  if (h >= 2.0) { a = b; b = vec3(1.0, 0.56, 0.14); }   // amber
  if (h >= 3.0) { a = b; b = vec3(0.28, 0.42, 1.0); }   // royal blue
  if (h >= 4.0) { a = b; b = vec3(0.1, 0.78, 1.0); }
  return mix(a, b, f);
}
vec3 rigColor(int i, float t) { return showHue(float(i) * 0.29 + t * 0.012); }
// beam angle from straight down (radians): neighbours lean opposite ways so the beams cross, and
// each sweeps slowly on its own
float rigTilt(int i, float t) {
  float fi = float(i);
  float lean = mod(fi, 2.0) < 0.5 ? 0.42 : -0.42;
  return lean + 0.26 * sin(t * (0.16 + mod(fi * 0.37, 0.12)) + fi * 1.7);
}
`;

// Black ice: translucent enough to show the reflection, with the light pool from the back light,
// blade scratches traced by the spin, frost from the spray and hard pin-point glints.
export const iceFragment = /* glsl */ `
precision highp float;
${rigGLSL}
uniform float uTime;
uniform float uFrost;
uniform float uAngle;
uniform vec3 uRimColor;
uniform vec3 uPoolCenter;
uniform float uAspect;
varying vec3 vWorld;
${noiseGLSL}

void main() {
  vec2 p = vWorld.xz;
  float r = length(p);
  vec3 V = normalize(cameraPosition - vWorld);
  float graze = 1.0 - clamp(V.y, 0.0, 1.0);

  // a lit rink: pale blue-grey ice, brighter where the light pools, glossy toward the horizon
  vec3 col = vec3(0.06, 0.12, 0.18);

  // pool of the back light on the ice, behind the dancer
  vec2 q = (p - uPoolCenter.xz) * vec2(0.42, 0.75);
  float pool = exp(-dot(q, q) * 1.4);
  col += vec3(0.3, 0.6, 0.78) * pool * 0.45;
  // the rink in the spotlight: white-blue ice, brightest around her, fading toward the stands
  float lit = exp(-r * r * 0.09);
  col += vec3(0.42, 0.62, 0.76) * lit * 0.55;
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
    if (d < w) {    // the angle (atan) only on the line itself
      float arc = smoothstep(0.1, 0.7, sin(atan(d2.y, d2.x) + fi * 2.1));
      traces += (1.0 - smoothstep(0.0, w, d)) * arc;
    }
  }
  traces = min(traces, 1.0) * 0.6;
  // fine grain: two octaves (the finer ones only shimmered at a distance)
  float frostTex = fbm(p * 2.2 + 7.0) * 0.6 + (vnoise(p * 13.0) * 0.5 + vnoise(p * 26.4 + 17.1) * 0.25) * 0.5;
  col += vec3(0.16, 0.22, 0.27) * frostTex * (0.4 + lit * 0.8);
  // the rig's lamps mirrored in the ice: a long streak under each, wider toward the viewer and
  // broken up by the surface (in frame units at this depth, so they line up with the lamps)
  float depth = max(cameraPosition.z - vWorld.z, 0.1);
  float fh = 0.6306 * depth;    // frame height at this depth (fov 35)
  float spread = rigSpread(uAspect);
  float wid = mix(0.011, 0.0035, smoothstep(3.0, 14.0, depth));
  float reach = smoothstep(2.5, 7.0, depth) * smoothstep(22.0, 12.0, depth);
  for (int k = 0; k < RIG_LAMPS; k++) {
    float lx = rigX(k, spread);
    float dxs = ((vWorld.x - cameraPosition.x) / fh - lx) / wid;
    if (abs(dxs) < 3.5) {    // only near its own streak
      float broken = 0.5 + 0.5 * vnoise(vec2(dxs * 2.0 + float(k) * 7.0, depth * 3.0));
      vec3 tint = mix(vec3(0.62, 0.8, 0.95), rigColor(k, uTime), 0.75);
      col += tint * exp(-dxs * dxs) * broken * reach * rigClear(lx) * 0.45;
    }
  }
  // tight scratches carved by the spin
  float ang = atan(p.y, p.x);
  float ring = sin(r * 260.0 + vnoise(vec2(ang * 3.0, r * 8.0)) * 6.0);
  float scratches = smoothstep(0.93, 1.0, ring) * exp(-r * 3.2) * 0.9;
  col += vec3(0.8, 0.93, 1.0) * (traces * (0.35 + lit * 0.6 + pool) + scratches * (0.3 + pool));

  // frost thrown by the blade, a ring that builds while she spins fast
  if (uFrost > 0.002 && r < 1.4) {
    float frost = smoothstep(0.15, 0.4, r) * (1.0 - smoothstep(0.5, 1.4, r)) * fbm(p * 9.0 + ang);
    col += vec3(0.6, 0.85, 1.0) * frost * uFrost * 0.45;
  }

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
  float alpha = mix(0.72, 0.97, smoothstep(0.4, 3.5, r));
  alpha = max(alpha, pool * 0.7);
  // the rink dissolves into the arena far away
  float far = 1.0 - smoothstep(9.0, 17.0, length(vWorld - vec3(0.0, 0.0, -2.0)));
  gl_FragColor = vec4(col, alpha * far);
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

// The arena behind her, drawn (no footage): a deep hall in the middle of a show. Far back over the
// rink hangs the rig, a row of bright spotlights in show colours, their beams slanting and crossing
// as they sweep; a farther row glints higher up. Coloured washes glide over a full house, phone
// lights glow and cameras flash in the stands. The space right behind her stays darkest, so the
// glass skater stands out.
export const arenaFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAspect;
varying vec2 vUv;
${noiseGLSL}

${rigGLSL}

// a spotlight seen from far away: a hot core, a soft bloom and a thin star of lens flare
vec3 lamp(vec2 d, float size, vec3 hue) {
  float r2 = dot(d, d) / (size * size);
  // far from the lamp and off its flare lines nothing of it shows: skip the exponentials
  if (r2 > 0.06 && min(abs(d.x), abs(d.y)) > 0.012 * size) return vec3(0.0);
  float hot = exp(-r2 * 26000.0) * 1.8;
  float bloom = exp(-r2 * 1400.0) * 0.4 + exp(-r2 * 120.0) * 0.07;
  float star = (exp(-abs(d.y) * 900.0 / size) * exp(-abs(d.x) * 38.0 / size) + exp(-abs(d.x) * 900.0 / size) * exp(-abs(d.y) * 60.0 / size)) * 0.22;
  return mix(vec3(1.0), hue, 0.35) * hot + hue * bloom + mix(vec3(1.0), hue, 0.6) * star;
}

void main() {
  vec2 uv = vUv;
  vec2 p = vec2((uv.x - 0.5) * uAspect, uv.y);    // frame units, x scaled by aspect
  float horizon = 0.41;
  float spread = rigSpread(uAspect);

  // the hall: deep blue, darker high up
  vec3 c = mix(vec3(0.035, 0.07, 0.12), vec3(0.01, 0.022, 0.045), smoothstep(horizon, 1.0, uv.y));

  // coloured haze hanging in the hall, lit by the show (the beams pass through the same haze)
  float hazeN = fbm(vec2(p.x * 4.0 + uTime * 0.04, p.y * 3.0 - uTime * 0.05));
  float haze = 0.6 + 0.4 * hazeN;
  c += mix(vec3(0.5, 0.2, 0.9), vec3(0.1, 0.5, 0.9), uv.x) * 0.03 * hazeN * smoothstep(0.95, 0.45, uv.y);

  // the stands: rows curving round the rink up into the dark, a full house. Wash lights glide over
  // the audience in show colours and pick out heads and shoulders; phone lights glow, cameras flash
  float above = uv.y - horizon;
  if (above > 0.0 && above < 0.5) {
    float bow = above + p.x * p.x * 0.035;
    float rows = smoothstep(0.35, 0.5, fract(bow * 62.0)) * 0.5 + 0.5;
    float fade = smoothstep(0.5, 0.04, above) * smoothstep(0.0, 0.03, above);
    c += vec3(0.016, 0.032, 0.05) * rows * fade;
    // wash lights sweeping the audience: coloured pools gliding along the rows
    vec3 wash = vec3(0.0);
    for (int w = 0; w < 4; w++) {
      float fw = float(w);
      vec2 wc = vec2(sin(uTime * (0.09 + fw * 0.023) + fw * 2.1) * 0.45 * spread,
                     horizon + 0.06 + 0.13 * (0.5 + 0.5 * sin(uTime * (0.06 + fw * 0.017) + fw * 4.0)));
      vec2 wd = (p - wc) * vec2(1.0, 2.2);
      wash += showHue(fw * 0.27 + 0.6 + uTime * 0.012) * exp(-dot(wd, wd) * 26.0);
    }
    // the audience where the light finds it: heads and shoulders in staggered rows, never a grid
    vec2 g = vec2(p.x * 70.0, bow * 62.0);
    g.x += mod(floor(g.y), 2.0) * 0.5;
    vec2 seat = floor(g);
    float hs = hash12(seat + 41.0);
    vec2 f = (fract(g) - 0.5 - (vec2(hs, hash12(seat + 9.0)) - 0.5) * vec2(0.36, 0.16)) * (0.85 + 0.3 * fract(hs * 9.0));
    float head = smoothstep(0.24, 0.15, length((f - vec2(0.0, 0.14)) * vec2(1.0, 0.9)));
    float shoulders = smoothstep(0.32, 0.18, length((f - vec2(0.0, -0.36)) * vec2(0.7, 1.2)));
    float crowd = max(head, shoulders) * step(0.08, hs);
    c += wash * (0.1 * rows + 0.3 + 0.26 * crowd) * fade;
    // now and then a camera flash somewhere in the crowd
    vec2 fg = vec2(p.x * 40.0, bow * 30.0);
    float slot = floor(uTime * 2.0);
    float fh = hash12(floor(fg) + slot * 7.13);
    float flash = step(0.9985, fh) * exp(-fract(uTime * 2.0) * 9.0) * smoothstep(0.22, 0.0, length(fract(fg) - 0.5));
    c += vec3(1.0, 0.97, 0.92) * flash * fade * 2.4;
    for (int l = 0; l < 2; l++) {
      float sc = l == 0 ? 90.0 : 170.0;    // near rows, then a finer, farther layer
      vec2 g = vec2(p.x * sc, bow * sc * 0.69);
      vec2 cell = floor(g);
      float h = hash12(cell + float(l) * 17.0);
      float tw = 0.65 + 0.35 * sin(uTime * (0.4 + h * 1.6) + h * 40.0);
      float dotMask = smoothstep(0.34, 0.0, length(fract(g) - 0.5 - (vec2(hash12(cell + 3.1), hash12(cell + 7.7)) - 0.5) * 0.4));
      vec3 hue = mix(vec3(0.55, 0.78, 1.0), vec3(1.0, 0.8, 0.52), step(0.55, fract(h * 7.0)));
      float on = step(l == 0 ? 0.9 : 0.86, h);
      c += hue * on * dotMask * tw * fade * (l == 0 ? 0.9 : 0.5) * (0.45 + 0.55 * fract(h * 13.0));
    }
  }
  // balcony fronts: two bright rows of small warm lamps curving round the hall
  for (int r = 0; r < 2; r++) {
    float by = r == 0 ? 0.53 : 0.79;
    float yb = by + p.x * p.x * (r == 0 ? 0.05 : 0.08);
    float n = r == 0 ? 42.0 : 56.0;
    vec2 q = vec2((fract(p.x * n) - 0.5) / n, uv.y - yb);
    float lampDot = exp(-dot(q, q) * (r == 0 ? 260000.0 : 420000.0));
    c += vec3(1.0, 0.84, 0.6) * lampDot * (r == 0 ? 1.1 : 0.7);
    c += vec3(0.5, 0.36, 0.22) * exp(-q.y * q.y * 12000.0) * 0.03;    // the glow they lay on the rail
  }
  // the far end of the rink glows where the light lands, with a few warm lights blurred by distance
  c += vec3(0.07, 0.17, 0.26) * exp(-pow((uv.y - horizon) * 20.0, 2.0));
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 b = vec2((fi < 2.0 ? -1.0 : 1.0) * (0.22 + mod(fi, 2.0) * 0.17) * spread, horizon + 0.035 + mod(fi * 0.37, 0.05));
    vec2 d = p - b;
    c += vec3(1.0, 0.55, 0.22) * exp(-dot(d, d) * 2200.0) * 0.16;
  }

  // the far rig: higher, smaller, dimmer
  for (int i = 0; i < 15; i++) {
    float fi = float(i) - 7.0;
    float lx = fi * 0.045 * spread;
    vec2 d = p - vec2(lx, 0.705 + abs(fi) * 0.003);
    c += lamp(d, 0.5, showHue(fi * 0.41 + 0.5 + uTime * 0.012)) * 0.45 * rigClear(lx);
  }
  // the main rig, far back over the rink: moving heads in show colours, each throwing a beam at a
  // slant (neighbours crossing) that sweeps slowly and lands on the far ice
  for (int i = 0; i < RIG_LAMPS; i++) {
    float lx = rigX(i, spread);
    vec2 at = vec2(lx, rigY(i));
    float clear = rigClear(lx);    // no lamp straight behind her
    vec3 hue = rigColor(i, uTime);
    vec2 d = p - at;
    c += lamp(d, 1.0, hue) * clear;
    float th = rigTilt(i, uTime);
    vec2 dir = vec2(sin(th), -cos(th));
    float along = dot(d, dir);
    float across = abs(d.x * dir.y - d.y * dir.x);
    float reach = (at.y - horizon) / cos(th);    // along the beam to the far ice
    float width = 0.006 + along * 0.17;
    float cone = smoothstep(width, 0.0, across) * smoothstep(0.0, 0.025, along) * smoothstep(reach + 0.01, reach * 0.2, along);
    c += hue * (cone * 0.36 + cone * cone * cone * 0.5) * haze * clear;
    // where the beam lands, a pool on the far ice
    vec2 q = (p - vec2(lx + dir.x * reach, horizon + 0.004)) * vec2(1.0, 7.0);
    c += hue * exp(-dot(q, q) * 120.0) * 0.4 * clear;
  }

  // movers on the far end of the rink throw beams up into the haze, fanning out and sweeping
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float side = i < 3 ? -1.0 : 1.0;
    float lx = side * (0.17 + mod(fi, 3.0) * 0.15) * spread;
    vec2 d = p - vec2(lx, horizon + 0.012);
    float th = side * (0.22 + mod(fi, 3.0) * 0.1) + 0.24 * sin(uTime * (0.21 + fi * 0.03) + fi * 2.4);
    vec2 dir = vec2(sin(th), cos(th));
    float along = dot(d, dir);
    float across = abs(d.x * dir.y - d.y * dir.x);
    float width = 0.005 + along * 0.13;
    float beam = smoothstep(width, 0.0, across) * smoothstep(0.0, 0.03, along) * smoothstep(0.5, 0.08, along);
    vec3 hue = showHue(fi * 0.33 + 0.15 + uTime * 0.012);
    c += hue * (beam * 0.3 + beam * beam * beam * 0.35) * haze;
    c += lamp(d, 0.6, hue) * 0.6;
  }

  // darkest right behind her: the space her figure is drawn against
  float behind = exp(-pow(p.x * 2.4, 2.0) - pow((uv.y - 0.62) * 2.6, 2.0));
  c *= 1.0 - 0.45 * behind;
  gl_FragColor = vec4(c, 1.0);
}
`;

// The stage curtains in front of the rink: deep red velvet, parted a little, so the visitor looks
// past them onto the ice. Drawn over the frame (camera-facing, like the arena): they keep framing
// the shot on any screen, narrower on phones. Heavy folds gather toward the floor, the pile
// catches a rosy sheen where it turns to the stage light, the hems are mirrored in the ice and the
// curtains throw a soft shadow inward. Scrolling draws them out of the frame.
export const curtainFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAspect;
uniform float uIntro;   // 0 closed (the page opens on them) .. 1 parted to rest
uniform float uOpen;    // 0 at rest (just parted) .. 1 drawn out of the frame
uniform float uShift;   // a touch of parallax with the pointer
varying vec2 vUv;
${noiseGLSL}

float k;    // 0 portrait .. 1 wide screen

// inner edge of a curtain (0 frame centre .. 1 frame edge) at height y: tied back low, it sweeps in
// toward the top
float edgeAt(float y, float side) {
  float uBot = mix(0.82, 0.6, k);
  float uTop = mix(0.66, 0.34, k);
  float e = mix(uBot, uTop, pow(clamp(y, 0.0, 1.0), 0.8));
  e += sin(y * 6.0 + uTime * 0.45 + side * 2.3) * 0.004;
  e = mix(-0.004, e, uIntro);    // closed: the two meet in the middle
  return mix(e, 1.12, uOpen);
}

// the velvet at (u, y) for a curtain whose inner edge is at e; fold height out
vec3 velvet(float u, float y, float e, float side, out float fold) {
  float w = (u - e) / max(1.03 - e, 0.03);    // 0 at the inner edge .. 1 at the frame edge
  float n = mix(3.2, 4.6, k);
  // folds of uneven width that wander a little down the drop
  float ph = w * n + 1.1 * vnoise(vec2(w * 2.3 + side * 9.0, y * 0.9)) + 0.3 * vnoise(vec2(w * 7.0 + side * 3.0, y * 2.6));
  ph += sin(uTime * 0.3 + y * 2.0 + side) * 0.05;
  float s = sin(ph * 6.2832), c = cos(ph * 6.2832);
  fold = s;
  // rounded crowns, narrow deep creases
  float crown = smoothstep(-0.85, 0.7, s);
  // light: spill from the stage on the inner side, bounce from the ice low down, dark high and out
  float light = (0.42 + 0.58 * exp(-w * 1.7)) * (0.62 + 0.5 * smoothstep(0.85, 0.08, y));
  light *= 0.9 + 0.1 * vnoise(vec2(w * 30.0, y * 5.0));    // the pile is never even
  vec3 col = mix(vec3(0.045, 0.002, 0.008), vec3(0.6, 0.04, 0.065), crown) * light;
  // velvet sheen: a bright line along each crown, leaning toward the stage, and a rosy glow on
  // the flank turned to the light
  float line = pow(max(0.0, sin(ph * 6.2832 + 0.75)), 5.0);
  float flank = pow(max(c, 0.0), 3.0);
  col += vec3(0.95, 0.26, 0.3) * (line * 0.3 + flank * 0.16) * light;
  // the rolled leading edge catches the cold stage light
  float lead = exp(-(u - e) * 70.0);
  col += mix(vec3(0.9, 0.3, 0.32), vec3(0.7, 0.85, 1.0), 0.25) * lead * 0.35 * light;
  return col;
}

void main() {
  k = smoothstep(0.6, 1.6, uAspect);
  float x = (vUv.x - 0.5) * 2.0 + uShift;
  float side = x < 0.0 ? -1.0 : 1.0;
  float u = abs(x);
  float y = vUv.y;
  if (u < min(edgeAt(1.0, side), edgeAt(0.0, side)) - 0.2) discard;    // the open middle: nothing to draw

  float aa = fwidth(u) * 1.2;
  float e = edgeAt(y, side);
  float fold;
  vec3 col = velvet(u, y, e, side, fold);
  // the hem: lifted toward the inner edge where the curtain is tied back, scalloped by the folds
  float w = (u - e) / max(1.03 - e, 0.03);
  float hem = mix(0.13, 0.05, k) + 0.035 * exp(-w * 3.5) - 0.008 * fold;
  col *= 0.7 + 0.3 * smoothstep(hem, hem + 0.02, y);
  float cover = smoothstep(e - aa, e + aa, u) * smoothstep(hem - aa, hem + aa, y);

  // a soft shadow thrown inward onto the scene
  float shadow = 0.5 * exp(-max(e - u, 0.0) * 9.0) * smoothstep(hem - 0.06, hem + 0.05, y) * (1.0 - uOpen);

  // the hem mirrored in the ice below it, rippled and fading
  float below = hem - y;
  float refl = 0.0;
  vec3 rcol = vec3(0.0);
  if (below > 0.0) {
    float y2 = hem + below * 1.3;
    float u2 = u + sin(y * 160.0 + uTime) * 0.002;
    float e2 = edgeAt(y2, side);
    float f2;
    rcol = velvet(u2, y2, e2, side, f2) * 0.8;
    refl = smoothstep(e2 - aa, e2 + aa, u2) * exp(-below * 14.0) * 0.4;
  }

  // composite: curtain over its reflection over the shadow (premultiplied, then back)
  vec3 pc = col * cover + rcol * refl * (1.0 - cover);
  float a = cover + refl * (1.0 - cover);
  a += shadow * (1.0 - a);
  if (a < 0.002) discard;
  gl_FragColor = vec4(pc / a, a);
}
`;

// The blade trace from the logo (its swoosh), carved into the ice around her: a bright groove with
// a soft glow (R = the shape, G = it blurred, from a canvas), glinting here and there; it fades in
// as the curtains part, and a wave of light runs out along it each time the figure changes.
export const traceFragment = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uTime;
uniform float uReveal;
uniform float uWave;    // seconds since the figure began to change (large = no wave)
varying vec2 vUv;
varying vec3 vWorld;
${noiseGLSL}
void main() {
  vec2 m = texture2D(uMap, vUv).rg;
  float r = length(vWorld.xz);
  float glint = step(0.985, hash12(floor(vWorld.xz * 160.0))) * (0.5 + 0.5 * sin(uTime * 3.0 + hash12(floor(vWorld.xz * 160.0) + 3.0) * 40.0));
  float wave = exp(-pow((r - uWave * 1.6) * 3.0, 2.0)) * exp(-uWave * 0.8);
  float show = smoothstep(0.0, 0.25, uReveal - r * 0.12);    // spreads outward from her feet
  vec3 col = vec3(0.86, 0.96, 1.0) * m.r * (0.55 + glint * 1.6 + wave * 2.0) + vec3(0.36, 0.86, 1.0) * m.g * (0.22 + wave * 0.9);
  gl_FragColor = vec4(col * show, 1.0);
}
`;

// The line of light that climbs the figure while it changes form: a thin ring on the ice plane,
// lifted to the line's height, with a soft halo and sparks running round it.
export const ringFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uAlpha;
varying vec2 vUv;
${noiseGLSL}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float ring = exp(-pow((r - 0.72) * 22.0, 2.0));
  float halo = exp(-pow((r - 0.6) * 4.0, 2.0)) * 0.3;
  float sparks = pow(vnoise(vec2(a * 9.0 + uTime * 6.0, uTime * 2.0)), 6.0) * 3.0 * exp(-pow((r - 0.72) * 9.0, 2.0));
  vec3 col = vec3(0.85, 0.97, 1.0) * ring + vec3(0.36, 0.9, 1.0) * (halo + sparks);
  gl_FragColor = vec4(col * uAlpha * smoothstep(1.0, 0.85, r), 1.0);
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
