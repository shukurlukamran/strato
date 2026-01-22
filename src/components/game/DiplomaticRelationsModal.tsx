"use client";

import { useMemo } from "react";
import type { Country, CountryStats } from "@/types/country";

interface DiplomaticRelationsModalProps {
  countries: Country[];
  statsByCountryId: Record<string, CountryStats>;
  playerCountryId?: string;
  onClose: () => void;
}

export function DiplomaticRelationsModal({
  countries,
  statsByCountryId,
  playerCountryId,
  onClose,
}: DiplomaticRelationsModalProps) {
  // Sort countries: player first, then by name
  const sortedCountries = useMemo(() => {
    return [...countries].sort((a, b) => {
      if (a.isPlayerControlled) return -1;
      if (b.isPlayerControlled) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [countries]);

  const getRelationStatus = (score: number): { text: string; color: string } => {
    if (score >= 70) return { text: "Friendly", color: "text-green-400" };
    if (score >= 50) return { text: "Neutral", color: "text-gray-400" };
    if (score >= 30) return { text: "Cold", color: "text-yellow-400" };
    return { text: "Hostile", color: "text-red-400" };
  };

  const getRelationBgColor = (score: number): string => {
    if (score >= 70) return "bg-green-900/30 border-green-400/30";
    if (score >= 50) return "bg-gray-800/50 border-gray-400/30";
    if (score >= 30) return "bg-yellow-900/30 border-yellow-400/30";
    return "bg-red-900/30 border-red-400/30";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-4xl rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-xs text-white/60">Diplomacy Overview</div>
            <div className="text-lg font-bold text-white">Diplomatic Relations</div>
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

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {sortedCountries.map((country) => {
              const stats = statsByCountryId[country.id];
              if (!stats) return null;

              return (
                <div
                  key={country.id}
                  className="rounded-lg border border-white/10 bg-slate-800/50 p-4"
                >
                  <div className="mb-3 flex items-center gap-3">
                    <span
                      className="inline-block h-4 w-4 rounded border-2 border-white/30"
                      style={{ backgroundColor: country.color }}
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-white">
                        {country.name}
                        {country.isPlayerControlled && (
                          <span className="ml-2 text-yellow-400">⚜ Your Country</span>
                        )}
                      </div>
                      <div className="text-xs text-white/60">
                        {country.isPlayerControlled ? "Player Controlled" : "AI Controlled"}
                      </div>
                    </div>
                  </div>

                  {/* Relations with other countries */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-white/70">
                      Relations with other nations:
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {sortedCountries
                        .filter((otherCountry) => otherCountry.id !== country.id)
                        .map((otherCountry) => {
                          /**
                           * IMPORTANT: Diplomatic relations are directional (A->B).
                           *
                           * The diplomacy window shows a per-country panel. For AI countries,
                           * "Relations with X" means "this country -> X".
                           *
                           * For the Player country panel, users expect to see "how others view the player"
                           * (since that’s what appears in each other country’s panel when you look at the player row).
                           * Otherwise, missing player->other entries default to 50 and show "Neutral", creating
                           * an apparent mismatch when other->player is "Cold/Hostile".
                           */
                          const otherStats = statsByCountryId[otherCountry.id];
                          const relationScore = country.isPlayerControlled
                            ? (otherStats?.diplomaticRelations?.[country.id] ?? 50) // other -> player
                            : (stats.diplomaticRelations?.[otherCountry.id] ?? 50); // country -> other
                          const status = getRelationStatus(relationScore);
                          const bgColor = getRelationBgColor(relationScore);

                          return (
                            <div
                              key={otherCountry.id}
                              className={`flex items-center justify-between rounded border p-2 ${bgColor}`}
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className="inline-block h-2 w-2 rounded border border-white/30"
                                  style={{ backgroundColor: otherCountry.color }}
                                />
                                <span className="text-xs text-white">
                                  {otherCountry.name}
                                  {otherCountry.isPlayerControlled && (
                                    <span className="ml-1 text-yellow-400">⚜</span>
                                  )}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-medium ${status.color}`}>
                                  {status.text}
                                </span>
                                <span className="text-xs text-white/60">
                                  ({relationScore}/100)
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 rounded-lg border border-white/10 bg-slate-800/30 p-3">
            <div className="mb-2 text-xs font-semibold text-white/70">Relation Status Guide:</div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <div className="flex items-center gap-2">
                <span className="text-green-400">●</span>
                <span className="text-white/70">Friendly (70-100)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400">●</span>
                <span className="text-white/70">Neutral (50-69)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">●</span>
                <span className="text-white/70">Cold (30-49)</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-red-400">●</span>
                <span className="text-white/70">Hostile (0-29)</span>
              </div>
            </div>
          </div>

          {/* Info note */}
          <div className="mt-4 text-xs text-white/50">
            <strong>Note:</strong> Relations are affected by wars, deals, and diplomatic
            actions. Attacking a country will decrease relations with them and nearby nations.
            Trade deals and alliances improve relations.
          </div>
        </div>

        <div className="flex items-center justify-end border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-slate-700 hover:text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
