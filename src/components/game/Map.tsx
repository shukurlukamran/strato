"use client";

import type { Country } from "@/types/country";
import { useGameStore } from "@/lib/store/gameStore";
import { useState } from "react";

// Generate voronoi-style polygons for each country based on their position
function generateCountryPath(country: Country): string {
  const { positionX: x, positionY: y } = country;
  
  // Create an organic polygon shape centered on the country's position
  // Using a simple algorithm that creates variety while avoiding overlaps
  const seed = country.id.charCodeAt(0) + country.id.charCodeAt(1);
  const baseRadius = 12;
  const points = 8; // 8-sided polygon for organic look
  
  const path: Array<[number, number]> = [];
  
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    // Add some randomness based on country ID for variety
    const radiusVariation = 0.7 + (Math.sin(seed + i * 2.5) * 0.3);
    const angleVariation = (Math.sin(seed * 1.3 + i * 1.7) * 0.15);
    
    const radius = baseRadius * radiusVariation;
    const adjustedAngle = angle + angleVariation;
    
    const px = x + Math.cos(adjustedAngle) * radius;
    const py = y + Math.sin(adjustedAngle) * radius;
    
    path.push([px, py]);
  }
  
  // Convert to SVG path
  const pathStr = path
    .map(([px, py], i) => `${i === 0 ? "M" : "L"} ${px} ${py}`)
    .join(" ") + " Z";
  
  return pathStr;
}

export function Map({ countries }: { countries: Country[] }) {
  const selectedCountryId = useGameStore((s) => s.selectedCountryId);
  const selectCountry = useGameStore((s) => s.selectCountry);
  const openChatWith = useGameStore((s) => s.openChatWith);
  const [hoveredCountryId, setHoveredCountryId] = useState<string | null>(null);

  const playerCountry = countries.find((c) => c.isPlayerControlled);

  return (
    <div className="rounded-lg border bg-gradient-to-br from-blue-50 to-green-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-800">World Map</div>
        <div className="text-xs text-gray-600">
          {playerCountry && `Playing as: ${playerCountry.name}`}
        </div>
      </div>

      {/* SVG Map */}
      <div className="relative overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 to-blue-100 shadow-inner">
        <svg
          viewBox="0 0 100 80"
          className="h-[500px] w-full"
          style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }}
        >
          {/* Ocean/background texture */}
          <defs>
            <pattern id="ocean" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="0.5" fill="#3b82f680" opacity="0.1" />
            </pattern>
            <filter id="glow">
              <feGaussianBlur stdDeviation="0.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          <rect x="0" y="0" width="100" height="80" fill="url(#ocean)" />

          {/* Country regions */}
          {countries.map((country) => {
            const isSelected = country.id === selectedCountryId;
            const isHovered = country.id === hoveredCountryId;
            const isPlayer = country.isPlayerControlled;
            const path = generateCountryPath(country);

            return (
              <g key={country.id}>
                {/* Country territory */}
                <path
                  d={path}
                  fill={country.color}
                  stroke={isPlayer ? "#000" : isSelected ? "#374151" : "#fff"}
                  strokeWidth={isPlayer ? "0.5" : isSelected ? "0.4" : "0.3"}
                  opacity={isHovered ? 0.9 : 0.75}
                  className="cursor-pointer transition-all duration-200"
                  style={{
                    filter: isPlayer ? "url(#glow) drop-shadow(0 0 2px rgba(0,0,0,0.3))" : 
                            isSelected ? "drop-shadow(0 0 3px rgba(0,0,0,0.4))" : "none",
                  }}
                  onClick={() => selectCountry(country.id)}
                  onMouseEnter={() => setHoveredCountryId(country.id)}
                  onMouseLeave={() => setHoveredCountryId(null)}
                />

                {/* Country name label */}
                <text
                  x={country.positionX}
                  y={country.positionY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="pointer-events-none select-none text-[3px] font-bold"
                  fill="#fff"
                  stroke="#000"
                  strokeWidth="0.15"
                  paintOrder="stroke"
                  opacity={isHovered || isSelected ? 1 : 0.9}
                >
                  {country.name}
                </text>

                {/* Player indicator (star) */}
                {isPlayer && (
                  <text
                    x={country.positionX}
                    y={country.positionY - 6}
                    textAnchor="middle"
                    className="pointer-events-none text-[4px]"
                    opacity="0.9"
                  >
                    ★
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Country interaction panel below map */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {countries.map((c) => {
          const selected = c.id === selectedCountryId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => selectCountry(c.id)}
              onMouseEnter={() => setHoveredCountryId(c.id)}
              onMouseLeave={() => setHoveredCountryId(null)}
              className={[
                "rounded-md border p-2 text-left transition-all",
                selected
                  ? "border-black bg-white shadow-md"
                  : "border-gray-200 bg-white/60 hover:border-gray-400 hover:bg-white",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-white shadow-sm"
                  style={{ backgroundColor: c.color }}
                />
                <div className="text-xs font-medium">{c.name}</div>
                {c.isPlayerControlled && (
                  <span className="ml-auto text-xs">★</span>
                )}
              </div>
              {!c.isPlayerControlled && (
                <button
                  type="button"
                  className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1 text-[11px] hover:bg-gray-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    openChatWith(c.id);
                  }}
                >
                  Open Chat
                </button>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

