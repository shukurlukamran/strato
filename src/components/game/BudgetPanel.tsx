"use client";

import { useState } from "react";
import { 
  calculateBudgetForDisplay,
  calculateEffectiveMilitaryStrength,
  calculateMilitaryEffectivenessMultiplier,
  calculatePopulationCapacity,
  calculateTradeCapacity,
} from "@/lib/game-engine/EconomicClientUtils";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";
import type { Country, CountryStats } from "@/types/country";
import { Tooltip } from "./Tooltip";

interface BudgetPanelProps {
  country: Country | null;
  stats: CountryStats | null;
  activeDealsValue?: number;
}

export function BudgetPanel({ country, stats, activeDealsValue = 0 }: BudgetPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isRevenueExpanded, setIsRevenueExpanded] = useState(true);
  const [isExpensesExpanded, setIsExpensesExpanded] = useState(true);

  if (!country || !stats) {
    return (
      <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
        <div className="text-sm text-white/60">Select a country to view budget</div>
      </div>
    );
  }

  const breakdown = calculateBudgetForDisplay(country, stats, activeDealsValue);
  const isSurplus = breakdown.netBudget > 0;
  const isDeficit = breakdown.netBudget < 0;
  
  // NEW: Calculate military effectiveness and population capacity
  const effectiveMilitaryStrength = calculateEffectiveMilitaryStrength(stats);
  const militaryMultiplier = calculateMilitaryEffectivenessMultiplier(stats);
  const popCapacity = calculatePopulationCapacity(stats);
  const tradeCapacity = calculateTradeCapacity(stats);

  // Tooltip content generators
  const getTaxRevenueTooltip = () => {
    const popUnits = stats.population / 10000;
    const baseTax = popUnits * ECONOMIC_BALANCE.BUDGET.BASE_TAX_PER_CITIZEN;
    const infraMult = 1 + ((stats.infrastructureLevel || 0) * ECONOMIC_BALANCE.BUDGET.INFRASTRUCTURE_TAX_EFFICIENCY);
    const capacityPenalty = popCapacity.isOvercrowded ? ECONOMIC_BALANCE.POPULATION.OVERCROWDING_TAX_PENALTY : 1.0;
    return `Tax Revenue Calculation:\n\nBase: ${popUnits.toFixed(1)} pop units × $${ECONOMIC_BALANCE.BUDGET.BASE_TAX_PER_CITIZEN} = $${baseTax.toFixed(0)}\nInfra Efficiency: ×${infraMult.toFixed(2)} (${stats.infrastructureLevel || 0} level)${popCapacity.isOvercrowded ? `\nOvercrowding: ×${capacityPenalty.toFixed(2)} ⚠️` : ''}\n\nTotal: $${breakdown.taxRevenue.toLocaleString()}/turn\n\nNOTE: Technology boosts production, not taxes!`;
  };

  const getTradeRevenueTooltip = () => {
    return `Trade Revenue: ${(activeDealsValue * ECONOMIC_BALANCE.BUDGET.TRADE_INCOME_MULTIPLIER * 100).toFixed(0)}% of active deals value\n\nDeals Value: $${activeDealsValue.toLocaleString()}\nMultiplier: ${(ECONOMIC_BALANCE.BUDGET.TRADE_INCOME_MULTIPLIER * 100).toFixed(0)}%\n\nTotal: $${breakdown.tradeRevenue.toLocaleString()}/turn`;
  };

  const getMaintenanceTooltip = () => {
    return `Maintenance Cost: ${(ECONOMIC_BALANCE.CONSUMPTION.MAINTENANCE_COST_MULTIPLIER * 100).toFixed(0)}% of current treasury\n\nTreasury: $${Number(stats.budget).toLocaleString()}\nRate: ${(ECONOMIC_BALANCE.CONSUMPTION.MAINTENANCE_COST_MULTIPLIER * 100).toFixed(0)}%\n\nTotal: $${breakdown.maintenanceCost.toLocaleString()}/turn`;
  };

  const getMilitaryUpkeepTooltip = () => {
    return `Military Upkeep: $${ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH} per strength point\n\nMilitary Strength: ${stats.militaryStrength}\nCost per Point: $${ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH}\n\nTotal: $${breakdown.militaryUpkeep.toLocaleString()}/turn`;
  };

  const getInfrastructureCostTooltip = () => {
    const infraLevel = stats.infrastructureLevel || 0;
    return `Infrastructure Maintenance: $${ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL} per level\n\nInfrastructure Level: ${infraLevel}\nCost per Level: $${ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL}\n\nTotal: $${breakdown.infrastructureCost.toLocaleString()}/turn\n\nHigher infrastructure needs more maintenance, but provides:\n• Better tax collection\n• More population capacity\n• More trade capacity`;
  };

  const getNetBudgetTooltip = () => {
    return `Net Budget = Total Revenue - Total Expenses\n\nRevenue: $${breakdown.totalRevenue.toLocaleString()}\nExpenses: $${breakdown.totalExpenses.toLocaleString()}\n\nNet: $${breakdown.netBudget > 0 ? '+' : ''}${breakdown.netBudget.toLocaleString()}/turn`;
  };

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      {/* Stats Overview - Always Visible */}
      <div className="mb-4 border-b border-white/10 pb-3">
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {/* Budget */}
          <Tooltip content={`💰 TREASURY\n\nYour available budget for actions and expenses.\n\nCurrent: $${Number(stats.budget).toLocaleString()}\nChange/turn: ${breakdown.netBudget > 0 ? '+' : ''}$${breakdown.netBudget.toLocaleString()}\n\n📊 REVENUE SOURCES:\n• Tax: $${breakdown.taxRevenue.toLocaleString()}/turn\n• Trade: $${breakdown.tradeRevenue.toLocaleString()}/turn\n\n📉 EXPENSES:\n• Maintenance: $${breakdown.maintenanceCost.toLocaleString()}/turn\n• Military: $${breakdown.militaryUpkeep.toLocaleString()}/turn\n• Infrastructure: $${breakdown.infrastructureCost.toLocaleString()}/turn\n\nClick "Budget Breakdown" below for details.`}>
            <div className="rounded border border-white/10 bg-slate-800/50 px-4 py-2 cursor-help">
              <div className="text-xs text-white/60 mb-1">💰 Budget</div>
              <div className="text-lg font-bold text-white">
                ${Number(stats.budget).toLocaleString()}
              </div>
            </div>
          </Tooltip>

          {/* Population */}
          <Tooltip content={`👥 POPULATION\n\nYour citizens generate tax revenue and produce resources.\n\nCurrent: ${stats.population.toLocaleString()} / ${popCapacity.capacity.toLocaleString()}\nCapacity Usage: ${popCapacity.percentUsed.toFixed(1)}%\n\n📈 GROWTH MECHANICS:\n• Base Growth: +2% per turn\n• Food Surplus: +1% per 100 surplus food\n• Food Shortage: -3% if below 80% needs\n• Capacity: Grows to ${popCapacity.capacity.toLocaleString()}\n\n${popCapacity.isOvercrowded ? '⚠️ OVERCROWDED PENALTIES:\n• Growth Rate: -50% (half speed!)\n• Tax Revenue: -20%\n• Food Consumption: +10%\n\n→ BUILD INFRASTRUCTURE to increase capacity!' : '✓ Room to grow! No capacity penalties.'}\n\n💡 TIP: Each infrastructure level adds +50k capacity.`}>
            <div className={`rounded border ${popCapacity.isOvercrowded ? 'border-yellow-500/50' : 'border-white/10'} bg-slate-800/50 px-4 py-2 cursor-help`}>
              <div className="text-xs text-white/60 mb-1">
                👥 Population {popCapacity.isOvercrowded && <span className="text-yellow-500">⚠️</span>}
              </div>
              <div className="text-lg font-bold text-white">
                {stats.population.toLocaleString()}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">
                {popCapacity.percentUsed.toFixed(0)}% capacity
              </div>
            </div>
          </Tooltip>

          {/* Military */}
          <Tooltip content={`⚔️ MILITARY STRENGTH\n\nYour nation's combat power for defense and conquest.\n\n💪 CURRENT POWER:\nBase Strength: ${stats.militaryStrength}\nTech Bonus: +${((militaryMultiplier - 1) * 100).toFixed(0)}% (Tech Level ${stats.technologyLevel.toFixed(1)})\n${stats.resourceProfile ? `Profile Bonus: ${stats.resourceProfile.name === 'Mining Empire' ? '+5%' : '0%'}` : ''}\n\nEffective Strength: ${effectiveMilitaryStrength} ${effectiveMilitaryStrength > stats.militaryStrength ? '⚡ BOOSTED!' : ''}\n\n💰 RECRUITMENT:\nCost per point: $${ECONOMIC_BALANCE.MILITARY.COST_PER_STRENGTH_POINT}${stats.technologyLevel > 0 ? `\nTech Discount: -${(stats.technologyLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_COST_REDUCTION_PER_LEVEL * 100).toFixed(0)}%` : ''}${stats.resourceProfile ? `\nProfile Modifier: ${stats.resourceProfile.name === 'Technological Hub' ? '-10%' : stats.resourceProfile.name === 'Mining Empire' ? '-10%' : '0%'}` : ''}\n\n📉 UPKEEP:\n$${ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH} per strength/turn\nTotal: $${(stats.militaryStrength * ECONOMIC_BALANCE.CONSUMPTION.MILITARY_UPKEEP_PER_STRENGTH).toFixed(0)}/turn\n\n💡 TIP: Technology makes your army more effective AND cheaper!`}>
            <div className="rounded border border-white/10 bg-slate-800/50 px-4 py-2 cursor-help">
              <div className="text-xs text-white/60 mb-1">⚔️ Military</div>
              <div className="text-lg font-bold text-red-400">
                {stats.militaryStrength}
                {effectiveMilitaryStrength > stats.militaryStrength && (
                  <span className="text-yellow-400 text-sm ml-1">⚡{effectiveMilitaryStrength}</span>
                )}
              </div>
              {militaryMultiplier > 1 && (
                <div className="text-[10px] text-yellow-400 mt-0.5">
                  +{((militaryMultiplier - 1) * 100).toFixed(0)}% from tech
                </div>
              )}
            </div>
          </Tooltip>

          {/* Technology */}
          <Tooltip content={`🔬 TECHNOLOGY LEVEL\n\nYour nation's scientific and industrial advancement.\n\nCurrent: Level ${stats.technologyLevel.toFixed(1)} / 5\n\n🎯 WHAT TECHNOLOGY AFFECTS:\n✓ Resource Production (MAJOR)\n✓ Military Effectiveness\n✓ Military Recruitment Cost\n✓ Research Speed (next upgrade cheaper)\n✗ Does NOT affect tax revenue\n\n📊 CURRENT BENEFITS:\n• Production: ${((ECONOMIC_BALANCE.TECHNOLOGY[`LEVEL_${Math.min(Math.floor(stats.technologyLevel), 5)}_MULTIPLIER` as keyof typeof ECONOMIC_BALANCE.TECHNOLOGY] - 1) * 100).toFixed(0)}% boost (${ECONOMIC_BALANCE.TECHNOLOGY[`LEVEL_${Math.min(Math.floor(stats.technologyLevel), 5)}_MULTIPLIER` as keyof typeof ECONOMIC_BALANCE.TECHNOLOGY]}x multiplier)\n• Military Power: +${((militaryMultiplier - 1) * 100).toFixed(0)}% stronger\n• Military Cost: -${(Math.min(stats.technologyLevel * ECONOMIC_BALANCE.TECHNOLOGY.MILITARY_COST_REDUCTION_PER_LEVEL, ECONOMIC_BALANCE.TECHNOLOGY.MAX_MILITARY_COST_REDUCTION) * 100).toFixed(0)}% cheaper\n• Research Cost: -${(Math.min(stats.technologyLevel * ECONOMIC_BALANCE.TECHNOLOGY.RESEARCH_SPEED_BONUS_PER_LEVEL, ECONOMIC_BALANCE.TECHNOLOGY.MAX_RESEARCH_SPEED_BONUS) * 100).toFixed(0)}% reduction\n\n💡 MULTIPLIER SCALE:\nL0: 1.0x | L1: 1.25x | L2: 1.6x | L3: 2.0x\nL4: 2.5x | L5: 3.0x (max)\n\n${stats.resourceProfile ? `\n🏛️ PROFILE EFFECT (${stats.resourceProfile.name}):\n${stats.resourceProfile.name === 'Technological Hub' ? '✓ -25% research cost (cheapest!)' : stats.resourceProfile.name === 'Agriculture' || stats.resourceProfile.name === 'Mining Empire' ? '⚠ +15% research cost (expensive)' : stats.resourceProfile.name === 'Precious Metals Trader' ? '⚠ +20% research cost (very expensive!)' : '→ Standard research cost'}` : ''}`}>
            <div className="rounded border border-white/10 bg-slate-800/50 px-4 py-2 cursor-help">
              <div className="text-xs text-white/60 mb-1">🔬 Technology</div>
              <div className="text-lg font-bold text-purple-400">
                Level {stats.technologyLevel.toFixed(1)}
              </div>
              <div className="text-[10px] text-purple-300 mt-0.5">
                Production & Military
              </div>
            </div>
          </Tooltip>

          {/* Infrastructure */}
          <Tooltip content={`🏗️ INFRASTRUCTURE LEVEL\n\nYour nation's capacity, organization, and administrative systems.\n\nCurrent: Level ${stats.infrastructureLevel || 0}\n\n🎯 WHAT INFRASTRUCTURE AFFECTS:\n✓ Tax Collection Efficiency (MAJOR)\n✓ Population Capacity\n✓ Trade Capacity (deals per turn)\n✓ Trade Efficiency (deal value)\n✗ Does NOT affect resource production\n\n📊 CURRENT BENEFITS:\n• Tax: +${((stats.infrastructureLevel || 0) * ECONOMIC_BALANCE.BUDGET.INFRASTRUCTURE_TAX_EFFICIENCY * 100).toFixed(0)}% collection efficiency\n• Pop. Capacity: ${popCapacity.capacity.toLocaleString()} (Base: 200k + ${(stats.infrastructureLevel || 0) * 50}k)\n• Trade Deals: ${tradeCapacity.maxDeals} active deals/turn\n• Trade Value: +${((stats.infrastructureLevel || 0) * ECONOMIC_BALANCE.INFRASTRUCTURE.TRADE_EFFICIENCY_PER_LEVEL * 100).toFixed(0)}% efficiency\n\n📉 MAINTENANCE COST:\n$${ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL} per level/turn\nTotal: $${(stats.infrastructureLevel || 0) * ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL}/turn\n\n💡 WHY BUILD INFRASTRUCTURE:\n→ Better tax collection from your population\n→ Avoid overcrowding penalties\n→ Make more trade deals\n→ Get more value from each trade\n\n${stats.resourceProfile ? `\n🏛️ PROFILE EFFECT (${stats.resourceProfile.name}):\n${stats.resourceProfile.name === 'Industrial Complex' ? '✓ -20% build cost (cheapest!)' : stats.resourceProfile.name === 'Coastal Trading Hub' ? '✓ -15% build cost + 25% trade bonus!' : stats.resourceProfile.name === 'Mining Empire' ? '⚠ +10% build cost' : stats.resourceProfile.name === 'Precious Metals Trader' ? '⚠ +20% build cost (expensive!)' : '→ Standard build cost'}` : ''}`}>
            <div className="rounded border border-white/10 bg-slate-800/50 px-4 py-2 cursor-help col-span-2">
              <div className="text-xs text-white/60 mb-1">🏗️ Infrastructure</div>
              <div className="text-lg font-bold text-green-400">
                Level {stats.infrastructureLevel || 0}
              </div>
              <div className="text-[10px] text-green-300 mt-0.5">
                Capacity: {popCapacity.capacity.toLocaleString()} pop • {tradeCapacity.maxDeals} deals/turn
              </div>
            </div>
          </Tooltip>
        </div>
      </div>

      {/* Budget Breakdown - Collapsible */}
      <div className="mb-4 border-b border-white/10 pb-3">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-sm font-semibold text-white hover:text-white/80 transition-colors mb-2"
        >
          <span>{isExpanded ? "▼" : "▶"}</span>
          <span>Budget Breakdown</span>
        </button>
        <Tooltip content={getNetBudgetTooltip()}>
          <div className="mt-2 flex items-baseline gap-2 cursor-help">
            <span className="text-xs text-white/60">Net Budget:</span>
            <span
              className={`text-2xl font-bold ${
                isSurplus ? "text-green-400" : isDeficit ? "text-red-400" : "text-white"
              }`}
            >
              {isSurplus ? "+" : ""}
              {breakdown.netBudget.toLocaleString()}
            </span>
            <span className="text-xs text-white/40">/turn</span>
          </div>
        </Tooltip>
      </div>

      {isExpanded && (
        <div className="space-y-4">
        {/* Revenue Section */}
        <div>
          <Tooltip content="Revenue: Income sources that add to your treasury each turn. Includes taxes from population, trade deals, and resource sales.">
            <button
              onClick={() => setIsRevenueExpanded(!isRevenueExpanded)}
              className="mb-2 flex items-center gap-2 text-xs font-semibold text-green-400 cursor-help hover:opacity-80 transition-opacity"
            >
              <span>{isRevenueExpanded ? "▼" : "▶"}</span>
              <span>Revenue</span>
              <span className="text-white/60">${breakdown.totalRevenue.toLocaleString()}</span>
            </button>
          </Tooltip>
          {isRevenueExpanded && (
            <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
              <Tooltip content={getTaxRevenueTooltip()}>
                <div className="flex items-center gap-2 cursor-help">
                  <span className="text-sm">💰</span>
                  <span className="text-sm text-white/90">Tax Revenue</span>
                </div>
              </Tooltip>
              <Tooltip content={getTaxRevenueTooltip()}>
                <span className="font-semibold text-green-400 cursor-help">
                  +{breakdown.taxRevenue.toLocaleString()}
                </span>
              </Tooltip>
            </div>
            {breakdown.tradeRevenue > 0 && (
              <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
                <Tooltip content={getTradeRevenueTooltip()}>
                  <div className="flex items-center gap-2 cursor-help">
                    <span className="text-sm">🤝</span>
                    <span className="text-sm text-white/90">Trade Revenue</span>
                  </div>
                </Tooltip>
                <Tooltip content={getTradeRevenueTooltip()}>
                  <span className="font-semibold text-green-400 cursor-help">
                    +{breakdown.tradeRevenue.toLocaleString()}
                  </span>
                </Tooltip>
              </div>
            )}
            {breakdown.resourceRevenue > 0 && (
              <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">📦</span>
                  <span className="text-sm text-white/90">Resource Sales</span>
                </div>
                <span className="font-semibold text-green-400">
                  +{breakdown.resourceRevenue.toLocaleString()}
                </span>
              </div>
            )}
            </div>
          )}
        </div>

        {/* Expenses Section */}
        <div>
          <Tooltip content="Expenses: Costs that reduce your treasury each turn. Includes maintenance, military upkeep, and infrastructure costs.">
            <button
              onClick={() => setIsExpensesExpanded(!isExpensesExpanded)}
              className="mb-2 flex items-center gap-2 text-xs font-semibold text-red-400 cursor-help hover:opacity-80 transition-opacity"
            >
              <span>{isExpensesExpanded ? "▼" : "▶"}</span>
              <span>Expenses</span>
              <span className="text-white/60">${breakdown.totalExpenses.toLocaleString()}</span>
            </button>
          </Tooltip>
          {isExpensesExpanded && (
            <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
              <Tooltip content={getMaintenanceTooltip()}>
                <div className="flex items-center gap-2 cursor-help">
                  <span className="text-sm">🔧</span>
                  <span className="text-sm text-white/90">Maintenance</span>
                </div>
              </Tooltip>
              <Tooltip content={getMaintenanceTooltip()}>
                <span className="font-semibold text-red-400 cursor-help">
                  -{breakdown.maintenanceCost.toLocaleString()}
                </span>
              </Tooltip>
            </div>
            <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
              <Tooltip content={getMilitaryUpkeepTooltip()}>
                <div className="flex items-center gap-2 cursor-help">
                  <span className="text-sm">⚔️</span>
                  <span className="text-sm text-white/90">Military Upkeep</span>
                </div>
              </Tooltip>
              <Tooltip content={getMilitaryUpkeepTooltip()}>
                <span className="font-semibold text-red-400 cursor-help">
                  -{breakdown.militaryUpkeep.toLocaleString()}
                </span>
              </Tooltip>
            </div>
            {breakdown.infrastructureCost > 0 && (
              <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
                <Tooltip content={getInfrastructureCostTooltip()}>
                  <div className="flex items-center gap-2 cursor-help">
                    <span className="text-sm">🏗️</span>
                    <span className="text-sm text-white/90">Infrastructure</span>
                  </div>
                </Tooltip>
                <Tooltip content={getInfrastructureCostTooltip()}>
                  <span className="font-semibold text-red-400 cursor-help">
                    -{breakdown.infrastructureCost.toLocaleString()}
                  </span>
                </Tooltip>
              </div>
            )}
            </div>
          )}
        </div>

        {/* Visual Indicator */}
        <Tooltip content={`Current Treasury: Your available budget. Changes by ${breakdown.netBudget > 0 ? '+' : ''}${breakdown.netBudget.toLocaleString()} each turn based on revenue and expenses.`}>
          <div className="mt-4 rounded border border-white/10 bg-slate-800/30 p-3 cursor-help">
            <div className="flex items-center justify-between">
              <span className="text-xs text-white/60">Current Treasury</span>
              <span className="text-lg font-bold text-white">
                {Number(stats.budget).toLocaleString()}
              </span>
            </div>
            {isDeficit && (
              <div className="mt-2 text-xs text-red-400">
                ⚠️ Running a deficit - treasury decreasing
              </div>
            )}
            {isSurplus && (
              <div className="mt-2 text-xs text-green-400">
                ✓ Budget surplus - treasury growing
              </div>
            )}
            {!isSurplus && !isDeficit && (
              <div className="mt-2 text-xs text-white/60">
                Budget balanced
              </div>
            )}
          </div>
        </Tooltip>
        </div>
      )}
    </div>
  );
}
