"use client";

import { useState } from "react";
import { ResourceCategory, ResourceRegistry, type ResourceAmount } from "@/lib/game-engine/ResourceTypes";
import { calculateProductionForDisplay, calculateConsumptionForDisplay, resourcesToArray } from "@/lib/game-engine/EconomicClientUtils";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";
import { ResourceProduction } from "@/lib/game-engine/ResourceProduction";
import type { Country, CountryStats } from "@/types/country";
import { Tooltip } from "./Tooltip";

interface ResourceDisplayProps {
  country: Country | null;
  stats: CountryStats | null;
  resources?: Record<string, number>;
}
  
  const resourceIcons: Record<string, string> = {
  // Basic (2)
  food: "🌾",
  timber: "🪵",
  // Strategic (2)
  iron: "⚙️",
  oil: "🛢️",
  // Economic (2)
  gold: "🥇",
  copper: "🔶",
  // Industrial (2)
  coal: "⚫",
  steel: "🔩",
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
    const techMult = ResourceProduction.getTechnologyMultiplier(stats.technologyLevel);
    
    // Resource purposes and requirements from plan
    const resourceInfo: Record<string, { purpose: string; usedFor: string[] }> = {
      food: {
        purpose: "Population survival and growth",
        usedFor: ["Population maintenance (5 per 10k pop/turn)", "Growth bonus with surplus"]
      },
      timber: {
        purpose: "Basic construction and infrastructure",
        usedFor: ["Infrastructure upgrades (all levels)", "Basic military (tech 0-1)"]
      },
      iron: {
        purpose: "Military equipment and weapons",
        usedFor: ["Military recruitment (all tech levels)"]
      },
      oil: {
        purpose: "Advanced military and energy",
        usedFor: ["Advanced military (tech 2+)", "Infrastructure level 4+", "Industrial production boost"]
      },
      gold: {
        purpose: "Diplomacy and luxury trade",
        usedFor: ["Diplomatic influence bonus", "High-value trade commodity"]
      },
      copper: {
        purpose: "Research and early industry",
        usedFor: ["Research (tech 0-5)", "Trade commodity"]
      },
      steel: {
        purpose: "Advanced construction and military",
        usedFor: ["Tech upgrades (all levels)", "Infrastructure level 2+", "Military tech 2+"]
      },
      coal: {
        purpose: "Energy and production",
        usedFor: ["Research (all levels)", "Infrastructure level 2+"]
      }
    };
    
    const info = resourceInfo[resourceId] || { purpose: definition.description, usedFor: [] };
    
    let calc = "";
    if (resourceId === 'food') {
      calc = `📊 PRODUCTION:\nBase: ${(popUnits * ECONOMIC_BALANCE.PRODUCTION.BASE_FOOD_PER_POP).toFixed(1)} × Tech(${techMult.toFixed(1)}x) = ${prod}/turn`;
      if (cons > 0) calc += `\n\n📉 CONSUMPTION:\n${popUnits.toFixed(1)} × 5 = ${cons}/turn`;
    } else {
      calc = `📊 PRODUCTION:\n${prod}/turn (Tech ${techMult.toFixed(1)}x multiplier)`;
      if (cons > 0) calc += `\n\n📉 CONSUMPTION:\n${cons}/turn`;
    }
    
    // Add profile effect if exists
    const profileEffect = getProfileEffect(resourceId);
    if (profileEffect) {
      const effectType = profileEffect.multiplier > 1.0 ? 'BONUS' : 'PENALTY';
      const effectPercent = Math.round(profileEffect.multiplier * 100);
      calc += `\n\n🏛️ PROFILE EFFECT (${stats.resourceProfile?.name}):\n${effectType}: ${effectPercent}% production`;
      if (profileEffect.startingBonus !== 0) {
        calc += `\nStarting bonus: ${profileEffect.startingBonus > 0 ? '+' : ''}${profileEffect.startingBonus}`;
      }
    }
    
    let usedForText = "";
    if (info.usedFor.length > 0) {
      usedForText = `\n\n🎯 USED FOR:\n${info.usedFor.map(u => `• ${u}`).join('\n')}`;
    }
    
    return `${info.purpose}\n\n${calc}${usedForText}\n\n📦 CURRENT STOCKPILE: ${amount.toLocaleString()}`;
  };

  const getTechBonusTooltip = () => {
    const techLevel = Math.max(0, Math.floor(stats.technologyLevel));
    const mult = ResourceProduction.getTechnologyMultiplier(techLevel);
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
