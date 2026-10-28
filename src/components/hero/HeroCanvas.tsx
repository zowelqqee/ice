"use client";

import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { ChromaticAberration, EffectComposer, Noise, SMAA, ToneMapping, Vignette, createEffectComponent } from "@react-three/postprocessing";
import { BlendFunction, BloomEffect, ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { Skater } from "./Skater";
import { SkaterModel, SKATER_MODEL, StageLights } from "./SkaterModel";
import { Trails } from "./Trails";
import { Arena, Curtains, Glow, Ice, MorphRing, Snow, Spray, Trace } from "./Stage";
import { MORPH_TIME, MORPH_TOP, curtains, morph, updateClipPlanes } from "./morph";
import { createStageUniforms, type StageUniforms } from "./uniforms";
import { impulse, spin, stepSpin } from "@/lib/spin";
import { heroScroll, pointer } from "@/lib/pointer";
import { audio } from "@/lib/audio/engine";
import { detectQuality, lower, presets, type Quality, type Tier } from "@/lib/quality";

// the page colour (--ink): the scene is a deep ice blue, never black
const SCENE_BG = "#0b1d2e";
// scene clock for the poster capture (?still): beams crossing, washes on the stands
const STILL_TIME = 40.5;

function Director({ stage, dpr }: { stage: StageUniforms; dpr: number }) {
  const { camera, size } = useThree();
  const setDpr = useThree((s) => s.setDpr);
  const look = useMemo(() => new THREE.Vector3(), []);
  const close = useRef(false);

  useFrame((state, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    // the poster frame holds the show lights at one moment, so every capture is the same
    stage.uTime.value = spin.still ? STILL_TIME : state.clock.elapsedTime;
    stage.uAngle.value = stepSpin(dt);

    // music drives the rim light
    const lv = audio.levels();
    const pulse = Math.min(1, lv.low * 1.4 + lv.mid * 0.6);
    stage.uPulse.value += (pulse - stage.uPulse.value) * (1 - Math.exp(-dt * 10));
    stage.uRim.value = 2.2 + stage.uPulse.value * 0.9 + Math.min(spin.speed / 20, 0.5);
    audio.setSpin(spin.speed, dt);

    // camera: frame the full figure on any aspect, then sink low and close as the visitor scrolls
    const aspect = size.width / size.height;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const fitW = 2.1 / (2 * tanHalf * aspect);
    const baseZ = THREE.MathUtils.clamp(Math.max(aspect > 1 ? 5.0 : 4.6, fitW), 4.6, 6.6);
    const p = heroScroll.progress;
    const e = p * p * (3 - 2 * p);
    pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 2.5));
    pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 2.5));
    // when the camera moves in, she fills the frame: render a little fewer pixels
    const isClose = e > 0.35;
    if (isClose !== close.current) {
      close.current = isClose;
      setDpr(isClose ? Math.max(1, dpr * 0.82) : dpr);
    }
    const z = THREE.MathUtils.lerp(baseZ, baseZ * 0.62, e);
    const y = THREE.MathUtils.lerp(1.05, 0.32, e) - pointer.sy * 0.12;
    const x = pointer.sx * 0.35;
    cam.position.set(x, y, z);
    look.set(0, THREE.MathUtils.lerp(aspect > 1 ? 1.14 : 1.02, 1.12, e), 0);
    cam.lookAt(look);
  });
  return null;
}

/** The clef and the skater take turns: once the curtains part the clef spins a moment, then a line
 *  of light climbs it and leaves her; she dances a while, turns back into the clef, and so on.
 *  While the visitor scrolls she stays herself (the camera moves in on her). */
function MorphDirector() {
  const hold = useRef(0);
  useFrame((_, dt) => {
    const d = Math.min(dt, 1 / 20);
    if (spin.still || spin.reduced) {
      morph.lower = "girl";
      morph.line = 99;
    } else if (morph.line < 90) {
      morph.line += ((MORPH_TOP + 0.1) / MORPH_TIME) * d;
      if (morph.line >= MORPH_TOP + 0.05) {
        morph.line = 99;
        hold.current = morph.lower === "girl" ? 10 : 4;
      }
    } else if (curtains.cueAt >= 0) {
      const scrolled = heroScroll.progress > 0.06;
      const settling = (performance.now() - curtains.cueAt) / 1000 < 3.6; // the clef spins first
      if (morph.lower === "girl" && scrolled) hold.current = Math.max(hold.current, 2);
      else hold.current -= d;
      if ((hold.current <= 0 && !settling) || (scrolled && morph.lower === "clef")) {
        morph.lower = morph.lower === "girl" ? "clef" : "girl";
        morph.line = -0.05;
        morph.startedAt = performance.now();
        impulse(7);
      }
    }
    updateClipPlanes();
  });
  return null;
}

/** Bloom worked out from a half-resolution copy of the frame: the glow is soft anyway, and at
 *  full resolution its first passes cost more than everything else in the frame together. */
class HalfBloomEffect extends BloomEffect {
  setSize(width: number, height: number) {
    super.setSize(Math.round(width / 2), Math.round(height / 2));
  }
}
const HalfBloom = createEffectComponent(HalfBloomEffect);
const BLOOM = { mipmapBlur: true, intensity: 0.55, luminanceThreshold: 0.8, luminanceSmoothing: 0.12, radius: 0.42 };

