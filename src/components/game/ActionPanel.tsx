"use client";

import { useState } from "react";
import type { Country, CountryStats } from "@/types/country";
import { Tooltip } from "./Tooltip";
import { 
  calculateResearchCostForDisplay, 
  calculateInfrastructureCostForDisplay,
  calculateMilitaryRecruitmentCostForDisplay 
} from "@/lib/game-engine/EconomicClientUtils";
import { ResourceCostClient } from "@/lib/game-engine/ResourceCostClient";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";

interface ActionPanelProps {
  country: Country | null;
  stats: CountryStats | null;
  gameId: string;
  playerCountryId?: string;
  onStatsUpdate: (newStats: Partial<CountryStats>) => void;
}

export function ActionPanel({ 
  country, 
  stats, 
  gameId, 
  playerCountryId,
  onStatsUpdate,
}: ActionPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [militaryAmount, setMilitaryAmount] = useState(10); // Default 10 units

  // Only show actions for player's own country
  const isPlayerCountry = country?.id === playerCountryId;

  if (!country || !stats || !isPlayerCountry) {
    return (
      <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-semibold text-white hover:text-white/80 transition-colors w-full"
        >
          <span>{isExpanded ? "▼" : "▶"}</span>
          <span>Actions</span>
        </button>
        {isExpanded && (
          <div className="mt-3 text-xs text-white/60">
            Actions are only available for your own country
          </div>
        )}
      </div>
    );
  }

  const handleAction = async (actionType: "research" | "infrastructure" | "military") => {
    if (loading) return;

    setLoading(actionType);
    setMessage(null);

    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          countryId: country.id,
          actionType,
          amount: actionType === "military" ? militaryAmount : undefined, // Pass military amount
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: 'error', text: data.error || "Failed to process action" });
        return;
      }

      // Update stats locally without page reload
      onStatsUpdate(data.updatedStats);
      
      // Build success message with resource cost info
      let successMsg = `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} successful! Cost: $${data.cost.toLocaleString()}`;
      if (data.resourceCost && data.resourceCost.shortage) {
        successMsg += ` (+${((data.resourceCost.penaltyMultiplier - 1) * 100).toFixed(0)}% due to resource shortage)`;
      } else if (data.resourceCost && data.resourceCost.required.length > 0) {
        successMsg += ` (Resources consumed ✓)`;
      }
      
      setMessage({ 
        type: 'success', 
        text: successMsg
      });

      // Clear success message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (e) {
      setMessage({ 
        type: 'error', 
        text: e instanceof Error ? e.message : "Failed to process action" 
      });
    } finally {
      setLoading(null);
    }
  };

  // Calculate costs using accurate formulas with profile modifiers
  const techLevel = Math.floor(stats.technologyLevel);
  const { cost: techCost, reductionPercent: techReduction } = calculateResearchCostForDisplay(stats);
  
  const infraLevel = stats.infrastructureLevel || 0;
  const infraCost = calculateInfrastructureCostForDisplay(stats);
  
  const { cost: militaryCost, reductionPercent: militaryReduction } = calculateMilitaryRecruitmentCostForDisplay(stats, militaryAmount);
  
  const currentBudget = Number(stats.budget);
  
  // Calculate resource costs and affordability
  const researchResourceCost = ResourceCostClient.getResearchResourceCost(stats);
  const infraResourceCost = ResourceCostClient.getInfrastructureResourceCost(stats);
  const militaryResourceCost = ResourceCostClient.getMilitaryResourceCost(militaryAmount, stats);
  
  // Calculate adjusted costs with resource shortage penalties
  const researchPenalty = ResourceCostClient.calculatePenaltyMultiplier(researchResourceCost.missing.length);
  const infraPenalty = ResourceCostClient.calculatePenaltyMultiplier(infraResourceCost.missing.length);
  const militaryPenalty = ResourceCostClient.calculatePenaltyMultiplier(militaryResourceCost.missing.length);
  
  const adjustedTechCost = Math.floor(techCost * researchPenalty);
  const adjustedInfraCost = Math.floor(infraCost * infraPenalty);
  const adjustedMilitaryCost = Math.floor(militaryCost * militaryPenalty);

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-white hover:text-white/80 transition-colors w-full"
      >
        <span>{isExpanded ? "▼" : "▶"}</span>
        <span>Actions</span>
      </button>
      
      {isExpanded && (
        <>
          {/* Message Display */}
          {message && (
            <div className={`mb-3 rounded border px-3 py-2 text-xs ${
              message.type === 'success' 
                ? 'border-green-500/50 bg-green-900/20 text-green-400' 
                : 'border-red-500/50 bg-red-900/20 text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          <div className="space-y-2">
            {/* Research Technology */}
            <Tooltip content={`🔬 RESEARCH TECHNOLOGY\n\nBoost your resource production and military power!\n\n📈 CURRENT → NEXT LEVEL:\nLevel ${techLevel} → ${techLevel + 1}\n\n✨ BENEFITS GAINED:\n• Resource Production: ${techLevel === 0 ? '1.25x' : techLevel === 1 ? '1.6x' : techLevel === 2 ? '2.0x' : techLevel === 3 ? '2.5x' : '3.0x'} multiplier (was ${techLevel === 0 ? '1.0x' : techLevel === 1 ? '1.25x' : techLevel === 2 ? '1.6x' : techLevel === 3 ? '2.0x' : '2.5x'})\n• Military Effectiveness: +20% combat power per level\n• Military Recruitment: -5% cost per level (max -25%)\n• Future Research: -3% cost per level (max -15%)\n${techLevel >= 5 ? '\n\n⚠️ MAX LEVEL REACHED!' : ''}\n\n💰 UPGRADE COST:\nBase Cost: $${(ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER, techLevel)).toFixed(0)}${techReduction > 0 ? `\nResearch Discount: -${techReduction.toFixed(1)}% (from current tech level)` : ''}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Tech Innovator' ? '-25% ✓' : stats.resourceProfile.name === 'Agricultural Hub' || stats.resourceProfile.name === 'Mining Empire' ? '+15% ⚠' : stats.resourceProfile.name === 'Trade Hub' ? '+20% ⚠' : 'Standard'}` : ''}\n${researchResourceCost.missing.length > 0 ? `\n⚠️ RESOURCE SHORTAGE PENALTY: +${((researchPenalty - 1) * 100).toFixed(0)}% (${researchResourceCost.missing.length} missing resource${researchResourceCost.missing.length > 1 ? 's' : ''})` : ''}\n\nTotal Cost: $${adjustedTechCost.toLocaleString()}\n\n📦 RESOURCE REQUIREMENTS:\n${researchResourceCost.formatted}\n${researchResourceCost.missing.length > 0 ? '\n⚠️ Missing resources increase budget cost by +40% each (max 2.5x total)!' : '\n✓ All resources available!'}\n\n💡 Technology affects: Production (1.25x-3.0x), Military (+20%/level), Research speed`}>
              <button
                type="button"
                disabled={loading !== null || currentBudget < adjustedTechCost}
                onClick={() => handleAction("research")}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${
                  currentBudget < adjustedTechCost
                    ? "cursor-not-allowed bg-slate-700/50 opacity-50"
                    : loading === "research"
                    ? "bg-purple-600/50"
                    : "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 hover:shadow-xl active:scale-95"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>🔬 Research Technology</span>
                  <span className={`text-xs opacity-90 ${researchResourceCost.missing.length > 0 ? 'text-orange-300' : ''}`}>
                    ${adjustedTechCost.toLocaleString()}
                    {researchResourceCost.missing.length > 0 && ' ⚠️'}
                  </span>
                </div>
                <div className="mt-1 text-xs opacity-75">
                  Level {techLevel} → {techLevel + 1}
                </div>
              </button>
            </Tooltip>

            {/* Build Infrastructure */}
            <Tooltip content={`🏗️ BUILD INFRASTRUCTURE\n\nExpand your capacity and administrative efficiency!\n\n📈 CURRENT → NEXT LEVEL:\nLevel ${infraLevel} → ${infraLevel + 1}\n\n✨ BENEFITS GAINED:\n• Tax Collection: +15% efficiency per level\n• Population Capacity: +50,000 citizens (Base: 200k)\n• Trade Capacity: +1 deal per turn\n• Trade Efficiency: +10% trade value per level\n\n⚠️ IMPORTANT: Infrastructure does NOT affect resource production!\n\n💰 UPGRADE COST:\nBase Cost: $${(ECONOMIC_BALANCE.UPGRADES.INFRA_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.INFRA_COST_MULTIPLIER, infraLevel)).toFixed(0)}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Industrial Powerhouse' ? '-20% ✓' : stats.resourceProfile.name === 'Trade Hub' ? '-15% ✓' : stats.resourceProfile.name === 'Mining Empire' ? '+10% ⚠' : stats.resourceProfile.name === 'Oil Kingdom' ? '+20% ⚠' : 'Standard'}` : ''}${infraResourceCost.missing.length > 0 ? `\n⚠️ RESOURCE SHORTAGE PENALTY: +${((infraPenalty - 1) * 100).toFixed(0)}% (${infraResourceCost.missing.length} missing resource${infraResourceCost.missing.length > 1 ? 's' : ''})` : ''}\n\nTotal Cost: $${adjustedInfraCost.toLocaleString()}\n\n📦 RESOURCE REQUIREMENTS:\n${infraResourceCost.formatted}\n${infraResourceCost.missing.length > 0 ? '\n⚠️ Missing resources increase budget cost by +40% each (max 2.5x total)!' : '\n✓ All resources available!'}\n\n📉 MAINTENANCE ADDED:\n+$${ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL} per level/turn (ongoing cost)\n\n💡 Infrastructure affects: Tax (+15%/level), Capacity (+50k/level), Trade (+1 deal, +10% value/level)\n${stats.population > (200000 + infraLevel * 50000) ? '\n⚠️ YOU ARE OVERCROWDED! Build ASAP to avoid penalties!' : ''}`}>
              <button
                type="button"
                disabled={loading !== null || currentBudget < adjustedInfraCost}
                onClick={() => handleAction("infrastructure")}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${
                  currentBudget < adjustedInfraCost
                    ? "cursor-not-allowed bg-slate-700/50 opacity-50"
                    : loading === "infrastructure"
                    ? "bg-green-600/50"
                    : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 hover:shadow-xl active:scale-95"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>🏗️ Build Infrastructure</span>
                  <span className={`text-xs opacity-90 ${infraResourceCost.missing.length > 0 ? 'text-orange-300' : ''}`}>
                    ${adjustedInfraCost.toLocaleString()}
                    {infraResourceCost.missing.length > 0 && ' ⚠️'}
                  </span>
                </div>
                <div className="mt-1 text-xs opacity-75">
                  Level {infraLevel} → {infraLevel + 1}
                </div>
              </button>
            </Tooltip>

            {/* Recruit Military */}
            <Tooltip content={`⚔️ RECRUIT MILITARY\n\nBuild your military strength for defense and conquest!\n\n💪 RECRUITMENT:\nCurrent Strength: ${stats.militaryStrength}\nRecruiting: +${militaryAmount} strength\nNew Total: ${stats.militaryStrength + militaryAmount}\n\n💰 COST BREAKDOWN:\nBase: $${militaryAmount} × $${ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT} = $${militaryAmount * ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT}${militaryReduction > 0 ? `\nTech Discount: -${militaryReduction.toFixed(1)}% (Level ${stats.technologyLevel.toFixed(1)})` : ''}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Military State' ? '-10% ✓' : stats.resourceProfile.name === 'Oil Kingdom' ? '+5% ⚠' : stats.resourceProfile.name === 'Trade Hub' ? '+20% ⚠' : 'Standard'}` : ''}${militaryResourceCost.missing.length > 0 ? `\n⚠️ RESOURCE SHORTAGE PENALTY: +${((militaryPenalty - 1) * 100).toFixed(0)}% (${militaryResourceCost.missing.length} missing resource${militaryResourceCost.missing.length > 1 ? 's' : ''})` : ''}\n\nTotal Cost: $${adjustedMilitaryCost.toLocaleString()}\n\n📦 RESOURCE REQUIREMENTS:\n${militaryResourceCost.formatted}\n${militaryResourceCost.missing.length > 0 ? '\n⚠️ Missing resources increase budget cost by +40% each (max 2.5x total)!' : '\n✓ All resources available!'}\n\n📉 ONGOING UPKEEP:\n+$${(militaryAmount * ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH).toFixed(1)} per turn ($${ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH} per strength)\n\n⚡ TECH BONUS:\nYour military fights at ${(100 + stats.technologyLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_EFFECTIVENESS_PER_LEVEL * 100).toFixed(0)}% effectiveness!\nEffective Power: ${Math.floor((stats.militaryStrength + militaryAmount) * (1 + stats.technologyLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_EFFECTIVENESS_PER_LEVEL))}\n\n💡 Higher tech = Cheaper recruitment + Stronger army!`}>
              <div className={`w-full rounded-lg px-4 py-3 shadow-lg ${
                currentBudget < adjustedMilitaryCost
                  ? "bg-slate-700/50 opacity-50"
                  : "bg-gradient-to-r from-red-600 to-red-700"
              }`}>
                {/* Slider Section */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="military-slider" className="text-sm font-semibold text-white">
                      ⚔️ Recruit Military
                    </label>
                    <span className={`text-xs text-white/90 ${militaryResourceCost.missing.length > 0 ? 'text-orange-300' : ''}`}>
                      ${adjustedMilitaryCost.toLocaleString()}
                      {militaryResourceCost.missing.length > 0 && ' ⚠️'}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      id="military-slider"
                      type="range"
                      min="5"
                      max="50"
                      step="5"
                      value={militaryAmount}
                      onChange={(e) => setMilitaryAmount(Number(e.target.value))}
                      disabled={loading !== null}
                      className="flex-1 h-2 rounded-lg appearance-none cursor-pointer bg-white/20 accent-red-500"
                      style={{
                        background: `linear-gradient(to right, rgb(239 68 68) 0%, rgb(239 68 68) ${((militaryAmount - 5) / 45) * 100}%, rgba(255,255,255,0.2) ${((militaryAmount - 5) / 45) * 100}%, rgba(255,255,255,0.2) 100%)`
                      }}
                    />
                    <span className="text-sm font-bold text-white min-w-[3ch] text-right">
                      {militaryAmount}
                    </span>
                  </div>
                  
                  <div className="mt-1.5 text-xs text-white/75">
                    Strength {stats.militaryStrength} → {stats.militaryStrength + militaryAmount} (+{militaryAmount})
                  </div>
                </div>

                {/* Action Button */}
                <button
                  type="button"
                  disabled={loading !== null || currentBudget < adjustedMilitaryCost}
                  onClick={() => handleAction("military")}
                  className={`w-full rounded px-3 py-2 text-sm font-semibold text-white transition-all ${
                    currentBudget < adjustedMilitaryCost
                      ? "cursor-not-allowed bg-slate-600/50"
                      : loading === "military"
                      ? "bg-red-800/50"
                      : "bg-red-800/80 hover:bg-red-700/80 active:scale-95"
                  }`}
                >
                  {loading === "military" ? "Recruiting..." : `Recruit ${militaryAmount} Units`}
                </button>
              </div>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}
