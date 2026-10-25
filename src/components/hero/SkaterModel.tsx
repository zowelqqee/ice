"use client";

// The hero skater as a glass figure (model built by scripts/skater/: MakeHuman CC0 body; costume,
// skates and hair ours), posed as in the costume sketch: on the left skate, right leg in passé,
// arms rounded overhead. No colours, only the form: clear through the middle, bright at the
// edges, with reflections and glints from the stage lights, the site's cyan rim, a faint thin-film
// shimmer, spun-glass hair and sparkle points for the crystals. She spins on her blade.

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { skaterPoints } from "./Skater";
import { clipPlanes, formVisible } from "./morph";
import { LOGO_CLEF } from "@/components/brand/logo";
import type { StageUniforms } from "./uniforms";

export const SKATER_MODEL = "/models/skater.glb";
const MODEL_YAW = 0; // the model faces +Z (the camera) at angle 0
const FILL_POS = new THREE.Vector3(2.6, 2.4, 6.0);
const TINT = new THREE.Color("#cdeffd");

// parts (glTF node names) that would only double up behind the glass
const HIDDEN = new Set(["sheer", "brows", "lashes"]);

type Shared = {
  uL1: { value: THREE.Vector3 }; // view-space directions to the back light, kicker and fill
  uL2: { value: THREE.Vector3 };
  uL3: { value: THREE.Vector3 };
  uW1: { value: THREE.Vector3 }; // the same in world space (hair strands)
  uW2: { value: THREE.Vector3 };
  uW3: { value: THREE.Vector3 };
};

const GLITTER = /* glsl */ `
float h13(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
// tiny facets with random tilts: they flash only when they catch a light
float glints(vec3 lp, vec3 N, vec3 V, float scale, float density) {
  vec3 q = lp * scale;
  vec3 cell = floor(q);
  if (h13(cell) < 1.0 - density) return 0.0;
  float dotMask = 1.0 - smoothstep(0.16, 0.3, length(fract(q) - 0.5));
  vec3 fn = normalize(N + (vec3(h13(cell + 7.1), h13(cell + 3.7), h13(cell + 1.3)) - 0.5) * 1.3);
  return (pow(clamp(dot(reflect(-uL1, fn), V), 0.0, 1.0), 70.0)
        + 0.8 * pow(clamp(dot(reflect(-uL2, fn), V), 0.0, 1.0), 70.0)
        + 0.5 * pow(clamp(dot(reflect(-uL3, fn), V), 0.0, 1.0), 70.0)) * dotMask;
}`;

interface GlassLook {
  body: number; // opacity through the middle (how much it darkens what is behind)
  edge: number; // extra opacity and brightness toward the silhouette
  glitter: number; // density of glinting facets
  sparkle?: boolean; // crystals: points of light
  solid?: boolean; // writes depth like cast glass: what lies behind it inside the figure is hidden
  inside?: boolean; // the back faces of a solid part, drawn first (the inner surface of the glass)
}

/** Glass on top of three's physical material: the material supplies reflections and specular
 *  highlights (diffuse is black), the shader adds the edge glow, rim and glints, and writes
 *  premultiplied colour so the glass both lets the stage through and adds light to it. */
