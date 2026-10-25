import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

// Procedural instruments carved from ice. Each builder returns:
//   ice      merged geometry of the ice body
//   glow     thin inlays that carry light (purfling, f-holes, rims)
//   strings  string segments (rendered as vibrating light threads)
//   parts    per-note animated parts (piano keys, glock bars, timpani heads)
// Units are metres; origin on the floor under the instrument.

export type Seg = { from: THREE.Vector3; to: THREE.Vector3; midi?: number };
export interface NotePart {
  kind: "key" | "bar" | "head";
  midi: number;
  geo: THREE.BufferGeometry;
  pivot: THREE.Vector3; // keys press around this point; heads ripple from it
}
export interface InstrumentModel {
  ice: THREE.BufferGeometry;
  extra?: THREE.BufferGeometry[]; // more ice drawn with the same material (a bow, a pedestal)
  glow: THREE.BufferGeometry | null;
  strings: Seg[];
  parts: NotePart[];
  height: number;
  radius: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A block of ice: never a sharp CG box; its edges are rounded like carved, slightly melted ice. */
const Box = (w: number, h: number, d: number) => new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.32);

/** Hand-carved irregularity: every vertex moves a little by a smooth 3D noise of its position (the
 *  same shift for the same point, so separate pieces never open at their seams). */
function carve(g: THREE.BufferGeometry, amp = 0.0028, freq = 7) {
  const p = g.attributes.position as THREE.BufferAttribute;
  const n = (x: number, y: number, z: number) =>
    Math.sin(x * freq + Math.sin(y * freq * 1.7) * 1.3) * Math.cos(z * freq * 1.3 + Math.sin(x * freq * 0.7)) * 0.6 +
    Math.sin((x + y + z) * freq * 2.9) * 0.4;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + n(y, z, x) * amp, y + n(z, x, y) * amp * 0.6, z + n(x, y, z) * amp);
  }
  p.needsUpdate = true;
  return g;
}

export function merge(geos: THREE.BufferGeometry[]) {
  const clean = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!["position", "normal", "uv"].includes(k)) n.deleteAttribute(k);
    if (!n.attributes.uv) n.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
    if (!n.attributes.normal) n.computeVertexNormals();
    return n;
  });
  return mergeGeometries(clean, false)!;
}

/** Geometry placed with a transform. */
function place(g: THREE.BufferGeometry, pos: THREE.Vector3, rot?: THREE.Euler, scale?: THREE.Vector3) {
  const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot ?? new THREE.Euler()), scale ?? V(1, 1, 1));
  return g.applyMatrix4(m);
}

/** Cylinder between two points. */
function rod(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1 = r0, seg = 24) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Tube along points with a radius profile. */
function tube(points: THREE.Vector3[], radius: (t: number) => number, seg = 120, radial = 14, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, "centripetal");
  const frames = curve.computeFrenetFrames(seg, closed);
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const p = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      pos.push(p.x + r * (Math.cos(a) * N.x + Math.sin(a) * B.x), p.y + r * (Math.cos(a) * N.y + Math.sin(a) * B.y), p.z + r * (Math.cos(a) * N.z + Math.sin(a) * B.z));
    }
  }
  for (let i = 0; i < seg; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function lathe(profile: [number, number][], seg = 48) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
}

/** A slender ice pedestal from the floor up to just under a floating instrument. */
export function pedestal(ice: THREE.BufferGeometry, shrink = 1) {
  ice.computeBoundingBox();
  const b = ice.boundingBox!;
  const c = b.getCenter(new THREE.Vector3());
  const h = Math.max(0.2, b.min.y - 0.015);
  const r = 0.11 * shrink;
  return place(
    lathe([
      [0.001, 0], [r * 1.9, 0], [r * 2.0, 0.03], [r * 1.5, 0.05], [r * 0.45, 0.12],
      [r * 0.3, h * 0.5], [r * 0.4, h - 0.08], [r * 1.2, h - 0.03], [r * 1.25, h], [0.001, h],
    ], 40),
    V(c.x, 0, c.z),
  );
}

// ── violin family ───────────────────────────────────────────────────────────────────────────

/** Half-width of a violin-family body at height y (body length 1, y in [-0.5, 0.5]). */
function bodyHalfWidth(y: number) {
  const ell = (c: number, ry: number, w: number) => {
    const k = 1 - ((y - c) / ry) ** 2;
    return k > 0 ? w * Math.sqrt(k) : 0;
  };
  const upper = ell(0.27, 0.235, 0.2);
  const lower = ell(-0.265, 0.24, 0.258);
  const waist = 0.118 + 0.9 * Math.max(0, Math.abs(y + 0.005) - 0.02) ** 2.2;
  const cbout = y < 0.12 && y > -0.13 ? Math.min(waist, Math.max(upper, lower)) : 0;
  const corner = 0.03 * Math.exp(-(((y - 0.118) / 0.011) ** 2)) + 0.032 * Math.exp(-(((y + 0.128) / 0.011) ** 2));
  return Math.max(y > 0.12 || y < -0.13 ? Math.max(upper, lower) : cbout, 0.004) + corner;
}

