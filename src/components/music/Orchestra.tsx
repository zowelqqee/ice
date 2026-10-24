"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Environment, Lightformer, MeshReflectorMaterial, PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, SMAA, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { BUILDERS, type InstrumentModel, type NotePart } from "./instruments";
import { createIceMaterial } from "./iceMaterial";
import { INSTRUMENTS, orchestra, type Instrument } from "@/lib/audio/orchestra";
import { detectQuality, type Quality } from "@/lib/quality";
import { focus } from "./focus";

interface Place {
  pos: [number, number, number];
  rotY: number;
}

// Desktop: an orchestra in a shallow arc. Portrait: one row the camera glides along.
const ARC: Record<Instrument, Place> = {
  // back row
  harp: { pos: [-4.6, 0, -1.8], rotY: 0.4 },
  piano: { pos: [-1.9, 0, -2.0], rotY: 0.95 },
  timpani: { pos: [0.85, 0, -1.7], rotY: -0.1 },
  glock: { pos: [3.25, 0, -1.6], rotY: -0.35 },
  // front row, each standing in a gap of the back row as seen from the audience
  violin: { pos: [-2.3, 0, 0.8], rotY: 0.3 },
  flute: { pos: [-0.45, 0, 0.9], rotY: 0.1 },
  horn: { pos: [1.5, 0, 0.9], rotY: 0.75 },
  cello: { pos: [3.15, 0, 0.7], rotY: 0.2 },
};
const ROW_GAP = 2.1;
// portrait framing per instrument: camera distance and the height to look at
const FRAME: Record<Instrument, [number, number]> = {
  harp: [4.4, 1.0], piano: [5.4, 0.9], glock: [3.2, 0.75], timpani: [4.0, 0.65],
  violin: [3.2, 1.1], flute: [3.4, 1.15], horn: [3.3, 1.0], cello: [3.4, 0.85],
};
const row = (n: Instrument): Place => ({ pos: [INSTRUMENTS.indexOf(n) * ROW_GAP, 0, n === "piano" ? -0.9 : 0], rotY: n === "piano" ? 0.85 : 0 });

const stringVertex = /* glsl */ `
uniform float uTime; uniform float uLevel; uniform float uPluck; uniform float uSeed;
void main() {
  vec3 p = position;
  float env = sin(uv.y * 3.14159);
  float amp = uLevel * 0.006 + uPluck * 0.01;
  p.x += env * sin(uTime * (52.0 + uSeed * 7.0)) * amp;
  p.z += env * cos(uTime * (47.0 + uSeed * 5.0)) * amp * 0.6;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const stringFragment = /* glsl */ `