function glass(stage: StageUniforms, shared: Shared, env: THREE.Texture, look: GlassLook, head: THREE.Vector3, clip: THREE.Plane) {
  const m = new THREE.MeshPhysicalMaterial({
    color: "#000000",
    roughness: look.sparkle ? 0.02 : 0.07,
    metalness: 0,
    ior: 1.5,
    specularIntensity: 1,
    clearcoat: look.sparkle ? 1 : 0.5,
    clearcoatRoughness: 0.04,
    iridescence: look.sparkle ? 0 : 0.15,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
    envMap: env,
    envMapIntensity: look.sparkle ? 2.2 : look.inside ? 0.15 : 0.32,
    transparent: true,
    depthWrite: !!look.solid && !look.inside,
    side: look.inside ? THREE.BackSide : look.solid ? THREE.FrontSide : THREE.DoubleSide,
    premultipliedAlpha: true,
    clippingPlanes: [clip],
  });
  const extra = { uTint: { value: TINT }, uHead: { value: head } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, extra, { uRimColor: stage.uRimColor, uRim: stage.uRim, uGlitter: stage.uGlitter });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocalP;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocalP = transformed;");
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vLocalP;
uniform vec3 uL1; uniform vec3 uL2; uniform vec3 uL3;
uniform vec3 uRimColor; uniform float uRim; uniform float uGlitter; uniform vec3 uTint; uniform vec3 uHead;
${GLITTER}`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
  vec3 Nr = normalize(normal);
  vec3 Vr = normalize(vViewPosition);
  float ndv = clamp(abs(dot(Nr, Vr)), 0.0, 1.0);
  // the face is all small curves: keep its glass quiet so it reads as a shape, not a glow
  float calm = 1.0 - 0.72 * (1.0 - smoothstep(0.09, 0.17, distance(vLocalP, uHead)));
  float fres = pow(1.0 - ndv, 2.2) * calm;
  float r1 = pow(1.0 - ndv, 3.0) * clamp(dot(Nr, uL1) * 1.3 + 0.3, 0.0, 1.0);
  float r2 = pow(1.0 - ndv, 4.0) * clamp(dot(Nr, uL2) * 1.3 + 0.2, 0.0, 1.0);
  vec3 refl = outgoingLight * mix(0.45, 1.0, calm);  // reflections and highlights (no diffuse)
  vec3 col = refl
           + uTint * fres * ${look.edge.toFixed(2)} * 0.55
           + uTint * pow(1.0 - ndv, 1.2) * calm * 0.12  // light gathered inside the glass
           + uRimColor * r1 * uRim * 0.42
           + vec3(0.8, 0.9, 1.0) * r2 * 0.6
           + vec3(1.0, 1.04, 1.1) * glints(vLocalP, Nr, Vr, 420.0, ${look.glitter.toFixed(3)}) * uGlitter * 1.4;
  ${look.sparkle ? "col *= 1.8;" : ""}
  float a = clamp(${look.body.toFixed(2)} + ${look.edge.toFixed(2)} * fres + dot(refl, vec3(0.3, 0.5, 0.2)) * 0.5, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`,
      )
      // the hero renders display-referred colour into a linear target; colour is premultiplied
      .replace("#include <colorspace_fragment>", "gl_FragColor.rgb = sRGBTransferOETF( vec4(gl_FragColor.rgb, 1.0) ).rgb;")
      .replace("#include <premultiplied_alpha_fragment>", "");
  };
  m.customProgramCacheKey = () => "glass" + JSON.stringify(look);
  return m;
}

/** Spun-glass hair (glTF LINES): anisotropic highlights from the stage lights, fading tips. */
function glassStrands(geom: THREE.BufferGeometry, shared: Shared, stage: StageUniforms, clip: THREE.Plane) {
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  const idx = geom.getIndex();
  const tan = new Float32Array(pos.count * 3);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const n = idx ? idx.count : pos.count;
  for (let i = 0; i < n; i += 2) {
    const i0 = idx ? idx.getX(i) : i;
    const i1 = idx ? idx.getX(i + 1) : i + 1;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1).sub(a);
    for (const k of [i0, i1]) {
      tan[k * 3] += b.x;
      tan[k * 3 + 1] += b.y;
      tan[k * 3 + 2] += b.z;
    }
  }
  geom.setAttribute("aTangent", new THREE.BufferAttribute(tan, 3));
  const col = geom.getAttribute("color");
  if (col) geom.setAttribute("aStrand", col);
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false, // normal blending at low opacity: dense strands settle to a frosted tone
    clipping: true,
    clippingPlanes: [clip],
    uniforms: { ...shared, uRimColor: stage.uRimColor, uRim: stage.uRim, uTint: { value: TINT } },
    vertexShader: /* glsl */ `
attribute vec3 aTangent;
attribute vec4 aStrand;
varying vec3 vT;
varying vec3 vV;
varying vec2 vS;
#include <clipping_planes_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vT = normalize(mat3(modelMatrix) * aTangent + 1e-6);
  vV = normalize(cameraPosition - wp.xyz);
  vS = aStrand.xy;
  vec4 mvPosition = viewMatrix * wp;
  #include <clipping_planes_vertex>
  gl_Position = projectionMatrix * mvPosition;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uW1; uniform vec3 uW2; uniform vec3 uW3;
uniform vec3 uRimColor; uniform float uRim; uniform vec3 uTint;
varying vec3 vT;
varying vec3 vV;
varying vec2 vS;
#include <clipping_planes_pars_fragment>
float spec(vec3 T, vec3 L, vec3 V) {
  float th = dot(T, normalize(L + V));
  return pow(sqrt(max(0.0, 1.0 - th * th)), 120.0);
}
void main() {
  #include <clipping_planes_fragment>
  vec3 T = normalize(vT);
  float tv = dot(T, vV);
  float edge = 1.0 - sqrt(max(0.0, 1.0 - tv * tv)); // strands seen end-on glow a little
  vec3 c = uTint * (0.16 + 0.08 * vS.y + 0.12 * edge)
         + vec3(0.9, 0.96, 1.0) * (spec(T, uW1, vV) * 0.55 + spec(T, uW3, vV) * 0.3)
         + uRimColor * spec(T, uW2, vV) * 0.25 * uRim * 0.4;
  float a = 0.09 * (1.0 - smoothstep(0.7, 1.0, vS.x));
  gl_FragColor = vec4(sRGBTransferOETF(vec4(c, 1.0)).rgb, a);
}`,
  });
}

