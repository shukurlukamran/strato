"use client";

import { useState } from "react";
import { calculateBudgetForDisplay } from "@/lib/game-engine/EconomicClientUtils";
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

  // Tooltip content generators
  const getTaxRevenueTooltip = () => {
    const popUnits = stats.population / 10000;
    const baseTax = popUnits * ECONOMIC_BALANCE.BUDGET.BASE_TAX_PER_CITIZEN;
    const techMult = Math.min(1 + (stats.technologyLevel * ECONOMIC_BALANCE.BUDGET.TECHNOLOGY_TAX_MULTIPLIER), ECONOMIC_BALANCE.BUDGET.MAX_TAX_MULTIPLIER);
    const infraMult = 1 + ((stats.infrastructureLevel || 0) * ECONOMIC_BALANCE.BUDGET.INFRASTRUCTURE_BONUS);
    return `Tax Revenue Calculation:\n\nBase: ${popUnits.toFixed(1)} pop units × $${ECONOMIC_BALANCE.BUDGET.BASE_TAX_PER_CITIZEN} = $${baseTax.toFixed(0)}\nTech Bonus: ×${techMult.toFixed(2)} (${stats.technologyLevel.toFixed(1)} level)\nInfra Bonus: ×${infraMult.toFixed(2)} (${stats.infrastructureLevel || 0} level)\n\nTotal: $${breakdown.taxRevenue.toLocaleString()}/turn`;
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
    return `Infrastructure Maintenance: $${ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL} per level\n\nInfrastructure Level: ${infraLevel}\nCost per Level: $${ECONOMIC_BALANCE.INFRASTRUCTURE.MAINTENANCE_COST_PER_LEVEL}\n\nTotal: $${breakdown.infrastructureCost.toLocaleString()}/turn`;
  };

  const getNetBudgetTooltip = () => {
    return `Net Budget = Total Revenue - Total Expenses\n\nRevenue: $${breakdown.totalRevenue.toLocaleString()}\nExpenses: $${breakdown.totalExpenses.toLocaleString()}\n\nNet: $${breakdown.netBudget > 0 ? '+' : ''}${breakdown.netBudget.toLocaleString()}/turn`;
  };

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      {/* Stats Overview - Always Visible */}
      <div className="mb-4 border-b border-white/10 pb-3">
        <div className="grid grid-cols-2 gap-2 mb-3">
          {/* Budget */}
          <Tooltip content={`Current Treasury: Your available budget. Changes by ${breakdown.netBudget > 0 ? '+' : ''}${breakdown.netBudget.toLocaleString()} each turn based on revenue and expenses.`}>
            <div className="rounded border border-white/10 bg-slate-800/50 px-3 py-2 cursor-help">
              <div className="text-xs text-white/60 mb-1">💰 Budget</div>
              <div className="text-lg font-bold text-white">
                ${Number(stats.budget).toLocaleString()}
              </div>
            </div>
          </Tooltip>

          {/* Population */}
          <Tooltip content={`Population: The number of citizens in your country. Higher population generates more tax revenue.\n\nCurrent: ${stats.population.toLocaleString()} citizens`}>
            <div className="rounded border border-white/10 bg-slate-800/50 px-3 py-2 cursor-help">
              <div className="text-xs text-white/60 mb-1">👥 Population</div>
              <div className="text-lg font-bold text-white">
                {stats.population.toLocaleString()}
              </div>
            </div>
          </Tooltip>

          {/* Military */}
          <Tooltip content={`Military Strength: Your nation's combat power. Higher strength allows you to defend territory and project power.\n\nCurrent: ${stats.militaryStrength} strength\nUpkeep: $${stats.militaryStrength * 5}/turn`}>
            <div className="rounded border border-white/10 bg-slate-800/50 px-3 py-2 cursor-help">
              <div className="text-xs text-white/60 mb-1">⚔️ Military</div>
              <div className="text-lg font-bold text-red-400">
                {stats.militaryStrength}
              </div>
            </div>
          </Tooltip>

          {/* Technology */}
          <Tooltip content={`Technology Level: Your nation's technological advancement. Higher levels boost economy, military effectiveness, and unlock new capabilities.\n\nCurrent: Level ${stats.technologyLevel.toFixed(1)}\nTax Bonus: +${(stats.technologyLevel * 5).toFixed(0)}%`}>
            <div className="rounded border border-white/10 bg-slate-800/50 px-3 py-2 cursor-help">
              <div className="text-xs text-white/60 mb-1">🔬 Technology</div>
              <div className="text-lg font-bold text-purple-400">
                {stats.technologyLevel.toFixed(1)}
              </div>
            </div>
          </Tooltip>

          {/* Infrastructure */}
          <Tooltip content={`Infrastructure Level: Your nation's development and public works. Higher levels boost economy and reduce costs.\n\nCurrent: Level ${stats.infrastructureLevel || 0}\nEconomy Bonus: +${((stats.infrastructureLevel || 0) * 10).toFixed(0)}%\nMaintenance: $${(stats.infrastructureLevel || 0) * 50}/turn`}>
            <div className="rounded border border-white/10 bg-slate-800/50 px-3 py-2 cursor-help col-span-2">
              <div className="text-xs text-white/60 mb-1">🏗️ Infrastructure</div>
              <div className="text-lg font-bold text-green-400">
                Level {stats.infrastructureLevel || 0}
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
