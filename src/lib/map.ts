import "server-only";
import { MAP_H, MAP_W, tourProjection } from "./tourProjection.mjs";
import type { TourDate } from "./data";

export { MAP_W, MAP_H };

export interface MapStop {
  id: string;
  show: string;
  city: string;
  x: number;
  y: number;
}

/**
 * Projects the tour stops and the route between them. The land layer itself is pre-rendered to
 * public/media/tour-map.svg by scripts/build-map.mjs (no geodata in the app bundle).
 */
export function buildTourMap(dates: TourDate[]) {
  const projection = tourProjection(dates.map((d) => [d.lon, d.lat]));
  const stops: MapStop[] = dates.map((d) => {
    const [x, y] = projection([d.lon, d.lat]) ?? [0, 0];
    return { id: d.id, show: d.show, city: d.city, x: +x.toFixed(1), y: +y.toFixed(1) };
  });

  // the route: arcs between consecutive distinct cities, bowed like a blade trace
  const route: string[] = [];
  let prev: MapStop | null = null;
  for (const s of stops) {
    if (prev && (prev.x !== s.x || prev.y !== s.y)) {
      const mx = (prev.x + s.x) / 2, my = (prev.y + s.y) / 2;
      const dx = s.x - prev.x, dy = s.y - prev.y;
      const k = 0.18;
      route.push(`M${prev.x} ${prev.y} Q${(mx - dy * k).toFixed(1)} ${(my + dx * k).toFixed(1)} ${s.x} ${s.y}`);
    }
    prev = s;
  }
  return { stops, route };
}
