"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  glowFragment,
  iceFragment,
  arenaFragment,
  curtainFragment,
  ringFragment,
  traceFragment,
  snowFragment,
  snowVertex,
  sprayFragment,
  sprayVertex,
  screenVertex,
  textureFragment,
  worldVertex,
} from "./shaders/stage";
import { LIGHT_BOTTOM, LIGHT_TOP, type StageUniforms } from "./uniforms";
import { spin } from "@/lib/spin";
import { heroScroll, pointer } from "@/lib/pointer";
import { LOGO_SWOOSH } from "@/components/brand/logo";
import { CURTAIN_TIME, MORPH_TOP, curtains, morph } from "./morph";

/** 0 closed .. 1 parted to rest: eased from the cue (open from the start under reduced motion). */
function curtainIntro() {
  if (spin.still) return curtains.stillClosed ? 0 : 1;
  if (spin.reduced) return 1;
  if (curtains.cueAt < 0) return 0;
  const t = Math.min(1, (performance.now() - curtains.cueAt) / 1000 / CURTAIN_TIME);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function Ice({ stage }: { stage: StageUniforms }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: iceFragment,
        transparent: true,
        depthWrite: true,
        uniforms: {
          uTime: stage.uTime,
          uAngle: stage.uAngle,
          uRimColor: stage.uRimColor,
          uFrost: { value: 0 },
          uPoolCenter: { value: new THREE.Vector3(LIGHT_BOTTOM.x, 0, LIGHT_BOTTOM.z) },
          uAspect: { value: 16 / 9 },
        },
      }),
    [stage],
  );
  useFrame(({ camera }, dt) => {
    mat.uniforms.uAspect.value = (camera as THREE.PerspectiveCamera).aspect;
    const target = Math.min(1, Math.max(0, (spin.speed - 3) / 8));
    const f = mat.uniforms.uFrost;
    f.value += (target - f.value) * (1 - Math.exp(-dt * (target > f.value ? 1.2 : 0.15)));
  });
  return (
    <mesh rotation-x={-Math.PI / 2} material={mat} renderOrder={5}>
      <planeGeometry args={[60, 60, 1, 1]} />
    </mesh>
  );
}

export function Glow({ stage }: { stage: StageUniforms }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: glowFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uRimColor: stage.uRimColor, uPulse: stage.uPulse, uIntensity: { value: 0.55 } },
      }),
    [stage],
  );
  return (
    <group>
      {/* the lamp itself, up in the rig */}
      <mesh position={LIGHT_TOP.toArray()} material={mat} scale={0.22} renderOrder={0}>
        <planeGeometry args={[6.5, 5.5]} />
      </mesh>
    </group>
  );
}

/** The drawn arena behind her (shaders/stage.ts arenaFragment). It depends only on the time and
 *  the frame's shape, so it is painted into a half-resolution texture at 30 frames a second (it
 *  is all soft light and haze) and shown on a plane that faces the camera and fills the frame at a
 *  fixed distance, however the camera moves and tilts. Painting it every frame at full resolution
 *  was the most expensive part of the scene. One half of the texture is painted per frame, so the
 *  cost is spread evenly instead of landing on every other frame. */
const ARENA_SCALE = 0.5;
const ARENA_STEP = 1 / 30;

export function Arena({ stage }: { stage: StageUniforms }) {
  const { camera, gl } = useThree();
  const paint = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    const material = new THREE.ShaderMaterial({
      vertexShader: screenVertex,
      fragmentShader: arenaFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAspect: { value: 16 / 9 } },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quad);
    return { target, material, scene, camera: new THREE.Camera(), at: [-1, -1], size: new THREE.Vector2() };
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: textureFragment,
        depthWrite: false,
        uniforms: { uMap: { value: paint.target.texture } },
      }),
    [paint],
  );
  useEffect(
    () => () => {
      paint.target.dispose();
      paint.material.dispose();
      paint.scene.children.forEach((m) => (m as THREE.Mesh).geometry.dispose());
      mat.dispose();
    },
    [paint, mat],
  );
  const ref = useRef<THREE.Mesh>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const cam = camera as THREE.PerspectiveCamera;
    const dist = 22;
    cam.getWorldDirection(dir);
    m.position.copy(cam.position).addScaledVector(dir, dist);
    m.quaternion.copy(cam.quaternion);
    const fh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    m.scale.set(fh * cam.aspect * 1.02, fh * 1.02, 1);

    gl.getDrawingBufferSize(paint.size);
    const w = Math.max(1, Math.round(paint.size.x * ARENA_SCALE));
    const h = Math.max(1, Math.round(paint.size.y * ARENA_SCALE));
    const u = paint.material.uniforms;
    const t = stage.uTime.value;
    const resized = paint.target.width !== w || paint.target.height !== h || u.uAspect.value !== cam.aspect;
    const half = paint.at[0] <= paint.at[1] ? 0 : 1; // the staler one
    if (!resized && Math.abs(t - paint.at[half]) < ARENA_STEP * 0.9) return;
    if (paint.target.width !== w || paint.target.height !== h) paint.target.setSize(w, h);
    const mid = Math.round(h / 2);
    paint.target.scissorTest = !resized;
    if (resized) paint.at.fill(t);
    else {
      paint.target.scissor.set(0, half ? mid : 0, w, half ? h - mid : mid);
      paint.at[half] = t;
    }
    u.uTime.value = t;
    u.uAspect.value = cam.aspect;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(paint.target);
    gl.render(paint.scene, paint.camera);
    gl.setRenderTarget(prev);
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-1} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

