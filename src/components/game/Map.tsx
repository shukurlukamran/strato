"use client";

import type { Country } from "@/types/country";
import type { City } from "@/types/city";
import { useGameStore } from "@/lib/store/gameStore";
import { useState, useMemo, useRef, useEffect } from "react";
import { CityTooltip } from "./CityTooltip";
import { TerritoryGenerator } from "@/lib/game-engine/TerritoryGenerator";

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
  const territoryPaths = useMemo(() => TerritoryGenerator.generateTerritories(countries), [countries]);

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
                      
                      // Tooltip dimensions
                      const tooltipWidth = 320;
                      const tooltipHeight = 300;
                      const margin = 20;
                      
                      // The tooltip uses transform: translate(-50%, -120%) by default
                      // This means it's centered horizontally and positioned above the point
                      
                      // Calculate where the tooltip edges will be with the default transform
                      const tooltipLeft = screenX - tooltipWidth / 2;
                      const tooltipRight = screenX + tooltipWidth / 2;
                      const tooltipTop = screenY - tooltipHeight * 1.2; // -120% transform
                      const tooltipBottom = screenY - tooltipHeight * 0.2;
                      
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
                        // Too close to top - position below instead
                        // Adjust screenY so that with -120% transform, tooltip appears below
                        screenY = screenY + tooltipHeight + margin;
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