function Effects({ q }: { q: Quality }) {
  if (q.post === "none") return null;
  const full = q.post === "full";
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {/* bloom only on true highlights (glints, blades, the lamp): the figure itself stays crisp */}
      <HalfBloom blendFunction={BlendFunction.ADD} args={[BLOOM]} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <SMAA />
      {full ? (
        <ChromaticAberration
          blendFunction={BlendFunction.NORMAL}
          offset={new THREE.Vector2(0.0009, 0.0006)}
          radialModulation
          modulationOffset={0.35}
        />
      ) : (
        <></>
      )}
      <Noise blendFunction={BlendFunction.OVERLAY} opacity={0.05} />
      <Vignette offset={0.32} darkness={0.42} />
    </EffectComposer>
  );
}

/** Fires once the frames after its siblings mounted (i.e. once the dancer is really there). */
function Ready({ onReady }: { onReady?: () => void }) {
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => onReady?.()));
    return () => cancelAnimationFrame(id);
  }, [onReady]);
  return null;
}

/** Her and her reflection, shown once the scene's shaders are compiled (hers, and those of parts
 *  that show up later, like the ring of the change). They compile in the background where the
 *  browser can (KHR_parallel_shader_compile), so no frame stalls on them. The lights stay outside
 *  the hidden group: the shaders are built for the lights in view. */
function Figures({ stage, detail, onReady }: { stage: StageUniforms; detail: Tier; onReady?: () => void }) {
  const { gl, scene, camera } = useThree();
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    let live = true;
    gl.compileAsync(scene, camera)
      .catch(() => {})
      .finally(() => live && setWarm(true));
    return () => {
      live = false;
    };
  }, [gl, scene, camera]);
  return (
    <>
      <StageLights stage={stage} />
      <group visible={warm}>
        <SkaterModel stage={stage} detail={detail} mirror />
        <SkaterModel stage={stage} detail={detail} />
      </group>
      {warm && <Ready onReady={onReady} />}
    </>
  );
}

/** If the character model fails to load, fall back to the raymarched dancer. */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function Scene({ q, dpr, model, onReady }: { q: Quality; dpr: number; model: boolean; onReady?: () => void }) {
  const stage = useMemo(() => createStageUniforms(), []);
  // the glass is set up once, for the tier the device started at (rebuilding it later would
  // recompile its shaders mid-show)
  const [detail] = useState(q.tier);
  const sdf = (
    <>
      <Skater stage={stage} steps={q.marchSteps} mirror />
      <Skater stage={stage} steps={q.marchSteps} />
      <Ready onReady={onReady} />
    </>
  );
  return (
    <>
      <Director stage={stage} dpr={dpr} />
      <MorphDirector />
      <Arena stage={stage} />
      <Glow stage={stage} />
      <Ice stage={stage} />
      <Trace stage={stage} />
      {model ? (
        <ModelBoundary fallback={sdf}>
          <Suspense fallback={null}>
            <Figures stage={stage} detail={detail} onReady={onReady} />
          </Suspense>
        </ModelBoundary>
      ) : (
        sdf
      )}
      {!spin.reduced && !spin.still && <Trails stage={stage} />}
      <Snow stage={stage} count={q.snow} size={q.tier === "low" ? 34 : 42} />
      {!spin.reduced && !spin.still && <Spray stage={stage} max={q.spray} radius={model ? 0.035 : 0.12} />}
      <MorphRing stage={stage} />
      <Curtains stage={stage} />
    </>
  );
}

export default function HeroCanvas({ onReady, active = true }: { onReady?: () => void; active?: boolean }) {
  const [q, setQ] = useState<Quality>(presets.mid);
  const [dpr, setDpr] = useState(1);
  const [ok, setOk] = useState(false);
  const [model, setModel] = useState(false);

  useEffect(() => {
    // the character model is used when it is deployed; otherwise the raymarched dancer
    fetch(SKATER_MODEL, { method: "HEAD" })
      .then((r) => setModel(r.ok))
      .catch(() => setModel(false))
      .finally(() => setOk(true));
    const d = spin.still ? presets.high : detectQuality(); // poster capture renders at full quality
    setQ(d);
    setDpr(spin.still ? window.devicePixelRatio || 1 : Math.min(window.devicePixelRatio || 1, d.dpr[1]));
  }, []);

  if (!ok) return null;
  return (
    <Canvas
      dpr={dpr}
      gl={{ antialias: false, powerPreference: "high-performance", alpha: false, stencil: false }}
      camera={{ fov: 35, near: 0.1, far: 60, position: [0, 1.05, 5] }}
      frameloop={spin.reduced ? "demand" : active ? "always" : "never"}
      onCreated={({ gl, scene }) => {
        gl.setClearColor(SCENE_BG, 1);
        // shaders output display-referred colour; keep the pipeline linear end to end so the
        // composer path and the no-post path look identical
        gl.outputColorSpace = THREE.LinearSRGBColorSpace;
        gl.toneMapping = THREE.NoToneMapping;
        gl.localClippingEnabled = true; // the clef and the skater are cut at the line as they change
        scene.background = new THREE.Color(SCENE_BG);
      }}
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => {
          setDpr((d) => Math.max(q.dpr[0], d * 0.8));
          setQ((cur) => (cur.tier === "low" ? cur : presets[lower(cur.tier)]));
        }}
        // never above the screen's own pixel density (on a 1x screen this used to climb to 1.6)
        onIncline={() => setDpr((d) => Math.min(q.dpr[1], window.devicePixelRatio || 1, d * 1.1))}
      />
      <Scene q={q} dpr={dpr} model={model} onReady={onReady} />
      <Effects q={q} />
    </Canvas>
  );
}