/** Arched plates + ribs over the outline; returns ice geometry and the purfling / f-hole light. */
function violinBody(rib: number, arch: number) {
  const NU = 26, NV = 96;
  const pos: number[] = [];
  const idx: number[] = [];
  const grid = (sign: 1 | -1) => {
    const base = pos.length / 3;
    for (let i = 0; i <= NV; i++) {
      const y = 0.5 - i / NV;
      const w = bodyHalfWidth(y);
      const taperY = Math.sin(Math.PI * (i / NV)) ** 0.35;
      for (let j = 0; j <= NU; j++) {
        const u = -1 + (2 * j) / NU;
        const a = arch * Math.pow(Math.max(0, 1 - u * u), 0.75) * taperY * (sign > 0 ? 1 : 0.85);
        pos.push(u * w, y, sign * (rib / 2 + a));
      }
    }
    for (let i = 0; i < NV; i++)
      for (let j = 0; j < NU; j++) {
        const a = base + i * (NU + 1) + j, b = a + NU + 1;
        if (sign > 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
  };
  grid(1);
  grid(-1);
  const ribBase = pos.length / 3;
  const ring: [number, number][] = [];
  for (let i = 0; i <= NV; i++) ring.push([bodyHalfWidth(0.5 - i / NV), 0.5 - i / NV]);
  const outline = [...ring, ...ring.slice().reverse().map(([x, y]) => [-x, y] as [number, number])];
  for (const [x, y] of outline) pos.push(x, y, rib / 2, x, y, -rib / 2);
  for (let i = 0; i < outline.length - 1; i++) {
    const a = ribBase + i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const ice = new THREE.BufferGeometry();
  ice.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  ice.setIndex(idx);
  ice.computeVertexNormals();

  const inset = outline.filter((_, i) => i % 2 === 0).map(([x, y]) => V(x * 0.93, y * 0.97, rib / 2 + arch * 0.08 + 0.0015));
  const glows: THREE.BufferGeometry[] = [tube(inset, () => 0.0016, 400, 4, true)];
  for (const s of [-1, 1]) {
    const f: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const y = 0.09 - t * 0.2;
      const x = s * (0.072 + 0.016 * Math.sin(t * Math.PI * 2) - 0.01 * t);
      const w = bodyHalfWidth(y);
      f.push(V(x, y, rib / 2 + arch * Math.pow(Math.max(0, 1 - (x / w) ** 2), 0.75) + 0.002));
    }
    glows.push(tube(f, (t) => 0.0035 * (0.5 + 0.5 * Math.sin(Math.PI * t)) + 0.0012, 40, 6));
    glows.push(place(new THREE.SphereGeometry(0.006, 10, 8), f[0].clone()), place(new THREE.SphereGeometry(0.006, 10, 8), f[12].clone()));
  }
  return { ice, glow: merge(glows) };
}

function scroll(top: THREE.Vector3, size: number) {
  // Archimedean volute, two turns, at the head of the pegbox
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const a = t * Math.PI * 4;
    const r = size * (1 - t * 0.78);
    pts.push(V(0, top.y + size + Math.sin(a) * r, top.z - size * 0.15 + Math.cos(a) * r));
  }
  return tube(pts, (t) => size * 0.42 * (1 - t * 0.7), 120, 10);
}

function violinFamily(scale: number, rib: number, arch: number, neckLen: number, bowLen: number, chinrest = true) {
  const { ice: body, glow } = violinBody(rib, arch);
  const top = 0.5;
  const geos: THREE.BufferGeometry[] = [body];
  geos.push(place(Box(0.05, neckLen, 0.04), V(0, top + neckLen / 2, rib / 2 + 0.012)));
  // fingerboard, narrowing toward the nut
  const board = Box(0.06, neckLen + 0.24, 0.012);
  const bp = board.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) * (0.72 + 0.28 * (0.5 - bp.getY(i) / (neckLen + 0.24))));
  board.computeVertexNormals();
  geos.push(place(board, V(0, top + neckLen / 2 - 0.12, rib / 2 + arch * 0.6 + 0.022)));
  geos.push(place(Box(0.05, 0.006, 0.012), V(0, top + neckLen, rib / 2 + arch * 0.6 + 0.03)));
  // pegbox, scroll, pegs
  const boxH = 0.13;
  geos.push(place(Box(0.042, boxH, 0.045), V(0, top + neckLen + boxH / 2, rib / 2 + 0.01)));
  geos.push(scroll(V(0, top + neckLen + boxH, rib / 2 + 0.012), 0.032));
  for (let k = 0; k < 4; k++) {
    const y = top + neckLen + 0.025 + k * 0.03;
    const side = k % 2 ? 1 : -1;
    geos.push(rod(V(-0.03 * side, y, rib / 2 + 0.01), V(0.06 * side, y, rib / 2 + 0.012), 0.005, 0.0065, 8));
    geos.push(place(new THREE.SphereGeometry(0.014, 12, 8), V(0.07 * side, y, rib / 2 + 0.012), undefined, V(0.45, 1, 0.9)));
  }
  // bridge with feet and heart cut-out
  const bs = new THREE.Shape();
  bs.moveTo(-0.042, 0);
  bs.lineTo(-0.03, 0);
  bs.quadraticCurveTo(-0.02, 0.018, 0, 0.012);
  bs.quadraticCurveTo(0.02, 0.018, 0.03, 0);
  bs.lineTo(0.042, 0);
  bs.lineTo(0.036, 0.034);
  bs.quadraticCurveTo(0, 0.05, -0.036, 0.034);
  bs.closePath();
  const heart = new THREE.Path();
  heart.absarc(0, 0.027, 0.006, 0, Math.PI * 2, false);
  bs.holes.push(heart);
  const bridge = new THREE.ExtrudeGeometry(bs, { depth: 0.004, bevelEnabled: false, curveSegments: 16 });
  geos.push(place(bridge, V(0, -0.06, rib / 2 + arch * 0.9), new THREE.Euler(Math.PI / 2, 0, 0)));
  // tailpiece, chinrest, end button
  const ts = new THREE.Shape();
  ts.moveTo(-0.022, 0);
  ts.quadraticCurveTo(-0.028, -0.09, -0.008, -0.11);
  ts.lineTo(0.008, -0.11);
  ts.quadraticCurveTo(0.028, -0.09, 0.022, 0);
  ts.closePath();
  geos.push(place(new THREE.ExtrudeGeometry(ts, { depth: 0.008, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), V(0, -0.18, rib / 2 + arch * 0.55)));
  if (chinrest) geos.push(place(new THREE.SphereGeometry(0.05, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), V(0.07, -0.43, rib / 2 + 0.006), new THREE.Euler(Math.PI / 2, 0, 0), V(1, 0.25, 0.8)));
  geos.push(place(new THREE.SphereGeometry(0.008, 10, 8), V(0, -0.505, 0)));

  // strings: tailpiece → bridge → nut (the break angle over the bridge)
  const strings: Seg[] = [];
  for (let k = 0; k < 4; k++) {
    const x0 = -0.012 + k * 0.008, x1 = -0.016 + k * 0.0107, x2 = -0.009 + k * 0.006;
    const zT = rib / 2 + arch * 0.55 + 0.012, zB = rib / 2 + arch * 0.9 + 0.046, zN = rib / 2 + arch * 0.6 + 0.036;
    strings.push({ from: V(x0, -0.19, zT), to: V(x1, -0.06, zB) });
    strings.push({ from: V(x1, -0.06, zB), to: V(x2, top + neckLen, zN) });
  }

  // bow: cambered stick, hair ribbon, frog, tip
  const bowGeos: THREE.BufferGeometry[] = [];
  const stick: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) stick.push(V(0, (i / 10) * bowLen, -0.012 * Math.sin(Math.PI * (i / 10))));
  bowGeos.push(tube(stick, (t) => 0.0042 - t * 0.0016, 60, 8));
  bowGeos.push(place(Box(0.008, bowLen * 0.93, 0.0015), V(0, bowLen * 0.505, 0.014)));
  bowGeos.push(place(Box(0.014, 0.05, 0.022), V(0, 0.04, 0.008)));
  bowGeos.push(place(Box(0.008, 0.022, 0.02), V(0, bowLen - 0.006, 0.006)));

  const s = scale;
  const all = merge(geos).scale(s, s, s);
  const bow = merge(bowGeos).scale(s, s, s);
  strings.forEach((st) => {
    st.from.multiplyScalar(s);
    st.to.multiplyScalar(s);
  });
  glow.scale(s, s, s);
  return { body: all, bow, glow, strings };
}

