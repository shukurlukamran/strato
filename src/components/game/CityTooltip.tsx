"use client";

import type { City, Country } from "@/types/country";
import { useState } from "react";

interface CityTooltipProps {
  city: City;
  country: Country;
  isPlayerCity: boolean;
  onAttack?: (city: City) => void;
}

export function CityTooltip({ city, country, isPlayerCity, onAttack }: CityTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const handleCityClick = () => {
    setIsVisible(!isVisible);
  };

  const handleAttack = () => {
    if (onAttack) {
      onAttack(city);
    }
    setIsVisible(false); // Hide tooltip after attack
  };

  return (
    <>
      {/* City click handler - positioned absolutely over the city */}
      <circle
        cx={city.positionX}
        cy={city.positionY}
        r="1.5"
        fill="transparent"
        className="cursor-pointer"
        onClick={handleCityClick}
      />

      {/* Tooltip */}
      {isVisible && (
        <g>
          {/* Background rectangle */}
          <rect
            x={city.positionX - 8}
            y={city.positionY - 12}
            width="16"
            height="10"
            fill="#1f2937"
            stroke="#374151"
            strokeWidth="0.2"
            rx="0.5"
            opacity="0.95"
          />

          {/* City name */}
          <text
            x={city.positionX}
            y={city.positionY - 10}
            textAnchor="middle"
            className="text-[2px] font-bold fill-white"
          >
            {city.name}
          </text>

          {/* Owner */}
          <text
            x={city.positionX}
            y={city.positionY - 8}
            textAnchor="middle"
            className="text-[1.5px] fill-gray-300"
          >
            {country.name}
          </text>

          {/* Population */}
          <text
            x={city.positionX - 7}
            y={city.positionY - 5.5}
            textAnchor="start"
            className="text-[1.2px] fill-white"
          >
            Pop: {city.population.toLocaleString()}
          </text>

          {/* Resources */}
          <text
            x={city.positionX - 7}
            y={city.positionY - 3.5}
            textAnchor="start"
            className="text-[1px] fill-gray-300"
          >
            Resources/turn:
          </text>

          {/* Resource list */}
          {Object.entries(city.resourcesPerTurn).map(([resource, amount], index) => (
            <text
              key={resource}
              x={city.positionX - 7}
              y={city.positionY - 2 + index * 1.2}
              textAnchor="start"
              className="text-[1px] fill-gray-400"
            >
              {resource}: +{amount}
            </text>
          ))}

          {/* Attack button for enemy cities */}
          {!isPlayerCity && (
            <g>
              <rect
                x={city.positionX - 3}
                y={city.positionY + 2}
                width="6"
                height="2"
                fill="#dc2626"
                stroke="#991b1b"
                strokeWidth="0.1"
                rx="0.2"
                className="cursor-pointer hover:fill-red-500 transition-colors"
                onClick={handleAttack}
              />
              <text
                x={city.positionX}
                y={city.positionY + 3.2}
                textAnchor="middle"
                className="text-[1.2px] font-bold fill-white cursor-pointer"
                onClick={handleAttack}
              >
                ATTACK
              </text>
            </g>
          )}

          {/* Close button */}
          <circle
            cx={city.positionX + 7}
            cy={city.positionY - 11}
            r="0.4"
            fill="#6b7280"
            className="cursor-pointer hover:fill-gray-400 transition-colors"
            onClick={() => setIsVisible(false)}
          />
          <text
            x={city.positionX + 7}
            y={city.positionY - 10.7}
            textAnchor="middle"
            className="text-[1.5px] font-bold fill-white cursor-pointer"
            onClick={() => setIsVisible(false)}
          >
            ×
          </text>
        </g>
      )}
    </>
  );
}