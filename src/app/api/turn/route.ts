import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { GameState } from "@/lib/game-engine/GameState";
import { TurnProcessor } from "@/lib/game-engine/TurnProcessor";

const BodySchema = z.object({
  gameId: z.string().min(1),
});

/**
 * Server-side turn advancement endpoint.
 * For now: Supabase-only (memory fallback is intentionally not durable).
 */
export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { gameId } = parsed.data;

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return NextResponse.json(
      { error: "Supabase is not configured; turn processing requires persistence." },
      { status: 501 },
    );
  }

  const gameRes = await supabase
    .from("games")
    .select("id, current_turn, status")
    .eq("id", gameId)
    .single();
  if (gameRes.error) return NextResponse.json({ error: gameRes.error.message }, { status: 400 });

  const turn = gameRes.data.current_turn as number;

  const countriesRes = await supabase
    .from("countries")
    .select("id, game_id, name, is_player_controlled, color, position_x, position_y")
    .eq("game_id", gameId);
  if (countriesRes.error) return NextResponse.json({ error: countriesRes.error.message }, { status: 400 });

  const statsRes = await supabase
    .from("country_stats")
    .select(
      "id, country_id, turn, population, budget, technology_level, military_strength, military_equipment, resources, diplomatic_relations, created_at",
    )
    .eq("turn", turn)
    .in(
      "country_id",
      (countriesRes.data ?? []).map((c) => c.id),
    );
  if (statsRes.error) return NextResponse.json({ error: statsRes.error.message }, { status: 400 });

  const actionsRes = await supabase
    .from("actions")
    .select("id, game_id, country_id, turn, action_type, action_data, status, created_at")
    .eq("game_id", gameId)
    .eq("turn", turn)
    .eq("status", "pending");
  if (actionsRes.error) return NextResponse.json({ error: actionsRes.error.message }, { status: 400 });

  const dealsRes = await supabase
    .from("deals")
    .select(
      "id, game_id, proposing_country_id, receiving_country_id, deal_type, deal_terms, status, proposed_at, accepted_at, expires_at, turn_created, turn_expires, created_at, updated_at",
    )
    .eq("game_id", gameId)
    .eq("status", "active");
  if (dealsRes.error) return NextResponse.json({ error: dealsRes.error.message }, { status: 400 });

  const state = new GameState({
    gameId,
    turn,
    countries: (countriesRes.data ?? []).map((c) => ({
      id: c.id,
      gameId: c.game_id,
      name: c.name,
      isPlayerControlled: c.is_player_controlled,
      color: c.color,
      positionX: Number(c.position_x),
      positionY: Number(c.position_y),
    })),
    countryStatsByCountryId: Object.fromEntries(
      (statsRes.data ?? []).map((s) => [
        s.country_id,
        {
          id: s.id,
          countryId: s.country_id,
          turn: s.turn,
          population: s.population,
          budget: Number(s.budget),
          technologyLevel: Number(s.technology_level),
          militaryStrength: s.military_strength,
          militaryEquipment: s.military_equipment ?? {},
          resources: s.resources ?? {},
          diplomaticRelations: s.diplomatic_relations ?? {},
          createdAt: s.created_at,
        },
      ]),
    ),
    pendingActions: (actionsRes.data ?? []).map((a) => ({
      id: a.id,
      gameId: a.game_id,
      countryId: a.country_id,
      turn: a.turn,
      actionType: a.action_type,
      actionData: a.action_data ?? {},
      status: a.status,
      createdAt: a.created_at,
    })),
    activeDeals: (dealsRes.data ?? []).map((d) => ({
      id: d.id,
      gameId: d.game_id,
      proposingCountryId: d.proposing_country_id,
      receivingCountryId: d.receiving_country_id,
      dealType: d.deal_type,
      dealTerms: d.deal_terms,
      status: d.status,
      proposedAt: d.proposed_at,
      acceptedAt: d.accepted_at,
      expiresAt: d.expires_at,
      turnCreated: d.turn_created,
      turnExpires: d.turn_expires,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    })),
  });

  const processor = new TurnProcessor();
  const result = processor.processTurn(state);

  // Persist: mark executed actions, store snapshot, advance turn.
  if (result.executedActions.length) {
    await supabase
      .from("actions")
      .upsert(
        result.executedActions.map((a) => ({ id: a.id, status: a.status })),
        { onConflict: "id" },
      );
  }

  await supabase.from("turn_history").insert({
    game_id: gameId,
    turn,
    state_snapshot: state.data,
    events: result.events,
    created_at: new Date().toISOString(),
  });

  // Create stats for the next turn based on current turn's stats
  // First, fetch the current stats again in case they were modified by deals/actions
  const updatedStatsRes = await supabase
    .from("country_stats")
    .select(
      "id, country_id, turn, population, budget, technology_level, military_strength, military_equipment, resources, diplomatic_relations, created_at",
    )
    .eq("turn", turn)
    .in(
      "country_id",
      (countriesRes.data ?? []).map((c) => c.id),
    );
  
  if (updatedStatsRes.error) {
    console.error("Failed to fetch updated stats for next turn creation:", updatedStatsRes.error);
  } else if (updatedStatsRes.data && updatedStatsRes.data.length > 0) {
    // Check if stats for next turn already exist
    const nextTurnStatsRes = await supabase
      .from("country_stats")
      .select("country_id")
      .eq("turn", turn + 1)
      .in(
        "country_id",
        (countriesRes.data ?? []).map((c) => c.id),
      );
    
    const existingCountryIds = new Set(
      (nextTurnStatsRes.data ?? []).map((s) => s.country_id)
    );
    
    // Create new stats entries for the next turn for countries that don't have them yet
    const nextTurnStats = updatedStatsRes.data
      .filter((s) => !existingCountryIds.has(s.country_id))
      .map((s) => ({
        country_id: s.country_id,
        turn: turn + 1,
        population: s.population,
        budget: Number(s.budget),
        technology_level: Number(s.technology_level),
        military_strength: s.military_strength,
        military_equipment: s.military_equipment ?? {},
        resources: s.resources ?? {},
        diplomatic_relations: s.diplomatic_relations ?? {},
        created_at: new Date().toISOString(),
      }));
    
    if (nextTurnStats.length > 0) {
      const insertRes = await supabase.from("country_stats").insert(nextTurnStats);
      if (insertRes.error) {
        console.error("Failed to create stats for next turn:", insertRes.error);
      } else {
        console.log(`Created stats for turn ${turn + 1} for ${nextTurnStats.length} countries`);
      }
    }
  }

  await supabase.from("games").update({ current_turn: turn + 1, updated_at: new Date().toISOString() }).eq("id", gameId);

  return NextResponse.json({ ok: true, nextTurn: turn + 1, events: result.events });
}

