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
      <div className="rounded-lg border bg-white p-4 text-sm text-gray-600">
        Select a country to see details.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: country.color }} />
        <div className="text-sm font-semibold">{country.name}</div>
        <div className="ml-auto text-xs text-gray-600">{country.isPlayerControlled ? "Player" : "AI"}</div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-gray-600">Population</dt>
          <dd className="font-medium">{stats.population.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">Budget</dt>
          <dd className="font-medium">{Number(stats.budget).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">Tech</dt>
          <dd className="font-medium">{Number(stats.technologyLevel).toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-600">Military</dt>
          <dd className="font-medium">{stats.militaryStrength}</dd>
        </div>
      </dl>
    </div>
  );
}

