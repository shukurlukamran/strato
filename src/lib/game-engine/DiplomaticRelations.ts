import type { CountryStats } from "@/types/country";

export const DIPLOMACY_SCORE_MIN = 0;
export const DIPLOMACY_SCORE_MAX = 100;
export const DIPLOMACY_SCORE_NEUTRAL = 50;

export function clampDiplomaticScore(value: number): number {
  return Math.max(DIPLOMACY_SCORE_MIN, Math.min(DIPLOMACY_SCORE_MAX, value));
}

export function getDiplomaticScore(
  relations: Record<string, number> | undefined,
  otherCountryId: string,
  fallback: number = DIPLOMACY_SCORE_NEUTRAL
): number {
  const raw = relations?.[otherCountryId];
  if (typeof raw !== "number" || Number.isNaN(raw)) {
    return clampDiplomaticScore(fallback);
  }
  return clampDiplomaticScore(raw);
}

export function applyDiplomaticDelta(
  stats: CountryStats,
  otherCountryId: string,
  delta: number,
  fallback: number = DIPLOMACY_SCORE_NEUTRAL
): CountryStats {
  const current = getDiplomaticScore(stats.diplomaticRelations, otherCountryId, fallback);
  const updated = clampDiplomaticScore(current + delta);

  return {
    ...stats,
    diplomaticRelations: {
      ...stats.diplomaticRelations,
      [otherCountryId]: updated,
    },
  };
}

export function applyMutualDiplomaticDelta(
  statsByCountryId: Record<string, CountryStats>,
  countryAId: string,
  countryBId: string,
  deltaAToB: number,
  deltaBToA: number,
  fallback: number = DIPLOMACY_SCORE_NEUTRAL
): { updatedA: CountryStats | null; updatedB: CountryStats | null } {
  const statsA = statsByCountryId[countryAId];
  const statsB = statsByCountryId[countryBId];

  if (!statsA || !statsB) {
    return { updatedA: null, updatedB: null };
  }

  const updatedA = applyDiplomaticDelta(statsA, countryBId, deltaAToB, fallback);
  const updatedB = applyDiplomaticDelta(statsB, countryAId, deltaBToA, fallback);

  return { updatedA, updatedB };
}