/** The red stage curtains in front of the rink (shaders/stage.ts curtainFragment): drawn over the
 *  frame just in front of the camera, so they frame the shot on any screen; scrolling draws them
 *  out of the frame as the camera moves in. */
export function Curtains({ stage }: { stage: StageUniforms }) {
  const { camera } = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: curtainFragment,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        uniforms: { uTime: stage.uTime, uAspect: { value: 16 / 9 }, uIntro: { value: 0 }, uOpen: { value: 0 }, uShift: { value: 0 } },
      }),
    [stage],
  );
  const ref = useRef<THREE.Mesh>(null);
  const dir = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const cam = camera as THREE.PerspectiveCamera;
    const dist = 0.5;
    cam.getWorldDirection(dir);
    m.position.copy(cam.position).addScaledVector(dir, dist);
    m.quaternion.copy(cam.quaternion);
    const fh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    m.scale.set(fh * cam.aspect * 1.02, fh * 1.02, 1);
    const u = mat.uniforms;
    u.uAspect.value = cam.aspect;
    const p = THREE.MathUtils.clamp(heroScroll.progress / 0.45, 0, 1);
    u.uOpen.value = p * p * (3 - 2 * p);
    u.uIntro.value = curtainIntro();
    u.uShift.value = -pointer.sx * 0.012;
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={30} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

// the logo's swoosh, in its own artwork units: where her feet stand in it (between the strokes, so
// it wraps round her), how wide it lies on the ice and how much deeper than in the artwork, so it
// still reads from the low camera
const TRACE = { x0: 160, x1: 2253, y0: 1147, y1: 1711, footX: 1152, footY: 1222, width: 2.7, depth: 1.7 };

/** The blade trace from the logo carved into the ice round her feet. */
export function Trace({ stage }: { stage: StageUniforms }) {
  const { gl } = useThree();
  const { mat, size, center } = useMemo(() => {
    const w = TRACE.x1 - TRACE.x0, h = TRACE.y1 - TRACE.y0;
    const c = document.createElement("canvas");
    c.width = 2048;
    c.height = Math.round((2048 * h) / w);
    const ctx = c.getContext("2d")!;
    const k = c.width / w;
    ctx.setTransform(k, 0, 0, k, -TRACE.x0 * k, -TRACE.y0 * k);
    const path = new Path2D(LOGO_SWOOSH);
    // G: the glow (the shape blurred), R: the groove itself
    ctx.filter = "blur(9px)";
    ctx.fillStyle = "#00ff00";
    ctx.fill(path);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = "#ff0000";
    ctx.fill(path);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    tex.colorSpace = THREE.NoColorSpace;
    const m = new THREE.ShaderMaterial({
      vertexShader: worldVertex,
      fragmentShader: traceFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMap: { value: tex }, uTime: stage.uTime, uReveal: { value: 0 }, uWave: { value: 99 } },
    });
    const s = TRACE.width / w;
    return {
      mat: m,
      size: [w * s, h * s * TRACE.depth] as const,
      center: [((TRACE.x0 + TRACE.x1) / 2 - TRACE.footX) * s, ((TRACE.y0 + TRACE.y1) / 2 - TRACE.footY) * s * TRACE.depth] as const,
    };
  }, [stage, gl]);
  useFrame((_, dt) => {
    const u = mat.uniforms;
    const target = curtainIntro() > 0.35 ? 12 : 0;
    u.uReveal.value += (target - u.uReveal.value) * (1 - Math.exp(-dt * 0.9));
    u.uWave.value = morph.startedAt < 0 ? 99 : (performance.now() - morph.startedAt) / 1000;
  });
  return (
    <mesh rotation-x={-Math.PI / 2} position={[center[0], 0.004, center[1]]} material={mat} renderOrder={5.5}>
      <planeGeometry args={[size[0], size[1]]} />
    </mesh>
  );
}