function applyAll(m: THREE.Matrix4, geos: THREE.BufferGeometry[], segs: Seg[]) {
  geos.forEach((g) => g.applyMatrix4(m));
  segs.forEach((s) => {
    s.from.applyMatrix4(m);
    s.to.applyMatrix4(m);
  });
}

export function violin(): InstrumentModel {
  const v = violinFamily(0.52, 0.08, 0.05, 0.36, 1.4); // shown at display size beside the others
  // held as if played: tilted, floating; the bow crossing the strings
  applyAll(new THREE.Matrix4().compose(V(0, 1.25, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0.35, 1.05)), V(1, 1, 1)), [v.body, v.glow], v.strings);
  v.bow.applyMatrix4(new THREE.Matrix4().compose(V(-0.08, 0.8, 0.24), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.2, -0.95)), V(1, 1, 1)));
  const ice = merge([v.body, v.bow]);
  return { ice: merge([ice, pedestal(v.body)]), glow: v.glow, strings: v.strings, parts: [], height: 1.5, radius: 0.45 };
}

export function cello(): InstrumentModel {
  const c = violinFamily(0.76, 0.16, 0.045, 0.37, 0.95, false);
  const ice = merge([c.body, rod(V(0, -0.5 * 0.76, 0), V(0, -0.5 * 0.76 - 0.36, 0.02), 0.006, 0.003, 8)]);
  applyAll(new THREE.Matrix4().compose(V(0, 0.74, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.18, 0.25, 0.08)), V(1, 1, 1)), [ice, c.glow], c.strings);
  c.bow.applyMatrix4(new THREE.Matrix4().compose(V(0.32, 0.12, 0.25), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0.32)), V(1, 1, 1)));
  return { ice: merge([ice, c.bow]), glow: c.glow, strings: c.strings, parts: [], height: 1.45, radius: 0.5 };
}

