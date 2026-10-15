import { INSTRUMENTS } from "@/lib/audio/orchestra";

// Which instrument the portrait camera is looking at (phones show the orchestra one at a time).
type Listener = () => void;
let index = 0;
const listeners = new Set<Listener>();

export const focus = {
  get: () => index,
  set(i: number) {
    const n = INSTRUMENTS.length;
    const next = ((i % n) + n) % n;
    if (next === index) return;
    index = next;
    listeners.forEach((l) => l());
  },
  subscribe(fn: Listener) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
