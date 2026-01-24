import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { GameState } from "@/lib/game-engine/GameState";
import { TurnProcessor } from "@/lib/game-engine/TurnProcessor";
import { EconomicEngine } from "@/lib/game-engine/EconomicEngine";
import { AIController } from "@/lib/ai/AIController";
import { ActionPricing } from "@/lib/game-engine/ActionPricing";

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

  // Fetch cities for attack decision evaluation
  const citiesRes = await supabase
    .from("cities")
    .select("id, country_id, game_id, name, position_x, position_y, size, border_path, per_turn_resources, population, is_under_attack, created_at")
    .eq("game_id", gameId);
  if (citiesRes.error) return NextResponse.json({ error: citiesRes.error.message }, { status: 400 });

  const cities = (citiesRes.data ?? []).map(c => ({
    id: c.id,
    countryId: c.country_id,
    gameId: c.game_id,
    name: c.name,
    positionX: Number(c.position_x),
    positionY: Number(c.position_y),
    size: Number(c.size),
    borderPath: c.border_path,
    perTurnResources: (c.per_turn_resources as Record<string, number>) ?? {},
    population: c.population,
    isUnderAttack: c.is_under_attack ?? false,
    createdAt: c.created_at,
  }));

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
  // OPTIMIZED V2: BATCH all AI countries into SINGLE API call (80% cost reduction!)
  console.log(`[Turn API] Generating AI actions for turn ${turn}...`);
  
  const aiCountries = state.data.countries.filter(country => !country.isPlayerControlled);
  // LLM is used at turn 2, then every 10 turns (2, 10, 20, 30, 40...)
  const isLLMTurn = turn === 2 || (turn >= 10 && turn % 10 === 0);
  
  console.log(`[Turn API] Processing turn ${turn}. LLM mode: ${isLLMTurn ? 'ENABLED (PARALLEL)' : 'DISABLED (using rule-based AI)'}`);
  
  // PARALLEL INDIVIDUAL LLM CALLS: More reliable than batch (avoids json_validate_failed)
  // Grok doesn't charge per request, so parallel individual calls are optimal
  let batchAnalyses: Map<string, any> | null = null;
  if (isLLMTurn && aiCountries.length > 0) {
    try {
      const llmPlanner = new (await import("@/lib/ai/LLMStrategicPlanner")).LLMStrategicPlanner();
      
      // Prepare all countries for analysis
      const countriesForAnalysis = aiCountries.map(country => ({
        countryId: country.id,
        stats: state.data.countryStatsByCountryId[country.id]
      })).filter(c => c.stats); // Only include countries with stats
      
      if (countriesForAnalysis.length > 0) {
        console.log(`[Turn API] 🚀 PARALLEL analyzing ${countriesForAnalysis.length} countries (individual calls for reliability)`);
        console.log(`[Turn API] Country IDs: [${countriesForAnalysis.map(c => c.countryId.substring(0, 8)).join(', ')}...]`);
        
        // Make all individual calls in parallel for best performance
        const startTime = Date.now();
        const analysisPromises = countriesForAnalysis.map(({ countryId, stats }) =>
          llmPlanner.analyzeSituation(state.data, countryId, stats)
            .then(analysis => ({ countryId, analysis }))
            .catch(error => {
              console.error(`[Turn API] Failed to analyze ${countryId}:`, error);
              return { countryId, analysis: null };
            })
        );
        
        const results = await Promise.all(analysisPromises);
        const duration = Date.now() - startTime;
        
        // Build results map
        batchAnalyses = new Map();
        let successCount = 0;
        for (const { countryId, analysis } of results) {
          if (analysis) {
            batchAnalyses.set(countryId, analysis);
            successCount++;
          }
        }
        
        console.log(`[Turn API] ✓ Parallel analysis complete in ${duration}ms: ${successCount}/${countriesForAnalysis.length} succeeded`);
        
        if (successCount < countriesForAnalysis.length) {
          console.warn(`[Turn API] ⚠️ ${countriesForAnalysis.length - successCount} countries failed analysis, will use cached plans`);
        }
      }
    } catch (error) {
      console.error(`[Turn API] Parallel analysis failed, will use cached plans:`, error);
    }
  }
  
  // Process each AI country with batch analysis results (if available)
  const aiActionPromises = aiCountries.map(async (country) => {
    const aiController = AIController.withRandomPersonality(country.id);
    
    try {
      // Pass batch analysis to avoid redundant LLM API calls
      const batchAnalysisForCountry = batchAnalyses?.get(country.id) || undefined;
      const actions = await aiController.decideTurnActions(state.data, country.id, cities, batchAnalysisForCountry);
      
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
  
  // Wait for all AI decisions (now parallel without staggering - batch already done)
  const aiActionsArrays = await Promise.all(aiActionPromises);
  const aiActions = aiActionsArrays.flat();
  
  // Save AI actions to database (let database auto-generate UUIDs)
  // IMPORTANT: Attack actions are scheduled for NEXT TURN to give defenders time to respond
  // CRITICAL: AI attack costs must be charged on declaration turn (current turn)
  if (aiActions.length > 0) {
    // Filter and validate AI attack actions - charge costs before insertion
    const validatedAiActions: typeof aiActions = [];
    const attackCostUpdates: Array<{ countryId: string; newBudget: number; statsId: string }> = [];

    for (const aiAction of aiActions) {
      const actionData = aiAction.actionData || {};
      const isAttack = aiAction.actionType === 'military' && actionData.subType === 'attack';

      if (isAttack) {
        // Get attacker stats for current turn
        const attackerStats = state.data.countryStatsByCountryId[aiAction.countryId];
        if (!attackerStats) {
          console.warn(`[AI] Skipping attack action for ${aiAction.countryId}: no current turn stats found`);
          continue;
        }

        // Calculate attack cost
        const allocatedStrength = Number(actionData.allocatedStrength) || 10;
        const attackPricing = ActionPricing.calculateAttackPricing(allocatedStrength);

        // Check if attacker can afford the attack
        if (!ActionPricing.canAffordAttack(attackPricing, attackerStats.budget)) {
          console.log(`[AI] ${aiAction.countryId} cannot afford attack (cost: $${attackPricing.cost}, budget: $${attackerStats.budget}) - skipping`);
          continue;
        }

        // Apply cost deduction to attacker stats (will be updated in database)
        const updatedStats = ActionPricing.applyAttackCost(attackPricing, attackerStats);

        // Update in-memory state to prevent EconomicEngine from overwriting the deduction
        state.withUpdatedStats(aiAction.countryId, updatedStats);

        // Record the budget update for batch processing
        attackCostUpdates.push({
          countryId: aiAction.countryId,
          newBudget: updatedStats.budget,
          statsId: attackerStats.id
        });

        // Add attack action for next turn with paid marker
        actionData.cost = attackPricing.cost;
        actionData.immediate = true; // Mark as paid
        validatedAiActions.push({
          ...aiAction,
          actionData
        });

        console.log(`[AI] Charged ${aiAction.countryId} $${attackPricing.cost} for attack (allocated strength: ${allocatedStrength})`);
      } else {
        // Non-attack actions go through as-is (will be charged during turn processing)
        validatedAiActions.push(aiAction);
      }
    }

    // Apply all attack cost deductions to database
    if (attackCostUpdates.length > 0) {
      const attackCostPromises = attackCostUpdates.map(update =>
        supabase
          .from("country_stats")
          .update({ budget: update.newBudget })
          .eq("id", update.statsId)
      );

      const attackCostResults = await Promise.all(attackCostPromises);
      const attackCostErrors = attackCostResults.filter(result => result.error);

      if (attackCostErrors.length > 0) {
        console.error('[AI] Failed to deduct attack costs for some countries:', attackCostErrors);
        // Continue processing - partial failures shouldn't block the turn
      } else {
        console.log(`[AI] ✓ Deducted attack costs for ${attackCostUpdates.length} countries`);
      }
    }

    // Insert validated AI actions
    if (validatedAiActions.length > 0) {
      const { data: insertedActions, error: aiActionsError } = await supabase
        .from("actions")
        .insert(validatedAiActions.map(a => {
          // Check if this is an attack action
          const actionData = a.actionData || {};
          const isAttack = a.actionType === 'military' && actionData.subType === 'attack';

          return {
            // Don't include id - let database auto-generate UUID
            game_id: a.gameId,
            country_id: a.countryId,
            // CRITICAL FIX: Attack actions use NEXT turn (turn + 1) so defenders have time to respond
            turn: isAttack ? a.turn + 1 : a.turn,
            action_type: a.actionType,
            action_data: a.actionData,
            status: a.status,
            created_at: a.createdAt
          };
        }))
        .select(); // Get back the inserted actions with auto-generated IDs
    
    if (aiActionsError) {
      console.error('[AI] Failed to save AI actions:', aiActionsError);
      console.error('[AI] Error details:', JSON.stringify(aiActionsError, null, 2));
    } else if (insertedActions && insertedActions.length > 0) {
      console.log(`[AI] ✓ Saved ${insertedActions.length} AI actions to database`);
      
      // IMPORTANT: Mark cities as under attack for AI attack actions
      // This allows player defenders to see the defense modal and respond
      const attackActions = insertedActions.filter((a: any) => {
        const actionData = a.action_data || {};
        return a.action_type === 'military' && actionData.subType === 'attack';
      });
      
      if (attackActions.length > 0) {
        const targetCityIds = attackActions.map((a: any) => {
          const actionData = a.action_data || {};
          return actionData.targetCityId;
        }).filter(Boolean);
        
        if (targetCityIds.length > 0) {
          await supabase
            .from('cities')
            .update({ is_under_attack: true })
            .in('id', targetCityIds);
          
          console.log(`[AI] ✓ Marked ${targetCityIds.length} cities as under attack`);
        }
      }
      
      // Add inserted actions (with database-generated IDs) to pending actions in state
      // NOTE: Attack actions scheduled for next turn (turn+1) are NOT added to current state
      // They will be picked up in the next turn processing cycle
      const actionsForCurrentTurn = insertedActions.filter((a: any) => a.turn === turn);
      
      if (actionsForCurrentTurn.length > 0) {
        const actionsWithIds = actionsForCurrentTurn.map((a: any) => ({
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
      }
      
      const attackActionsForNextTurn = insertedActions.filter((a: any) => {
        const actionData = a.action_data || {};
        return a.turn === turn + 1 && a.action_type === 'military' && actionData.subType === 'attack';
      });
      
      if (attackActionsForNextTurn.length > 0) {
        console.log(`[AI] ✓ Scheduled ${attackActionsForNextTurn.length} attack actions for next turn (players will have time to defend)`);
      }
    } else {
      console.warn('[AI] No actions were inserted (insertedActions is empty)');
    }
    } else {
      console.warn('[AI] No valid AI actions to insert (all were filtered out or unaffordable)');
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

  // Create a helper function to fetch city data for combat resolution
  const getCityData = async (cityId: string) => {
    const cityRes = await supabase
      .from("cities")
      .select("id, name, country_id, per_turn_resources, population")
      .eq("id", cityId)
      .limit(1);
    
    if (cityRes.data && cityRes.data.length > 0) {
      const city = cityRes.data[0];
      return {
        id: city.id,
        name: city.name,
        countryId: city.country_id,
        gameId: gameId,
        positionX: 0,
        positionY: 0,
        size: 1,
        borderPath: "",
        perTurnResources: city.per_turn_resources as Record<string, number>,
        population: city.population,
        createdAt: new Date().toISOString(),
      };
    }
    
    return null;
  };

  const processor = new TurnProcessor();
  const result = await processor.processTurn(state, getCityData);

  // Handle combat results: transfer cities and generate history events
  const combatEvents: Array<{ type: string; message: string; data?: Record<string, unknown> }> = [];
  
  if (result.combatResults && result.combatResults.length > 0) {
    for (const combatResult of result.combatResults) {
      const actionData = combatResult.attackAction.actionData as any;
      const targetCityId = actionData.targetCityId;
      const attackerId = actionData.attackerId || combatResult.attackAction.countryId;
      const defenderId = actionData.defenderId;
      
      // Fetch city data
      const cityRes = await supabase
        .from("cities")
        .select("id, name, country_id, per_turn_resources, population")
        .eq("id", targetCityId)
        .limit(1);
      
      if (cityRes.data && cityRes.data.length > 0) {
        const city = cityRes.data[0];
        const attackerCountry = state.data.countries.find(c => c.id === attackerId);
        const defenderCountry = state.data.countries.find(c => c.id === defenderId);
        
        if (attackerCountry && defenderCountry) {
          if (combatResult.attackerWins) {
            // Transfer city to attacker
            await supabase
              .from("cities")
              .update({ 
                country_id: attackerId,
                is_under_attack: false 
              })
              .eq("id", targetCityId);
            
            // Update country stats to reflect city transfer
            // IMPORTANT: We update the GameState object which will be saved later
            const attackerStats = state.data.countryStatsByCountryId[attackerId];
            const defenderStats = state.data.countryStatsByCountryId[defenderId];
            
            if (attackerStats && defenderStats) {
              // Transfer population
              attackerStats.population += city.population;
              defenderStats.population = Math.max(0, defenderStats.population - city.population);
              
              // Transfer stockpile resources (immediate effect)
              for (const [resource, amount] of Object.entries(city.per_turn_resources as Record<string, number> || {})) {
                attackerStats.resources[resource] = (attackerStats.resources[resource] || 0) + amount;
                defenderStats.resources[resource] = Math.max(0, (defenderStats.resources[resource] || 0) - amount);
              }
              
              // Update state (will be saved to database later in batch)
              state.withUpdatedStats(attackerId, attackerStats);
              state.withUpdatedStats(defenderId, defenderStats);
              
              console.log(`[Combat] City transfer complete: ${city.name} from ${defenderCountry.name} to ${attackerCountry.name}`);
              console.log(`[Combat] Attacker gained: ${city.population} population, ${Object.keys(city.per_turn_resources).length} resource types`);
              
              // CHECK FOR COUNTRY ELIMINATION
              // Count remaining cities for the defender
              const defenderCitiesRes = await supabase
                .from("cities")
                .select("id")
                .eq("game_id", gameId)
                .eq("country_id", defenderId);
              
              const remainingCities = (defenderCitiesRes.data || []).length;
              
              if (remainingCities === 0) {
                console.log(`[Elimination] ${defenderCountry.name} has been eliminated!`);
                
                // Transfer remaining assets to victor
                attackerStats.budget += defenderStats.budget;
                attackerStats.militaryStrength += Math.floor(defenderStats.militaryStrength * 0.5); // Victor captures 50% of remaining military
                attackerStats.militaryEquipment = {
                  ...attackerStats.militaryEquipment,
                  ...Object.fromEntries(
                    Object.entries(defenderStats.militaryEquipment || {}).map(([k, v]) => {
                      const attackerValue = attackerStats.militaryEquipment?.[k];
                      const attackerNum = typeof attackerValue === 'number' ? attackerValue : 0;
                      const defenderNum = typeof v === 'number' ? v : 0;
                      return [k, attackerNum + defenderNum];
                    })
                  )
                };
                
                // Transfer remaining resources
                for (const [resource, amount] of Object.entries(defenderStats.resources)) {
                  attackerStats.resources[resource] = (attackerStats.resources[resource] || 0) + amount;
                }
                
                // Update attacker stats with captured assets
                state.withUpdatedStats(attackerId, attackerStats);
                
                // Zero out defender stats (they're eliminated)
                state.withUpdatedStats(defenderId, {
                  ...defenderStats,
                  budget: 0,
                  militaryStrength: 0,
                  population: 0,
                  resources: {},
                  militaryEquipment: {}
                });
                
                // Create elimination event
                combatEvents.push({
                  type: "game.elimination",
                  message: `💀 ${defenderCountry.name} has been eliminated by ${attackerCountry.name}! All remaining assets transferred to the victor.`,
                  data: {
                    eliminatedCountryId: defenderId,
                    eliminatedCountryName: defenderCountry.name,
                    victorCountryId: attackerId,
                    victorCountryName: attackerCountry.name,
                    assetsTransferred: {
                      budget: defenderStats.budget,
                      military: Math.floor(defenderStats.militaryStrength * 0.5),
                      resources: Object.keys(defenderStats.resources).length
                    }
                  }
                });
                
                // CHECK WIN CONDITION
                // Count how many countries still have cities
                const allCountriesWithCitiesRes = await supabase
                  .from("cities")
                  .select("country_id")
                  .eq("game_id", gameId);
                
                const uniqueCountryIds = new Set((allCountriesWithCitiesRes.data || []).map(c => c.country_id));
                
                if (uniqueCountryIds.size === 1) {
                  console.log(`[Victory] ${attackerCountry.name} is the last country standing! Game over.`);
                  
                  // Update game status to finished
                  await supabase
                    .from("games")
                    .update({ 
                      status: "finished",
                      updated_at: new Date().toISOString()
                    })
                    .eq("id", gameId);
                  
                  // Create victory event
                  combatEvents.push({
                    type: "game.victory",
                    message: `🎉 ${attackerCountry.name} has won the game by conquering all territories!`,
                    data: {
                      victorCountryId: attackerId,
                      victorCountryName: attackerCountry.name,
                      turn: turn
                    }
                  });
                }
              }
              
              // FIXED: allocatedStrength is already in effective terms (includes tech bonus)
              // The AttackModal and DefenseModal calculate allocatedStrength from effective military strength
              // So we should NOT re-apply tech bonuses here
              
              // Get tech levels for display purposes only
              const attackerTechLevel = attackerStats.technologyLevel || 0;
              const defenderTechLevel = defenderStats.technologyLevel || 0;
              const attackerTechBonus = attackerTechLevel * 0.20; // 20% per level
              const defenderTechBonus = defenderTechLevel * 0.20;
              
              // The allocated strengths are already effective (tech-boosted)
              const attackStrength = actionData.allocatedStrength;
              const defenseStrength = combatResult.defenderAllocation;
              
              // CRITICAL FIX: Show the ACTUAL ratio used in combat (with terrain bonus applied)
              const TERRAIN_BONUS = 1.2;
              const adjustedDefenseStrength = defenseStrength * TERRAIN_BONUS;
              const actualCombatRatio = (attackStrength / adjustedDefenseStrength).toFixed(2);
              
              // Check if defender is player and didn't submit defense
              const hasPlayerDefense = actionData.defenseAllocation !== undefined && actionData.defenseAllocation !== null;
              const autoDefenseNote = (defenderCountry.isPlayerControlled && !hasPlayerDefense) 
                ? `\n• Note: Defense was automatically set to 50% of effective strength (no player response)` 
                : '';
              
              combatEvents.push({
                type: "action.military.capture",
                message: `⚔️⚔️ ${attackerCountry.name} captured ${city.name} from ${defenderCountry.name}!\n` +
                  `• Attack: ${attackStrength} (effective strength with +${(attackerTechBonus * 100).toFixed(0)}% tech)\n` +
                  `• Defense: ${defenseStrength} (effective strength with +${(defenderTechBonus * 100).toFixed(0)}% tech + 20% terrain)\n` +
                  `• Combat Ratio: ${actualCombatRatio}:1\n` +
                  `• Losses: ${attackerCountry.name} -${combatResult.attackerLosses}, ${defenderCountry.name} -${combatResult.defenderLosses}${autoDefenseNote}`,
                data: {
                  attackerId,
                  defenderId,
                  cityId: targetCityId,
                  cityName: city.name,
                  attackerAllocation: attackStrength,
                  defenderAllocation: defenseStrength,
                  attackerEffective: attackStrength,
                  defenderEffective: adjustedDefenseStrength,
                  attackerLosses: combatResult.attackerLosses,
                  defenderLosses: combatResult.defenderLosses,
                  captured: true
                }
              });
            }
          } else {
            // Defense successful - just clear attack flag
            await supabase
              .from("cities")
              .update({ is_under_attack: false })
              .eq("id", targetCityId);
            
            // FIXED: allocatedStrength is already in effective terms (includes tech bonus)
            // The AttackModal and DefenseModal calculate allocatedStrength from effective military strength
            // So we should NOT re-apply tech bonuses here
            const attackerStats = state.data.countryStatsByCountryId[attackerId];
            const defenderStats = state.data.countryStatsByCountryId[defenderId];
            
            if (attackerStats && defenderStats) {
              // Get tech levels for display purposes only
              const attackerTechLevel = attackerStats.technologyLevel || 0;
              const defenderTechLevel = defenderStats.technologyLevel || 0;
              const attackerTechBonus = attackerTechLevel * 0.20; // 20% per level
              const defenderTechBonus = defenderTechLevel * 0.20;
              
              // The allocated strengths are already effective (tech-boosted)
              const attackStrength = actionData.allocatedStrength;
              const defenseStrength = combatResult.defenderAllocation;
              
              // CRITICAL FIX: Show the ACTUAL ratio used in combat (with terrain bonus applied)
              // CombatResolver applies 20% terrain bonus: adjustedDefender = defenseStrength * 1.2
              const TERRAIN_BONUS = 1.2;
              const adjustedDefenseStrength = defenseStrength * TERRAIN_BONUS;
              const actualCombatRatio = (attackStrength / adjustedDefenseStrength).toFixed(2);
              
              // Check if defender is player and didn't submit defense
              const hasPlayerDefense = actionData.defenseAllocation !== undefined && actionData.defenseAllocation !== null;
              const autoDefenseNote = (defenderCountry.isPlayerControlled && !hasPlayerDefense) 
                ? `\n• Note: Defense was automatically set to 50% of effective strength (no player response)` 
                : '';
              
              combatEvents.push({
                type: "action.military.defense",
                message: `🛡️🛡️ ${defenderCountry.name} defended ${city.name} against ${attackerCountry.name}!\n` +
                  `• Attack: ${attackStrength} (effective strength with +${(attackerTechBonus * 100).toFixed(0)}% tech)\n` +
                  `• Defense: ${defenseStrength} (effective strength with +${(defenderTechBonus * 100).toFixed(0)}% tech + 20% terrain)\n` +
                  `• Combat Ratio: ${actualCombatRatio}:1 (defender prevailed despite odds)\n` +
                  `• Losses: ${attackerCountry.name} -${combatResult.attackerLosses}, ${defenderCountry.name} -${combatResult.defenderLosses}${autoDefenseNote}`,
                data: {
                  attackerId,
                  defenderId,
                  cityId: targetCityId,
                  cityName: city.name,
                  attackerAllocation: attackStrength,
                  defenderAllocation: defenseStrength,
                  attackerEffective: attackStrength,
                  defenderEffective: adjustedDefenseStrength,
                  strengthRatio: parseFloat(actualCombatRatio),
                  attackerLosses: combatResult.attackerLosses,
                  defenderLosses: combatResult.defenderLosses,
                  captured: false
                }
              });
            }
          }
        }
      } else {
        // City not found - just clear the attack flag if it exists
        await supabase
          .from("cities")
          .update({ is_under_attack: false })
          .eq("id", targetCityId);
      }
    }
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
      }
      // Don't show generic "took military action" for attacks - they're handled separately
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
  // Include combat events with detailed outcomes
  const allEvents = [...combatEvents, ...actionSummaryEvents, ...result.events.filter(e => !e.type.startsWith('economic'))];

  // Persist: mark executed actions, update stats, store snapshot, advance turn.
  // OPTIMIZED: Batch all updates together
  if (result.executedActions.length) {
    // Get unique country IDs that had actions OR were involved in combat
    const actionCountryIds = new Set(result.executedActions.map(a => a.countryId));
    const combatCountryIds = new Set<string>();
    
    // Add all countries involved in combat (both attackers and defenders)
    if (result.combatResults) {
      for (const combatResult of result.combatResults) {
        const actionData = combatResult.attackAction.actionData as any;
        combatCountryIds.add(actionData.attackerId || combatResult.attackAction.countryId);
        if (actionData.defenderId) {
          combatCountryIds.add(actionData.defenderId);
        }
      }
      
      // Diplomatic fallout affects all countries when combat occurs
      if (result.combatResults.length > 0) {
        for (const country of state.data.countries) {
          combatCountryIds.add(country.id);
        }
      }
    }
    
    const affectedCountryIds = [...new Set([...actionCountryIds, ...combatCountryIds])];
    
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
      // This includes military losses from combat
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