// ── grand piano ──────────────────────────────────────────────────────────────────────────────

function caseShape(inset = 0) {
  const s = new THREE.Shape();
  const i = inset;
  s.moveTo(i, i);
  s.lineTo(1.48 - i, i);
  s.lineTo(1.48 - i, 0.6);
  s.bezierCurveTo(1.48 - i, 1.32 - i, 0.76 - i, 1.18, 0.64 - i, 1.76);
  s.bezierCurveTo(0.58 - i, 2.12 - i, 0.36, 2.22 - i, 0.13, 2.2 - i);
  s.lineTo(i, 2.13 - i);
  s.lineTo(i, i);
  return s;
}

export function piano(): InstrumentModel {
  const geos: THREE.BufferGeometry[] = [];
  const glows: THREE.BufferGeometry[] = [];
  const caseH = 0.3, bottom = 0.62;
  // rim: the case outline with the cavity cut out
  const rimShape = caseShape(0);
  rimShape.holes.push(new THREE.Path(caseShape(0.035).getPoints(80)));
  const rim = new THREE.ExtrudeGeometry(rimShape, { depth: caseH, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 80 });
  rim.rotateX(-Math.PI / 2);
  geos.push(place(rim, V(-0.74, bottom, 1.1)));
  // soundboard and the cast-iron frame, lightened with oval openings
  const board = new THREE.ExtrudeGeometry(caseShape(0.03), { depth: 0.02, bevelEnabled: false, curveSegments: 60 });
  board.rotateX(-Math.PI / 2);
  geos.push(place(board, V(-0.74, bottom + 0.04, 1.1)));
  const plate = caseShape(0.08);
  for (const [cx, cy, rx, ry] of [[0.42, 1.2, 0.17, 0.42], [0.92, 0.75, 0.2, 0.32], [0.3, 0.55, 0.14, 0.2]] as const) {
    const h = new THREE.Path();
    h.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, 0);
    plate.holes.push(h);
  }
  const iron = new THREE.ExtrudeGeometry(plate, { depth: 0.012, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, curveSegments: 60 });
  iron.rotateX(-Math.PI / 2);
  geos.push(place(iron, V(-0.74, bottom + 0.16, 1.1)));
  // lid propped open on the spine side; prop stick; music desk
  const lid = new THREE.ExtrudeGeometry(caseShape(0), { depth: 0.016, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.004, curveSegments: 80 });
  lid.rotateX(-Math.PI / 2);
  lid.applyMatrix4(new THREE.Matrix4().makeTranslation(-0.74, bottom + caseH + 0.012, 1.1).multiply(new THREE.Matrix4().makeRotationZ(0.68)));
  geos.push(lid);
  geos.push(rod(V(0.42, bottom + caseH, 0.15), V(0.18, bottom + caseH + 0.62, 0.15), 0.008, 0.007, 8));
  geos.push(place(Box(0.8, 0.28, 0.012), V(-0.02, bottom + caseH + 0.15, 0.82), new THREE.Euler(-0.32, 0, 0)));
  // keybed, key slip, cheek blocks
  geos.push(place(Box(1.5, 0.05, 0.3), V(0, bottom + 0.02, 1.25)));
  geos.push(place(Box(1.5, 0.05, 0.015), V(0, bottom + 0.06, 1.405)));
  for (const x of [-0.74, 0.74]) geos.push(place(Box(0.05, 0.12, 0.3), V(x, bottom + 0.08, 1.25)));
  // legs with casters; lyre with three pedals
  for (const [x, z] of [[-0.66, 1.12], [0.66, 1.12], [-0.42, -0.8]] as const) {
    geos.push(rod(V(x, 0.05, z), V(x, bottom, z), 0.035, 0.05, 14));
    geos.push(place(new THREE.SphereGeometry(0.035, 12, 8), V(x, 0.035, z)));
  }
  geos.push(rod(V(-0.06, 0.08, 0.98), V(-0.06, bottom, 0.98), 0.018, 0.018, 8));
  geos.push(rod(V(0.06, 0.08, 0.98), V(0.06, bottom, 0.98), 0.018, 0.018, 8));
  geos.push(place(Box(0.22, 0.05, 0.08), V(0, 0.08, 1.0)));
  for (const x of [-0.06, 0, 0.06]) geos.push(place(Box(0.02, 0.01, 0.09), V(x, 0.07, 1.08)));
  // a line of light along the case top
  glows.push(tube(caseShape(0.004).getPoints(160).map((p) => V(p.x - 0.74, bottom + caseH + 0.009, 1.1 - p.y)), () => 0.0028, 600, 4, true));

  // 88 keys (52 white, 36 black), each its own part so it presses with its note
  const parts: NotePart[] = [];
  const whiteW = 1.38 / 52;
  let w = 0;
  for (let midi = 21; midi <= 108; midi++) {
    const black = [1, 3, 6, 8, 10].includes(midi % 12);
    if (!black) {
      const x = -0.69 + (w + 0.5) * whiteW;
      parts.push({ kind: "key", midi, geo: Box(whiteW - 0.0016, 0.022, 0.15).translate(x, bottom + 0.067, 1.33), pivot: V(x, bottom + 0.067, 1.255) });
      w++;
    } else {
      const x = -0.69 + w * whiteW;
      parts.push({ kind: "key", midi, geo: Box(whiteW * 0.55, 0.026, 0.095).translate(x, bottom + 0.086, 1.3), pivot: V(x, bottom + 0.086, 1.255) });
    }
  }
  // strings fanning from the keyboard toward the tail
  const strings: Seg[] = [];
  for (let i = 0; i < 46; i++) {
    const t = i / 45;
    strings.push({ from: V(-0.66 + t * 1.3, bottom + 0.2, 0.92), to: V(-0.66 + t * 0.68, bottom + 0.2, -0.92 + t * 1.25 + (t > 0.6 ? (t - 0.6) * 0.6 : 0)) });
  }
  return { ice: merge(geos), glow: merge(glows), strings, parts, height: 1.6, radius: 1.2 };
}

