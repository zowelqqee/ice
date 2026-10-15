import { noiseGLSL, rimGLSL } from "./common";

// Joint layout shared with Skater.tsx (figure-local space, metres, y up, blades on the ice at y≈0).
export const J = {
  pelvis: 0, waist: 1, chest: 2, neck: 3, head: 4,
  shL: 5, elL: 6, wrL: 7, tipL: 8,
  shR: 9, elR: 10, wrR: 11, tipR: 12,
  hipS: 13, kneeS: 14, ankleS: 15, toeS: 16,
  hipF: 17, kneeF: 18, ankleF: 19, toeF: 20,
} as const;
export const JOINT_COUNT = 21;

export const skaterVertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

// The dancer is a signed distance field: smooth-unioned anatomy (no mannequin joints), hands and
// skates modelled in their own local frames, sharp-edged costume crystals. Raymarched inside a
// proxy cylinder fitted to the pose every frame; each body part is skipped when its bounding
// volume is farther than the current hit, so the detail costs little.
export const skaterFragment = /* glsl */ `
precision highp float;
uniform mat4 projectionMatrix;
uniform vec3 uJ[${JOINT_COUNT}];
uniform mat3 uHandL;   // columns: side, along the fingers, palm normal
uniform mat3 uHandR;
uniform mat3 uFootS;   // columns: side, up the shin, toward the toe
uniform mat3 uFootF;
uniform float uAngle;
uniform float uMirror;
uniform float uDetail; // 0 in the reflection: skips fingers, laces, strands
uniform float uTime;
uniform int uSteps;
uniform float uGlitter;
uniform float uSpan;   // proxy size, bounds the march
varying vec3 vWorld;

${noiseGLSL}
${rimGLSL}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}
float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float sdRBox(vec3 p, vec3 b, float r) { return sdBox(p, b - r) - r; }

// material ids
const float M_COSTUME = 0.0, M_BOOT = 1.0, M_STEEL = 2.0, M_HAIR = 3.0, M_TIGHTS = 4.0,
            M_CRYSTAL = 5.0, M_SKIN = 6.0, M_LACE = 7.0;

void pick(inout vec2 res, float d, float m) { if (d < res.x) res = vec2(d, m); }

// ── hand: palm and five two-segment fingers in a soft ballet line ───────────────────────────
float finger(vec3 q, vec3 root, vec3 dir, float len, float curl, float r0) {
  vec3 bend = normalize(dir + vec3(0.0, 0.0, curl));
  vec3 mid = root + dir * len * 0.55;
  vec3 tip = mid + bend * len * 0.45;
  float d = sdRoundCone(q, root, mid, r0, r0 * 0.82);
  return smin(d, sdRoundCone(q, mid, tip, r0 * 0.82, r0 * 0.62), 0.004);
}
vec2 hand(vec3 p, vec3 wrist, mat3 B, float thumbSide) {
  vec3 q = transpose(B) * (p - wrist);
  float d = sdEllipsoid(q - vec3(0.0, 0.043, 0.0), vec3(0.031, 0.046, 0.0115));
  float cuff = length(vec2(length(q.xz * vec2(1.0, 1.25)) - 0.021, q.y + 0.006)) - 0.0034;
  if (uDetail < 0.5) {
    d = smin(d, sdRoundCone(q, vec3(0.0, 0.07, 0.0), vec3(0.0, 0.14, 0.006), 0.022, 0.012), 0.01);
    return vec2(d, M_SKIN);
  }
  float xs[4] = float[4](-0.021, -0.0072, 0.0072, 0.02);
  float ls[4] = float[4](0.062, 0.071, 0.066, 0.051);
  float sp[4] = float[4](-0.07, -0.02, 0.03, 0.09);
  for (int i = 0; i < 4; i++) {
    float a = sp[i] * -thumbSide;
    vec3 dir = normalize(vec3(sin(a), cos(a), 0.06 + float(i) * 0.02));
    d = smin(d, finger(q, vec3(xs[i] * -thumbSide, 0.081, 0.0), dir, ls[i], 0.32 + float(i) * 0.05, 0.0072 - float(i) * 0.0004), 0.006);
  }
  vec3 tdir = normalize(vec3(0.62 * thumbSide, 0.7, 0.32));
  d = smin(d, finger(q, vec3(0.026 * thumbSide, 0.024, 0.006), tdir, 0.05, 0.25, 0.0085), 0.008);
  vec2 res = vec2(d, M_SKIN);
  pick(res, cuff, M_CRYSTAL);
  return res;
}

// ── skate: white boot, laces, sole, heel, rockered blade with toe pick ──────────────────────
vec2 skate(vec3 p, vec3 ankle, mat3 F) {
  vec3 q = transpose(F) * (p - ankle);
  vec3 qe = vec3(q.x * 1.12, q.y, q.z);
  float boot = sdRoundCone(qe, vec3(0.0, 0.07, -0.006), vec3(0.0, -0.04, -0.006), 0.035, 0.034);
  boot = smin(boot, length(vec2(length(q.xz * vec2(1.1, 1.0)) - 0.035, q.y - 0.068)) - 0.007, 0.008);
  boot = smin(boot, sdEllipsoid(q - vec3(0.0, -0.066, -0.028), vec3(0.03, 0.04, 0.041)), 0.018);
  boot = smin(boot, sdRoundCone(qe, vec3(0.0, -0.06, -0.004), vec3(0.0, -0.088, 0.1), 0.031, 0.022), 0.018);
  boot = smin(boot, sdEllipsoid(q - vec3(0.0, -0.09, 0.104), vec3(0.027, 0.02, 0.034)), 0.014);
  boot = smin(boot, sdRoundCone(q, vec3(0.0, -0.035, 0.05), vec3(0.0, 0.066, 0.026), 0.017, 0.02), 0.01);
  float sole = sdRBox(q - vec3(0.0, -0.111, 0.034), vec3(0.028, 0.0045, 0.094), 0.004);
  sole = min(sole, sdRBox(q - vec3(0.0, -0.123, -0.044), vec3(0.023, 0.009, 0.026), 0.003));
  boot = smin(boot, sole, 0.006);
  vec2 res = vec2(boot, M_BOOT);

  if (uDetail > 0.5) {
    float lace = 1e5;
    for (int i = 0; i < 5; i++) {
      float y = -0.045 + float(i) * 0.024;
      float z = 0.05 - (y + 0.045) * 0.3;
      lace = min(lace, sdCapsule(q, vec3(-0.016, y, z), vec3(0.016, y + 0.018, z - 0.006), 0.0019));
      lace = min(lace, sdCapsule(q, vec3(0.016, y, z), vec3(-0.016, y + 0.018, z - 0.006), 0.0019));
    }
    pick(res, lace, M_LACE);
  }

  float steel = sdBox(q - vec3(0.0, -0.1195, 0.035), vec3(0.011, 0.0022, 0.1));
  steel = min(steel, sdBox(q - vec3(0.0, -0.128, 0.104), vec3(0.0048, 0.008, 0.014)));
  steel = min(steel, sdBox(q - vec3(0.0, -0.128, -0.045), vec3(0.0048, 0.008, 0.012)));
  vec3 qb = q - vec3(0.0, -0.149, 0.03);
  qb.y -= qb.z * qb.z * 1.1; // rocker: the blade curves up at both ends
  steel = min(steel, sdBox(qb, vec3(0.0017, 0.0135, 0.141)));
  if (uDetail > 0.5) {
    for (int j = 0; j < 3; j++) {
      vec3 tq = q - vec3(0.0, -0.151 + float(j) * 0.0085, 0.171 - float(j) * 0.002);
      tq.yz = mat2(0.7071, -0.7071, 0.7071, 0.7071) * tq.yz;
      steel = min(steel, sdBox(tq, vec3(0.0015, 0.0036, 0.0036)));
    }
  }
  pick(res, steel, M_STEEL);
  return res;
}

vec2 map(vec3 p) {
  vec2 res = vec2(1e5, M_COSTUME);
  float k = 1.0 / 1.3;

  // torso: ribcage, waist, pelvis (flattened front-to-back), shoulders, bust, glutes, neck
  float bt = length(p - vec3(0.0, 1.2, 0.0)) - 0.36;
  if (bt < res.x + 0.08) {
    vec3 q = vec3(p.x, p.y, p.z * 1.3);
    float d = sdRoundCone(q, uJ[0], uJ[1], 0.128, 0.084) * k;
    d = smin(d, sdRoundCone(q, uJ[1], uJ[2], 0.084, 0.104) * k, 0.06);
    d = smin(d, sdRoundCone(q, uJ[2], uJ[3] - vec3(0.0, 0.075, 0.0), 0.104, 0.05) * k, 0.05);
    d = smin(d, sdRoundCone(p, uJ[5], uJ[9], 0.037, 0.037), 0.07);
    d = smin(d, sdEllipsoid(p - uJ[5], vec3(0.048, 0.05, 0.045)), 0.03);
    d = smin(d, sdEllipsoid(p - uJ[9], vec3(0.048, 0.05, 0.045)), 0.03);
    d = smin(d, sdEllipsoid(p - (uJ[2] + vec3(-0.052, -0.012, 0.064)), vec3(0.044, 0.037, 0.03)), 0.035);
    d = smin(d, sdEllipsoid(p - (uJ[2] + vec3(0.052, -0.012, 0.064)), vec3(0.044, 0.037, 0.03)), 0.035);
    d = smin(d, sdEllipsoid(p - (uJ[0] + vec3(-0.05, -0.03, -0.05)), vec3(0.06, 0.065, 0.05)), 0.04);
    d = smin(d, sdEllipsoid(p - (uJ[0] + vec3(0.05, -0.03, -0.05)), vec3(0.06, 0.065, 0.05)), 0.04);
    d = smin(d, sdRoundCone(p, uJ[3] - vec3(0.0, 0.075, 0.0), uJ[3] + vec3(0.0, 0.055, 0.008), 0.037, 0.031), 0.03);
    pick(res, d, M_COSTUME);
    // crystal trims: sweetheart neckline and waistband
    vec3 c = uJ[2];
    float trim = sdCapsule(p, c + vec3(-0.094, 0.1, 0.03), c + vec3(-0.02, 0.012, 0.094), 0.0045);
    trim = min(trim, sdCapsule(p, c + vec3(0.094, 0.1, 0.03), c + vec3(0.02, 0.012, 0.094), 0.0045));
    trim = min(trim, sdCapsule(p, c + vec3(-0.02, 0.012, 0.094), c + vec3(0.02, 0.012, 0.094), 0.0045));
    vec3 w = vec3(p.x, p.y - uJ[1].y + 0.012, p.z * 1.3);
    trim = min(trim, (length(vec2(length(w.xz) - 0.088, w.y)) - 0.0055) * k);
    pick(res, trim, M_CRYSTAL);
  }

  // head: skull, jaw, a nose in profile (always in shadow), combed hair, coiled bun
  vec3 hc = uJ[4];
  float bh = length(p - (hc + vec3(0.0, 0.03, -0.03))) - 0.19;
  if (bh < res.x + 0.05) {
    vec3 q = p - hc;
    float skull = sdEllipsoid(q - vec3(0.0, 0.012, -0.008), vec3(0.071, 0.087, 0.082));
    skull = smin(skull, sdEllipsoid(q - vec3(0.0, -0.04, 0.022), vec3(0.053, 0.051, 0.057)), 0.035);
    skull = smin(skull, sdRoundCone(q, vec3(0.0, -0.006, 0.074), vec3(0.0, -0.031, 0.088), 0.0068, 0.0105), 0.012);
    float neckBlend = smin(skull, res.x, 0.025);
    pick(res, skull, M_SKIN);
    res.x = min(res.x, neckBlend);
    float hair = max(sdEllipsoid(q - vec3(0.0, 0.017, -0.014), vec3(0.077, 0.093, 0.088)), dot(q, vec3(0.0, -0.5, 0.866)) - 0.014);
    vec3 b = q - vec3(0.0, 0.074, -0.088);
    float bun = length(b) - 0.045;
    if (uDetail > 0.5) {
      hair -= 0.0009 * sin(atan(q.x, -q.z) * 52.0);
      bun -= 0.0026 * sin(atan(b.y, b.x) * 6.0 + length(b.xy) * 110.0);
    }
    hair = smin(hair, bun, 0.012);
    pick(res, hair, M_HAIR);
  }

  // arms (costume sleeves) and hands
  for (int s = 0; s < 2; s++) {
    int o = s == 0 ? 5 : 9;
    vec3 sh = uJ[o], el = uJ[o + 1], wr = uJ[o + 2], tip = uJ[o + 3];
    float ba = min(sdCapsule(p, sh, el, 0.06), sdCapsule(p, el, tip, 0.08));
    if (ba > res.x + 0.08) continue;
    // one continuous cone per segment (no creases), muscle mass added as soft ellipsoid blends
    float a = sdRoundCone(p, sh, el, 0.036, 0.025);
    a = smin(a, sdRoundCone(p, el, wr, 0.025, 0.0175), 0.02);
    a = smin(a, length(p - mix(sh, el, 0.35)) - 0.034, 0.05);
    a = smin(a, length(p - mix(el, wr, 0.22)) - 0.025, 0.04);
    float blended = smin(a, res.x, 0.03);
    if (blended < res.x) res = vec2(blended, M_COSTUME);
    // the hand (palm + fingers) only when the ray is actually near it
    float bhand = length(p - mix(wr, tip, 0.5)) - 0.12;
    if (bhand < res.x + 0.02) {
      vec2 hd = s == 0 ? hand(p, wr, uHandL, 1.0) : hand(p, wr, uHandR, -1.0);
      hd.x = smin(hd.x, a, 0.012);
      pick(res, hd.x, hd.y);
    }
  }

  // legs (tights) and skates
  for (int s = 0; s < 2; s++) {
    int o = s == 0 ? 13 : 17;
    vec3 hip = uJ[o], kn = uJ[o + 1], an = uJ[o + 2];
    float bl = min(sdCapsule(p, hip, kn, 0.09), sdCapsule(p, kn, an, 0.07));
    if (bl < res.x + 0.09) {
      vec3 mid = mix(hip, kn, 0.5), calf = mix(kn, an, 0.3);
      float l = sdRoundCone(p, hip, mid, 0.068, 0.055);
      l = smin(l, sdRoundCone(p, mid, kn, 0.055, 0.04), 0.06);
      l = smin(l, sdRoundCone(p, kn, calf, 0.04, 0.043), 0.05);
      l = smin(l, sdRoundCone(p, calf, an, 0.043, 0.027), 0.05);
      float lb = smin(l, res.x, 0.06);
      float mat = l < res.x ? M_TIGHTS : res.y;
      res = vec2(min(res.x, lb), mat);
    }
    mat3 F = s == 0 ? uFootS : uFootF;
    float bs = length(p - (an + F * vec3(0.0, -0.06, 0.05))) - 0.18;
    if (bs < res.x + 0.02) {
      vec2 sk = skate(p, an, F);
      pick(res, sk.x, sk.y);
    }
  }
  return res;
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.00045;
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x +
                   e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

vec3 rotY(vec3 v, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z);
}

void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  float t0 = length(vWorld - ro);
  if (uMirror > 0.5) { ro.y = -ro.y; rd.y = -rd.y; }
  vec3 lro = rotY(ro, -uAngle);
  vec3 lrd = rotY(rd, -uAngle);

  float t = t0;
  float tEnd = t0 + uSpan;
  vec2 h = vec2(1.0, 0.0);
  bool hit = false;
  for (int i = 0; i < 160; i++) {
    if (i >= uSteps) break;
    h = map(lro + lrd * t);
    if (h.x < 0.0007 * t) { hit = true; break; }
    t += h.x * (h.x > 0.03 ? 1.0 : 0.88); // bolder steps in empty space, careful near the surface
    if (t > tEnd) break;
  }
  if (!hit) discard;

  vec3 lp = lro + lrd * t;
  vec3 ln = calcNormal(lp);
  vec3 wp = rotY(lp, uAngle);
  vec3 wn = rotY(ln, uAngle);
  vec3 V = -rd;
  float m = h.y;

  // two back lights and a side kicker: a crisp double rim; the face stays in shadow
  vec3 L1 = normalize(uLightPos - wp);
  vec3 L2 = normalize(vec3(3.2, 2.4, -2.6) - wp);
  vec3 S = normalize(uSidePos - wp);
  float ndv = clamp(dot(wn, V), 0.0, 1.0);
  float fres = 1.0 - ndv;
  float rim1 = pow(fres, 3.0) * clamp(dot(wn, L1) * 1.3 + 0.3, 0.0, 1.0);
  float rim2 = pow(fres, 4.0) * clamp(dot(wn, L2) * 1.3 + 0.2, 0.0, 1.0);
  float edge = smoothstep(0.8, 0.975, fres) * clamp(dot(wn, L1) + 0.4, 0.0, 1.0);
  float kick = pow(fres, 5.0) * clamp(dot(wn, S), 0.0, 1.0) * 0.4;
  float faceShadow = 1.0 - smoothstep(1.47, 1.53, lp.y);
  float fill = ndv * ndv * faceShadow;

  vec3 base = vec3(0.008, 0.011, 0.02);
  float rimAmt = 1.0, shine = 0.0, gloss = 32.0;
  if (m == M_BOOT) { base = vec3(0.1, 0.11, 0.125); rimAmt = 1.35; shine = 0.7; gloss = 80.0; }
  else if (m == M_HAIR) { base = vec3(0.004, 0.005, 0.008); rimAmt = 0.85; shine = 0.35; gloss = 24.0; }
  else if (m == M_TIGHTS) { base = vec3(0.012, 0.013, 0.02); rimAmt = 1.05; shine = 0.12; gloss = 18.0; }
  else if (m == M_SKIN) { base = vec3(0.006, 0.007, 0.011); rimAmt = 0.95; }
  else if (m == M_LACE) { base = vec3(0.16, 0.17, 0.19); rimAmt = 0.8; }

  vec3 col = base + vec3(0.012, 0.022, 0.04) * fill * (m == M_BOOT ? 3.0 : 1.0);
  col += uRimColor * (rim1 * uRim * rimAmt + kick);
  col += vec3(0.75, 0.85, 1.0) * (rim2 * 1.1 * rimAmt);
  col += mix(uRimColor, vec3(1.0), 0.6) * edge * 0.6 * rimAmt;
  vec3 H = normalize(L1 + V);
  col += vec3(0.9, 0.97, 1.0) * pow(clamp(dot(wn, H), 0.0, 1.0), gloss) * shine * 1.8;

  if (m == M_STEEL) {
    float spec = pow(clamp(dot(reflect(-L1, wn), V), 0.0, 1.0), 48.0);
    float spec2 = pow(clamp(dot(reflect(-L2, wn), V), 0.0, 1.0), 64.0);
    // polished steel mirrors the rink: dark ice below, the lit haze above, the lamp as a hard spark
    vec3 R = reflect(-V, wn);
    vec3 env = mix(vec3(0.02, 0.04, 0.06), vec3(0.45, 0.75, 0.9), smoothstep(-0.25, 0.45, R.y));
    env += vec3(0.9, 1.0, 1.1) * smoothstep(0.92, 0.99, dot(R, L1));
    col = env * 0.85 + uRimColor * fres * 0.8 + vec3(2.2, 2.5, 2.8) * (spec + spec2);
  } else if (m == M_COSTUME || m == M_CRYSTAL) {
    // sequins: each cell is a tiny mirror with its own tilt, so glints flicker as she turns
    float scale = m == M_CRYSTAL ? 900.0 : 420.0;
    vec3 cell = floor(lp * scale);
    float hsh = hash13(cell);
    vec3 jitter = vec3(hash13(cell + 7.1), hash13(cell + 3.7), hash13(cell + 1.3)) - 0.5;
    vec3 fn = normalize(wn + jitter * (m == M_CRYSTAL ? 1.2 : 0.9));
    float g1 = pow(clamp(dot(reflect(-L1, fn), V), 0.0, 1.0), 90.0);
    float g2 = pow(clamp(dot(reflect(-L2, fn), V), 0.0, 1.0), 90.0);
    // crystals follow a swirling embroidery on the bodice and sleeves instead of a flat scatter
    float swirl = sin(lp.y * 46.0 + atan(lp.x, lp.z) * 3.0 + sin(lp.y * 9.0) * 2.0);
    float embroidery = smoothstep(0.55, 0.9, swirl);
    float on = m == M_CRYSTAL ? step(0.2, hsh) : step(mix(0.93, 0.45, embroidery), hsh);
    col += vec3(1.0, 1.05, 1.1) * (g1 + g2 * 0.7) * on * uGlitter * (m == M_CRYSTAL ? 9.0 : 5.0);
    if (m == M_CRYSTAL) col += uRimColor * 0.05;
  } else if (m == M_HAIR) {
    float band = pow(1.0 - abs(dot(wn, L1)), 8.0);
    col += vec3(0.5, 0.65, 0.8) * band * 0.08;
  }

  float alpha = 1.0;
  if (uMirror > 0.5) {
    alpha = 0.5 * exp(-lp.y * 1.15);
    col *= vec3(0.75, 0.9, 1.1);
    wp.y = -wp.y;
  }
  vec4 clip = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`;
