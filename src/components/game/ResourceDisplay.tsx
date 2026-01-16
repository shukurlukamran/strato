"use client";

import { ResourceCategory, ResourceRegistry, type ResourceAmount } from "@/lib/game-engine/ResourceTypes";
import { calculateProductionForDisplay, calculateConsumptionForDisplay, resourcesToArray } from "@/lib/game-engine/EconomicClientUtils";
import type { Country, CountryStats } from "@/types/country";

interface ResourceDisplayProps {
  country: Country | null;
  stats: CountryStats | null;
  resources?: Record<string, number>;
}

const resourceIcons: Record<string, string> = {
  // Basic
  food: "🌾",
  water: "💧",
  timber: "🪵",
  stone: "🪨",
  // Strategic
  iron: "⚙️",
  oil: "🛢️",
  uranium: "☢️",
  rare_earth: "💎",
  // Economic
  gold: "🥇",
  silver: "🥈",
  gems: "💠",
  copper: "🔶",
  // Industrial
  coal: "⚫",
  steel: "🔩",
  aluminum: "✈️",
  electronics: "💻",
};

const categoryLabels: Record<ResourceCategory, string> = {
  [ResourceCategory.BASIC]: "Basic Resources",
  [ResourceCategory.STRATEGIC]: "Strategic Resources",
  [ResourceCategory.ECONOMIC]: "Economic Resources",
  [ResourceCategory.INDUSTRIAL]: "Industrial Resources",
};

const categoryColors: Record<ResourceCategory, string> = {
  [ResourceCategory.BASIC]: "text-green-400",
  [ResourceCategory.STRATEGIC]: "text-red-400",
  [ResourceCategory.ECONOMIC]: "text-yellow-400",
  [ResourceCategory.INDUSTRIAL]: "text-blue-400",
};

export function ResourceDisplay({ country, stats, resources }: ResourceDisplayProps) {
  if (!country || !stats) {
    return (
      <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
        <div className="text-sm text-white/60">Select a country to view resources</div>
      </div>
    );
  }

  const currentResources = resourcesToArray(resources || stats.resources || {});
  const production = calculateProductionForDisplay(country, stats);
  const consumption = calculateConsumptionForDisplay(stats);

  // Group resources by category
  const resourcesByCategory = new Map<ResourceCategory, Array<{
    resource: ResourceAmount;
    production: number;
    consumption: number;
    netChange: number;
  }>>();

  // Initialize categories
  Object.values(ResourceCategory).forEach(cat => {
    resourcesByCategory.set(cat, []);
  });

  // Process each resource
  currentResources.forEach(resource => {
    const definition = ResourceRegistry.getResource(resource.resourceId);
    if (!definition) return;

    const produced = production.resources.find(r => r.resourceId === resource.resourceId)?.amount || 0;
    const consumed = consumption.find(r => r.resourceId === resource.resourceId)?.amount || 0;
    const netChange = produced - consumed;

    const category = definition.category;
    const existing = resourcesByCategory.get(category) || [];
    existing.push({
      resource,
      production: produced,
      consumption: consumed,
      netChange
    });
    resourcesByCategory.set(category, existing);
  });

  // Also include resources that are produced but not yet in current resources
  production.resources.forEach(produced => {
    const exists = currentResources.find(r => r.resourceId === produced.resourceId);
    if (!exists) {
      const definition = ResourceRegistry.getResource(produced.resourceId);
      if (definition) {
        const category = definition.category;
        const existing = resourcesByCategory.get(category) || [];
        const consumed = consumption.find(r => r.resourceId === produced.resourceId)?.amount || 0;
        existing.push({
          resource: { resourceId: produced.resourceId, amount: 0 },
          production: produced.amount,
          consumption: consumed,
          netChange: produced.amount - consumed
        });
        resourcesByCategory.set(category, existing);
      }
    }
  });

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div className="text-sm font-semibold text-white">Resources</div>
        <div className="text-xs text-white/60">
          Tech: +{production.productionSummary.technologyBonus.toFixed(0)}% | 
          Infra: +{production.productionSummary.infrastructureBonus.toFixed(0)}%
        </div>
      </div>

      {currentResources.length === 0 && production.resources.length === 0 ? (
        <div className="text-sm text-white/60">No resources tracked</div>
      ) : (
        <div className="space-y-4">
          {Object.values(ResourceCategory).map(category => {
            const categoryResources = resourcesByCategory.get(category) || [];
            if (categoryResources.length === 0) return null;

            return (
              <div key={category} className="space-y-2">
                <div className={`text-xs font-semibold ${categoryColors[category]}`}>
                  {categoryLabels[category]}
                </div>
                <div className="space-y-1.5">
                  {categoryResources.map(({ resource, production: prod, consumption: cons, netChange }) => {
                    const definition = ResourceRegistry.getResource(resource.resourceId);
                    if (!definition) return null;

                    const trend = netChange > 0 ? "↑" : netChange < 0 ? "↓" : "→";
                    const trendColor = netChange > 0 ? "text-green-400" : netChange < 0 ? "text-red-400" : "text-white/40";

                    return (
                      <div
                        key={resource.resourceId}
                        className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-lg flex-shrink-0">{resourceIcons[resource.resourceId] || "📦"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-white/90 truncate">{definition.name}</div>
                            <div className="text-xs text-white/50">
                              {prod > 0 && <span className="text-green-400">+{prod}/turn</span>}
                              {cons > 0 && (
                                <>
                                  {prod > 0 && " • "}
                                  <span className="text-red-400">-{cons}/turn</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="font-bold text-white">{resource.amount.toLocaleString()}</span>
                          <span className={`text-xs ${trendColor}`} title={`Net: ${netChange > 0 ? '+' : ''}${netChange}/turn`}>
                            {trend}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
