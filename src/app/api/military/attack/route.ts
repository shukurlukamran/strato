import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = z.object({
  gameId: z.string().uuid(),
  attackerCountryId: z.string().uuid(),
  targetCityId: z.string().uuid(),
  allocatedStrength: z.number().int().min(1),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { gameId, attackerCountryId, targetCityId, allocatedStrength } = parsed.data;

  const supabase = getSupabaseServerClient();

  // Get current turn
  const gameRes = await supabase.from("games").select("id, current_turn, status").eq("id", gameId).limit(1);
  if (gameRes.error) return NextResponse.json({ error: gameRes.error.message }, { status: 400 });
  if (!gameRes.data || gameRes.data.length === 0) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const turn = gameRes.data[0].current_turn as number;

  // Load target city with position data
  const cityRes = await supabase
    .from("cities")
    .select("id, game_id, country_id, is_under_attack, position_x, position_y")
    .eq("id", targetCityId)
    .limit(1);
  if (cityRes.error) return NextResponse.json({ error: cityRes.error.message }, { status: 400 });
  if (!cityRes.data || cityRes.data.length === 0) return NextResponse.json({ error: "City not found" }, { status: 404 });

  const targetCity = cityRes.data[0] as any;
  if (targetCity.game_id !== gameId) return NextResponse.json({ error: "City does not belong to this game" }, { status: 400 });
  if (targetCity.country_id === attackerCountryId) return NextResponse.json({ error: "Cannot attack your own city" }, { status: 400 });
  if (targetCity.is_under_attack) return NextResponse.json({ error: "City is already under attack" }, { status: 400 });

  // Validate that target city is actually a neighbor (within attack range)
  const allCitiesRes = await supabase
    .from("cities")
    .select("id, country_id, position_x, position_y")
    .eq("game_id", gameId)
    .eq("country_id", attackerCountryId);
  
  if (allCitiesRes.error) return NextResponse.json({ error: allCitiesRes.error.message }, { status: 400 });
  
  const attackerCities = allCitiesRes.data || [];
  if (attackerCities.length === 0) return NextResponse.json({ error: "Attacker has no cities" }, { status: 400 });

  // Check if target city is within attack range of at least one attacker city
  const attackRange = 10; // Same as AI logic
  let isNeighbor = false;
  for (const attackerCity of attackerCities) {
    const distance = Math.sqrt(
      Math.pow(Number(attackerCity.position_x) - Number(targetCity.position_x), 2) +
      Math.pow(Number(attackerCity.position_y) - Number(targetCity.position_y), 2)
    );
    
    if (distance <= attackRange) {
      isNeighbor = true;
      break;
    }
  }

  if (!isNeighbor) {
    return NextResponse.json({ error: "Target city is not adjacent to your territory" }, { status: 400 });
  }

  // Attacker stats (current turn)
  const statsRes = await supabase
    .from("country_stats")
    .select("id, budget, military_strength")
    .eq("country_id", attackerCountryId)
    .eq("turn", turn)
    .limit(1);
  if (statsRes.error) return NextResponse.json({ error: statsRes.error.message }, { status: 400 });
  if (!statsRes.data || statsRes.data.length === 0) return NextResponse.json({ error: "Attacker stats not found" }, { status: 404 });

  const stats = statsRes.data[0];
  const currentBudget = Number(stats.budget);
  const currentStrength = Number(stats.military_strength);

  if (allocatedStrength > currentStrength) {
    return NextResponse.json({ error: "Allocated strength exceeds current military strength" }, { status: 400 });
  }

  // Phase 3 cost model
  const cost = 100 + allocatedStrength * 10;
  if (currentBudget < cost) {
    return NextResponse.json(
      { error: `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}` },
      { status: 400 },
    );
  }

  // Deduct cost immediately (submission-time)
  const updateStatsRes = await supabase
    .from("country_stats")
    .update({ budget: currentBudget - cost })
    .eq("id", stats.id)
    .select("budget")
    .limit(1);
  if (updateStatsRes.error) return NextResponse.json({ error: updateStatsRes.error.message }, { status: 500 });

  // Mark city under attack immediately for UI
  const markCityRes = await supabase.from("cities").update({ is_under_attack: true }).eq("id", targetCityId);
  if (markCityRes.error) return NextResponse.json({ error: markCityRes.error.message }, { status: 500 });

  // Create a pending military action for turn-end resolution.
  // IMPORTANT: immediate=true means the budget cost was already deducted at submission time.
  const actionInsertRes = await supabase.from("actions").insert({
    game_id: gameId,
    country_id: attackerCountryId,
    turn,
    action_type: "military",
    action_data: {
      subType: "attack",
      targetCityId,
      allocatedStrength,
      attackerId: attackerCountryId,
      defenderId: targetCity.country_id,
      cost,
      immediate: true,
      createdAt: new Date().toISOString(),
    },
    status: "pending",
  });
  if (actionInsertRes.error) return NextResponse.json({ error: actionInsertRes.error.message }, { status: 500 });

  return NextResponse.json({ ok: true, cost, turn });
}