/** The ring of light that climbs the figure while it changes form. */
export function MorphRing({ stage }: { stage: StageUniforms }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: ringFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: stage.uTime, uAlpha: { value: 0 } },
      }),
    [stage],
  );
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const h = morph.line;
    m.visible = h < MORPH_TOP;
    if (!m.visible) return;
    m.position.y = Math.max(0.01, h);
    // fades in off the ice and out at the top; a little wider round the skirt
    mat.uniforms.uAlpha.value = Math.min(1, (h + 0.05) / 0.25) * Math.min(1, (MORPH_TOP - h) / 0.35);
    const r = 0.5 + 0.18 * Math.exp(-Math.pow((h - 1.0) * 2.5, 2));
    m.scale.set(r, r, 1);
  });
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} material={mat} renderOrder={9} visible={false}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

export function Snow({ stage, count, size }: { stage: StageUniforms; count: number; size: number }) {
  const { gl } = useThree();
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 14;
      pos[i * 3 + 1] = Math.random() * 6.5;
      pos[i * 3 + 2] = -9 + Math.random() * 12;
      seed[i] = Math.random();
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -3), 12);
    return g;
  }, [count]);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: snowVertex,
        fragmentShader: snowFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: stage.uTime,
          uSize: { value: size },
          uPixelRatio: { value: gl.getPixelRatio() },
          uBeamTop: { value: LIGHT_TOP },
          uBeamBottom: { value: LIGHT_BOTTOM },
        },
      }),
    [stage, size, gl],
  );
  return <points geometry={geo} material={mat} renderOrder={7} />;
}

/** Spray of ice thrown by the blade, emission rate follows spin speed. */
export function Spray({ stage, max, radius = 0.12 }: { stage: StageUniforms; max: number; radius?: number }) {
  const { gl } = useThree();
  const sim = useMemo(() => {
    const pos = new Float32Array(max * 3);
    const vel = new Float32Array(max * 3);
    const life = new Float32Array(max);
    const decay = new Float32Array(max);
    const seed = new Float32Array(max);
    for (let i = 0; i < max; i++) {
      pos[i * 3 + 1] = -10;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aLife", new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 4);
    return { g, pos, vel, life, decay, cursor: 0, acc: 0 };
  }, [max]);

  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: sprayVertex,
        fragmentShader: sprayFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: stage.uTime,
          uRimColor: stage.uRimColor,
          uSize: { value: 26 },
          uPixelRatio: { value: gl.getPixelRatio() },
        },
      }),
    [stage, gl],
  );

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const { pos, vel, life, decay } = sim;
    const s = Math.max(0, spin.speed - 1.6);
    // emission
    sim.acc += Math.min(s * s * 9, 900) * dt + (s > 0 ? 0 : 0);
    const angle = stage.uAngle.value;
    const dir = Math.sign(spin.velocity || 1);
    while (sim.acc >= 1) {
      sim.acc -= 1;
      const i = sim.cursor;
      sim.cursor = (sim.cursor + 1) % max;
      // contact point: heel or toe of the support blade
      const along = (Math.random() < 0.6 ? 1.08 : -0.83) * radius;
      const lx = 0.008, lz = along;
      const c = Math.cos(angle), sn = Math.sin(angle);
      const wx = c * lx + sn * lz;
      const wz = -sn * lx + c * lz;
      // tangential (from the turn) + outward + up
      const tx = -wz * dir, tz = wx * dir;
      const rl = Math.hypot(wx, wz) || 1;
      const sp = 0.4 + Math.random() * 1.1;
      const k = Math.min(1.6, s / 7);
      vel[i * 3] = tx * spin.speed * 0.9 + (wx / rl) * sp * k + (Math.random() - 0.5) * 0.35;
      vel[i * 3 + 1] = (0.25 + Math.random() * 1.0) * k;
      vel[i * 3 + 2] = tz * spin.speed * 0.9 + (wz / rl) * sp * k + (Math.random() - 0.5) * 0.35;
      pos[i * 3] = wx;
      pos[i * 3 + 1] = 0.01;
      pos[i * 3 + 2] = wz;
      life[i] = 1;
      decay[i] = 0.55 + Math.random() * 0.9;
    }
    // integrate
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= decay[i] * dt;
      const j = i * 3;
      vel[j + 1] -= 3.2 * dt;
      const drag = Math.exp(-dt * 1.6);
      vel[j] *= drag;
      vel[j + 2] *= drag;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < 0.004) {
        // settle on the ice and slide
        pos[j + 1] = 0.004;
        vel[j + 1] *= -0.15;
        vel[j] *= 0.85;
        vel[j + 2] *= 0.85;
      }
    }
    sim.g.attributes.position.needsUpdate = true;
    sim.g.attributes.aLife.needsUpdate = true;
  });

  return <points geometry={sim.g} material={mat} renderOrder={8} frustumCulled={false} />;
}
