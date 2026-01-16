"use client";

import type { Country, CountryStats } from "@/types/country";

export function CountryPanel({
  country,
  stats,
}: {
  country: Country | null;
  stats: CountryStats | null;
}) {
  if (!country || !stats) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-800/50 p-4 text-sm text-white/60">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-white/20" />
          <span>Select a country on the map</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
        <span
          className="inline-block h-4 w-4 rounded border-2 border-white/30 shadow-md"
          style={{ backgroundColor: country.color }}
        />
        <div className="flex-1">
          <div className="text-lg font-bold text-white">{country.name}</div>
          <div className="text-xs text-white/60">
            {country.isPlayerControlled ? "Your Country" : "AI Controlled"}
          </div>
        </div>
        {country.isPlayerControlled && (
          <span className="text-xl text-yellow-400">⚜</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-white/10 bg-slate-800/50 p-3">
          <div className="text-xs text-white/60">Population</div>
          <div className="mt-1 text-lg font-bold text-white">{stats.population.toLocaleString()}</div>
        </div>
        <div className="rounded border border-white/10 bg-slate-800/50 p-3">
          <div className="text-xs text-white/60">Budget</div>
          <div className="mt-1 text-lg font-bold text-green-400">
            {Number(stats.budget).toLocaleString()}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-slate-800/50 p-3">
          <div className="text-xs text-white/60">Technology</div>
          <div className="mt-1 text-lg font-bold text-blue-400">
            {Number(stats.technologyLevel).toFixed(1)}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-slate-800/50 p-3">
          <div className="text-xs text-white/60">Infrastructure</div>
          <div className="mt-1 text-lg font-bold text-purple-400">
            {stats.infrastructureLevel ?? 0}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-slate-800/50 p-3">
          <div className="text-xs text-white/60">Military</div>
          <div className="mt-1 text-lg font-bold text-red-400">{stats.militaryStrength}</div>
        </div>
      </div>
    </div>
  );
}
