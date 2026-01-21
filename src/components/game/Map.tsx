"use client";

import type { Country } from "@/types/country";
import type { City } from "@/types/city";
import { useGameStore } from "@/lib/store/gameStore";
import { useState, useMemo, useRef } from "react";
import { CityTooltip } from "./CityTooltip";
import { TerritoryGenerator } from "@/lib/game-engine/TerritoryGenerator";

type Pt = { x: number; y: number };

// Smaller = smoother borders (more compute). 0.4 is a good balance for 100x80 map.
const CITY_TILING_RESOLUTION = 0.4;

function parsePathToPolygon(pathStr: string): Pt[] {
  const coords: Pt[] = [];
  const commands = pathStr.match(/[ML]\s*[-\d.]+\s+[-\d.]+/g) || [];
  for (const cmd of commands) {
    const match = cmd.match(/([-\d.]+)\s+([-\d.]+)/);
    if (match) {
      coords.push({ x: Number.parseFloat(match[1]), y: Number.parseFloat(match[2]) });
    }
  }
  return coords;
}

function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  // Ray casting
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;

    const intersects = (yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function boundsOf(points: Pt[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function keyPt(x: number, y: number) {
  return `${x.toFixed(3)},${y.toFixed(3)}`;
}

function parseKeyPt(k: string): Pt {
  const [xs, ys] = k.split(",");
  return { x: Number.parseFloat(xs), y: Number.parseFloat(ys) };
}

function simplifyAxisAlignedLoop(points: Pt[]): Pt[] {
  if (points.length <= 3) return points;
  const simplified: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];
    const collinearX = prev.x === curr.x && curr.x === next.x;
    const collinearY = prev.y === curr.y && curr.y === next.y;
    if (!collinearX && !collinearY) simplified.push(curr);
  }
  return simplified;
}

function traceLoopsFromAdjacency(adjacency: globalThis.Map<string, string[]>): Pt[] {
  const loops: Pt[][] = [];
  const maxSteps = 200000;

  const popEdge = (from: string): string | null => {
    const list = adjacency.get(from);
    if (!list || list.length === 0) return null;
    const to = list.pop()!;
    if (list.length === 0) adjacency.delete(from);
    return to;
  };

  const findStartKey = (): string | null => {
    let bestKey: string | null = null;
    let best: Pt | null = null;
    for (const k of adjacency.keys()) {
      const p = parseKeyPt(k);
      if (!best || p.y < best.y || (p.y === best.y && p.x < best.x)) {
        best = p;
        bestKey = k;
      }
    }
    return bestKey;
  };

  while (adjacency.size > 0) {
    const startKey = findStartKey();
    if (!startKey) break;
    const startPt = parseKeyPt(startKey);
    const pts: Pt[] = [startPt];

    let current = startKey;
    let steps = 0;
    while (steps++ < maxSteps) {
      const next = popEdge(current);
      if (!next) break;
      const nextPt = parseKeyPt(next);
      pts.push(nextPt);
      current = next;
      if (current === startKey) break;
    }

    // Drop duplicate closing point if present
    if (pts.length >= 2) {
      const last = pts[pts.length - 1];
      if (last.x === startPt.x && last.y === startPt.y) pts.pop();
    }

    if (pts.length >= 3) loops.push(simplifyAxisAlignedLoop(pts));
  }

  // Pick the largest loop (Voronoi cells should be single-loop; this is a safety net)
  let best: Pt[] = [];
  for (const loop of loops) {
    if (loop.length > best.length) best = loop;
  }
  return best;
}

function mergeIntervals(intervals: Array<[number, number]>, eps = 1e-6): Array<[number, number]> {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  let [curS, curE] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= curE + eps) {
      curE = Math.max(curE, e);
    } else {
      merged.push([curS, curE]);
      curS = s;
      curE = e;
    }
  }
  merged.push([curS, curE]);
  return merged;
}