// ── concert harp ─────────────────────────────────────────────────────────────────────────────

export function harp(): InstrumentModel {
  const geos: THREE.BufferGeometry[] = [];
  const glows: THREE.BufferGeometry[] = [];
  const H = 1.78;
  // fluted column
  const col = new THREE.CylinderGeometry(0.036, 0.042, H * 0.86, 48, 40);
  const cp = col.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i), z = cp.getZ(i), y = cp.getY(i);
    const k = 1 + 0.07 * Math.cos(Math.atan2(z, x) * 16) * (Math.abs(y) < H * 0.38 ? 1 : 0);
    cp.setX(i, x * k);
    cp.setZ(i, z * k);
  }
  col.computeVertexNormals();
  geos.push(place(col, V(-0.4, H * 0.43 + 0.12, 0)));
  // crown and plinth
  geos.push(place(lathe([[0.001, 0], [0.05, 0], [0.065, 0.02], [0.045, 0.05], [0.07, 0.09], [0.055, 0.12], [0.03, 0.15], [0.001, 0.17]]), V(-0.4, H * 0.86 + 0.1, 0)));
  geos.push(place(lathe([[0.001, 0], [0.11, 0], [0.12, 0.03], [0.08, 0.06], [0.06, 0.12], [0.001, 0.12]]), V(-0.4, 0, 0)));
  // base with seven pedals
  geos.push(place(Box(0.62, 0.09, 0.32), V(-0.08, 0.045, 0)));
  for (let k = 0; k < 7; k++) geos.push(place(Box(0.018, 0.008, 0.07), V(-0.3 + k * 0.07, 0.04, 0.19)));
  // neck: S-curve from the crown to the top of the soundboard, with tuning pins
  const neckPts = [V(-0.4, H - 0.02, 0), V(-0.18, H * 0.99, 0), V(0.08, H * 0.86, 0), V(0.32, H * 0.9, 0), V(0.52, H * 0.84, 0), V(0.6, H * 0.78, 0)];
  const neckCurve = new THREE.CatmullRomCurve3(neckPts, false, "centripetal");
  geos.push(tube(neckPts, () => 0.04, 160, 12).scale(1, 1, 0.55));
  // soundboard from beside the column up to the neck's end
  const sbA = V(-0.26, 0.11, 0), sbB = V(0.57, H * 0.79, 0);
  const sbDir = sbB.clone().sub(sbA);
  const sbLen = sbDir.length();
  const board = new THREE.CylinderGeometry(0.05, 0.17, sbLen, 4, 12);
  board.rotateY(Math.PI / 4);
  board.scale(1, 1, 0.5);
  board.translate(0, sbLen / 2, -0.02);
  board.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), sbDir.clone().normalize()));
  board.translate(sbA.x, sbA.y, sbA.z);
  geos.push(board);
  glows.push(tube([sbA.clone().add(V(0.02, 0.02, 0.05)), sbB.clone().add(V(0.0, -0.02, 0.03))], () => 0.003, 40, 5));
  // 36 strings from the neck down to the soundboard
  const strings: Seg[] = [];
  const midis = [38, 40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96, 98];
  for (let i = 0; i < 36; i++) {
    const t = i / 35;
    const top = neckCurve.getPointAt(0.12 + t * 0.8);
    const k = (top.x - sbA.x) / (sbB.x - sbA.x);
    const bottomP = sbA.clone().lerp(sbB, Math.max(0.02, Math.min(1, k)));
    strings.push({ from: bottomP.add(V(0, 0, 0.03)), to: top.clone().add(V(0, -0.02, 0)), midi: midis[i] });
    geos.push(rod(top.clone().add(V(0, 0, -0.02)), top.clone().add(V(0, 0, 0.04)), 0.003, 0.003, 6));
  }
  return { ice: merge(geos), glow: merge(glows), strings, parts: [], height: H + 0.12, radius: 0.6 };
}

