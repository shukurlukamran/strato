import { NextResponse } from "next/server";
import { appendFileSync } from "fs";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { MilitaryCalculator } from "@/lib/game-engine/MilitaryCalculator";
import type { CountryStats } from "@/types/country";

const DEBUG_LOG = "/Users/kamranshukurlu/Documents/Strato/.cursor/debug.log";
function agentLog(msg: string, data: Record<string, unknown>, hypothesisId: string) {
  try {
    appendFileSync(DEBUG_LOG, JSON.stringify({ location: "defend/route.ts", message: msg, data, hypothesisId, timestamp: Date.now(), sessionId: "debug-session" }) + "\n");
  } catch (_) {}
}

const BodySchema = z.object({
  gameId: z.string().uuid(),
  defenderCountryId: z.string().uuid(),
  targetCityId: z.string().uuid(),
  allocatedStrength: z.number().int().min(1),
});

/**
 * Defense API endpoint
 * Creates a defense action for a city under attack
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { gameId, defenderCountryId, targetCityId, allocatedStrength } = parsed.data;

  const supabase = getSupabaseServerClient();

  // Get current turn
  const gameRes = await supabase.from("games").select("id, current_turn, status").eq("id", gameId).limit(1);
  if (gameRes.error) return NextResponse.json({ error: gameRes.error.message }, { status: 400 });
  if (!gameRes.data || gameRes.data.length === 0) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const turn = gameRes.data[0].current_turn as number;

  // Load target city and verify it's under attack
  const cityRes = await supabase
    .from("cities")
    .select("id, game_id, country_id, is_under_attack")
    .eq("id", targetCityId)
    .limit(1);
  if (cityRes.error) return NextResponse.json({ error: cityRes.error.message }, { status: 400 });
  if (!cityRes.data || cityRes.data.length === 0) return NextResponse.json({ error: "City not found" }, { status: 404 });

  const targetCity = cityRes.data[0] as any;
  if (targetCity.game_id !== gameId) return NextResponse.json({ error: "City does not belong to this game" }, { status: 400 });
  // #region agent log
  const dbCountryId = targetCity.country_id;
  const idsMatch = dbCountryId === defenderCountryId;
  const types = { db: typeof dbCountryId, req: typeof defenderCountryId };
  agentLog("own city check", { defenderCountryId, dbCountryId, idsMatch, types, targetCityId }, "H2");
  // #endregion
  if (targetCity.country_id !== defenderCountryId) {
    // #region agent log
    agentLog("own city REJECT", { defenderCountryId, dbCountryId: targetCity.country_id, targetCityId }, "H3");
    // #endregion
    return NextResponse.json({ error: "You can only defend your own cities" }, { status: 400 });
  }
  // #region agent log
  agentLog("own city OK", { defenderCountryId, dbCountryId, targetCityId }, "H2");
  // #endregion
  if (!targetCity.is_under_attack) return NextResponse.json({ error: "City is not under attack" }, { status: 400 });

  // Check for existing attack action targeting this city
  const attackActionRes = await supabase
    .from("actions")
    .select("id, country_id, action_data")
    .eq("game_id", gameId)
    .eq("turn", turn)
    .eq("status", "pending")
    .eq("action_type", "military")
    .contains("action_data", { subType: "attack", targetCityId });
  
  if (attackActionRes.error) return NextResponse.json({ error: attackActionRes.error.message }, { status: 400 });
  if (!attackActionRes.data || attackActionRes.data.length === 0) {
    return NextResponse.json({ error: "No pending attack found for this city" }, { status: 400 });
  }

  const attackAction = attackActionRes.data[0];
  const attackData = attackAction.action_data as any;
  const attackerId = attackData.attackerId || attackAction.country_id;

  // Defender stats (current turn) - fetch full stats including technology level and resource profile
  const statsRes = await supabase
    .from("country_stats")
    .select("id, country_id, turn, military_strength, technology_level, budget, resource_profile, created_at")
    .eq("country_id", defenderCountryId)
    .eq("turn", turn)
    .limit(1);
  if (statsRes.error) return NextResponse.json({ error: statsRes.error.message }, { status: 400 });
  if (!statsRes.data || statsRes.data.length === 0) return NextResponse.json({ error: "Defender stats not found" }, { status: 404 });

  const defenderStats = statsRes.data[0];
  
  // Validate that stats match current turn
  if (defenderStats.turn !== turn) {
    return NextResponse.json({ 
      error: `Stats are from turn ${defenderStats.turn} but current turn is ${turn}. Please refresh.` 
    }, { status: 400 });
  }
  
  // Use the same calculation as the frontend for consistency
  // This includes tech bonuses and profile modifiers
  const rawStrength = Number(defenderStats.military_strength);
  const techLevel = Number(defenderStats.technology_level) || 0;
  const countryStats: CountryStats = {
    id: defenderStats.id,
    countryId: defenderCountryId,
    turn: turn,
    population: 0, // Not needed for calculation
    budget: Number(defenderStats.budget) || 0,
    technologyLevel: techLevel,
    infrastructureLevel: 0, // Not needed for calculation
    militaryStrength: rawStrength,
    militaryEquipment: {},
    resources: {},
    diplomaticRelations: {},
    resourceProfile: defenderStats.resource_profile as any,
    createdAt: defenderStats.created_at || new Date().toISOString(),
  };
  
  const effectiveStrength = MilitaryCalculator.calculateEffectiveMilitaryStrength(countryStats);
  
  if (allocatedStrength > effectiveStrength) {
    const baseStrength = rawStrength;
    const techEffectiveness = 1 + (techLevel * 0.20);
    return NextResponse.json({ 
      error: `Allocated strength (${allocatedStrength}) exceeds effective military strength (${effectiveStrength}). Base: ${baseStrength}, Tech Level: ${techLevel}, Tech Multiplier: ${techEffectiveness.toFixed(2)}` 
    }, { status: 400 });
  }

  // Update the attack action with defense allocation
  // The defense allocation is stored in the attack action's action_data
  const updatedActionData = {
    ...attackData,
    defenseAllocation: allocatedStrength,
    defenderId: defenderCountryId,
  };

  const updateRes = await supabase
    .from("actions")
    .update({ action_data: updatedActionData })
    .eq("id", attackAction.id);

  if (updateRes.error) return NextResponse.json({ error: updateRes.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, turn });
}
