"use client";

import { useMemo, useState } from "react";
import type { City } from "@/types/city";
import type { Country, CountryStats } from "@/types/country";

interface DefenseModalProps {
  gameId: string;
  defendingCity: City;
  defenderCountry: Country;
  defenderStats: CountryStats;
  attackerCountry: Country;
  attackerStats: CountryStats;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function DefenseModal({
  gameId,
  defendingCity,
  defenderCountry,
  defenderStats,
  attackerCountry,
  attackerStats,
  onClose,
  onSubmitted,
}: DefenseModalProps) {
  const [percent, setPercent] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allocatedStrength = useMemo(() => {
    const base = Math.floor(defenderStats.militaryStrength * (percent / 100));
    return Math.max(1, Math.min(defenderStats.militaryStrength, base));
  }, [defenderStats.militaryStrength, percent]);

  // Estimate success probability (defender doesn't know attacker's allocation)
  // This is just an estimate based on total military strength
  const estimatedSuccessChance = useMemo(() => {
    const strengthRatio = defenderStats.militaryStrength / attackerStats.militaryStrength;
    // Defender has 20% terrain advantage
    const adjustedRatio = strengthRatio * 1.2;
    
    // Rough probability estimate (not exact since we don't know attacker allocation)
    if (adjustedRatio >= 1.5) return 75;
    if (adjustedRatio >= 1.2) return 65;
    if (adjustedRatio >= 1.0) return 55;
    if (adjustedRatio >= 0.8) return 45;
    if (adjustedRatio >= 0.6) return 35;
    return 25;
  }, [defenderStats.militaryStrength, attackerStats.militaryStrength]);

  const submitDefense = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/military/defend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          defenderCountryId: defenderCountry.id,
          targetCityId: defendingCity.id,
          allocatedStrength,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to submit defense");
      }
      onSubmitted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit defense");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-xs text-white/60">Defense Action</div>
            <div className="text-lg font-bold text-white">Defend {defendingCity.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-white/70 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded border border-red-500/40 bg-red-900/20 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="rounded border border-yellow-500/40 bg-yellow-900/20 px-4 py-3">
            <div className="flex items-center gap-2 text-yellow-300">
              <span className="text-lg">⚠️</span>
              <span className="text-sm font-semibold">Your city is under attack!</span>
            </div>
            <div className="mt-2 text-xs text-yellow-200/80">
              {attackerCountry.name} is attacking {defendingCity.name}. Allocate your military strength to defend it.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-white/10 bg-slate-800/50 p-3">
              <div className="text-xs text-white/60">Defender (You)</div>
              <div className="mt-1 font-semibold text-white">{defenderCountry.name}</div>
              <div className="mt-1 text-xs text-white/70">Military: {defenderStats.militaryStrength}</div>
              <div className="mt-1 text-xs text-white/70">City: {defendingCity.name}</div>
            </div>
            <div className="rounded border border-white/10 bg-slate-800/50 p-3">
              <div className="text-xs text-white/60">Attacker</div>
              <div className="mt-1 font-semibold text-white">{attackerCountry.name}</div>
              <div className="mt-1 text-xs text-white/70">Total Military: {attackerStats.militaryStrength}</div>
              <div className="mt-1 text-xs text-white/50 italic">
                Allocation: Unknown
              </div>
            </div>
          </div>

          <div className="rounded border border-white/10 bg-slate-800/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Allocate defense strength</div>
              <div className="text-xs text-white/70">
                {percent}% → {allocatedStrength} strength
              </div>
            </div>

            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              disabled={submitting}
              className="w-full"
            />

            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="text-white/70">Estimated success chance</div>
                <div className={`font-semibold ${
                  estimatedSuccessChance >= 60 ? "text-green-400" :
                  estimatedSuccessChance >= 40 ? "text-yellow-400" :
                  "text-red-400"
                }`}>
                  ~{estimatedSuccessChance}%
                </div>
              </div>
              <div className="text-xs text-white/50 italic">
                Note: This is an estimate. The attacker's allocation is unknown.
              </div>
            </div>
          </div>

          <div className="rounded border border-blue-500/40 bg-blue-900/20 px-4 py-3">
            <div className="text-xs font-semibold text-blue-300 mb-1">Defense Strategy</div>
            <div className="text-xs text-blue-200/80">
              • Higher allocation = better defense, but leaves other cities vulnerable
              • Lower allocation = saves strength, but risks losing this city
              • You have a 20% terrain advantage when defending
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white/80 hover:text-white hover:bg-slate-700"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitDefense}
            disabled={submitting}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-500 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Confirm Defense"}
          </button>
        </div>
      </div>
    </div>
  );
}