// ── flute ────────────────────────────────────────────────────────────────────────────────────

export function flute(): InstrumentModel {
  const geos: THREE.BufferGeometry[] = [];
  const L = 0.67;
  geos.push(rod(V(0, 0, 0), V(0, L, 0), 0.0098, 0.0098, 20));
  geos.push(place(lathe([[0.001, 0], [0.011, 0], [0.012, 0.012], [0.008, 0.02], [0.001, 0.022]], 20), V(0, L, 0)));
  geos.push(place(new THREE.SphereGeometry(0.018, 16, 10), V(0, L - 0.07, 0.009), undefined, V(1, 1.4, 0.35)));
  for (const y of [0.11, L - 0.18]) geos.push(place(new THREE.TorusGeometry(0.0108, 0.0016, 6, 24), V(0, y, 0), new THREE.Euler(Math.PI / 2, 0, 0)));
  // key-work: cups with rings, the rod mechanism alongside
  for (let k = 0; k < 13; k++) {
    const y = 0.07 + k * 0.034 + (k > 8 ? 0.03 : 0);
    const r = k > 9 ? 0.0075 : 0.0068;
    geos.push(place(new THREE.CylinderGeometry(r, r, 0.004, 18), V(0, y, 0.0115), new THREE.Euler(Math.PI / 2, 0, 0)));
    geos.push(place(new THREE.TorusGeometry(r * 0.55, 0.0011, 6, 16), V(0, y, 0.0135)));
    geos.push(rod(V(0, y, 0.0105), V(0.011, y, 0.006), 0.0012, 0.0012, 5));
  }
  geos.push(rod(V(0.012, 0.05, 0.004), V(0.012, 0.52, 0.004), 0.0018, 0.0018, 6));
  const ice = merge(geos);
  // scaled up so it reads beside the others (it is a soloist here)
  ice.applyMatrix4(new THREE.Matrix4().compose(V(0.2, 1.3, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.4, 1.38)), V(1.6, 1.6, 1.6)));
  return { ice: merge([ice, pedestal(ice, 0.8)]), glow: null, strings: [], parts: [], height: 1.7, radius: 0.55 };
}

// ── French horn ──────────────────────────────────────────────────────────────────────────────

