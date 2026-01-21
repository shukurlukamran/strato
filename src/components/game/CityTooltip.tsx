"use client";

import type { City } from "@/types/city";
import type { Country } from "@/types/country";
import { calculateCityValue } from "@/types/city";

interface CityTooltipProps {
  city: City;
  country: Country;
  canAttack?: boolean;
  onAttack?: () => void;
  onClose: () => void;
  position?: { x: number; y: number };
}

/**
 * CityTooltip - Display city information in a tooltip
 * Shows city name, owner, population, and per-turn resources
 */
export function CityTooltip({ city, country, canAttack, onAttack, onClose, position }: CityTooltipProps) {
  const cityValue = calculateCityValue(city);
  
  // Resource icons (simple emoji representation)
  const resourceIcons: Record<string, string> = {
    oil: "🛢️",
    gems: "💎",
    coal: "⚫",
    iron: "⛏️",
    gold: "🥇",
    food: "🌾",
    water: "💧",
    timber: "🪵",
    stone: "🪨",
    rare_earth: "✨",
    steel: "🔩",
    aluminum: "⚙️",
  };

  return (
    <div 
      className="fixed z-50 w-80 max-h-[90vh] overflow-y-auto rounded-lg border border-slate-700 bg-slate-800/95 shadow-2xl backdrop-blur-sm"
      style={position ? { 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        transform: 'translate(-50%, -120%)',
        maxWidth: '90vw',
      } : undefined}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between border-b border-slate-700 px-4 py-3"
        style={{ borderColor: country.color }}
      >
        <div className="flex items-center gap-2">
          <div
            className="h-4 w-4 rounded border border-white/30"
            style={{ backgroundColor: country.color }}
          />
          <h3 className="text-lg font-bold text-white">{city.name}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-white/60 hover:text-white transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Owner */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Owner:</span>
          <span className="font-semibold text-white">{country.name}</span>
        </div>

        {/* Population */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Population:</span>
          <span className="font-semibold text-white">
            {city.population.toLocaleString()}
          </span>
        </div>

        {/* City Value */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">City Value:</span>
          <span className="font-semibold text-emerald-400">
            {cityValue} pts
          </span>
        </div>

        {/* Resources Per Turn */}
        {Object.keys(city.perTurnResources).length > 0 && (
          <div className="pt-2 border-t border-slate-700">
            <div className="text-sm font-semibold text-slate-300 mb-2">
              Resources Per Turn:
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(city.perTurnResources)
                .filter(([_, amount]) => amount > 0)
                .map(([resource, amount]) => (
                  <div
                    key={resource}
                    className="flex items-center gap-1.5 rounded bg-slate-700/50 px-2 py-1"
                  >
                    <span className="text-sm">
                      {resourceIcons[resource] || "📦"}
                    </span>
                    <span className="text-xs font-medium text-slate-300 capitalize">
                      {resource}:
                    </span>
                    <span className="text-xs font-bold text-white">
                      {amount}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Under Attack Indicator */}
        {city.isUnderAttack && (
          <div className="mt-3 rounded bg-red-900/30 border border-red-500/50 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-lg">⚔️</span>
              <span className="text-sm font-semibold text-red-300">
                City Under Attack!
              </span>
            </div>
          </div>
        )}

        {/* Attack Action (Phase 2 -> Phase 3 will wire modal/API) */}
        {canAttack && (
          <div className="pt-3 border-t border-slate-700">
            <button
              type="button"
              onClick={onAttack}
              className="w-full rounded-lg bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:from-red-500 hover:to-red-600 active:scale-[0.99]"
            >
              ⚔️ Attack
            </button>
            <div className="mt-1 text-xs text-white/60">
              This city borders your country.
            </div>
          </div>
        )}
      </div>

      {/* Footer - Additional Info */}
      <div className="border-t border-slate-700 px-4 py-2 text-xs text-slate-500">
        City Size: {(city.size * 100).toFixed(0)}% of average
      </div>
    </div>
  );
}
