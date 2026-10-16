// Shared by the page (stops, route) and scripts/build-map.mjs (land layer), so both line up.
// The frame is fixed (Lisbon to Dubai, up to Scandinavia): tour dates change at run time from the
// admin, while the land layer is drawn once at build time. Stops outside the frame are listed but
// not drawn.
import { geoConicConformal } from "d3-geo";

export const MAP_W = 1000;
export const MAP_H = 640;
const FRAME = [
  [-11, 36],
  [30, 60],
  [56, 24],
  [-9.5, 38.5],
];

export function tourProjection() {
  const projection = geoConicConformal().parallels([35, 62]).rotate([-14, 0]);
  projection.fitExtent(
    [
      [60, 60],
      [MAP_W - 60, MAP_H - 60],
    ],
    { type: "MultiPoint", coordinates: FRAME },
  );
  projection.clipExtent([
    [0, 0],
    [MAP_W, MAP_H],
  ]);
  return projection;
}
