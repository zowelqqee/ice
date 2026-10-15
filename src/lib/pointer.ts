// Normalised pointer (-1..1) and hero scroll progress (0..1), written by DOM handlers, read by scenes.
export const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
export const heroScroll = { progress: 0 };

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );
}
