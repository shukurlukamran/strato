"use client";

import { calculateBudgetForDisplay } from "@/lib/game-engine/EconomicClientUtils";
import type { Country, CountryStats } from "@/types/country";

interface BudgetPanelProps {
  country: Country | null;
  stats: CountryStats | null;
  activeDealsValue?: number;
}

export function BudgetPanel({ country, stats, activeDealsValue = 0 }: BudgetPanelProps) {
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

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      <div className="mb-4 border-b border-white/10 pb-3">
        <div className="text-sm font-semibold text-white">Budget Breakdown</div>
        <div className="mt-2 flex items-baseline gap-2">
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
      </div>

      <div className="space-y-4">
        {/* Revenue Section */}
        <div>
          <div className="mb-2 text-xs font-semibold text-green-400">Revenue</div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">💰</span>
                <span className="text-sm text-white/90">Tax Revenue</span>
              </div>
              <span className="font-semibold text-green-400">
                +{breakdown.taxRevenue.toLocaleString()}
              </span>
            </div>
            {breakdown.tradeRevenue > 0 && (
              <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🤝</span>
                  <span className="text-sm text-white/90">Trade Revenue</span>
                </div>
                <span className="font-semibold text-green-400">
                  +{breakdown.tradeRevenue.toLocaleString()}
                </span>
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
            <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
              <span className="text-xs font-semibold text-white/70">Total Revenue</span>
              <span className="font-bold text-green-400">
                {breakdown.totalRevenue.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Expenses Section */}
        <div>
          <div className="mb-2 text-xs font-semibold text-red-400">Expenses</div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔧</span>
                <span className="text-sm text-white/90">Maintenance</span>
              </div>
              <span className="font-semibold text-red-400">
                -{breakdown.maintenanceCost.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">⚔️</span>
                <span className="text-sm text-white/90">Military Upkeep</span>
              </div>
              <span className="font-semibold text-red-400">
                -{breakdown.militaryUpkeep.toLocaleString()}
              </span>
            </div>
            {breakdown.infrastructureCost > 0 && (
              <div className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm">🏗️</span>
                  <span className="text-sm text-white/90">Infrastructure</span>
                </div>
                <span className="font-semibold text-red-400">
                  -{breakdown.infrastructureCost.toLocaleString()}
                </span>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
              <span className="text-xs font-semibold text-white/70">Total Expenses</span>
              <span className="font-bold text-red-400">
                {breakdown.totalExpenses.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Visual Indicator */}
        <div className="mt-4 rounded border border-white/10 bg-slate-800/30 p-3">
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
      </div>
    </div>
  );
}
