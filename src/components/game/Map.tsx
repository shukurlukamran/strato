"use client";

import type { Country } from "@/types/country";
import type { City } from "@/types/city";
import { useGameStore } from "@/lib/store/gameStore";
import { useState, useMemo, useRef, useEffect } from "react";
import { CityTooltip } from "./CityTooltip";

// Generate connected territories using a simpler, faster approach
// Creates regions that share borders by using distance-based expansion
function generateConnectedTerritories(countries: Country[]): globalThis.Map<string, string> {
  const cells = new globalThis.Map<string, string>();
  const viewBox = { width: 100, height: 80 };
  
  // For each country, find all points that are closest to it
  // This creates a Voronoi-like diagram but with connected regions
  const resolution = 1; // Grid resolution
  const countryRegions = new globalThis.Map<string, Array<{ x: number; y: number }>>();
  
  // Initialize regions
  for (const country of countries) {
    countryRegions.set(country.id, []);
  }
  
  // Assign each grid point to nearest country
  for (let y = 0; y < viewBox.height; y += resolution) {
    for (let x = 0; x < viewBox.width; x += resolution) {
      let minDist = Infinity;
      let closestCountryId: string | null = null;
      
      for (const country of countries) {
        const dx = x - country.positionX;
        const dy = y - country.positionY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDist) {
          minDist = dist;
          closestCountryId = country.id;
        }
      }
      
      if (closestCountryId) {
        countryRegions.get(closestCountryId)!.push({ x, y });
      }
    }
  }
  
  // Create paths for each country using boundary tracing
  for (const [countryId, points] of countryRegions.entries()) {
    if (points.length === 0) continue;
    
    // Find boundary points (points on the edge of the region)
    const boundary = findBoundary(points, viewBox);
    if (boundary.length < 3) continue;
    
    // Sort boundary points to form a closed path
    const sortedBoundary = sortBoundaryPoints(boundary, countries.find(c => c.id === countryId)!);
    
    // Create SVG path
    const pathStr = sortedBoundary
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ") + " Z";
    
    cells.set(countryId, pathStr);
  }
  
  return cells;
}

// Find boundary points of a region
function findBoundary(points: Array<{ x: number; y: number }>, viewBox: { width: number; height: number }): Array<{ x: number; y: number }> {
  const pointSet = new Set(points.map(p => `${p.x},${p.y}`));
  const boundary: Array<{ x: number; y: number }> = [];
  
  for (const point of points) {
    // Check if this point is on the boundary (has a neighbor that's not in the set)
    const neighbors = [
      { x: point.x - 1, y: point.y },
      { x: point.x + 1, y: point.y },
      { x: point.x, y: point.y - 1 },
      { x: point.x, y: point.y + 1 },
    ];
    
    const isBoundary = neighbors.some(n => 
      !pointSet.has(`${n.x},${n.y}`) || 
      n.x < 0 || n.x >= viewBox.width || 
      n.y < 0 || n.y >= viewBox.height
    );
    
    if (isBoundary) {
      boundary.push(point);
    }
  }
  
  return boundary;
}

// Sort boundary points to form a closed path
function sortBoundaryPoints(boundary: Array<{ x: number; y: number }>, center: Country): Array<{ x: number; y: number }> {
  // Sort by angle from center
  return [...boundary].sort((a, b) => {
    const angleA = Math.atan2(a.y - center.positionY, a.x - center.positionX);
    const angleB = Math.atan2(b.y - center.positionY, b.x - center.positionX);
    return angleA - angleB;
  });
}

export function Map({ countries, cities = [] }: { countries: Country[]; cities?: City[] }) {
  const selectedCountryId = useGameStore((s) => s.selectedCountryId);
  const selectCountry = useGameStore((s) => s.selectCountry);
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);
  const [hoveredCityId, setHoveredCityId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | undefined>();
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = normal, >1 = zoomed in, <1 = zoomed out
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Generate connected territories once
  const territoryPaths = useMemo(() => generateConnectedTerritories(countries), [countries]) as globalThis.Map<string, string>;

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

          return (
            <g key={city.id}>
              {/* City area - clickable and hoverable */}
              <path
                d={city.borderPath}
                fill={isHovered ? country.color : "transparent"}
                fillOpacity={isHovered ? 0.15 : 0}
                stroke="#fff"
                strokeWidth="0.2"
                strokeDasharray="1 1"
                opacity={isHovered ? 0.9 : isCountrySelected ? 0.5 : 0.3}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setHoveredCityId(city.id)}
                onMouseLeave={() => setHoveredCityId(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  
                  // Calculate tooltip position relative to viewport
                  if (mapContainerRef.current) {
                    const svgRect = mapContainerRef.current.getBoundingClientRect();
                    const svg = e.currentTarget.ownerSVGElement;
                    if (svg) {
                      const viewBox = svg.viewBox.baseVal;
                      const scaleX = svgRect.width / viewBox.width;
                      const scaleY = svgRect.height / viewBox.height;
                      
                      const screenX = svgRect.left + (city.positionX - viewBox.x) * scaleX;
                      const screenY = svgRect.top + (city.positionY - viewBox.y) * scaleY;
                      
                      setTooltipPosition({ x: screenX, y: screenY });
                    }
                  }
                  
                  setSelectedCityId(city.id);
                }}
              />

              {/* City name (on hover) */}
              {isHovered && (
                <>
                  {/* Background for better readability */}
                  <rect
                    x={city.positionX - 10}
                    y={city.positionY - 2}
                    width="20"
                    height="4"
                    fill="#000"
                    opacity="0.8"
                    rx="0.5"
                    className="pointer-events-none"
                  />
                  <text
                    x={city.positionX}
                    y={city.positionY + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="pointer-events-none select-none text-[2.5px] font-bold"
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
          onClose={() => {
            setSelectedCityId(null);
            setTooltipPosition(undefined);
          }}
        />
      )}
    </div>
  );
}
