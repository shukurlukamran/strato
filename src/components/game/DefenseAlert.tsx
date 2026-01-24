"use client";

import type { City } from "@/types/city";

interface DefenseAlertProps {
  cities: City[];
  onClick: (city: City) => void;
}

export function DefenseAlert({ cities, onClick }: DefenseAlertProps) {
  if (cities.length === 0) return null;

  const city = cities[0]; // Show alert for first city, user can click to see details

  return (
    <button
      type="button"
      onClick={() => onClick(city)}
      className="inline-flex items-center gap-2 rounded-full border-2 border-red-500/80 bg-red-900/40 px-3 py-1.5 text-xs font-semibold text-red-300 transition-all hover:bg-red-900/60 hover:border-red-400"
      title={`${city.name} is under attack! Click to allocate defense.`}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
      </span>
      <span className="animate-pulse">⚔️ Defense Required</span>
      {cities.length > 1 && (
        <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {cities.length}
        </span>
      )}
    </button>
  );
}
