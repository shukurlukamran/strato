"use client";

import { useState, useEffect } from "react";
import type { Country, CountryStats } from "@/types/country";
import { Tooltip } from "./Tooltip";
import { 
  calculateResearchCostForDisplay, 
  calculateInfrastructureCostForDisplay,
  calculateMilitaryRecruitmentCostForDisplay 
} from "@/lib/game-engine/EconomicClientUtils";
import { ResourceCostClient } from "@/lib/game-engine/ResourceCostClient";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";
import { ResourceProduction } from "@/lib/game-engine/ResourceProduction";
import { ResourceRegistry } from "@/lib/game-engine/ResourceTypes";

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

  // Black market state
  const [blackMarketSide, setBlackMarketSide] = useState<'buy' | 'sell'>('buy');
  const [blackMarketResource, setBlackMarketResource] = useState<string>('food');
  const [blackMarketAmount, setBlackMarketAmount] = useState<number>(10);
  const [marketPrices, setMarketPrices] = useState<any>(null);

  // Only show actions for player's own country
  const isPlayerCountry = country?.id === playerCountryId;

  // Fetch market prices for black market
  useEffect(() => {
    if (!isPlayerCountry) return;

    const fetchMarketPrices = async () => {
      try {
        const res = await fetch(`/api/market/prices?gameId=${encodeURIComponent(gameId)}`);
        if (res.ok) {
          const data = await res.json();
          setMarketPrices(data);
        }
      } catch (error) {
        console.error('Failed to fetch market prices:', error);
      }
    };

    fetchMarketPrices();
  }, [gameId, isPlayerCountry]);

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
      if (data.resourceCost && data.resourceCost.required.length > 0) {
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

  const handleBlackMarketTransaction = async () => {
    if (!country || !stats) return;

    setLoading('black-market');
    setMessage(null);

    try {
      const res = await fetch('/api/market/black', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameId,
          countryId: country.id,
          side: blackMarketSide,
          resourceId: blackMarketResource,
          amount: blackMarketAmount,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        setMessage({ type: 'error', text: error.error || 'Transaction failed' });
        return;
      }

      const data = await res.json();

      // Update local stats
      onStatsUpdate({
        budget: data.newBudget,
        resources: data.newResources,
      });

      // Refresh market prices after transaction
      const priceRes = await fetch(`/api/market/prices?gameId=${encodeURIComponent(gameId)}`);
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        setMarketPrices(priceData);
      }

      setMessage({
        type: 'success',
        text: `${blackMarketSide === 'buy' ? 'Bought' : 'Sold'} ${blackMarketAmount}x ${blackMarketResource} ${blackMarketSide === 'buy' ? 'from' : 'to'} black market`,
      });

    } catch (error) {
      setMessage({ type: 'error', text: 'Transaction failed' });
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
  
  // No penalty adjustments - resources are strictly required
  const adjustedTechCost = techCost;
  const adjustedInfraCost = infraCost;
  const adjustedMilitaryCost = militaryCost;

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
            <Tooltip content={(() => {
              const currentMult = ResourceProduction.getTechnologyMultiplier(techLevel);
              const nextMult = ResourceProduction.getTechnologyMultiplier(techLevel + 1);
              const currentMultStr = currentMult.toFixed(2) + 'x';
              const nextMultStr = nextMult.toFixed(2) + 'x';
              
              return `🔬 RESEARCH TECHNOLOGY\n\nBoost your resource production and military power!\n\n📈 CURRENT → NEXT LEVEL:\nLevel ${techLevel} → ${techLevel + 1}\n\n✨ BENEFITS GAINED:\n• Resource Production: ${nextMultStr} multiplier (was ${currentMultStr})\n• Military Effectiveness: +20% combat power per level\n• Military Recruitment: -5% cost per level (max -25%)\n• Future Research: -3% cost per level (max -15%)\n\n💰 UPGRADE COST:\nBase Cost: $${(ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER, techLevel)).toFixed(0)}${techReduction > 0 ? `\nResearch Discount: -${techReduction.toFixed(1)}% (from current tech level)` : ''}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Tech Innovator' ? '-25% ✓' : stats.resourceProfile.name === 'Agricultural Hub' || stats.resourceProfile.name === 'Mining Empire' ? '+15% ⚠' : stats.resourceProfile.name === 'Trade Hub' ? '+20% ⚠' : 'Standard'}` : ''}\nTotal Cost: $${adjustedTechCost.toLocaleString()}\n\n📦 RESOURCE REQUIREMENTS:\n${researchResourceCost.formatted}\n${researchResourceCost.missing.length > 0 ? '\n❌ BLOCKED: Missing resources! Acquire via trade or black market first.' : '\n✓ All resources available!'}\n\n💡 Technology affects: Production (${currentMultStr} → ${nextMultStr}), Military (+20%/level), Research speed`;
            })()}>
              <button
                type="button"
                disabled={loading !== null || currentBudget < adjustedTechCost || researchResourceCost.missing.length > 0}
                onClick={() => handleAction("research")}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${
                  (currentBudget < adjustedTechCost || researchResourceCost.missing.length > 0)
                    ? "cursor-not-allowed bg-slate-700/50 opacity-50"
                    : loading === "research"
                    ? "bg-purple-600/50"
                    : "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 hover:shadow-xl active:scale-95"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>🔬 Research Technology</span>
                  <span className={`text-xs opacity-90 ${researchResourceCost.missing.length > 0 ? 'text-red-400' : ''}`}>
                    ${adjustedTechCost.toLocaleString()}
                    {researchResourceCost.missing.length > 0 && ' ❌'}
                  </span>
                </div>
                <div className="mt-1 text-xs opacity-75">
                  Level {techLevel} → {techLevel + 1}
                </div>
              </button>
            </Tooltip>

            {/* Build Infrastructure */}
            <Tooltip content={`🏗️ BUILD INFRASTRUCTURE\n\nExpand your capacity and administrative efficiency!\n\n📈 CURRENT → NEXT LEVEL:\nLevel ${infraLevel} → ${infraLevel + 1}\n\n✨ BENEFITS GAINED:\n• Tax Collection: +15% efficiency per level\n• Population Capacity: +50,000 citizens (Base: 200k)\n• Trade Capacity: +1 deal per turn\n• Trade Efficiency: +10% trade value per level\n\n⚠️ IMPORTANT: Infrastructure does NOT affect resource production!\n\n💰 UPGRADE COST:\nBase Cost: $${(ECONOMIC_BALANCE.UPGRADES.INFRA_BASE_COST * Math.pow(ECONOMIC_BALANCE.UPGRADES.INFRA_COST_MULTIPLIER, infraLevel)).toFixed(0)}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Industrial Powerhouse' ? '-20% ✓' : stats.resourceProfile.name === 'Trade Hub' ? '-15% ✓' : stats.resourceProfile.name === 'Mining Empire' ? '+10% ⚠' : stats.resourceProfile.name === 'Oil Kingdom' ? '+20% ⚠' : 'Standard'}` : ''}Total Cost: $${adjustedInfraCost.toLocaleString()}\n\n📦 RESOURCE REQUIREMENTS:\n${infraResourceCost.formatted}\n${infraResourceCost.missing.length > 0 ? '\n❌ BLOCKED: Missing resources! Acquire via trade or black market first.' : '\n✓ All resources available!'}\n\n📉 MAINTENANCE ADDED:\n+$${ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL} per level/turn (ongoing cost)\n\n💡 Infrastructure affects: Tax (+15%/level), Capacity (+50k/level), Trade (+1 deal, +10% value/level)\n${stats.population > (200000 + infraLevel * 50000) ? '\n⚠️ YOU ARE OVERCROWDED! Build ASAP to avoid penalties!' : ''}`}>
              <button
                type="button"
                disabled={loading !== null || currentBudget < adjustedInfraCost || infraResourceCost.missing.length > 0}
                onClick={() => handleAction("infrastructure")}
                className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${
                  (currentBudget < adjustedInfraCost || infraResourceCost.missing.length > 0)
                    ? "cursor-not-allowed bg-slate-700/50 opacity-50"
                    : loading === "infrastructure"
                    ? "bg-green-600/50"
                    : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 hover:shadow-xl active:scale-95"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span>🏗️ Build Infrastructure</span>
                  <span className={`text-xs opacity-90 ${infraResourceCost.missing.length > 0 ? 'text-red-400' : ''}`}>
                    ${adjustedInfraCost.toLocaleString()}
                    {infraResourceCost.missing.length > 0 && ' ❌'}
                  </span>
                </div>
                <div className="mt-1 text-xs opacity-75">
                  Level {infraLevel} → {infraLevel + 1}
                </div>
              </button>
            </Tooltip>

            {/* Recruit Military */}
            <Tooltip content={`⚔️ RECRUIT MILITARY\n\nBuild your military strength for defense and conquest!\n\n💪 RECRUITMENT:\nCurrent Strength: ${stats.militaryStrength}\nRecruiting: +${militaryAmount} strength\nNew Total: ${stats.militaryStrength + militaryAmount}\n\n💰 COST BREAKDOWN:\nBase: $${militaryAmount} × $${ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT} = $${militaryAmount * ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT}${militaryReduction > 0 ? `\nTech Discount: -${militaryReduction.toFixed(1)}% (Level ${stats.technologyLevel.toFixed(1)})` : ''}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Military State' ? '-10% ✓' : stats.resourceProfile.name === 'Oil Kingdom' ? '+5% ⚠' : stats.resourceProfile.name === 'Trade Hub' ? '+20% ⚠' : 'Standard'}` : ''}Total Cost: $${adjustedMilitaryCost.toLocaleString()}\n\n📦 RESOURCE REQUIREMENTS:\n${militaryResourceCost.formatted}\n${militaryResourceCost.missing.length > 0 ? '\n❌ BLOCKED: Missing resources! Acquire via trade or black market first.' : '\n✓ All resources available!'}\n\n📉 ONGOING UPKEEP:\n+$${(militaryAmount * ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH).toFixed(1)} per turn ($${ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH} per strength)\n\n⚡ TECH BONUS:\nYour military fights at ${((1 + stats.technologyLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_EFFECTIVENESS_PER_LEVEL) * 100).toFixed(0)}% effectiveness!\nEffective Power: ${Math.floor((stats.militaryStrength + militaryAmount) * (1 + stats.technologyLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_EFFECTIVENESS_PER_LEVEL))}\n\n💡 Higher tech = Cheaper recruitment + Stronger army!`}>
                <div className={`w-full rounded-lg px-4 py-3 shadow-lg ${
                (currentBudget < adjustedMilitaryCost || militaryResourceCost.missing.length > 0)
                  ? "bg-slate-700/50 opacity-50"
                  : "bg-gradient-to-r from-red-600 to-red-700"
              }`}>
                {/* Slider Section */}
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="military-slider" className="text-sm font-semibold text-white">
                      ⚔️ Recruit Military
                    </label>
                    <span className={`text-xs text-white/90 ${militaryResourceCost.missing.length > 0 ? 'text-red-400' : ''}`}>
                      ${adjustedMilitaryCost.toLocaleString()}
                      {militaryResourceCost.missing.length > 0 && ' ❌'}
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
                  disabled={loading !== null || currentBudget < adjustedMilitaryCost || militaryResourceCost.missing.length > 0}
                  onClick={() => handleAction("military")}
                  className={`w-full rounded px-3 py-2 text-sm font-semibold text-white transition-all ${
                    (currentBudget < adjustedMilitaryCost || militaryResourceCost.missing.length > 0)
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

            {/* Black Market */}
            <Tooltip content={`🕵️ BLACK MARKET\n\nAccess immediate resources at premium prices!\n\n💰 BUYING:\nPay 80% markup on market price\nGet resources instantly\n\n💸 SELLING:\nReceive 45% of market price\nConvert surplus to budget\n\n⚠️ WARNING:\nBlack market transactions are expensive\nUse when you need resources urgently\n\n📊 Current prices update automatically`}>
              <div className="rounded-lg border border-orange-500/30 bg-gradient-to-br from-orange-900/20 to-red-900/20 p-4 shadow-lg">
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-white">🕵️ Black Market</label>
                  </div>

                  {/* Side Toggle */}
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => setBlackMarketSide('buy')}
                      className={`flex-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
                        blackMarketSide === 'buy'
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-700/50 text-white/60 hover:bg-slate-600/50'
                      }`}
                    >
                      Buy Resources
                    </button>
                    <button
                      type="button"
                      onClick={() => setBlackMarketSide('sell')}
                      className={`flex-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
                        blackMarketSide === 'sell'
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-700/50 text-white/60 hover:bg-slate-600/50'
                      }`}
                    >
                      Sell Resources
                    </button>
                  </div>

                  {/* Resource Selector */}
                  <div className="mb-3">
                    <select
                      value={blackMarketResource}
                      onChange={(e) => setBlackMarketResource(e.target.value)}
                      className="w-full rounded bg-slate-800/50 border border-white/20 px-3 py-2 text-sm text-white"
                      disabled={loading !== null}
                    >
                      {ResourceRegistry.getAllResources()
                        .filter(r => r.tradeable)
                        .map(resource => (
                          <option key={resource.id} value={resource.id}>
                            {resource.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={blackMarketAmount}
                        onChange={(e) => setBlackMarketAmount(Math.max(1, parseInt(e.target.value) || 1))}
                        className="flex-1 rounded bg-slate-800/50 border border-white/20 px-3 py-2 text-sm text-white"
                        disabled={loading !== null}
                      />
                      <span className="text-xs text-white/60">units</span>
                    </div>
                  </div>

                  {/* Price Preview */}
                  {marketPrices && (
                    <div className="mb-3 rounded bg-slate-800/30 p-2 text-xs">
                      <div className="text-white/80">
                        {blackMarketSide === 'buy' ? 'Cost' : 'Revenue'}:
                        <span className={`ml-1 font-mono ${
                          blackMarketSide === 'buy' ? 'text-orange-400' : 'text-green-400'
                        }`}>
                          ${(blackMarketSide === 'buy'
                            ? marketPrices.blackMarketBuyPrices[blackMarketResource]
                            : marketPrices.blackMarketSellPrices[blackMarketResource]
                          ) * blackMarketAmount}
                        </span>
                      </div>
                      <div className="text-white/60">
                        Unit price: ${(blackMarketSide === 'buy'
                          ? marketPrices.blackMarketBuyPrices[blackMarketResource]
                          : marketPrices.blackMarketSellPrices[blackMarketResource]
                        ).toFixed(1)}
                      </div>
                    </div>
                  )}

                  {/* Execute Button */}
                  <button
                    type="button"
                    disabled={loading !== null}
                    onClick={handleBlackMarketTransaction}
                    className={`w-full rounded px-3 py-2 text-sm font-semibold text-white transition-all ${
                      loading === 'black-market'
                        ? 'bg-slate-700/50 cursor-not-allowed'
                        : blackMarketSide === 'buy'
                        ? 'bg-green-600 hover:bg-green-500 active:scale-95'
                        : 'bg-red-600 hover:bg-red-500 active:scale-95'
                    }`}
                  >
                    {loading === 'black-market'
                      ? 'Processing...'
                      : `${blackMarketSide === 'buy' ? 'Buy' : 'Sell'} ${blackMarketAmount}x ${ResourceRegistry.getResource(blackMarketResource)?.name || blackMarketResource}`
                    }
                  </button>
                </div>
              </div>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}