export function horn(): InstrumentModel {
  const geos: THREE.BufferGeometry[] = [];
  // coiled main tubing: two and a half wraps into the bell throat
  const pts: THREE.Vector3[] = [];
  const turns = 2.6;
  for (let i = 0; i <= 140; i++) {
    const t = i / 140;
    const a = t * Math.PI * 2 * turns;
    const r = 0.16 - t * 0.025 + 0.012 * Math.sin(a * 2);
    pts.push(V(Math.cos(a) * r, Math.sin(a) * r, (t - 0.5) * 0.07));
  }
  geos.push(tube(pts, (t) => 0.0065 + t * t * 0.007, 420, 12));
  const end = pts[pts.length - 1];
  const dir = end.clone().sub(pts[pts.length - 4]).normalize();
  // flared bell (exponential), continuing from the end of the coil
  const prof: [number, number][] = [];
  for (let i = 0; i <= 30; i++) prof.push([0.0135 + 0.142 * Math.pow(i / 30, 4.2), (i / 30) * 0.3]);
  prof.push([0.152, 0.3], [0.147, 0.296]);
  const bell = lathe(prof, 48);
  bell.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), V(dir.x * 0.3, dir.y * 0.3, 1).normalize()));
  bell.translate(end.x, end.y, end.z);
  geos.push(bell);
  // leadpipe and mouthpiece
  geos.push(tube([V(0.16, 0, -0.035), V(0.22, -0.06, -0.02), V(0.3, -0.04, 0), V(0.36, 0.0, 0.01)], (t) => 0.0045 + t * 0.0015, 60, 10));
  geos.push(place(lathe([[0.001, 0], [0.006, 0], [0.004, 0.03], [0.011, 0.045], [0.001, 0.048]], 16), V(0.36, 0, 0.01), new THREE.Euler(0, 0, -Math.PI / 2)));
  // rotary valves with caps and levers; tuning slides
  for (let k = 0; k < 3; k++) {
    const p = V(0.05 + k * 0.035, -0.11, 0.02);
    geos.push(place(new THREE.CylinderGeometry(0.014, 0.014, 0.05, 20), p.clone(), new THREE.Euler(Math.PI / 2, 0, 0)));
    geos.push(place(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 20), p.clone().add(V(0, 0, 0.028)), new THREE.Euler(Math.PI / 2, 0, 0)));
    geos.push(rod(p.clone().add(V(0, 0.016, 0.03)), p.clone().add(V(0.01, 0.07, 0.045)), 0.0022, 0.0022, 6));
    geos.push(tube([p.clone().add(V(0, -0.012, 0)), p.clone().add(V(-0.01, -0.06 - k * 0.01, 0)), p.clone().add(V(0.012, -0.075 - k * 0.01, 0)), p.clone().add(V(0.022, -0.012, 0))], () => 0.0042, 50, 8));
  }
  const ice = merge(geos);
  ice.applyMatrix4(new THREE.Matrix4().compose(V(0, 1.08, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, -0.5, 0.2)), V(1.6, 1.6, 1.6)));
  return { ice: merge([ice, pedestal(ice)]), glow: null, strings: [], parts: [], height: 1.45, radius: 0.5 };
}

// ── timpani pair ─────────────────────────────────────────────────────────────────────────────

function kettle(r: number, x: number, z: number, midi: number, geos: THREE.BufferGeometry[], glows: THREE.BufferGeometry[], parts: NotePart[]) {
  const top = 0.82;
  const prof: [number, number][] = [[0.001, top - r * 0.85]];
  for (let i = 1; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 0.5;
    prof.push([r * Math.sin(a) * (0.92 + 0.08 * Math.sin(a)), top - r * 0.85 * Math.cos(a)]);
  }
  prof.push([r * 1.02, top], [r * 0.99, top + 0.005]);
  geos.push(place(lathe(prof, 64), V(x, 0, z)));
  geos.push(place(new THREE.TorusGeometry(r * 1.02, 0.012, 10, 64), V(x, top + 0.004, z), new THREE.Euler(Math.PI / 2, 0, 0)));
  // tension rods with T-handles
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const p0 = V(x + Math.cos(a) * (r + 0.02), top - 0.18, z + Math.sin(a) * (r + 0.02));
    const p1 = V(x + Math.cos(a) * (r + 0.02), top + 0.03, z + Math.sin(a) * (r + 0.02));
    geos.push(rod(p0, p1, 0.005, 0.005, 6));
    geos.push(rod(p1.clone().add(V(-Math.sin(a) * 0.025, 0, Math.cos(a) * 0.025)), p1.clone().add(V(Math.sin(a) * 0.025, 0, -Math.cos(a) * 0.025)), 0.004, 0.004, 6));
  }
  // legs, base ring, pedal
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    geos.push(rod(V(x + Math.cos(a) * r * 0.6, top - r * 0.85 + 0.02, z + Math.sin(a) * r * 0.6), V(x + Math.cos(a) * r * 0.85, 0.03, z + Math.sin(a) * r * 0.85), 0.012, 0.016, 8));
  }
  geos.push(place(new THREE.TorusGeometry(r * 0.85, 0.012, 8, 48), V(x, 0.03, z), new THREE.Euler(Math.PI / 2, 0, 0)));
  geos.push(place(Box(0.1, 0.02, 0.18), V(x, 0.04, z + r * 0.7), new THREE.Euler(0.25, 0, 0)));
  glows.push(place(new THREE.TorusGeometry(r, 0.0025, 6, 96), V(x, top + 0.016, z), new THREE.Euler(Math.PI / 2, 0, 0)));
  // the head is its own part so it can ripple when struck
  const head = new THREE.RingGeometry(0.002, r * 0.99, 64, 24);
  head.rotateX(-Math.PI / 2);
  head.translate(x, top + 0.008, z);
  parts.push({ kind: "head", midi, geo: head, pivot: V(x, top + 0.008, z) });
}

