"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  beamFragment,
  beamVertex,
  glowFragment,
  iceFragment,
  plateFragment,
  snowFragment,
  snowVertex,
  sprayFragment,
  sprayVertex,
  worldVertex,
} from "./shaders/stage";
import { LIGHT_BOTTOM, LIGHT_TOP, type StageUniforms } from "./uniforms";
import { spin } from "@/lib/spin";

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
        },
      }),
    [stage],
  );
  useFrame((_, dt) => {
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

export function Beam({ stage, intensity = 0.16 }: { stage: StageUniforms; intensity?: number }) {
  const geo = useMemo(() => {
    const len = LIGHT_TOP.distanceTo(LIGHT_BOTTOM);
    const g = new THREE.CylinderGeometry(0.05, 1.9, len, 64, 1, true);
    g.translate(0, -len / 2, 0); // apex at origin
    // uv.y: 1 at apex .. 0 at floor, flip so 0 = apex
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    return g;
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: stage.uTime, uRimColor: stage.uRimColor, uIntensity: { value: intensity } },
      }),
    [stage, intensity],
  );
  const ref = useRef<THREE.Mesh>(null);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    m.position.copy(LIGHT_TOP);
    const dir = LIGHT_BOTTOM.clone().sub(LIGHT_TOP).normalize();
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  }, []);
  return <mesh ref={ref} geometry={geo} material={mat} renderOrder={6} />;
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
      {/* halo behind the dancer: this is what turns her into a silhouette */}
      <mesh position={[0, 1.35, -3.2]} material={mat} renderOrder={0}>
        <planeGeometry args={[6.5, 5.5]} />
      </mesh>
      {/* the lamp itself, up in the rig */}
      <mesh position={LIGHT_TOP.toArray()} material={mat} scale={0.22} renderOrder={0}>
        <planeGeometry args={[6.5, 5.5]} />
      </mesh>
    </group>
  );
}

export function Plate({ src, poster }: { src: { webm: string; mp4: string }; poster: string }) {
  const { camera, invalidate } = useThree();
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: worldVertex,
        fragmentShader: plateFragment,
        depthWrite: false,
        uniforms: { uMap: { value: null as THREE.Texture | null }, uOpacity: { value: 0.0 }, uTime: { value: 0 } },
      }),
    [],
  );

  useEffect(() => {
    let disposed = false;
    const img = new THREE.TextureLoader().load(poster, (t) => {
      if (disposed) return;
      if (!mat.uniforms.uMap.value) mat.uniforms.uMap.value = t;
      if (spin.reduced || spin.still) mat.uniforms.uOpacity.value = 1;
      invalidate(); // reduced motion renders on demand only
    });
    // reduced motion and poster capture use the still frame only (deterministic, no video)
    if (spin.reduced || spin.still) return () => { disposed = true; img.dispose(); };
    const video = document.createElement("video");
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    const canWebm = video.canPlayType('video/webm; codecs="vp9"') !== "";
    video.src = canWebm ? src.webm : src.mp4;
    const vt = new THREE.VideoTexture(video);
    const onPlay = () => {
      if (!disposed) mat.uniforms.uMap.value = vt;
    };
    video.addEventListener("playing", onPlay, { once: true });
    video.play().catch(() => {});
    return () => {
      disposed = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      vt.dispose();
      img.dispose();
    };
  }, [mat, src.webm, src.mp4, poster, invalidate]);

  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    const o = mat.uniforms.uOpacity;
    o.value += ((mat.uniforms.uMap.value ? 1 : 0) - o.value) * (1 - Math.exp(-dt * 1.5));
    // keep the plate filling the frame from wherever the camera is
    const m = ref.current;
    if (!m) return;
    const cam = camera as THREE.PerspectiveCamera;
    const dist = Math.abs(cam.position.z - m.position.z);
    const fh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    // a distant window onto the real arena: narrower than the frame, edges dissolve into black
    const w = Math.max(fh * cam.aspect * 0.78, fh * 0.95);
    m.scale.set(w, w * (9 / 16), 1);
    // the plate's rink (58% down the frame) lines up just above our horizon
    m.position.y = cam.position.y + 0.08 * w * (9 / 16) + 0.25;
  });

  return (
    <mesh ref={ref} position={[0, 2, -18]} material={mat} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
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
