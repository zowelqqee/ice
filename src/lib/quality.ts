// Coarse device tier, picked once on the client. The scene also steps down at runtime
// when frame rate drops (PerformanceMonitor in the hero canvas).

export type Tier = "low" | "mid" | "high";

export interface Quality {
  tier: Tier;
  dpr: [number, number];
  marchSteps: number;
  spray: number; // max spray particles
  snow: number;
  post: "full" | "lite" | "none";
}

export function detectQuality(): Quality {
  if (typeof window === "undefined") return presets.mid;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (coarse || small) return cores >= 6 && mem >= 4 ? presets.mid : presets.low;
  return cores >= 8 ? presets.high : presets.mid;
}

export const presets: Record<Tier, Quality> = {
  high: { tier: "high", dpr: [1.1, 1.6], marchSteps: 90, spray: 2000, snow: 1400, post: "full" },
  mid: { tier: "mid", dpr: [1, 1.35], marchSteps: 72, spray: 1200, snow: 800, post: "lite" },
  low: { tier: "low", dpr: [0.85, 1.15], marchSteps: 52, spray: 500, snow: 380, post: "lite" },
};

export function lower(t: Tier): Tier {
  return t === "high" ? "mid" : "low";
}
