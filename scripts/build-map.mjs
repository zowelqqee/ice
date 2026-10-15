#!/usr/bin/env node
// Pre-renders the land layer of the tour map to public/media/tour-map.svg, framed by the same
// projection the page uses for the stops. Runs before dev/build (package.json pre-scripts).
// Only coastlines and borders are written: no names or other attributes from the atlas.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import { MAP_H, MAP_W, tourProjection } from "../src/lib/tourProjection.mjs";

const require = createRequire(import.meta.url);
const root = new URL("..", import.meta.url).pathname;
const tour = JSON.parse(readFileSync(`${root}src/data/tour.json`, "utf8")).dates;
const land = require("world-atlas/land-50m.json");
const countries = require("world-atlas/countries-50m.json");

const path = geoPath(tourProjection(tour.map((d) => [d.lon, d.lat]))).digits(0);
const landD = path(feature(land, land.objects.land)) ?? "";
const bordersD = path(mesh(countries, countries.objects.countries, (a, b) => a !== b)) ?? "";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_W} ${MAP_H}">
<defs><radialGradient id="f" cx="50%" cy="50%" r="60%"><stop offset="60%" stop-color="#fff"/><stop offset="100%" stop-color="#000"/></radialGradient>
<mask id="m"><rect width="${MAP_W}" height="${MAP_H}" fill="url(#f)"/></mask></defs>
<g mask="url(#m)"><path d="${landD}" fill="#0b1829" stroke="#2c4766" stroke-width="0.7"/><path d="${bordersD}" fill="none" stroke="#1d3150" stroke-width="0.5"/></g>
</svg>
`;
mkdirSync(`${root}public/media`, { recursive: true });
writeFileSync(`${root}public/media/tour-map.svg`, svg);
console.log(`tour-map.svg: ${(svg.length / 1024).toFixed(0)} KB`);
