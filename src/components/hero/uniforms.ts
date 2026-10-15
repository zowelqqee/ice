import * as THREE from "three";

// Uniform objects shared by every hero material, so one write per frame reaches all of them.
export function createStageUniforms() {
  return {
    uTime: { value: 0 },
    uAngle: { value: 0 },
    uLightPos: { value: new THREE.Vector3(0, 5.2, -3.4) },
    uSidePos: { value: new THREE.Vector3(-4.5, 2.2, -0.5) },
    uRimColor: { value: new THREE.Color("#5cf2ff").multiplyScalar(1.15) },
    uRim: { value: 1.6 },
    uPulse: { value: 0 },
    uGlitter: { value: 1 },
  };
}
export type StageUniforms = ReturnType<typeof createStageUniforms>;

export const LIGHT_TOP = new THREE.Vector3(0, 6.4, -3.6);
export const LIGHT_BOTTOM = new THREE.Vector3(0, 0, -1.4);
