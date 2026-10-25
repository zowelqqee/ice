import * as THREE from "three";

// The hero's two forms and the stage curtains, shared by the scene, the Enter screen and the page.
//
// The figure on the ice is either the treble clef from the logo or the skater, and one turns into
// the other: a line of light rises from the ice, the new form below it, the old one above it.
// Each form is cut at the line with a clipping plane (one per form, and one per form for the
// reflection in the ice, which is mirrored).

export type Form = "girl" | "clef";

/** Height the line climbs to: above it nothing of either form is left. */
export const MORPH_TOP = 2.2;
/** Seconds the line takes to climb. */
export const MORPH_TIME = 1.6;

export const morph = {
  lower: "clef" as Form, // the form below the line (the one taking over)
  line: 99, // world height of the line; 99 = the lower form fills the figure, the other is gone
  startedAt: -1, // performance.now() when the last change began (the trace on the ice flashes)
};

export const clipPlanes = {
  girl: new THREE.Plane(),
  clef: new THREE.Plane(),
  girlMirror: new THREE.Plane(),
  clefMirror: new THREE.Plane(),
};

/** Point each form's planes at the current line. */
export function updateClipPlanes() {
  const h = morph.line;
  for (const f of ["girl", "clef"] as const) {
    const lower = f === morph.lower;
    // the form below keeps y <= h, the form above keeps y >= h; mirrored, y flips sign
    clipPlanes[f].set(new THREE.Vector3(0, lower ? -1 : 1, 0), lower ? h : -h);
    clipPlanes[`${f}Mirror`].set(new THREE.Vector3(0, lower ? 1 : -1, 0), lower ? h : -h);
  }
}
updateClipPlanes();

export function formVisible(f: Form) {
  return f === morph.lower || morph.line < MORPH_TOP;
}

// --- the curtains -----------------------------------------------------------------------------
// They are closed when the page opens and part (only a little: the stage stays framed) on a cue:
// the door of the Enter screen opening, or, without it, the scene being ready.

/** Seconds the curtains take to part. */
export const CURTAIN_TIME = 2.6;

const cueListeners = new Set<() => void>();
export const curtains = {
  cueAt: -1, // performance.now() when they started to part; -1 = still closed
  /** poster capture: ?still=closed renders them shut */
  stillClosed: typeof window !== "undefined" && new URLSearchParams(location.search).get("still") === "closed",
};

/** Part the curtains (once). */
export function cueCurtains() {
  if (curtains.cueAt >= 0) return;
  curtains.cueAt = performance.now();
  cueListeners.forEach((l) => l());
}

export function onCurtainCue(fn: () => void) {
  cueListeners.add(fn);
  return () => {
    cueListeners.delete(fn);
  };
}
