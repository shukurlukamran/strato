"use client";

import type { City, Country, CountryStats } from "@/types/country";
import { useState } from "react";
import { CombatResolver } from "@/lib/game-engine/CombatResolver";

interface AttackDialogProps {
  attackerCountry: Country;
  attackerStats: CountryStats;
  targetCity: City;
  targetCountry: Country;
  targetStats: CountryStats;
  onAttack: (militaryPercentage: number, isLiveResolution: boolean) => void;
  onCancel: () => void;
}

export function AttackDialog({
  attackerCountry,
  attackerStats,
  targetCity,
  targetCountry,
  targetStats,
  onAttack,
  onCancel
}: AttackDialogProps) {
  const [militaryPercentage, setMilitaryPercentage] = useState(50);
  const [isLiveResolution, setIsLiveResolution] = useState(true);

  const allocatedStrength = Math.floor(attackerStats.militaryStrength * (militaryPercentage / 100));
  const attackCost = CombatResolver.calculateAttackCost(attackerStats, targetCity, allocatedStrength);

  const handleAttack = () => {
    onAttack(militaryPercentage, isLiveResolution);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border border-gray-700 bg-slate-800 p-6 shadow-2xl">
        <div className="mb-4">
          <h2 className="text-xl font-bold text-white">Launch Attack</h2>
          <p className="text-sm text-gray-300">
            Attack <span className="font-semibold text-red-400">{targetCity.name}</span> in{" "}
            <span className="font-semibold">{targetCountry.name}</span>
          </p>
        </div>

        <div className="space-y-4">
          {/* Military Allocation Slider */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Military Allocation: {militaryPercentage}%
            </label>
            <input
              type="range"
              min="10"
              max="100"
              step="5"
              value={militaryPercentage}
              onChange={(e) => setMilitaryPercentage(Number(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>10%</span>
              <span>{allocatedStrength} strength allocated</span>
              <span>100%</span>
            </div>
          </div>

          {/* Resolution Type */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Combat Resolution
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={isLiveResolution}
                  onChange={() => setIsLiveResolution(true)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-300">Live Resolution</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={!isLiveResolution}
                  onChange={() => setIsLiveResolution(false)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-300">Turn End</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {isLiveResolution
                ? "Combat resolves immediately"
                : "Combat resolves at the end of the turn"
              }
            </p>
          </div>

          {/* Cost Breakdown */}
          <div className="rounded bg-slate-700 p-3">
            <h3 className="text-sm font-medium text-white mb-2">Attack Costs:</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-300">Economic Cost:</span>
                <span className="text-red-400">-${attackCost.economicCost}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Diplomatic Impact:</span>
                <span className="text-orange-400">-{attackCost.diplomaticPenalty} relations</span>
              </div>
            </div>
          </div>

          {/* Combat Preview */}
          <div className="rounded bg-slate-700 p-3">
            <h3 className="text-sm font-medium text-white mb-2">Combat Preview:</h3>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-300">Your forces:</span>
                <span className="text-blue-400">{allocatedStrength}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Defending forces:</span>
                <span className="text-red-400">~{Math.floor(targetStats.militaryStrength * 0.5)}</span>
              </div>
              <p className="text-gray-400 mt-2">
                Actual defender allocation will be determined during combat resolution.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 rounded bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAttack}
            disabled={allocatedStrength === 0}
            className="flex-1 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Launch Attack
          </button>
        </div>
      </div>
    </div>
  );
}