/** The reflection in the ice: a faint glass silhouette fading with depth below the surface. */
function mirrorMaterial(clip: THREE.Plane) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    clipping: true,
    clippingPlanes: [clip],
    uniforms: { uTint: { value: TINT } },
    vertexShader: /* glsl */ `
varying float vY;
varying float vF;
#include <clipping_planes_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vY = wp.y;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vF = pow(1.0 - abs(dot(n, normalize(cameraPosition - wp.xyz))), 2.0);
  vec4 mvPosition = viewMatrix * wp;
  #include <clipping_planes_vertex>
  gl_Position = projectionMatrix * mvPosition;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uTint;
varying float vY;
varying float vF;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  float a = 0.16 * exp(vY * 1.3) * (0.25 + vF);
  gl_FragColor = vec4(uTint * a, 1.0);
}`,
  });
}

function useEnvMap() {
  const gl = useThree((s) => s.gl);
  const env = useMemo(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const t = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    return t;
  }, [gl]);
  useEffect(() => () => env.dispose(), [env]);
  return env;
}

/** Height of the glass clef on the ice (her height with arms raised). */
const CLEF_HEIGHT = 1.95;
let clefGeo: THREE.BufferGeometry | null = null;
/** The logo's treble clef as a solid: extruded, bevelled, standing on the ice with its stem on
 *  the spin axis (built once from the vector shape). */
function clefGeometry() {
  if (clefGeo) return clefGeo;
  const svg = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${LOGO_CLEF}"/></svg>`);
  const shapes = svg.paths.flatMap((p) => SVGLoader.createShapes(p));
  const depth = 34; // logo units (the clef is ~754 tall)
  const g = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: 9, bevelSize: 5, bevelSegments: 3, curveSegments: 10 });
  g.computeBoundingBox();
  const bottom = g.boundingBox!.max.y;
  const s = CLEF_HEIGHT / (bottom - g.boundingBox!.min.y);
  // the stem stands on the spin axis; y flips (the artwork is top-down), z flips too so the faces
  // keep their winding
  g.translate(-1152, -bottom, -depth / 2);
  g.scale(s, -s, -s);
  clefGeo = g;
  return g;
}

