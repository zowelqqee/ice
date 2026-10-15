// Shared by the page (stops, route) and scripts/build-map.mjs (land layer), so both line up.
import { geoConicConformal } from "d3-geo";

export const MAP_W = 1000;
export const MAP_H = 640;

/** @param {[number, number][]} points lon/lat of every stop */
export function tourProjection(points) {
  const projection = geoConicConformal().parallels([35, 62]).rotate([-14, 0]);
  projection.fitExtent(
    [
      [60, 60],
      [MAP_W - 60, MAP_H - 60],
    ],
    { type: "MultiPoint", coordinates: [...points, [-11, 36], [30, 60]] },
  );
  projection.clipExtent([
    [0, 0],
    [MAP_W, MAP_H],
  ]);
  return projection;
}
