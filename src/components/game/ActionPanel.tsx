"use client";

import { useState } from "react";
import type { Country, CountryStats } from "@/types/country";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";

interface ActionPanelProps {
  country: Country | null;
  stats: CountryStats | null;
  gameId?: string;
  currentTurn: number;
  playerCountryId?: string;
  onEndTurn: () => void;
  onActionCreated?: () => void;
}

export function ActionPanel({ 
  country, 
  stats, 
  gameId, 
  currentTurn,
  playerCountryId,
  onEndTurn,
  onActionCreated 
}: ActionPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Only show actions for player's own country
  const isPlayerCountry = country?.id === playerCountryId;

  if (!country || !stats || !gameId) {
    return (
      <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
        <div className="mb-3 text-sm font-semibold text-white">Actions</div>
        <div className="text-xs text-white/60">Select a country to perform actions</div>
      </div>
    );
  }

  if (!isPlayerCountry) {
    return (
      <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
        <div className="mb-3 text-sm font-semibold text-white">Actions</div>
        <div className="text-xs text-white/60">Actions are only available for your own country</div>
      </div>
    );
  }

  const handleAction = async (actionType: "research" | "economic" | "military", actionData: Record<string, unknown>) => {
    if (!gameId || !country.id) return;

    setLoading(actionType);
    setError(null);

    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          countryId: country.id,
          actionType,
          actionData,
          turn: currentTurn,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = "Failed to create action";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        console.error("Action creation failed:", errorMessage);
        throw new Error(errorMessage);
      }

      const data = await res.json();
      console.log("Action created successfully:", data);
      if (onActionCreated) {
        onActionCreated();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create action");
    } finally {
      setLoading(null);
    }
  };

  // Calculate costs
  const currentTechLevel = Math.floor(stats.technologyLevel);
  const techCost = Math.floor(500 * Math.pow(1.5, currentTechLevel));
  const currentInfraLevel = stats.infrastructureLevel || 0;
  const infraCost = Math.floor(
    ECONOMIC_BALANCE.INFRASTRUCTURE.BUILD_COST_BASE * 
    Math.pow(ECONOMIC_BALANCE.INFRASTRUCTURE.BUILD_COST_MULTIPLIER, currentInfraLevel)
  );
  const militaryCost = 100; // Per strength point
  const currentBudget = Number(stats.budget);

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-white hover:text-white/80 transition-colors"
      >
        <span>{isExpanded ? "▼" : "▶"}</span>
        <span>Actions</span>
      </button>
      
      {isExpanded && (
        <>
          {error && (
            <div className="mb-3 rounded border border-red-500/50 bg-red-900/20 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-2">
        {/* Research Action */}
        <button
          type="button"
          disabled={loading !== null || currentBudget < techCost}
          onClick={() => handleAction("research", {})}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${
            currentBudget < techCost
              ? "cursor-not-allowed bg-slate-700/50 opacity-50"
              : loading === "research"
              ? "bg-blue-600/50"
              : "bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 hover:shadow-xl active:scale-95"
          }`}
        >
          <div className="flex items-center justify-between">
            <span>🔬 Research (Tech +1)</span>
            <span className="text-xs opacity-90">${techCost.toLocaleString()}</span>
          </div>
          <div className="mt-1 text-xs opacity-75">
            Current: Level {currentTechLevel.toFixed(1)}
          </div>
        </button>

        {/* Infrastructure Action */}
        <button
          type="button"
          disabled={loading !== null || currentBudget < infraCost}
          onClick={() => handleAction("economic", { subType: "infrastructure" })}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${
            currentBudget < infraCost
              ? "cursor-not-allowed bg-slate-700/50 opacity-50"
              : loading === "economic"
              ? "bg-green-600/50"
              : "bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600 hover:shadow-xl active:scale-95"
          }`}
        >
          <div className="flex items-center justify-between">
            <span>🏗️ Infrastructure (+1)</span>
            <span className="text-xs opacity-90">${infraCost.toLocaleString()}</span>
          </div>
          <div className="mt-1 text-xs opacity-75">
            Current: Level {currentInfraLevel}
          </div>
        </button>

        {/* Military Recruitment */}
        <button
          type="button"
          disabled={loading !== null || currentBudget < militaryCost}
          onClick={() => handleAction("military", { subType: "recruit", amount: 1 })}
          className={`w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all ${
            currentBudget < militaryCost
              ? "cursor-not-allowed bg-slate-700/50 opacity-50"
              : loading === "military"
              ? "bg-red-600/50"
              : "bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 hover:shadow-xl active:scale-95"
          }`}
        >
          <div className="flex items-center justify-between">
            <span>⚔️ Recruit Military (+1)</span>
            <span className="text-xs opacity-90">${militaryCost.toLocaleString()}</span>
          </div>
          <div className="mt-1 text-xs opacity-75">
            Current: {stats.militaryStrength} strength
          </div>
        </button>

        {/* End Turn */}
        <div className="pt-2 border-t border-white/10">
          <button
            type="button"
            disabled={loading !== null}
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-500 hover:to-blue-600 hover:shadow-xl active:scale-95 disabled:opacity-50"
            onClick={onEndTurn}
          >
            End Turn
          </button>
        </div>
          </div>
        </>
      )}
    </div>
  );
}