uniform float uLevel; uniform float uActive; uniform float uPluck;
void main() {
  float k = 0.25 + uActive * (0.45 + uLevel * 1.4) + uPluck * 2.0;
  gl_FragColor = vec4(vec3(0.55, 1.25, 1.5) * k, 1.0);
}`;

const headVertex = /* glsl */ `
uniform float uHit; uniform float uAge; uniform vec3 uCenter;
varying float vRing;
void main() {
  vec3 p = position;
  float d = distance(p.xz, uCenter.xz);
  float wave = sin(d * 60.0 - uAge * 28.0) * exp(-uAge * 2.8) * exp(-d * 2.0) * uHit;
  p.y += wave * 0.008;
  vRing = wave;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const headFragment = /* glsl */ `
uniform float uHit; uniform float uAge; uniform float uActive;
varying float vRing;
void main() {
  float glow = abs(vRing) * 3.0 + exp(-uAge * 3.0) * uHit * 0.5;
  vec3 c = vec3(0.12, 0.2, 0.26) * (0.4 + uActive * 0.6) + vec3(0.4, 1.1, 1.4) * glow;
  gl_FragColor = vec4(c, 0.55);
}`;

function Burst({ trigger, height, radius }: { trigger: number; height: number; radius: number }) {
  const N = 220;
  const sim = useMemo(() => {
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    return { g, pos, vel, life: 0 };
  }, []);
  const mat = useMemo(
    () => new THREE.PointsMaterial({ size: 0.035, color: new THREE.Color(1.6, 2.2, 2.4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    [],
  );
  const pts = useRef<THREE.Points>(null);
  useEffect(() => {
    if (!trigger) return;
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * radius * 0.6;
      sim.pos.set([Math.cos(a) * rr, Math.random() * height, Math.sin(a) * rr], i * 3);
      const sp = 0.5 + Math.random() * 1.6;
      sim.vel.set([Math.cos(a) * sp, 0.3 + Math.random() * 1.4, Math.sin(a) * sp], i * 3);
    }
    sim.life = 1;
  }, [trigger, height, radius, sim]);
  useFrame((_, dt) => {
    if (pts.current) pts.current.visible = sim.life > 0;
    if (sim.life <= 0) return;
    sim.life -= dt * 0.75;
    for (let i = 0; i < N; i++) {
      sim.vel[i * 3 + 1] -= 2.4 * dt;
      sim.pos[i * 3] += sim.vel[i * 3] * dt;
      sim.pos[i * 3 + 1] = Math.max(0.01, sim.pos[i * 3 + 1] + sim.vel[i * 3 + 1] * dt);
      sim.pos[i * 3 + 2] += sim.vel[i * 3 + 2] * dt;
    }
    sim.g.attributes.position.needsUpdate = true;
    mat.opacity = Math.max(0, sim.life);
  });
  return <points ref={pts} geometry={sim.g} material={mat} frustumCulled={false} visible={false} />;
}

/** Keys, bars and heads: each reacts to its own note, timed to the audio clock. */
function NoteParts({ name, parts, active }: { name: Instrument; parts: NotePart[]; active: React.MutableRefObject<number> }) {
  const items = useMemo(
    () =>
      parts.map((p) => {
        let mat: THREE.Material;
        const uniforms = { uHit: { value: 0 }, uAge: { value: 9 }, uActive: { value: 0 }, uCenter: { value: p.pivot.clone() } };
        if (p.kind === "head") {
          mat = new THREE.ShaderMaterial({ vertexShader: headVertex, fragmentShader: headFragment, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide });
        } else {
          const black = p.kind === "key" && [1, 3, 6, 8, 10].includes(p.midi % 12);
          mat = new THREE.MeshPhysicalMaterial({
            color: black ? new THREE.Color("#7fa6b8") : new THREE.Color("#e6f8ff"),
            roughness: 0.1, // glossy carved ice, like the instrument bodies
            clearcoat: 1,
            clearcoatRoughness: 0.05,
            envMapIntensity: 2.4,
            transparent: true,
            opacity: 0.8,
            emissive: new THREE.Color("#5cf2ff"),
            emissiveIntensity: 0,
          });
        }
        return { part: p, mat, uniforms, hit: 0, age: 9, pending: [] as number[] };
      }),
    [parts],
  );
  const refs = useRef<(THREE.Mesh | null)[]>([]);

  useEffect(
    () =>
      orchestra.onNote((n, midi, when) => {
        if (n !== name) return;
        let best = items[0];
        for (const it of items) if (Math.abs(it.part.midi - midi) < Math.abs(best.part.midi - midi)) best = it;
        best?.pending.push(when);
      }),
    [items, name],
  );

  useFrame((_, dt) => {
    const now = orchestra.time;
    items.forEach((it, i) => {
      if (it.pending.length && it.pending[0] <= now) {
        it.pending.shift();
        it.hit = 1;
        it.age = 0;
      }
      it.age += dt;
      it.hit *= Math.exp(-dt * (it.part.kind === "head" ? 0.6 : 5));
      const m = refs.current[i];
      if (it.part.kind === "head") {
        it.uniforms.uHit.value = it.hit;
        it.uniforms.uAge.value = it.age;
        it.uniforms.uActive.value = active.current;
      } else {
        (it.mat as THREE.MeshPhysicalMaterial).emissiveIntensity = it.hit * 2.6 + active.current * 0.05;
        if (m && it.part.kind === "key") m.position.set(0, -it.hit * 0.008, 0);
        if (m && it.part.kind === "bar") m.position.set(0, it.hit * 0.004, 0);
      }
    });
  });

  return (
    <>
      {items.map((it, i) => (
        <mesh key={i} ref={(el) => void (refs.current[i] = el)} geometry={it.part.geo} material={it.mat} />
      ))}
    </>
  );
}

const poolMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uOn: { value: 0 }, uLevel: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uOn; uniform float uLevel; varying vec2 vUv;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float pool = exp(-d * d * 3.5);
        float ring = exp(-pow((d - 0.78) * 14.0, 2.0)) * (0.25 + uOn * 0.6);
        vec3 c = vec3(0.35, 0.75, 0.9) * pool * (0.12 + uOn * (0.35 + uLevel * 0.5)) + vec3(0.4, 1.1, 1.3) * ring * 0.35;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });

function IceInstrument({ name, place, cheap }: { name: Instrument; place: Place; cheap: boolean }) {
  const model: InstrumentModel = useMemo(() => BUILDERS[name](), [name]);
  const { mat, uniforms } = useMemo(() => createIceMaterial(cheap), [cheap]);
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.2, 1.5), toneMapped: false, transparent: true, opacity: 0.5 }), []);
  const strings = useMemo(
    () =>
      model.strings.map((s, i) => {
        const len = s.from.distanceTo(s.to);
        const g = new THREE.CylinderGeometry(0.0016, 0.0016, len, 4, 16, true);
        g.translate(0, len / 2, 0);
        g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.to.clone().sub(s.from).normalize()));
        g.translate(s.from.x, s.from.y, s.from.z);
        const m = new THREE.ShaderMaterial({
          vertexShader: stringVertex,
          fragmentShader: stringFragment,
          uniforms: { uTime: uniforms.uTime, uLevel: uniforms.uLevel, uActive: uniforms.uActive, uPluck: { value: 0 }, uSeed: { value: i } },
        });
        return { g, m, midi: s.midi, pending: [] as number[] };
      }),
    [model, uniforms],
  );
  const pool = useMemo(() => poolMaterial(), []);
  const group = useRef<THREE.Group>(null);
  const [burst, setBurst] = useState(0);
  const [hover, setHover] = useState(false);
  const wasOn = useRef(false);
  const level = useRef(0);
  const active = useRef(0);

  // harp strings pluck with their own notes
  useEffect(() => {
    if (!strings.some((s) => s.midi)) return;
    return orchestra.onNote((n, midi, when) => {
      if (n !== name) return;
      let best = strings[0];
      for (const s of strings) if (s.midi && Math.abs(s.midi - midi) < Math.abs((best.midi ?? 0) - midi)) best = s;
      best.pending.push(when);
    });
  }, [strings, name]);

  useFrame((state, dt) => {
    const on = orchestra.state.awake.includes(name);
    level.current += (orchestra.level(name) - level.current) * (1 - Math.exp(-dt * 14));
    active.current += ((on ? 1 : 0) - active.current) * (1 - Math.exp(-dt * 4));
    uniforms.uTime.value = state.clock.elapsedTime;
    uniforms.uLevel.value = level.current;
    uniforms.uActive.value = active.current;
    glowMat.opacity = 0.18 + active.current * (0.35 + level.current * 1.2) + (hover ? 0.15 : 0);
    pool.uniforms.uOn.value = active.current + (hover ? 0.25 : 0);
    pool.uniforms.uLevel.value = level.current;
    if (on && !wasOn.current) {
      uniforms.uCrack.value = 0.0001;
      setBurst((b) => b + 1);
    }
    wasOn.current = on;
    if (uniforms.uCrack.value > 0 && uniforms.uCrack.value < 1) uniforms.uCrack.value = Math.min(1, uniforms.uCrack.value + dt * 0.7);
    if (!on && active.current < 0.02) uniforms.uCrack.value = 0;
    const now = orchestra.time;
    for (const s of strings) {
      if (s.pending.length && s.pending[0] <= now) {
        s.pending.shift();
        s.m.uniforms.uPluck.value = 1;
      }
      s.m.uniforms.uPluck.value *= Math.exp(-dt * 3);
    }
    const g = group.current;
    if (g) {
      g.scale.setScalar(1 + level.current * 0.025 * active.current);
      const lift = hover ? 0.05 : 0;
      g.position.y += (lift - g.position.y) * (1 - Math.exp(-dt * 6));
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    uniforms.uOrigin.value.copy(group.current!.worldToLocal(e.point.clone()));
    focus.set(INSTRUMENTS.indexOf(name));
    orchestra.toggle(name);
  };

  return (
    <group position={place.pos} rotation-y={place.rotY}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, 0]} material={pool} renderOrder={1}>
        <planeGeometry args={[model.radius * 3.2, model.radius * 3.2]} />
      </mesh>
      <group ref={group}>
        <mesh
          geometry={model.ice}
          material={mat}
          onClick={onClick}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHover(true);
            document.body.style.cursor = "pointer";
          }}
          onPointerOut={() => {
            setHover(false);
            document.body.style.cursor = "";
          }}
        />
        {model.glow && <mesh geometry={model.glow} material={glowMat} />}
        {strings.map((s, i) => (
          <mesh key={i} geometry={s.g} material={s.m} />
        ))}
        {model.parts.length > 0 && <NoteParts name={name} parts={model.parts} active={active} />}
        <Burst trigger={burst} height={model.height} radius={model.radius} />
      </group>
    </group>
  );
}

