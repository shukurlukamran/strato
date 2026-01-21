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
  // Phase 2.2: Now async to support LLM strategic planning
  // OPTIMIZED: Process all AI countries in parallel with staggered LLM calls
  console.log(`[Turn API] Generating AI actions for turn ${turn}...`);
  
  const aiCountries = state.data.countries.filter(country => !country.isPlayerControlled);
  const isLLMTurn = turn === 1 || turn % 5 === 0;
  
  // If it's an LLM turn, stagger the calls to avoid API rate limiting
  // Otherwise, process fully in parallel
  const aiActionPromises = aiCountries.map(async (country, index) => {
    // Stagger LLM calls by 150ms each to avoid overwhelming Gemini API
    if (isLLMTurn && index > 0) {
      await new Promise(resolve => setTimeout(resolve, 150 * index));
    }
    
    const aiController = AIController.withRandomPersonality(country.id);
    
    try {
      const actions = await aiController.decideTurnActions(state.data, country.id);
      
      console.log(`[AI] ${country.name}: Generated ${actions.length} actions`);
      if (actions.length > 0) {
        console.log(`[AI] ${country.name} actions:`, actions.map(a => ({
          type: a.actionType,
          data: a.actionData
        })));
      }
      
      return actions;
    } catch (error) {
      console.error(`[AI] Failed to generate actions for ${country.name}:`, error);
      return [];
    }
  });
  
  // Wait for all AI decisions (staggered start, but all awaited together)
  const aiActionsArrays = await Promise.all(aiActionPromises);
  const aiActions = aiActionsArrays.flat();
  
  // Save AI actions to database (let database auto-generate UUIDs)
  if (aiActions.length > 0) {
    const { data: insertedActions, error: aiActionsError } = await supabase
      .from("actions")
      .insert(aiActions.map(a => ({
        // Don't include id - let database auto-generate UUID
        game_id: a.gameId,
        country_id: a.countryId,
        turn: a.turn,
        action_type: a.actionType,
        action_data: a.actionData,
        status: a.status,
        created_at: a.createdAt
      })))
      .select(); // Get back the inserted actions with auto-generated IDs
    
    if (aiActionsError) {
      console.error('[AI] Failed to save AI actions:', aiActionsError);
      console.error('[AI] Error details:', JSON.stringify(aiActionsError, null, 2));
    } else if (insertedActions && insertedActions.length > 0) {
      console.log(`[AI] ✓ Saved ${insertedActions.length} AI actions to database`);
      
      // Add inserted actions (with database-generated IDs) to pending actions in state
      const actionsWithIds = insertedActions.map((a: any) => ({
        id: a.id,
        gameId: a.game_id,
        countryId: a.country_id,
        turn: a.turn,
        actionType: a.action_type,
        actionData: a.action_data,
        status: a.status,
        createdAt: a.created_at,
      }));
      
      state.setPendingActions([...state.data.pendingActions, ...actionsWithIds]);
      
      console.log(`[AI] ✓ Added ${actionsWithIds.length} AI actions to state for processing`);
    } else {
      console.warn('[AI] No actions were inserted (insertedActions is empty)');
    }
  } else {
    console.log(`[AI] No AI actions generated this turn`);
  }

  // Process economic phase BEFORE action resolution
  // OPTIMIZED: Process all countries' economics in parallel
  const economicEvents: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];
  const economicEventInserts: Array<any> = [];
  
  const economicPromises = state.data.countries.map(async (country) => {
    const stats = state.data.countryStatsByCountryId[country.id];
    if (!stats) return { country, events: [], economicEventData: null };
    
    // Calculate active deals value for this country
    const activeDealsValue = state.data.activeDeals
      .filter(d => d.status === 'active' && 
        (d.proposingCountryId === country.id || d.receivingCountryId === country.id))
      .reduce((total, deal) => {
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
      
      // Collect events
      const events = economicResult.eventMessages.map(msg => ({
        type: 'economic.update',
        message: `${country.name}: ${msg}`,
        data: { countryId: country.id }
      }));
      
      // Prepare economic event for batch insert
      const economicEventData = {
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
      };
      
      return { country, events, economicEventData };
    } catch (error) {
      console.error(`Failed to process economics for country ${country.id}:`, error);
      return {
        country,
        events: [{
          type: 'economic.error',
          message: `Economic processing failed for ${country.name}`,
          data: { countryId: country.id, error: String(error) }
        }],
        economicEventData: null
      };
    }
  });
  
  // Wait for all economic processing in parallel
  const economicResults = await Promise.all(economicPromises);
  
  // Collect all events and batch insert economic events
  for (const result of economicResults) {
    economicEvents.push(...result.events);
    if (result.economicEventData) {
      economicEventInserts.push(result.economicEventData);
    }
  }
  
  // Batch insert all economic events
  if (economicEventInserts.length > 0) {
    await supabase.from('economic_events').insert(economicEventInserts);
  }

  const processor = new TurnProcessor();
  const result = processor.processTurn(state);

  // MVP bridge: clear "under attack" flags for attacks that were processed this turn.
  // Full combat resolution (wins/losses/city transfer) comes in Phase 5.
  const processedAttackCityIds = result.executedActions
    .filter((a) => a.actionType === "military" && (a.actionData as any)?.subType === "attack")
    .map((a) => (a.actionData as any)?.targetCityId)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (processedAttackCityIds.length > 0) {
    // Unique list
    const uniqueIds = [...new Set(processedAttackCityIds)];
    await supabase.from("cities").update({ is_under_attack: false }).in("id", uniqueIds);
  }

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
  // OPTIMIZED: Batch all updates together
  if (result.executedActions.length) {
    // Get unique country IDs that had actions
    const affectedCountryIds = [...new Set(result.executedActions.map(a => a.countryId))];
    
    // Batch update actions and stats in parallel
    await Promise.all([
      // Update action statuses
      supabase
        .from("actions")
        .upsert(
          result.executedActions.map((a) => ({ id: a.id, status: a.status })),
          { onConflict: "id" },
        ),
      
      // Batch update all stats at once (using upsert for efficiency)
      supabase
        .from("country_stats")
        .upsert(
          affectedCountryIds.map(countryId => {
            const stats = state.data.countryStatsByCountryId[countryId];
            return {
              country_id: countryId,
              turn: turn,
              budget: stats.budget,
              technology_level: stats.technologyLevel,
              infrastructure_level: stats.infrastructureLevel || 0,
              military_strength: stats.militaryStrength,
              population: stats.population,
              military_equipment: stats.militaryEquipment,
              resources: stats.resources,
              diplomatic_relations: stats.diplomaticRelations,
              resource_profile: stats.resourceProfile
            };
          }),
          { onConflict: 'country_id,turn' }
        )
    ]);
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