export function SkaterModel({ stage, mirror = false }: { stage: StageUniforms; mirror?: boolean }) {
  const gltf = useGLTF(SKATER_MODEL, false, true);
  const env = useEnvMap();
  const shared = useMemo<Shared>(
    () => ({
      uL1: { value: new THREE.Vector3() },
      uL2: { value: new THREE.Vector3() },
      uL3: { value: new THREE.Vector3() },
      uW1: { value: new THREE.Vector3() },
      uW2: { value: new THREE.Vector3() },
      uW3: { value: new THREE.Vector3() },
    }),
    [],
  );

  const { scene, fit, clef } = useMemo(() => {
    const scene = gltf.scene.clone(true);
    scene.updateMatrixWorld(true);
    const at = (name: string) => scene.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3();
    const pivot = at("anchor_pivot");
    const lift = new THREE.Vector3(0, 0.002, 0);
    const fit = {
      offset: new THREE.Vector3(-pivot.x, 0.002 - pivot.y, -pivot.z),
      anchors: [at("anchor_toe"), at("anchor_tip_l"), at("anchor_tip_r")].map((p) => p.sub(pivot).add(lift)),
    };

    // head centre (model space), from the scalp: the glass is calmer around the face
    const cap = scene.getObjectByName("hair_cap") as THREE.Mesh | undefined;
    const head = new THREE.Vector3(0, 1.6, 0);
    if (cap) {
      cap.geometry.computeBoundingBox();
      cap.geometry.boundingBox!.getCenter(head).applyMatrix4(cap.matrixWorld);
      head.y -= 0.03;
    }
    const cut = clipPlanes.girl;
    const solid = glass(stage, shared, env, { body: 0.06, edge: 0.75, glitter: 0.004, solid: true }, head, cut);
    const velvet = glass(stage, shared, env, { body: 0.05, edge: 0.7, glitter: 0.02, solid: true }, head, cut);
    const inside = glass(stage, shared, env, { body: 0.03, edge: 0.55, glitter: 0, solid: true, inside: true }, head, cut);
    const frosted = glass(stage, shared, env, { body: 0.42, edge: 0.6, glitter: 0.01 }, head, cut); // hair mass: denser, so the head holds its shape against the lamp
    const chiffon = glass(stage, shared, env, { body: 0.03, edge: 0.6, glitter: 0.02 }, head, cut);
    const sparkle = glass(stage, shared, env, { body: 0.1, edge: 0.9, glitter: 0, sparkle: true }, head, cut);
    const mirrorMat = mirrorMaterial(clipPlanes.girlMirror);
    // by part name (node names survive the optimiser; identical placeholder materials do not)
    const byPart: Record<string, THREE.Material> = {
      velvet,
      skirt_outer: chiffon,
      skirt_middle: chiffon,
      skirt_inner: chiffon,
      crystals: sparkle,
      veins: sparkle,
      hair_cap: frosted,
      bun_core: frosted,
    };

    // statues have smooth eyes: replace the eyeballs (iris and cornea read as rings in glass)
    // with plain spheres of the same size and place
    const eyes = scene.getObjectByName("eyes") as THREE.Mesh | undefined;
    if (eyes) {
      const pos = eyes.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (const side of [-1, 1]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < pos.count; i++) {
          const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(eyes.matrixWorld);
          if (Math.sign(v.x - head.x) === side) pts.push(v);
        }
        if (!pts.length) continue;
        const c = pts.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(pts.length);
        const r = pts.reduce((acc, v) => acc + v.distanceTo(c), 0) / pts.length;
        const ball = new THREE.Mesh(new THREE.SphereGeometry(r * 0.96, 24, 16), solid);
        ball.name = "eyeball";
        ball.position.copy(c);
        scene.add(ball);
      }
      eyes.visible = false;
    }

    const backs: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const obj = o as THREE.Mesh | THREE.LineSegments;
      if (!(obj as THREE.Mesh).isMesh && !(obj as THREE.LineSegments).isLineSegments) return;
      const name = obj.name;
      obj.frustumCulled = false;
      if (name === "eyeball") {
        obj.renderOrder = 3;
        if (mirror) obj.visible = false;
        return;
      }
      if (HIDDEN.has(name) || name === "eyes") {
        obj.visible = false;
        return;
      }
      const lines = (obj as THREE.LineSegments).isLineSegments;
      if (mirror) {
        if (lines || name === "crystals" || name === "veins") obj.visible = false;
        else obj.material = mirrorMat;
        obj.renderOrder = 1;
        return;
      }
      if (lines) {
        obj.material = glassStrands(obj.geometry, shared, stage, cut);
        obj.renderOrder = 6;
        return;
      }
      obj.material = byPart[name] ?? solid;
      obj.renderOrder = name === "crystals" || name === "veins" ? 5 : name.startsWith("skirt") ? 4 : name === "hair_cap" || name === "bun_core" ? 3.5 : 3;
      if ((obj.material as THREE.MeshPhysicalMaterial).depthWrite) backs.push(obj as THREE.Mesh);
    });
    // inner surfaces of the depth-writing glass, drawn just before it
    for (const m of backs) {
      const b = new THREE.Mesh(m.geometry, inside);
      b.renderOrder = 2.9;
      b.frustumCulled = false;
      m.parent!.add(b);
      b.position.copy(m.position);
      b.quaternion.copy(m.quaternion);
      b.scale.copy(m.scale);
    }

    // the treble clef from the logo, in the same glass, standing where she stands
    const clef = new THREE.Group();
    const far = new THREE.Vector3(0, 99, 0); // no face to calm
    const clefGlass = mirror
      ? [mirrorMaterial(clipPlanes.clefMirror)]
      : [
          glass(stage, shared, env, { body: 0.03, edge: 0.55, glitter: 0, solid: true, inside: true }, far, clipPlanes.clef),
          glass(stage, shared, env, { body: 0.07, edge: 0.85, glitter: 0.012, solid: true }, far, clipPlanes.clef),
        ];
    clefGlass.forEach((m, i) => {
      const mesh = new THREE.Mesh(clefGeometry(), m);
      mesh.renderOrder = mirror ? 1 : i === 0 ? 2.9 : 3;
      mesh.frustumCulled = false;
      clef.add(mesh);
    });
    return { scene, fit, clef };
  }, [gltf.scene, stage, shared, mirror, env]);

  const figure = useRef<THREE.Group>(null);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const center = useMemo(() => new THREE.Vector3(0, 1.1, 0), []);

  useFrame((state) => {
    const f = figure.current;
    if (!f) return;
    f.rotation.y = stage.uAngle.value + MODEL_YAW;
    scene.visible = formVisible("girl");
    clef.visible = formVisible("clef");
    const view = state.camera.matrixWorldInverse;
    shared.uW1.value.copy(stage.uLightPos.value).sub(center).normalize();
    shared.uW2.value.copy(stage.uSidePos.value).sub(center).normalize();
    shared.uW3.value.copy(FILL_POS).sub(center).normalize();
    shared.uL1.value.copy(shared.uW1.value).transformDirection(view);
    shared.uL2.value.copy(shared.uW2.value).transformDirection(view);
    shared.uL3.value.copy(shared.uW3.value).transformDirection(view);
    if (!mirror) {
      f.updateMatrixWorld();
      skaterPoints.toeF.copy(tmp.copy(fit.anchors[0]).applyMatrix4(f.matrixWorld));
      skaterPoints.tipL.copy(tmp.copy(fit.anchors[1]).applyMatrix4(f.matrixWorld));
      skaterPoints.tipR.copy(tmp.copy(fit.anchors[2]).applyMatrix4(f.matrixWorld));
    }
  });

  return (
    <group scale={mirror ? [1, -1, 1] : [1, 1, 1]}>
      {!mirror && <StageLights stage={stage} />}
      <group ref={figure}>
        <group position={fit.offset}>
          <primitive object={scene} />
        </group>
        <primitive object={clef} />
      </group>
    </group>
  );
}

/** Lights for the glass highlights (the set pieces have their own shaders and ignore them). */
function StageLights({ stage }: { stage: StageUniforms }) {
  const back = useRef<THREE.DirectionalLight>(null);
  const kick = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    back.current?.position.copy(stage.uLightPos.value);
    kick.current?.position.copy(stage.uSidePos.value);
    if (back.current) back.current.intensity = 3 + stage.uPulse.value * 1.5;
  });
  return (
    <>
      <directionalLight ref={back} color="#e8f7ff" intensity={3} />
      <directionalLight ref={kick} color="#8ff2ff" intensity={1.6} />
      <directionalLight position={FILL_POS} color="#f4f0ff" intensity={1.2} />
    </>
  );
}

useGLTF.preload(SKATER_MODEL, false, true);
