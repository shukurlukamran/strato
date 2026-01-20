"use client";

import { useState } from "react";
import type { Country, CountryStats } from "@/types/country";
import { Tooltip } from "./Tooltip";
import { 
  calculateResearchCostForDisplay, 
  calculateInfrastructureCostForDisplay,
  calculateMilitaryRecruitmentCostForDisplay 
} from "@/lib/game-engine/EconomicClientUtils";

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
      
      setMessage({ 
        type: 'success', 
        text: `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} successful! Cost: $${data.cost.toLocaleString()}` 
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
            <Tooltip content={`🔬 RESEARCH TECHNOLOGY\n\nBoost your resource production and military power!\n\n📈 CURRENT → NEXT LEVEL:\nLevel ${techLevel} → ${techLevel + 1}\n\n✨ BENEFITS GAINED:\n• Resource Production: Better multiplier\n• Military Effectiveness: +20% combat power\n• Military Recruitment: -5% cost\n• Future Research: -3% cost${techLevel >= 5 ? '\n\n⚠️ MAX LEVEL REACHED!' : ''}\n\n💰 UPGRADE COST:\nBase Cost: $${(800 * Math.pow(1.35, techLevel)).toFixed(0)}${techReduction > 0 ? `\nResearch Discount: -${techReduction.toFixed(1)}% (from tech)` : ''}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Technological Hub' ? '-25% ✓' : stats.resourceProfile.name === 'Agriculture' || stats.resourceProfile.name === 'Mining Empire' ? '+15% ⚠' : stats.resourceProfile.name === 'Precious Metals Trader' ? '+20% ⚠' : 'Standard'}` : ''}\n\nTotal Cost: $${techCost.toLocaleString()}\n\n💡 Technology affects: Production, Military, Research speed`}>
              <button
                type="button"
                disabled={loading !== null || currentBudget < techCost}
                onClick={() => handleAction("research")}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${
                  currentBudget < techCost
                    ? "cursor-not-allowed bg-slate-700/50 opacity-50"
                    : loading === "research"
                    ? "bg-purple-600/50"
                    : "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 hover:shadow-xl active:scale-95"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>🔬 Research Technology</span>
                  <span className="text-xs opacity-90">${techCost.toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs opacity-75">
                  Level {techLevel} → {techLevel + 1}
                </div>
              </button>
            </Tooltip>

            {/* Build Infrastructure */}
            <Tooltip content={`🏗️ BUILD INFRASTRUCTURE\n\nExpand your capacity and administrative efficiency!\n\n📈 CURRENT → NEXT LEVEL:\nLevel ${infraLevel} → ${infraLevel + 1}\n\n✨ BENEFITS GAINED:\n• Tax Collection: +12% efficiency\n• Population Capacity: +50,000 citizens\n• Trade Capacity: +1 deal per turn\n• Trade Efficiency: +10% trade value\n\n💰 UPGRADE COST:\nBase Cost: $${(700 * Math.pow(1.30, infraLevel)).toFixed(0)}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Industrial Complex' ? '-20% ✓' : stats.resourceProfile.name === 'Coastal Trading Hub' ? '-15% ✓' : stats.resourceProfile.name === 'Mining Empire' ? '+10% ⚠' : stats.resourceProfile.name === 'Precious Metals Trader' ? '+20% ⚠' : 'Standard'}` : ''}\n\nTotal Cost: $${infraCost.toLocaleString()}\n\n📉 MAINTENANCE ADDED:\n+$35 per turn (ongoing cost)\n\n💡 Infrastructure affects: Tax, Capacity, Trade\n${stats.population > (200000 + infraLevel * 50000) ? '\n⚠️ YOU ARE OVERCROWDED! Build ASAP!' : ''}`}>
              <button
                type="button"
                disabled={loading !== null || currentBudget < infraCost}
                onClick={() => handleAction("infrastructure")}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${
                  currentBudget < infraCost
                    ? "cursor-not-allowed bg-slate-700/50 opacity-50"
                    : loading === "infrastructure"
                    ? "bg-green-600/50"
                    : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 hover:shadow-xl active:scale-95"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>🏗️ Build Infrastructure</span>
                  <span className="text-xs opacity-90">${infraCost.toLocaleString()}</span>
                </div>
                <div className="mt-1 text-xs opacity-75">
                  Level {infraLevel} → {infraLevel + 1}
                </div>
              </button>
            </Tooltip>

            {/* Recruit Military */}
            <Tooltip content={`⚔️ RECRUIT MILITARY\n\nBuild your military strength for defense and conquest!\n\n💪 RECRUITMENT:\nCurrent Strength: ${stats.militaryStrength}\nRecruiting: +${militaryAmount} strength\nNew Total: ${stats.militaryStrength + militaryAmount}\n\n💰 COST BREAKDOWN:\nBase: $${militaryAmount} × $50 = $${militaryAmount * 50}${militaryReduction > 0 ? `\nTech Discount: -${militaryReduction.toFixed(1)}% (Level ${stats.technologyLevel.toFixed(1)})` : ''}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Technological Hub' ? '-10% ✓' : stats.resourceProfile.name === 'Oil Kingdom' ? '+5% ⚠' : stats.resourceProfile.name === 'Precious Metals Trader' ? '+20% ⚠' : 'Standard'}` : ''}\n\nTotal Cost: $${militaryCost.toLocaleString()}\n\n📉 ONGOING UPKEEP:\n+$${(militaryAmount * 0.8).toFixed(1)} per turn ($0.80 per strength)\n\n⚡ TECH BONUS:\nYour military fights at ${(100 + stats.technologyLevel * 20).toFixed(0)}% effectiveness!\nEffective Power: ${Math.floor((stats.militaryStrength + militaryAmount) * (1 + stats.technologyLevel * 0.20))}\n\n💡 Higher tech = Cheaper recruitment + Stronger army!`}>
              <div className={`w-full rounded-lg px-4 py-3 shadow-lg ${
                currentBudget < militaryCost
                  ? "bg-slate-700/50 opacity-50"
                  : "bg-gradient-to-r from-red-600 to-red-700"
              }`}>
                {/* Slider Section */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="military-slider" className="text-sm font-semibold text-white">
                      ⚔️ Recruit Military
                    </label>
                    <span className="text-xs text-white/90">${militaryCost.toLocaleString()}</span>
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
                  disabled={loading !== null || currentBudget < militaryCost}
                  onClick={() => handleAction("military")}
                  className={`w-full rounded px-3 py-2 text-sm font-semibold text-white transition-all ${
                    currentBudget < militaryCost
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
