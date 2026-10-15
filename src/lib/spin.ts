// Shared spin state for the hero dancer. Plain mutable object: written by input handlers
// (scroll, drag, keyboard), integrated once per frame by the scene, read by audio and UI.

export const IDLE_SPEED = 0.85; // rad/s, the slow turn at rest
/** The pose the dancer starts in; the hero poster is rendered from exactly this frame. */
export const START_ANGLE = -0.55;
const MAX_SPEED = 22;

export const spin = {
  angle: START_ANGLE, // integrated body angle (rad)
  velocity: IDLE_SPEED, // free angular velocity from drag / impulses
  scrollTarget: 0, // angle offset requested by scroll (rad)
  scrollAngle: 0, // smoothed scroll offset
  speed: IDLE_SPEED, // total |angular speed| this frame (rad/s), drives tuck, flare, spray, audio
  tuck: 0, // 0 = arms open, 1 = arms overhead (follows speed)
  reduced: false, // prefers-reduced-motion
  still: false, // poster capture: frozen at START_ANGLE
};

if (typeof window !== "undefined") {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  spin.reduced = mq.matches;
  spin.still = new URLSearchParams(location.search).has("still");
  if (spin.still) document.documentElement.dataset.still = "";
  mq.addEventListener("change", (e) => (spin.reduced = e.matches));
}

/** Add angular velocity (rad/s), e.g. from a drag flick or a key press. */
export function impulse(dv: number) {
  if (spin.reduced) return;
  spin.velocity = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, spin.velocity + dv));
}

/** Integrate one frame. Returns the angle to render. */
export function stepSpin(dt: number) {
  const d = Math.min(dt, 1 / 20);
  if (spin.still) {
    spin.speed = 0;
    spin.tuck = 0;
    return START_ANGLE;
  }
  if (spin.reduced) {
    spin.speed = 0;
    spin.tuck = 0.15;
    return spin.angle;
  }
  // free velocity relaxes toward the idle turn, keeping direction of the last flick
  const idle = Math.sign(spin.velocity || 1) * IDLE_SPEED;
  spin.velocity += (idle - spin.velocity) * (1 - Math.exp(-d * 0.9));
  spin.angle += spin.velocity * d;

  const prev = spin.scrollAngle;
  spin.scrollAngle += (spin.scrollTarget - spin.scrollAngle) * (1 - Math.exp(-d * 6));
  const scrollRate = (spin.scrollAngle - prev) / Math.max(d, 1e-4);

  spin.speed = Math.abs(spin.velocity + scrollRate);
  // arms pull in as she accelerates (conservation of angular momentum, made visible)
  const targetTuck = Math.min(1, Math.max(0, (spin.speed - 1.2) / 9));
  spin.tuck += (targetTuck - spin.tuck) * (1 - Math.exp(-d * (targetTuck > spin.tuck ? 5 : 1.6)));
  return spin.angle + spin.scrollAngle;
}
