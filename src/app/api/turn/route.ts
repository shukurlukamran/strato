import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { GameState } from "@/lib/game-engine/GameState";
import { TurnProcessor } from "@/lib/game-engine/TurnProcessor";
import { EconomicEngine } from "@/lib/game-engine/EconomicEngine";
import { AIController } from "@/lib/ai/AIController";

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
    .limit(1);
  
  if (gameRes.error) return NextResponse.json({ error: gameRes.error.message }, { status: 400 });
  if (!gameRes.data || gameRes.data.length === 0) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const turn = gameRes.data[0].current_turn as number;

  const countriesRes = await supabase
    .from("countries")
    .select("id, game_id, name, is_player_controlled, color, position_x, position_y")
    .eq("game_id", gameId);
  if (countriesRes.error) return NextResponse.json({ error: countriesRes.error.message }, { status: 400 });

  const statsRes = await supabase
    .from("country_stats")
    .select(
      "id, country_id, turn, population, budget, technology_level, infrastructure_level, military_strength, military_equipment, resources, diplomatic_relations, resource_profile, created_at",
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

  // Also fetch already-executed actions from this turn (immediate player actions)
  const executedActionsRes = await supabase
    .from("actions")
    .select("id, game_id, country_id, turn, action_type, action_data, status, created_at")
    .eq("game_id", gameId)
    .eq("turn", turn)
    .eq("status", "executed");
  if (executedActionsRes.error) return NextResponse.json({ error: executedActionsRes.error.message }, { status: 400 });

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
          infrastructureLevel: s.infrastructure_level ?? 0,
          militaryStrength: s.military_strength,
          militaryEquipment: s.military_equipment ?? {},
          resources: s.resources ?? {},
          diplomaticRelations: s.diplomatic_relations ?? {},
          resourceProfile: s.resource_profile,
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

  // GENERATE AI ACTIONS for non-player countries
  console.log(`[Turn API] Generating AI actions for turn ${turn}...`);
  const aiActions = [];
  
  for (const country of state.data.countries) {
    if (!country.isPlayerControlled) {
      // Create AI controller with random personality (seeded by country ID for consistency)
      const aiController = AIController.withRandomPersonality(country.id);
      
      try {
        const actions = aiController.decideTurnActions(state.data, country.id);
        aiActions.push(...actions);
        
        console.log(`[AI] ${country.name}: Generated ${actions.length} actions`);
      } catch (error) {
        console.error(`[AI] Failed to generate actions for ${country.name}:`, error);
      }
    }
  }
  
  // Save AI actions to database
  if (aiActions.length > 0) {
    const { error: aiActionsError } = await supabase
      .from("actions")
      .insert(aiActions.map(a => ({
        id: a.id,
        game_id: a.gameId,
        country_id: a.countryId,
        turn: a.turn,
        action_type: a.actionType,
        action_data: a.actionData,
        status: a.status,
        created_at: a.createdAt
      })));
    
    if (aiActionsError) {
      console.error('[AI] Failed to save AI actions:', aiActionsError);
    } else {
      console.log(`[AI] ✓ Saved ${aiActions.length} AI actions to database`);
      
      // Add AI actions to pending actions in state
      state.setPendingActions([...state.data.pendingActions, ...aiActions]);
    }
  }

  // Process economic phase BEFORE action resolution
  const economicEvents: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];
  
  for (const country of state.data.countries) {
    const stats = state.data.countryStatsByCountryId[country.id];
    if (!stats) continue;
    
    // Calculate active deals value for this country
    const activeDealsValue = state.data.activeDeals
      .filter(d => d.status === 'active' && 
        (d.proposingCountryId === country.id || d.receivingCountryId === country.id))
      .reduce((total, deal) => {
        // Simple calculation: sum deal terms value (placeholder)
        // TODO: Implement proper deal value calculation
        return total + 100; // Placeholder value
      }, 0);
    
    try {
      const economicResult = await EconomicEngine.processEconomicTurn(
        supabase,
        country,
        stats,
        activeDealsValue
      );
      
      // Fetch updated stats from database (EconomicEngine already saved them)
      const countryStatsRes = await supabase
        .from('country_stats')
        .select('population, budget, resources, infrastructure_level')
        .eq('country_id', country.id)
        .eq('turn', turn)
        .limit(1);
      
      if (countryStatsRes.data && countryStatsRes.data.length > 0) {
        // Update stats in state with database values
        state.withUpdatedStats(country.id, {
          ...stats,
          budget: Number(countryStatsRes.data[0].budget),
          population: countryStatsRes.data[0].population,
          infrastructureLevel: countryStatsRes.data[0].infrastructure_level ?? 0,
          resources: (countryStatsRes.data[0].resources as Record<string, number>) ?? stats.resources
        });
      } else {
        // Fallback: update manually if fetch fails
        state.withUpdatedStats(country.id, {
          ...stats,
          budget: stats.budget + economicResult.budgetChange,
          population: stats.population + economicResult.populationChange
        });
      }
      
      // Add economic events
      economicResult.eventMessages.forEach(msg => {
        economicEvents.push({
          type: 'economic.update',
          message: `${country.name}: ${msg}`,
          data: { countryId: country.id }
        });
      });
      
      // Log economic event to database
      await supabase.from('economic_events').insert({
        game_id: gameId,
        country_id: country.id,
        turn_number: turn,
        event_type: 'economic_turn',
        event_data: {
          budgetChange: economicResult.budgetChange,
          populationChange: economicResult.populationChange,
          resourcesProduced: economicResult.resourcesProduced,
          resourcesConsumed: economicResult.resourcesConsumed
        }
      });
    } catch (error) {
      console.error(`Failed to process economics for country ${country.id}:`, error);
      economicEvents.push({
        type: 'economic.error',
        message: `Economic processing failed for ${country.name}`,
        data: { countryId: country.id, error: String(error) }
      });
    }
  }

  const processor = new TurnProcessor();
  const result = processor.processTurn(state);

  // Helper function to generate action summary message
  function generateActionMessage(action: any, countryName: string): { type: string; message: string; data: any } | null {
    let actionMessage = "";
    let eventType = action.actionType;
    
    if (action.actionType === "research") {
      actionMessage = `${countryName} researched technology`;
    } else if (action.actionType === "infrastructure") {
      // Handle direct infrastructure actions (player actions via /api/actions)
      actionMessage = `${countryName} built infrastructure`;
      eventType = "economic"; // Group with economic actions for display
    } else if (action.actionType === "economic") {
      // Handle AI economic actions with subtypes
      const subType = (action.actionData as any)?.subType;
      if (subType === "infrastructure") {
        actionMessage = `${countryName} built infrastructure`;
      } else {
        actionMessage = `${countryName} improved economy`;
      }
    } else if (action.actionType === "military") {
      const subType = (action.actionData as any)?.subType;
      const amount = (action.actionData as any)?.amount || 10;
      if (subType === "recruit") {
        actionMessage = `${countryName} recruited ${amount} military units`;
      } else {
        actionMessage = `${countryName} took military action`;
      }
    } else if (action.actionType === "diplomacy") {
      actionMessage = `${countryName} engaged in diplomacy`;
    }
    
    if (actionMessage) {
      return {
        type: `action.${eventType}`,
        message: actionMessage,
        data: { countryId: action.countryId, actionType: action.actionType }
      };
    }
    return null;
  }

  // Generate action summary events for history log
  const actionSummaryEvents: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];
  
  // 1. Add already-executed actions from this turn (immediate player actions)
  for (const action of (executedActionsRes.data ?? [])) {
    const country = state.data.countries.find(c => c.id === action.country_id);
    if (!country) continue;
    
    const actionData = {
      id: action.id,
      gameId: action.game_id,
      countryId: action.country_id,
      turn: action.turn,
      actionType: action.action_type,
      actionData: action.action_data,
      status: action.status,
      createdAt: action.created_at,
    };
    
    const event = generateActionMessage(actionData, country.name);
    if (event) {
      actionSummaryEvents.push(event);
    }
  }
  
  // 2. Add newly executed actions from turn processing (AI actions)
  for (const action of result.executedActions) {
    const country = state.data.countries.find(c => c.id === action.countryId);
    if (!country) continue;
    
    const event = generateActionMessage(action, country.name);
    if (event) {
      actionSummaryEvents.push(event);
    }
  }

  // Only include action events in turn history (exclude economic background events)
  // Turn history should only show player-visible actions, deals, and natural events
  const allEvents = [...actionSummaryEvents, ...result.events.filter(e => !e.type.startsWith('economic'))];

  // Persist: mark executed actions, update stats, store snapshot, advance turn.
  if (result.executedActions.length) {
    await supabase
      .from("actions")
      .upsert(
        result.executedActions.map((a) => ({ id: a.id, status: a.status })),
        { onConflict: "id" },
      );
    
    // Update stats for countries that had actions executed
    const updatedStats = result.executedActions
      .map(a => state.data.countryStatsByCountryId[a.countryId])
      .filter(Boolean);
    
    for (const stats of updatedStats) {
      await supabase
        .from("country_stats")
        .update({
          budget: stats.budget,
          technology_level: stats.technologyLevel,
          infrastructure_level: stats.infrastructureLevel || 0,
          military_strength: stats.militaryStrength
        })
        .eq("country_id", stats.countryId)
        .eq("turn", turn);
    }
  }

  await supabase.from("turn_history").insert({
    game_id: gameId,
    turn,
    state_snapshot: state.data,
    events: allEvents,
    created_at: new Date().toISOString(),
  });

  // Create stats for the next turn based on current turn's stats
  // First, fetch the current stats again in case they were modified by deals/actions
  console.log(`[Turn API] Fetching updated stats for turn ${turn} before creating next turn stats...`);
  const updatedStatsRes = await supabase
    .from("country_stats")
    .select(
      "id, country_id, turn, population, budget, technology_level, infrastructure_level, military_strength, military_equipment, resources, diplomatic_relations, resource_profile, created_at",
    )
    .eq("turn", turn)
    .in(
      "country_id",
      (countriesRes.data ?? []).map((c) => c.id),
    );
  
  if (updatedStatsRes.error) {
    console.error("Failed to fetch updated stats for next turn creation:", updatedStatsRes.error);
  } else if (updatedStatsRes.data && updatedStatsRes.data.length > 0) {
    console.log(`[Turn API] Fetched ${updatedStatsRes.data.length} updated stats for turn ${turn}`);
    
    // Log sample of updated stats
    if (updatedStatsRes.data.length > 0) {
      console.log(`[Turn API] Sample updated stats for turn ${turn}:`, {
        countryId: updatedStatsRes.data[0].country_id,
        budget: updatedStatsRes.data[0].budget,
        population: updatedStatsRes.data[0].population,
        resources: updatedStatsRes.data[0].resources
      });
    }
    
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
    
    if (existingCountryIds.size > 0) {
      console.log(`[Turn API] Stats for turn ${turn + 1} already exist for ${existingCountryIds.size} countries. Updating them instead of creating new ones.`);
    }
    
    // Prepare stats for the next turn using the freshly fetched stats from database
    const nextTurnStats = updatedStatsRes.data
      .map((s) => {
        // Use database values directly - they already have economic updates applied
        return {
          country_id: s.country_id,
          turn: turn + 1,
          population: s.population,
          budget: Number(s.budget),
          technology_level: Number(s.technology_level),
          infrastructure_level: s.infrastructure_level ?? 0,
          military_strength: s.military_strength,
          military_equipment: s.military_equipment ?? {},
          resources: s.resources ?? {},
          diplomatic_relations: s.diplomatic_relations ?? {},
          resource_profile: s.resource_profile, // Preserve resource profile across turns
          created_at: new Date().toISOString(),
        };
      });
    
    if (nextTurnStats.length > 0) {
      // Use upsert to either create or update stats for next turn
      const insertRes = await supabase
        .from("country_stats")
        .upsert(nextTurnStats, { 
          onConflict: 'country_id,turn',
          ignoreDuplicates: false 
        });
      if (insertRes.error) {
        console.error("Failed to create stats for next turn:", insertRes.error);
      } else {
        console.log(`✓ Created stats for turn ${turn + 1} for ${nextTurnStats.length} countries`);
        // Log a sample of the updated stats for debugging
        if (nextTurnStats.length > 0) {
          console.log(`Sample stats for turn ${turn + 1}:`, {
            countryId: nextTurnStats[0].country_id,
            budget: nextTurnStats[0].budget,
            population: nextTurnStats[0].population,
            resources: nextTurnStats[0].resources
          });
        }
      }
    } else {
      console.log(`No new stats to create for turn ${turn + 1} (all countries already have stats)`);
    }
  }

  await supabase.from("games").update({ current_turn: turn + 1, updated_at: new Date().toISOString() }).eq("id", gameId);

  return NextResponse.json({ ok: true, nextTurn: turn + 1, events: allEvents });
}