export function timpani(): InstrumentModel {
  const geos: THREE.BufferGeometry[] = [];
  const glows: THREE.BufferGeometry[] = [];
  const parts: NotePart[] = [];
  kettle(0.34, -0.38, 0, 45, geos, glows, parts);
  kettle(0.29, 0.36, 0.08, 50, geos, glows, parts);
  for (const s of [-1, 1]) {
    const a = V(-0.5 + s * 0.04, 0.84, 0.12), b = V(-0.18 + s * 0.06, 0.86, 0.32);
    geos.push(rod(a, b, 0.005, 0.005, 6));
    geos.push(place(new THREE.SphereGeometry(0.022, 14, 10), a));
  }
  return { ice: merge(geos), glow: merge(glows), strings: [], parts, height: 1.0, radius: 0.8 };
}

// ── glockenspiel: ice bars ───────────────────────────────────────────────────────────────────

export function glock(): InstrumentModel {
  const geos: THREE.BufferGeometry[] = [];
  const parts: NotePart[] = [];
  const top = 0.86;
  const caseW = 0.95;
  geos.push(place(Box(caseW, 0.05, 0.36), V(0, top - 0.04, 0)));
  for (const s of [-1, 1]) {
    geos.push(rod(V(s * 0.36, 0.02, -0.16), V(s * 0.3, top - 0.06, 0.12), 0.012, 0.012, 8));
    geos.push(rod(V(s * 0.36, 0.02, 0.16), V(s * 0.3, top - 0.06, -0.12), 0.012, 0.012, 8));
  }
  // bars: naturals in front, sharps raised behind, shortening with pitch
  let nat = 0;
  const naturals = [79, 81, 83, 84, 86, 88, 89, 91, 93, 95, 96, 98, 100, 101, 103, 105, 107, 108];
  const xOf = (i: number) => -0.42 + i * 0.05;
  for (let midi = 79; midi <= 108; midi++) {
    const len = 0.19 - (midi - 79) * 0.0036;
    if (naturals.includes(midi)) {
      const x = xOf(nat++);
      parts.push({ kind: "bar", midi, geo: Box(0.042, 0.012, len).translate(x, top + 0.002, 0.08 - (0.19 - len) * 0.5), pivot: V(x, top, 0.08) });
    } else {
      const x = xOf(nat) - 0.025;
      parts.push({ kind: "bar", midi, geo: Box(0.038, 0.012, len * 0.85).translate(x, top + 0.025, -0.1), pivot: V(x, top + 0.02, -0.1) });
    }
  }
  geos.push(place(Box(caseW - 0.05, 0.01, 0.012), V(0, top - 0.008, 0.03)));
  geos.push(place(Box(caseW - 0.05, 0.03, 0.012), V(0, top + 0.008, -0.1)));
  for (const s of [-1, 1]) {
    const a = V(0.12 + s * 0.05, top + 0.05, 0.2), b = V(0.3 + s * 0.06, top + 0.07, 0.42);
    geos.push(rod(a, b, 0.004, 0.004, 6));
    geos.push(place(new THREE.SphereGeometry(0.014, 12, 8), a));
  }
  return { ice: merge(geos), glow: null, strings: [], parts, height: 1.0, radius: 0.55 };
}

const carved = (build: () => InstrumentModel) => (): InstrumentModel => {
  const m = build();
  return { ...m, ice: carve(m.ice) };
};

export const BUILDERS = {
  violin: carved(violin),
  cello: carved(cello),
  piano: carved(piano),
  harp: carved(harp),
  flute: carved(flute),
  horn: carved(horn),
  timpani: carved(timpani),
  glock: carved(glock),
};