function Stage({ q }: { q: Quality }) {
  const { size, camera } = useThree();
  const portrait = size.width / size.height < 1.05;
  const f = useSyncExternalStore(focus.subscribe, focus.get, focus.get);
  const bars = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(0, 0.75, -0.35), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = portrait ? 42 : 34;
    cam.updateProjectionMatrix();
  }, [camera, portrait]);

  useFrame((state, dt) => {
    const k = 1 - Math.exp(-dt * 1.6);
    if (portrait) {
      const x = f * ROW_GAP;
      const [dist, h] = FRAME[INSTRUMENTS[f]];
      target.set(x + state.pointer.x * 0.15, h + 0.75, dist);
      lookTarget.set(x, h, -0.2);
    } else if (orchestra.state.awake.length) {
      // glide toward the instrument just woken, close enough to read its detail
      const [fx, , fz] = ARC[INSTRUMENTS[f]].pos;
      const back = fz < 0; // back-row instruments: rise over the front row and look down into them
      target.set(fx * (back ? 0.8 : 0.7) + state.pointer.x * 0.2, (back ? 2.45 : 1.65) + state.pointer.y * 0.08, fz + (back ? 2.9 : 3.0));
      lookTarget.set(fx * 0.95, back ? 0.8 : 1.1, fz - 0.1);
    } else {
      target.set(state.pointer.x * 0.35, 2.2 + state.pointer.y * 0.12, 7.7);
      lookTarget.set(-0.3, 0.8, -0.6);
    }
    look.lerp(lookTarget, k);
    camera.position.lerp(target, k);
    camera.lookAt(look);
    bars.current?.children.forEach((c, i) => {
      const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
      const v = 0.2 + Math.sin(state.clock.elapsedTime * 0.6 + i * 1.3) * 0.07;
      m.color.setRGB(0.25 * v, 0.85 * v, v);
    });
  });

  const cheap = q.tier === "low";
  const haze = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `varying vec2 vUv;
          void main(){
            vec2 p = (vUv - vec2(0.5, 0.42)) * vec2(0.8, 1.6);
            float d = length(p);
            // a lit cyclorama behind the orchestra: the ice refracts it, so it needs light and shape
            vec3 c = vec3(0.16, 0.42, 0.56) * exp(-d * d * 3.0) + vec3(0.05, 0.13, 0.19) * exp(-d * 1.4);
            // soft vertical light shafts
            float shafts = pow(0.5 + 0.5 * sin(vUv.x * 46.0 + sin(vUv.x * 7.0) * 2.0), 6.0) * smoothstep(0.15, 0.9, vUv.y);
            c += vec3(0.1, 0.24, 0.3) * shafts * exp(-d * 1.2);
            c *= smoothstep(0.0, 0.32, vUv.y);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    [],
  );
  const span = portrait ? (INSTRUMENTS.length - 1) * ROW_GAP : 0;

  return (
    <>
      {/* a cold blue hall, not a black void */}
      <color attach="background" args={["#0f2c44"]} />
      <fog attach="fog" args={["#0f2c44", 9, 18]} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={4} position={[0, 4.5, -5]} scale={[16, 1.6, 1]} color="#bff6ff" />
        <Lightformer form="rect" intensity={2.2} position={[-6, 2, 1]} rotation-y={Math.PI / 2} scale={[8, 1.2, 1]} color="#5cf2ff" />
        <Lightformer form="rect" intensity={1.8} position={[6, 1.5, 2]} rotation-y={-Math.PI / 2} scale={[8, 0.8, 1]} color="#eaf6ff" />
        <Lightformer form="rect" intensity={2.4} position={[0, 3, 7]} scale={[12, 2.5, 1]} color="#eaf6ff" />
        <Lightformer form="rect" intensity={5} position={[0, 0.6, -6]} scale={[18, 0.5, 1]} color="#7fe9ff" />
        <Lightformer form="rect" intensity={3} position={[0, 2.5, -6.5]} scale={[10, 4, 1]} color="#bdefff" />
        <Lightformer form="ring" intensity={3.5} position={[2, 6, 0]} scale={2} color="#ffffff" />
      </Environment>
      <ambientLight intensity={0.25} />
      <spotLight position={[-4, 7, 5]} angle={0.7} penumbra={0.9} intensity={70} color="#d6f8ff" />
      <spotLight position={[5, 6, 4]} angle={0.7} penumbra={0.9} intensity={45} color="#bfefff" />
      {/* from behind: the rims of the ice light up */}
      <directionalLight position={[0, 4, -7]} intensity={2.4} color="#d8f7ff" />

      <mesh position={[span / 2, 5, -9]} material={haze}>
        <planeGeometry args={[30 + span, 10]} />
      </mesh>
      <group ref={bars} position={[span / 2, 0, -4.8]}>
        {Array.from({ length: portrait ? 14 : 8 }, (_, i) => (i - (portrait ? 6.5 : 3.5)) * 2).map((x, i) => (
          <mesh key={i} position={[x, 1.6, -1]}>
            <planeGeometry args={[0.035, 3.2]} />
            <meshBasicMaterial color="#5cf2ff" toneMapped={false} />
          </mesh>
        ))}
      </group>

      {INSTRUMENTS.map((n) => (
        <IceInstrument key={n} name={n} place={portrait ? row(n) : ARC[n]} cheap={cheap} />
      ))}

      <mesh rotation-x={-Math.PI / 2} position={[span / 2, 0, 0]}>
        <planeGeometry args={[40 + span, 40]} />
        {cheap ? (
          <meshStandardMaterial color="#163b57" roughness={0.3} metalness={0.4} />
        ) : (
          <MeshReflectorMaterial
            resolution={q.tier === "high" ? 512 : 256}
            mixBlur={1.1}
            mixStrength={1.8}
            blur={[260, 70]}
            roughness={0.8}
            depthScale={0.6}
            minDepthThreshold={0.5}
            maxDepthThreshold={1.4}
            color="#163b57"
            metalness={0.7}
            mirror={0.6}
          />
        )}
      </mesh>

      <EffectComposer multisampling={q.tier === "high" ? 2 : 0}>
        <Bloom mipmapBlur intensity={0.85} luminanceThreshold={0.76} radius={0.5} />
        <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        {q.tier === "high" ? <></> : <SMAA />}
        <Vignette offset={0.3} darkness={0.45} />
      </EffectComposer>
    </>
  );
}

/** Horizontal swipes on portrait screens move along the row of instruments. */
function useSwipe(el: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let x0 = 0, y0 = 0, tracking = false;
    const down = (e: PointerEvent) => {
      x0 = e.clientX;
      y0 = e.clientY;
      tracking = true;
    };
    const up = (e: PointerEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.3) focus.set(focus.get() + (dx < 0 ? 1 : -1));
    };
    node.addEventListener("pointerdown", down);
    node.addEventListener("pointerup", up);
    return () => {
      node.removeEventListener("pointerdown", down);
      node.removeEventListener("pointerup", up);
    };
  }, [el]);
}

export default function Orchestra({ active = true }: { active?: boolean }) {
  const [q, setQ] = useState<Quality | null>(null);
  const [dpr, setDpr] = useState(1);
  const wrap = useRef<HTMLDivElement>(null);
  useSwipe(wrap);
  useEffect(() => {
    const d = detectQuality();
    setQ(d);
    // capable machines render the ice at up to 1.75x pixels; others keep the tier's cap
    setDpr(Math.min(window.devicePixelRatio || 1, d.tier === "high" ? 1.75 : Math.min(d.dpr[1], 1.5)));
  }, []);
  return (
    <div ref={wrap} className="relative h-full w-full touch-pan-y">
      {/* phones: step along the row */}
      {(["prev", "next"] as const).map((d) => (
        <button
          key={d}
          type="button"
          aria-label={d === "prev" ? "Previous instrument" : "Next instrument"}
          onClick={() => focus.set(focus.get() + (d === "prev" ? -1 : 1))}
          className={`absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-ice/30 bg-ink/40 text-ice backdrop-blur-sm sm:hidden ${d === "prev" ? "left-2" : "right-2"}`}
        >
          <span aria-hidden>{d === "prev" ? "‹" : "›"}</span>
        </button>
      ))}
      {q && (
        <Canvas
          frameloop={active ? "always" : "never"}
          dpr={dpr}
          camera={{ fov: 34, near: 0.1, far: 50, position: [0, 2.35, 8.6] }}
          gl={{ antialias: false, powerPreference: "high-performance" }}
          onCreated={({ gl }) => {
            // what the ice refracts: three-quarter resolution on capable machines, half elsewhere
            (gl as THREE.WebGLRenderer & { transmissionResolutionScale: number }).transmissionResolutionScale = q.tier === "high" ? 0.75 : 0.5;
          }}
        >
          <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d * 0.85))} />
          <Stage q={q} />
        </Canvas>
      )}
    </div>
  );
}
