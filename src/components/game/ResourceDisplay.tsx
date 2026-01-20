"use client";

import { useState } from "react";
import { ResourceCategory, ResourceRegistry, type ResourceAmount } from "@/lib/game-engine/ResourceTypes";
import { calculateProductionForDisplay, calculateConsumptionForDisplay, resourcesToArray } from "@/lib/game-engine/EconomicClientUtils";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";
import type { Country, CountryStats } from "@/types/country";
import { Tooltip } from "./Tooltip";

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
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<ResourceCategory>>(
    new Set(Object.values(ResourceCategory))
  );

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

  // Check if resource is affected by profile
  const getProfileEffect = (resourceId: string) => {
    if (!stats.resourceProfile) return null;
    const modifier = stats.resourceProfile.modifiers.find(m => m.resourceId === resourceId);
    return modifier;
  };

  // Tooltip content generators
  const getResourceTooltip = (resourceId: string, prod: number, cons: number, amount: number) => {
    const definition = ResourceRegistry.getResource(resourceId);
    if (!definition) return "";
    
    const popUnits = stats.population / 10000;
    const techMult = ECONOMIC_BALANCE.TECHNOLOGY[`LEVEL_${Math.min(Math.max(0, Math.floor(stats.technologyLevel)), 5)}_MULTIPLIER` as keyof typeof ECONOMIC_BALANCE.TECHNOLOGY] || 1;
    
    let calc = "";
    if (resourceId === 'food') {
      calc = `Base: ${(popUnits * ECONOMIC_BALANCE.PRODUCTION.BASE_FOOD_PER_POP).toFixed(1)} × Tech(${techMult.toFixed(1)}x) = ${prod}/turn\n\nNOTE: Infrastructure no longer affects production!`;
      if (cons > 0) calc += ` | Consumed: ${popUnits.toFixed(1)} × 5 = ${cons}/turn`;
    } else {
      calc = `Production: ${prod}/turn (Tech ${techMult.toFixed(1)}x)`;
      if (cons > 0) calc += ` | Consumption: ${cons}/turn`;
    }
    
    // Add profile effect if exists
    const profileEffect = getProfileEffect(resourceId);
    if (profileEffect) {
      const effectType = profileEffect.multiplier > 1.0 ? 'BONUS' : 'PENALTY';
      const effectPercent = Math.round(profileEffect.multiplier * 100);
      calc += `\n\n🏛️ Profile Effect (${stats.resourceProfile?.name}):\n${effectType}: ${effectPercent}% production`;
      if (profileEffect.startingBonus !== 0) {
        calc += `\nStarting: ${profileEffect.startingBonus > 0 ? '+' : ''}${profileEffect.startingBonus}`;
      }
    }
    
    return `${definition.description}\n\n${calc}\n\nCurrent: ${amount.toLocaleString()}`;
  };

  const getTechBonusTooltip = () => {
    const techLevel = Math.min(Math.max(0, Math.floor(stats.technologyLevel)), 5);
    const mult = ECONOMIC_BALANCE.TECHNOLOGY[`LEVEL_${techLevel}_MULTIPLIER` as keyof typeof ECONOMIC_BALANCE.TECHNOLOGY] || 1;
    return `Technology Level ${techLevel}: ${(mult * 100).toFixed(0)}% production multiplier\n\nFormula: Base production × ${mult.toFixed(2)}x`;
  };

  const getInfraBonusTooltip = () => {
    const infraLevel = stats.infrastructureLevel || 0;
    return `Infrastructure Level ${infraLevel}\n\nNEW: Infrastructure affects capacity & administration, NOT production!\n\nBenefits:\n• Tax collection: +${(infraLevel * 12)}%\n• Population capacity: ${200000 + (infraLevel * 50000).toLocaleString()}\n• Trade capacity: ${2 + infraLevel} deals/turn`;
  };

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
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-semibold text-white hover:text-white/80 transition-colors"
        >
          <span>{isExpanded ? "▼" : "▶"}</span>
          <span>Resources</span>
        </button>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <Tooltip content={getTechBonusTooltip()}>
            <span className="cursor-help">Tech: +{production.productionSummary.technologyBonus.toFixed(0)}%</span>
          </Tooltip>
          <span>|</span>
          <Tooltip content={getInfraBonusTooltip()}>
            <span className="cursor-help">Infra: +{production.productionSummary.infrastructureBonus.toFixed(0)}%</span>
          </Tooltip>
        </div>
      </div>

      {isExpanded && (
        <>
          {currentResources.length === 0 && production.resources.length === 0 ? (
        <div className="text-sm text-white/60">No resources tracked</div>
      ) : (
            <div className="space-y-4">
          {Object.values(ResourceCategory).map(category => {
            const categoryResources = resourcesByCategory.get(category) || [];
            if (categoryResources.length === 0) return null;

            const isCategoryExpanded = expandedCategories.has(category);
            const categoryTotal = categoryResources.reduce((sum, r) => sum + r.resource.amount, 0);

            return (
              <div key={category} className="space-y-2">
                <Tooltip content={`${categoryLabels[category]}: Resources in this category are used for ${category === ResourceCategory.BASIC ? 'population needs and basic production' : category === ResourceCategory.STRATEGIC ? 'military and advanced technology' : category === ResourceCategory.ECONOMIC ? 'trade and diplomatic influence' : 'industrial production and construction'}.`}>
                  <button
                    onClick={() => {
                      const newSet = new Set(expandedCategories);
                      if (isCategoryExpanded) {
                        newSet.delete(category);
                      } else {
                        newSet.add(category);
                      }
                      setExpandedCategories(newSet);
                    }}
                    className={`flex items-center gap-2 text-xs font-semibold ${categoryColors[category]} cursor-help hover:opacity-80 transition-opacity`}
                  >
                    <span>{isCategoryExpanded ? "▼" : "▶"}</span>
                    <span>{categoryLabels[category]}</span>
                    <span className="text-white/60">({categoryTotal.toLocaleString()})</span>
                  </button>
                </Tooltip>
                {isCategoryExpanded && (
                  <div className="space-y-1.5">
                  {categoryResources.map(({ resource, production: prod, consumption: cons, netChange }) => {
                    const definition = ResourceRegistry.getResource(resource.resourceId);
                    if (!definition) return null;

                    const trend = netChange > 0 ? "↑" : netChange < 0 ? "↓" : "→";
                    const trendColor = netChange > 0 ? "text-green-400" : netChange < 0 ? "text-red-400" : "text-white/40";

                    const profileEffect = getProfileEffect(resource.resourceId);
                    const profileIcon = profileEffect 
                      ? (profileEffect.multiplier > 1.0 ? "⬆" : "⬇")
                      : null;
                    const profileIconColor = profileEffect
                      ? (profileEffect.multiplier > 1.0 ? "text-green-400" : "text-red-400")
                      : "";

                    return (
                      <div
                        key={resource.resourceId}
                        className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2 text-sm"
                      >
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-lg flex-shrink-0">{resourceIcons[resource.resourceId] || "📦"}</span>
                            <div className="flex-1 min-w-0">
                              <Tooltip content={getResourceTooltip(resource.resourceId, prod, cons, resource.amount)}>
                                <div className="font-medium text-white/90 truncate cursor-help flex items-center gap-1">
                                  {profileIcon && <span className={`text-xs ${profileIconColor}`}>{profileIcon}</span>}
                                  {definition.name}
                                </div>
                              </Tooltip>
                              <div className="text-xs text-white/50">
                                {prod > 0 && (
                                  <Tooltip content={`Production: ${prod} units per turn`}>
                                    <span className="text-green-400 cursor-help">+{prod}/turn</span>
                                  </Tooltip>
                                )}
                                {cons > 0 && (
                                  <>
                                    {prod > 0 && " • "}
                                    <Tooltip content={`Consumption: ${cons} units per turn`}>
                                      <span className="text-red-400 cursor-help">-{cons}/turn</span>
                                    </Tooltip>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Tooltip content={`Current stockpile: ${resource.amount.toLocaleString()} units`}>
                              <span className="font-bold text-white cursor-help">{resource.amount.toLocaleString()}</span>
                            </Tooltip>
                            <Tooltip content={`Net change: ${netChange > 0 ? '+' : ''}${netChange}/turn`}>
                              <span className={`text-xs ${trendColor} cursor-help`}>
                                {trend}
                              </span>
                            </Tooltip>
                          </div>
                        </div>
                    );
                  })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