function buildSharedCityTilingForCountry(
  countryCities: City[],
  allCountries: Country[],
  ownCountryId: string,
  territoryPath: string,
  resolution = CITY_TILING_RESOLUTION,
): {
  cityPathById: globalThis.Map<string, string>;
  internalBordersPath: string;
  borderNeighborCountryIdsByCityId: globalThis.Map<string, globalThis.Set<string>>;
} {
  const poly = parsePathToPolygon(territoryPath);
  if (poly.length < 3 || countryCities.length === 0) {
    return {
      cityPathById: new globalThis.Map(),
      internalBordersPath: "",
      borderNeighborCountryIdsByCityId: new globalThis.Map(),
    };
  }

  const { minX, minY, maxX, maxY } = boundsOf(poly);
  const originX = minX;
  const originY = minY;
  const nx = Math.max(1, Math.ceil((maxX - minX) / resolution) + 3);
  const ny = Math.max(1, Math.ceil((maxY - minY) / resolution) + 3);

  const size = nx * ny;
  const inside = new Uint8Array(size);
  const label = new Int16Array(size);
  label.fill(-1);

  const idx = (ix: number, iy: number) => iy * nx + ix;

  const mapWidth = 100;
  const mapHeight = 80;

  const nearestCountryId = (x: number, y: number): string | null => {
    let bestId: string | null = null;
    let bestD = Infinity;
    for (const c of allCountries) {
      const dx = x - c.positionX;
      const dy = y - c.positionY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        bestId = c.id;
      }
    }
    return bestId;
  };

  // Raster Voronoi assignment inside the country polygon
  for (let iy = 0; iy < ny; iy++) {
    const y = originY + iy * resolution;
    for (let ix = 0; ix < nx; ix++) {
      const x = originX + ix * resolution;
      if (!pointInPolygon({ x, y }, poly)) continue;
      inside[idx(ix, iy)] = 1;

      let best = 0;
      let bestD = Infinity;
      for (let ci = 0; ci < countryCities.length; ci++) {
        const c = countryCities[ci];
        const dx = x - c.positionX;
        const dy = y - c.positionY;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = ci;
        }
      }
      label[idx(ix, iy)] = best;
    }
  }

  // Internal border segments (rendered once for both cities)
  const verticalByX = new globalThis.Map<string, Array<[number, number]>>();
  const horizontalByY = new globalThis.Map<string, Array<[number, number]>>();

  for (let iy = 0; iy < ny; iy++) {
    const yCenter = originY + iy * resolution;
    for (let ix = 0; ix < nx; ix++) {
      const i = idx(ix, iy);
      if (!inside[i]) continue;
      const l = label[i];

      // Right neighbor (unique border detection)
      if (ix + 1 < nx) {
        const ir = idx(ix + 1, iy);
        if (inside[ir] && label[ir] !== l) {
          const xEdge = originX + (ix + 0.5) * resolution;
          const y0 = yCenter - resolution / 2;
          const y1 = yCenter + resolution / 2;
          const k = xEdge.toFixed(3);
          const list = verticalByX.get(k) ?? [];
          list.push([y0, y1]);
          verticalByX.set(k, list);
        }
      }

      // Bottom neighbor (unique border detection)
      if (iy + 1 < ny) {
        const ib = idx(ix, iy + 1);
        if (inside[ib] && label[ib] !== l) {
          const yEdge = originY + (iy + 0.5) * resolution;
          const xCenter = originX + ix * resolution;
          const x0 = xCenter - resolution / 2;
          const x1 = xCenter + resolution / 2;
          const k = yEdge.toFixed(3);
          const list = horizontalByY.get(k) ?? [];
          list.push([x0, x1]);
          horizontalByY.set(k, list);
        }
      }
    }
  }

  const internalParts: string[] = [];
  for (const [xKey, intervals] of verticalByX.entries()) {
    const x = Number.parseFloat(xKey);
    const merged = mergeIntervals(intervals);
    for (const [y0, y1] of merged) {
      internalParts.push(`M ${x.toFixed(2)} ${y0.toFixed(2)} L ${x.toFixed(2)} ${y1.toFixed(2)}`);
    }
  }
  for (const [yKey, intervals] of horizontalByY.entries()) {
    const y = Number.parseFloat(yKey);
    const merged = mergeIntervals(intervals);
    for (const [x0, x1] of merged) {
      internalParts.push(`M ${x0.toFixed(2)} ${y.toFixed(2)} L ${x1.toFixed(2)} ${y.toFixed(2)}`);
    }
  }

  // City polygons built from pixel edges (shared coordinates => no seams)
  const adjacencyByCity: Array<globalThis.Map<string, string[]>> = Array.from(
    { length: countryCities.length },
    () => new globalThis.Map(),
  );
  const addEdge = (ci: number, from: Pt, to: Pt) => {
    const fromK = keyPt(from.x, from.y);
    const toK = keyPt(to.x, to.y);
    const adj = adjacencyByCity[ci];
    const list = adj.get(fromK) ?? [];
    list.push(toK);
    adj.set(fromK, list);
  };

  const isInside = (ix: number, iy: number): boolean => ix >= 0 && ix < nx && iy >= 0 && iy < ny && inside[idx(ix, iy)] === 1;
  const getLabel = (ix: number, iy: number): number => label[idx(ix, iy)];

  // For each city, track which neighboring countries it touches along the COUNTRY border.
  // This enables "attackable city" determination (enemy city touches player country border).
  const neighborCountryIdsByCityIndex: Array<globalThis.Set<string>> = Array.from(
    { length: countryCities.length },
    () => new globalThis.Set<string>(),
  );

  const h = resolution / 2;
  const eps = Math.max(0.01, resolution * 0.06);
  const outBase = h + eps;

  const recordNeighborCountryAlong = (cityIndex: number, originX: number, originY: number, dirX: number, dirY: number) => {
    // Try progressively further samples to robustly cross the Voronoi bisector.
    // This fixes edge-cases where stepping just outside the polygon still lands in the same nearest-country region.
    const multipliers = [1, 2, 3, 4];
    for (const m of multipliers) {
      const sampleX = originX + dirX * outBase * m;
      const sampleY = originY + dirY * outBase * m;
      if (sampleX < 0 || sampleX > mapWidth || sampleY < 0 || sampleY > mapHeight) continue;
      const neighborId = nearestCountryId(sampleX, sampleY);
      if (!neighborId) continue;
      if (neighborId === ownCountryId) continue;
      neighborCountryIdsByCityIndex[cityIndex].add(neighborId);
      break;
    }
  };

  for (let iy = 0; iy < ny; iy++) {
    const y = originY + iy * resolution;
    for (let ix = 0; ix < nx; ix++) {
      const i = idx(ix, iy);
      if (!inside[i]) continue;
      const ci = label[i];
      const x = originX + ix * resolution;

      // Neighbor checks: when neighbor is different/outside => boundary edge for this city
      const upInside = isInside(ix, iy - 1);
      const downInside = isInside(ix, iy + 1);
      const leftInside = isInside(ix - 1, iy);
      const rightInside = isInside(ix + 1, iy);
      const upLeftInside = isInside(ix - 1, iy - 1);
      const upRightInside = isInside(ix + 1, iy - 1);
      const downLeftInside = isInside(ix - 1, iy + 1);
      const downRightInside = isInside(ix + 1, iy + 1);

      const upDiff = !upInside || getLabel(ix, iy - 1) !== ci;
      const downDiff = !downInside || getLabel(ix, iy + 1) !== ci;
      const leftDiff = !leftInside || getLabel(ix - 1, iy) !== ci;
      const rightDiff = !rightInside || getLabel(ix + 1, iy) !== ci;

      // If this is a COUNTRY boundary edge (neighbor cell is outside the territory),
      // sample just outside the edge to determine which other country lies beyond.
      if (!upInside) recordNeighborCountryAlong(ci, x, y, 0, -1);
      if (!downInside) recordNeighborCountryAlong(ci, x, y, 0, 1);
      if (!leftInside) recordNeighborCountryAlong(ci, x, y, -1, 0);
      if (!rightInside) recordNeighborCountryAlong(ci, x, y, 1, 0);

      // IMPORTANT: diagonal borders can be missed if we only sample N/S/E/W.
      // If a territory boundary passes diagonally, a pixel can have all 4-cardinal neighbors inside,
      // but a diagonal neighbor outside. Sampling diagonals fixes "border city not attackable" cases.
      if (!upLeftInside) recordNeighborCountryAlong(ci, x, y, -1, -1);
      if (!upRightInside) recordNeighborCountryAlong(ci, x, y, 1, -1);
      if (!downLeftInside) recordNeighborCountryAlong(ci, x, y, -1, 1);
      if (!downRightInside) recordNeighborCountryAlong(ci, x, y, 1, 1);

      // Top edge (inside is below) => left -> right
      if (upDiff) addEdge(ci, { x: x - h, y: y - h }, { x: x + h, y: y - h });
      // Right edge (inside is left) => top -> bottom
      if (rightDiff) addEdge(ci, { x: x + h, y: y - h }, { x: x + h, y: y + h });
      // Bottom edge (inside is above) => right -> left
      if (downDiff) addEdge(ci, { x: x + h, y: y + h }, { x: x - h, y: y + h });
      // Left edge (inside is right) => bottom -> top
      if (leftDiff) addEdge(ci, { x: x - h, y: y + h }, { x: x - h, y: y - h });
    }
  }

  const cityPathById = new globalThis.Map<string, string>();
  for (let ci = 0; ci < countryCities.length; ci++) {
    // Clone adjacency for tracing (we destructively pop edges)
    const cloned = new globalThis.Map<string, string[]>();
    for (const [k, v] of adjacencyByCity[ci].entries()) cloned.set(k, [...v]);
    const loop = traceLoopsFromAdjacency(cloned);
    if (loop.length < 3) continue;
    const d =
      loop.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ") + " Z";
    cityPathById.set(countryCities[ci].id, d);
  }

  const borderNeighborCountryIdsByCityId = new globalThis.Map<string, globalThis.Set<string>>();
  for (let ci = 0; ci < countryCities.length; ci++) {
    const set = neighborCountryIdsByCityIndex[ci];
    if (set.size > 0) borderNeighborCountryIdsByCityId.set(countryCities[ci].id, set);
  }

  return {
    cityPathById,
    internalBordersPath: internalParts.join(" "),
    borderNeighborCountryIdsByCityId,
  };
}

