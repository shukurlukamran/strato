import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";
import { 
  getProfileTechCostModifier, 
  getProfileInfraCostModifier 
} from "@/lib/game-engine/ProfileModifiers";
import { MilitaryCalculator } from "@/lib/game-engine/MilitaryCalculator";
import { ResourceCost } from "@/lib/game-engine/ResourceCost";
import type { ResourceProfile } from "@/lib/game-engine/ResourceProfile";

const ActionRequestSchema = z.object({
  gameId: z.string().uuid(),
  countryId: z.string().uuid(),
  actionType: z.enum(["research", "infrastructure", "military"]),
  amount: z.number().min(5).max(50).optional(), // Optional military amount (5-50, multiples of 5)
});

/**
 * GET endpoint to fetch actions
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId");
  const turn = searchParams.get("turn");
  const status = searchParams.get("status");

  if (!gameId) {
    return NextResponse.json({ error: "gameId is required" }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("actions")
    .select("id, game_id, country_id, turn, action_type, action_data, status, created_at")
    .eq("game_id", gameId);

  if (turn) {
    query = query.eq("turn", parseInt(turn));
  }

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ actions: data ?? [] });
}

export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    if (!json) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    
    const parsed = ActionRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { gameId, countryId, actionType, amount } = parsed.data;
    const supabase = getSupabaseServerClient();

    // Get the game's current turn
    const gameRes = await supabase
      .from("games")
      .select("current_turn, status")
      .eq("id", gameId)
      .limit(1);

    if (gameRes.error) {
      console.error("[Actions API] Game query error:", { gameId, error: gameRes.error });
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (!gameRes.data || gameRes.data.length === 0) {
      console.error("[Actions API] Game not found (no data):", { gameId });
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Take the first result if multiple exist (shouldn't happen with primary key, but handle it)
    const game = gameRes.data[0];
    if (gameRes.data.length > 1) {
      console.warn("[Actions API] Multiple games found with same ID (taking first):", {
        gameId,
        count: gameRes.data.length,
      });
    }

    const currentTurn = game.current_turn as number;

    // Get current country stats for the current turn (including resource_profile for modifiers and resources)
    const statsRes = await supabase
      .from("country_stats")
      .select("id, turn, budget, technology_level, infrastructure_level, military_strength, resource_profile, resources")
      .eq("country_id", countryId)
      .eq("turn", currentTurn)
      .limit(1);

    if (statsRes.error) {
      console.error("[Actions API] Country stats query error:", { countryId, currentTurn, error: statsRes.error });
      return NextResponse.json({ error: "Country stats not found" }, { status: 404 });
    }

    if (!statsRes.data || statsRes.data.length === 0) {
      console.error("[Actions API] Country stats not found (no data):", { countryId, currentTurn });
      return NextResponse.json({ error: "Country stats not found" }, { status: 404 });
    }

    // Take the first result if multiple exist
    const stats = statsRes.data[0];
    if (statsRes.data.length > 1) {
      console.warn("[Actions API] Multiple stats found for same country/turn (taking first):", {
        countryId,
        currentTurn,
        count: statsRes.data.length,
      });
    }
    const statsId = stats.id;
    const currentBudget = Number(stats.budget);
    const currentResources = (stats.resources as Record<string, number>) || {};

    // Define action costs and effects
    let cost = 0;
    let newStats: Partial<typeof stats> = {};
    let resourceCostInfo: { required: any[]; missing: any[]; shortage: boolean; penaltyMultiplier: number } | null = null;
    
    // Parse resource profile for modifiers
    const resourceProfile = stats.resource_profile as ResourceProfile | null;
    
    // Helper to build CountryStats object for resource checks
    const countryStats = {
      technologyLevel: Number(stats.technology_level),
      infrastructureLevel: stats.infrastructure_level || 0,
      militaryStrength: stats.military_strength,
      resourceProfile: resourceProfile,
      population: 0, // Not needed for cost calculation
      budget: currentBudget,
      resources: currentResources,
    } as any;

    switch (actionType) {
      case "research": {
        const techLevel = Math.floor(Number(stats.technology_level));
        
        // Check resource requirements
        const requiredResources = ResourceCost.calculateResearchResourceCost(countryStats);
        resourceCostInfo = ResourceCost.checkResourceAffordability(requiredResources, currentResources);
        
        // NEW FORMULA: Base cost with exponential growth
        const baseCost = ECONOMIC_BALANCE.UPGRADES.TECH_BASE_COST * 
                        Math.pow(ECONOMIC_BALANCE.UPGRADES.TECH_COST_MULTIPLIER, techLevel);
        
        // Profile modifier (e.g., Tech Hub gets 25% discount)
        const profileModifier = getProfileTechCostModifier(resourceProfile);
        
        // Research speed bonus (higher tech makes further research slightly cheaper)
        const researchBonus = Math.min(
          ECONOMIC_BALANCE.TECHNOLOGY.MAX_RESEARCH_SPEED_BONUS,
          techLevel * ECONOMIC_BALANCE.TECHNOLOGY.RESEARCH_SPEED_BONUS_PER_LEVEL
        );
        const researchModifier = 1 - researchBonus;
        
        // Apply resource shortage penalty (increases cost if missing resources)
        const resourcePenalty = resourceCostInfo.penaltyMultiplier;
        
        cost = Math.floor(baseCost * profileModifier * researchModifier * resourcePenalty);
        
        if (currentBudget < cost) {
          const message = resourceCostInfo.shortage 
            ? `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}. (Cost increased by ${((resourcePenalty - 1) * 100).toFixed(0)}% due to resource shortage)`
            : `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}`;
          return NextResponse.json({ error: message }, { status: 400 });
        }
        
        // Deduct resources if available
        let updatedResources = currentResources;
        if (resourceCostInfo.canAfford) {
          updatedResources = ResourceCost.deductResources(currentResources, requiredResources);
        }
        
        newStats = {
          budget: currentBudget - cost,
          technology_level: Number(stats.technology_level) + 1,
          resources: updatedResources,
        };
        break;
      }

      case "infrastructure": {
        const infraLevel = stats.infrastructure_level || 0;
        
        // Check resource requirements
        const requiredResources = ResourceCost.calculateInfrastructureResourceCost(countryStats);
        resourceCostInfo = ResourceCost.checkResourceAffordability(requiredResources, currentResources);
        
        // NEW FORMULA: Base cost with exponential growth
        const baseCost = ECONOMIC_BALANCE.UPGRADES.INFRA_BASE_COST * 
                        Math.pow(ECONOMIC_BALANCE.UPGRADES.INFRA_COST_MULTIPLIER, infraLevel);
        
        // Profile modifier (e.g., Industrial Complex gets 20% discount)
        const profileModifier = getProfileInfraCostModifier(resourceProfile);
        
        // Apply resource shortage penalty
        const resourcePenalty = resourceCostInfo.penaltyMultiplier;
        
        cost = Math.floor(baseCost * profileModifier * resourcePenalty);
        
        if (currentBudget < cost) {
          const message = resourceCostInfo.shortage 
            ? `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}. (Cost increased by ${((resourcePenalty - 1) * 100).toFixed(0)}% due to resource shortage)`
            : `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}`;
          return NextResponse.json({ error: message }, { status: 400 });
        }
        
        // Deduct resources if available
        let updatedResources = currentResources;
        if (resourceCostInfo.canAfford) {
          updatedResources = ResourceCost.deductResources(currentResources, requiredResources);
        }
        
        newStats = {
          budget: currentBudget - cost,
          infrastructure_level: infraLevel + 1,
          resources: updatedResources,
        };
        break;
      }

      case "military": {
        // Use amount from request or default to 10
        const militaryAmount = amount && amount >= 5 && amount <= 50 && amount % 5 === 0 ? amount : 10;
        
        // Check resource requirements
        const requiredResources = ResourceCost.calculateMilitaryResourceCost(militaryAmount, countryStats);
        resourceCostInfo = ResourceCost.checkResourceAffordability(requiredResources, currentResources);
        
        // Base cost calculation with tech and profile modifiers
        const baseCost = MilitaryCalculator.calculateRecruitmentCost(militaryAmount, countryStats);
        
        // Apply resource shortage penalty
        const resourcePenalty = resourceCostInfo.penaltyMultiplier;
        
        cost = Math.floor(baseCost * resourcePenalty);
        
        if (currentBudget < cost) {
          const message = resourceCostInfo.shortage 
            ? `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}. (Cost increased by ${((resourcePenalty - 1) * 100).toFixed(0)}% due to resource shortage)`
            : `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}`;
          return NextResponse.json({ error: message }, { status: 400 });
        }
        
        // Deduct resources if available
        let updatedResources = currentResources;
        if (resourceCostInfo.canAfford) {
          updatedResources = ResourceCost.deductResources(currentResources, requiredResources);
        }
        
        newStats = {
          budget: currentBudget - cost,
          military_strength: stats.military_strength + militaryAmount,
          resources: updatedResources,
        };
        break;
      }
    }

    // Update stats in database using the specific stats ID
    const updateRes = await supabase
      .from("country_stats")
      .update(newStats)
      .eq("id", statsId)
      .select()
      .limit(1);

    if (updateRes.error) {
      console.error("Failed to update stats:", updateRes.error);
      return NextResponse.json({ error: "Failed to update stats" }, { status: 500 });
    }

    if (!updateRes.data || updateRes.data.length === 0) {
      console.error("Failed to update stats: no data returned", { statsId });
      return NextResponse.json({ error: "Failed to update stats" }, { status: 500 });
    }

    // Log the action to the actions table for history tracking
    try {
      // Get country name for better logging
      const countryRes = await supabase
        .from("countries")
        .select("name")
        .eq("id", countryId)
        .limit(1);
      
      const countryName = countryRes.data?.[0]?.name || "Unknown Country";
      
      // Map action types to database enum values
      // Database enum: 'diplomacy','military','economic','research'
      let dbActionType: string;
      let subType: string | undefined;
      
      if (actionType === "infrastructure") {
        dbActionType = "economic";
        subType = "infrastructure";
      } else if (actionType === "military") {
        dbActionType = "military";
        subType = "recruit";
      } else {
        dbActionType = actionType;
        subType = actionType;
      }
      
      // Record the action
      await supabase.from("actions").insert({
        game_id: gameId,
        country_id: countryId,
        turn: currentTurn,
        action_type: dbActionType as any,
        action_data: {
          subType: subType,
          cost,
          amount: actionType === "military" ? (amount || 10) : undefined,
          timestamp: new Date().toISOString(),
          immediate: true, // Flag to indicate this was an immediate action, not turn-based
        },
        status: "executed",
      });
      
      console.log(`[Actions API] Recorded action: ${countryName} performed ${actionType} (saved as ${dbActionType})`);
    } catch (error) {
      // Don't fail the request if logging fails
      console.error("[Actions API] Failed to log action:", error);
    }

    return NextResponse.json({
      success: true,
      cost,
      resourceCost: resourceCostInfo,
      updatedStats: {
        budget: newStats.budget,
        technologyLevel: newStats.technology_level,
        infrastructureLevel: newStats.infrastructure_level,
        militaryStrength: newStats.military_strength,
        resources: newStats.resources,
      },
    });
  } catch (error) {
    console.error("Action error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process action" },
      { status: 500 }
    );
  }
}
