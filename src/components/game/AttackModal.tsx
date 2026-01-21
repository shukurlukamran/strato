"use client";

import { useMemo, useState } from "react";
import type { City } from "@/types/city";
import type { Country, CountryStats } from "@/types/country";

interface AttackModalProps {
  gameId: string;
  attackerCountry: Country;
  attackerStats: CountryStats;
  targetCity: City;
  defenderCountry: Country;
  defenderStats: CountryStats;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function AttackModal({
  gameId,
  attackerCountry,
  attackerStats,
  targetCity,
  defenderCountry,
  defenderStats,
  onClose,
  onSubmitted,
}: AttackModalProps) {
  const [percent, setPercent] = useState(50);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allocatedStrength = useMemo(() => {
    const base = Math.floor(attackerStats.militaryStrength * (percent / 100));
    return Math.max(1, Math.min(attackerStats.militaryStrength, base));
  }, [attackerStats.militaryStrength, percent]);

  const cost = useMemo(() => {
    // Phase 3 (from plan): 100 + (10 per strength point allocated)
    return 100 + allocatedStrength * 10;
  }, [allocatedStrength]);

  const canAfford = Number(attackerStats.budget) >= cost;

  const submitAttack = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/military/attack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          attackerCountryId: attackerCountry.id,
          targetCityId: targetCity.id,
          allocatedStrength,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to submit attack");
      }
      onSubmitted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit attack");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-xs text-white/60">Military Action</div>
            <div className="text-lg font-bold text-white">Attack {targetCity.name}</div>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded border border-white/10 bg-slate-800/50 p-3">
              <div className="text-xs text-white/60">Attacker</div>
              <div className="mt-1 font-semibold text-white">{attackerCountry.name}</div>
              <div className="mt-1 text-xs text-white/70">Military: {attackerStats.militaryStrength}</div>
              <div className="mt-1 text-xs text-white/70">Budget: ${Number(attackerStats.budget).toLocaleString()}</div>
            </div>
            <div className="rounded border border-white/10 bg-slate-800/50 p-3">
              <div className="text-xs text-white/60">Defender</div>
              <div className="mt-1 font-semibold text-white">{defenderCountry.name}</div>
              <div className="mt-1 text-xs text-white/70">Military: {defenderStats.militaryStrength}</div>
              <div className="mt-1 text-xs text-white/70">City: {targetCity.name}</div>
            </div>
          </div>

          <div className="rounded border border-white/10 bg-slate-800/40 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Allocate strength</div>
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

            <div className="mt-3 flex items-center justify-between text-sm">
              <div className="text-white/70">Attack cost</div>
              <div className={canAfford ? "font-semibold text-white" : "font-semibold text-red-300"}>
                ${cost.toLocaleString()}
              </div>
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
            onClick={submitAttack}
            disabled={submitting || !canAfford}
            className="rounded-lg bg-gradient-to-r from-red-600 to-red-700 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:from-red-500 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting..." : "Confirm Attack"}
          </button>
        </div>
      </div>
    </div>
  );
}