export function Map({
  countries,
  cities = [],
  onAttackCity,
}: {
  countries: Country[];
  cities?: City[];
  onAttackCity?: (city: City) => void;
}) {
  const selectedCountryId = useGameStore((s) => s.selectedCountryId);
  const selectCountry = useGameStore((s) => s.selectCountry);
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | undefined>();
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = normal, >1 = zoomed in, <1 = zoomed out
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Generate territories based on city ownership
  // This ensures captured cities are within their country's borders
  const territoryPaths = useMemo(
    () => TerritoryGenerator.generateTerritoriesFromCities(countries, cities),
    [countries, cities]
  );

  // Derive shared city shapes + a single internal border overlay per country.
  // This eliminates the "two dashed lines + seam" artifact by ensuring shared edges are identical.
  const derivedCityGeometry = useMemo(() => {
    const cityPathById = new globalThis.Map<string, string>();
    const borderNeighborCountryIdsByCityId = new globalThis.Map<string, globalThis.Set<string>>();
    const borderParts: string[] = [];

    for (const country of countries) {
      const territoryPath = territoryPaths.get(country.id);
      if (!territoryPath) continue;
      const countryCities = cities.filter((c) => c.countryId === country.id);
      if (countryCities.length === 0) continue;

      const { cityPathById: byId, internalBordersPath, borderNeighborCountryIdsByCityId: byCityNeighbor } =
        buildSharedCityTilingForCountry(countryCities, countries, country.id, territoryPath);
      for (const [id, d] of byId.entries()) cityPathById.set(id, d);
      for (const [cityId, neighborSet] of byCityNeighbor.entries()) borderNeighborCountryIdsByCityId.set(cityId, neighborSet);
      if (internalBordersPath) borderParts.push(internalBordersPath);
    }

    const playerCountryId = countries.find((c) => c.isPlayerControlled)?.id ?? null;
    const attackableCityIds = new globalThis.Set<string>();
    if (playerCountryId) {
      for (const city of cities) {
        if (city.countryId === playerCountryId) continue; // can't attack own city
        const neighbors = borderNeighborCountryIdsByCityId.get(city.id);
        if (neighbors?.has(playerCountryId)) attackableCityIds.add(city.id);
      }
    }

    return {
      cityPathById,
      internalBordersPath: borderParts.join(" "),
      borderNeighborCountryIdsByCityId,
      playerCountryId,
      attackableCityIds,
    };
  }, [countries, cities, territoryPaths]);

  // Calculate viewBox based on zoom level (centered zoom)
  const baseViewBox = { width: 100, height: 80 };
  const zoomedWidth = baseViewBox.width / zoomLevel;
  const zoomedHeight = baseViewBox.height / zoomLevel;
  const offsetX = (baseViewBox.width - zoomedWidth) / 2;
  const offsetY = (baseViewBox.height - zoomedHeight) / 2;
  const viewBox = `${offsetX} ${offsetY} ${zoomedWidth} ${zoomedHeight}`;

  const handleZoomIn = () => {
    setZoomLevel((prev) => Math.min(prev * 1.2, 5)); // Max 5x zoom
  };

  const handleZoomOut = () => {
    setZoomLevel((prev) => Math.max(prev / 1.2, 0.5)); // Min 0.5x zoom (zoomed out)
  };

  // Selected city and its country for tooltip
  const selectedCity = cities.find(c => c.id === selectedCityId);
  const selectedCityCountry = selectedCity ? countries.find(c => c.id === selectedCity.countryId) : null;
  const canAttackSelectedCity =
    !!selectedCity &&
    !!derivedCityGeometry.playerCountryId &&
    selectedCity.countryId !== derivedCityGeometry.playerCountryId &&
    derivedCityGeometry.attackableCityIds.has(selectedCity.id);

  return (
    <div ref={mapContainerRef} className="relative h-full w-full overflow-hidden">
      {/* SVG Map - Full Screen */}
      <svg
        viewBox={viewBox}
        className="h-full w-full"
        style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" }}
      >
        {/* Ocean/background texture */}
        <defs>
          <pattern id="ocean" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.5" fill="#3b82f680" opacity="0.1" />
          </pattern>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="countryHover">
            <feGaussianBlur stdDeviation="0.3" />
            <feOffset dx="0" dy="0" result="offsetblur" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="1.2" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        
        <rect x="0" y="0" width="100" height="80" fill="url(#ocean)" />

        {/* Country regions - connected territories */}
        {countries.map((country) => {
          const isSelected = country.id === selectedCountryId;
          const isHovered = country.id === hoveredCountryId;
          const isPlayer = country.isPlayerControlled;
          const path = territoryPaths.get(country.id) || "";

          if (!path) return null;

          return (
            <g key={country.id}>
              {/* Country territory */}
              <path
                d={path}
                fill={country.color}
                stroke={isPlayer ? "#000" : isSelected ? "#1f2937" : "#fff"}
                strokeWidth={isPlayer ? "0.6" : isSelected ? "0.5" : "0.4"}
                opacity={isHovered ? 0.95 : isSelected ? 0.85 : 0.8}
                className="cursor-pointer transition-all duration-200"
                style={{
                  filter: isPlayer 
                    ? "url(#glow) drop-shadow(0 0 3px rgba(0,0,0,0.4))" 
                    : isSelected 
                    ? "drop-shadow(0 0 4px rgba(0,0,0,0.5))" 
                    : isHovered
                    ? "url(#countryHover)"
                    : "none",
                }}
                onClick={() => {
                  selectCountry(country.id);
                }}
                onMouseEnter={() => setHoveredCountryId(country.id)}
                onMouseLeave={() => setHoveredCountryId(null)}
              />

              {/* Country name label */}
              <text
                x={country.positionX}
                y={country.positionY}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none text-[3.5px] font-bold"
                fill="#fff"
                stroke="#000"
                strokeWidth="0.2"
                paintOrder="stroke"
                opacity={isHovered || isSelected ? 1 : 0.9}
              >
                {country.name}
              </text>

              {/* Player indicator (crown) */}
              {isPlayer && (
                <text
                  x={country.positionX}
                  y={country.positionY - 7}
                  textAnchor="middle"
                  className="pointer-events-none text-[5px]"
                  fill="#FFD700"
                  stroke="#000"
                  strokeWidth="0.15"
                  paintOrder="stroke"
                  opacity="1"
                >
                  ⚜
                </text>
              )}
            </g>
          );
        })}

        {/* City areas - interactive regions */}
        {cities.map((city) => {
          const country = countries.find(c => c.id === city.countryId);
          if (!country) return null;
          
          const isHovered = city.id === hoveredCityId;
          const isCountrySelected = country.id === selectedCountryId;
          // Always use the stored border path to keep city size and location fixed
          const cityPath = city.borderPath;
          const isAttackable = derivedCityGeometry.attackableCityIds.has(city.id);

          return (
            <g key={city.id}>
              {/* City area - clickable and hoverable */}
              <path
                d={cityPath}
                fill={isHovered ? country.color : "transparent"}
                // Make hover highlight clearly visible again
                fillOpacity={isHovered ? 0.32 : 0}
                // Add a subtle outline on hover (solid) for readability.
                // This avoids the "double dashed border" artifact because only the overlay uses dashes.
                stroke={
                  isHovered && isAttackable
                    ? "rgba(239,68,68,0.95)"
                    : isHovered
                      ? "rgba(255,255,255,0.85)"
                      : "none"
                }
                strokeWidth={isHovered ? "0.28" : "0"}
                strokeLinejoin="round"
                opacity={isHovered ? 1 : isCountrySelected ? 0.5 : 0.35}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredCityId(city.id)}
                onMouseLeave={() => setHoveredCityId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  
                  // Toggle tooltip if clicking the same city
                  if (selectedCityId === city.id) {
                    setSelectedCityId(null);
                    setTooltipPosition(undefined);
                    return;
                  }
                  
                  // Select the country that owns this city
                  selectCountry(city.countryId);
                  
                  // Calculate tooltip position relative to viewport
                  if (mapContainerRef.current) {
                    const svgRect = mapContainerRef.current.getBoundingClientRect();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (svg) {
                      const viewBox = svg.viewBox.baseVal;
                      const scaleX = svgRect.width / viewBox.width;
                      const scaleY = svgRect.height / viewBox.height;
                      
                      let screenX = svgRect.left + (city.positionX - viewBox.x) * scaleX;
                      let screenY = svgRect.top + (city.positionY - viewBox.y) * scaleY;
                      
                      // Tooltip dimensions (max-height: 80vh = 0.8 * window.innerHeight)
                      const tooltipWidth = 320;
                      const tooltipMaxHeight = window.innerHeight * 0.8;
                      const margin = 20;
                      
                      // The tooltip uses transform: translate(-50%, calc(-100% - 20px))
                      // This centers it horizontally and positions it 20px above the point
                      
                      // Calculate where the tooltip edges will be
                      const tooltipLeft = screenX - tooltipWidth / 2;
                      const tooltipRight = screenX + tooltipWidth / 2;
                      const tooltipTop = screenY - tooltipMaxHeight - 20; // Above with 20px gap
                      
                      // Adjust horizontally if needed
                      if (tooltipLeft < margin) {
                        // Too far left - shift right
                        screenX = margin + tooltipWidth / 2;
                      } else if (tooltipRight > window.innerWidth - margin) {
                        // Too far right - shift left
                        screenX = window.innerWidth - margin - tooltipWidth / 2;
                      }
                      
                      // Adjust vertically if needed
                      if (tooltipTop < margin) {
                        // Too close to top - shift down to fit on screen
                        screenY = tooltipMaxHeight + margin + 20;
                      }
                      
                      setTooltipPosition({ x: screenX, y: screenY });
                    }
                  }
                  
                  setSelectedCityId(city.id);
                }}
              />

              {/* City name (on hover) - smaller */}
              {isHovered && (
                <>
                  {/* Background for better readability */}
                  <rect
                    x={city.positionX - 6}
                    y={city.positionY - 1.5}
                    width="12"
                    height="3"
                    fill="#000"
                    opacity="0.75"
                    rx="0.3"
                    className="pointer-events-none"
                  />
                  <text
                    x={city.positionX}
                    y={city.positionY + 0.2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none select-none text-[1.8px] font-semibold"
                    fill="#fff"
                    opacity="1"
                  >
                    {city.name}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* City internal borders - rendered ONCE for mutual borders */}
        {derivedCityGeometry.internalBordersPath && (
          <path
            d={derivedCityGeometry.internalBordersPath}
            fill="none"
            stroke="#fff"
            // Round caps + tiny dash length creates proper "dots"
            strokeWidth="0.24"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="0.01 0.9"
            opacity={selectedCountryId ? 0.5 : 0.35}
            className="pointer-events-none"
            shapeRendering="geometricPrecision"
          />
        )}
      </svg>

      {/* Zoom Controls - Bottom of Map */}
      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 flex-row gap-2">
        {/* Zoom In Button */}
        <button
          onClick={handleZoomIn}
          disabled={zoomLevel >= 5}
          className="flex h-8 w-8 items-center justify-center rounded bg-slate-800/90 text-white shadow-lg transition-all hover:bg-slate-700/90 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Zoom In"
          aria-label="Zoom In"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
            <path d="M11 8v6" />
            <path d="M8 11h6" />
          </svg>
        </button>

        {/* Zoom Out Button */}
        <button
          onClick={handleZoomOut}
          disabled={zoomLevel <= 0.5}
          className="flex h-8 w-8 items-center justify-center rounded bg-slate-800/90 text-white shadow-lg transition-all hover:bg-slate-700/90 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Zoom Out"
          aria-label="Zoom Out"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
            <path d="M8 11h6" />
          </svg>
        </button>
      </div>

      {/* City Tooltip */}
      {selectedCity && selectedCityCountry && tooltipPosition && (
        <CityTooltip
          city={selectedCity}
          country={selectedCityCountry}
          position={tooltipPosition}
          canAttack={canAttackSelectedCity}
          onAttack={
            canAttackSelectedCity
              ? () => {
                  onAttackCity?.(selectedCity);
                }
              : undefined
          }
          onClose={() => {
            setSelectedCityId(null);
            setTooltipPosition(undefined);
          }}
        />
      )}
    </div>
  );
}
