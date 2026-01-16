import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";

const CreateActionSchema = z.object({
  gameId: z.string().min(1),
  countryId: z.string().min(1),
  actionType: z.enum(["diplomacy", "military", "economic", "research"]),
  actionData: z.record(z.string(), z.unknown()),
  turn: z.number().int().positive(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  if (!json) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  
  const parsed = CreateActionSchema.safeParse(json);
  if (!parsed.success) {
    console.error("Action validation error:", parsed.error);
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { gameId, countryId, actionType, actionData, turn } = parsed.data;
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  console.log("[API Actions] Received action request:", {
    gameId,
    countryId,
    actionType,
    turn,
    gameIdValid: uuidRegex.test(gameId),
    countryIdValid: uuidRegex.test(countryId),
  });
  
  if (!uuidRegex.test(gameId)) {
    console.error("[API Actions] Invalid game ID format:", gameId);
    return NextResponse.json({ error: "Invalid game ID format" }, { status: 400 });
  }
  if (!uuidRegex.test(countryId)) {
    console.error("[API Actions] Invalid country ID format:", countryId);
    return NextResponse.json({ error: "Invalid country ID format" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServerClient();

    // Get the game's current turn - first verify game exists
    console.log("[API Actions] Looking for game:", {
      gameId,
      gameIdLength: gameId.length,
      gameIdType: typeof gameId,
      isValidUUID: uuidRegex.test(gameId),
    });
    
    const gameRes = await supabase
      .from("games")
      .select("id, current_turn, status")
      .eq("id", gameId)
      .maybeSingle(); // Use maybeSingle instead of single to avoid errors

    if (gameRes.error) {
      console.error("[API Actions] Game query error:", {
        gameId,
        error: gameRes.error,
        errorMessage: gameRes.error.message,
        errorCode: gameRes.error.code,
      });
      return NextResponse.json({ 
        error: `Database error: ${gameRes.error.message || 'Failed to query game'}` 
      }, { status: 500 });
    }

    if (!gameRes.data) {
      console.error("[API Actions] Game not found for ID:", gameId);
      
      // Double-check by trying to find any game with similar ID
      const allGames = await supabase
        .from("games")
        .select("id, name, created_at")
        .limit(10)
        .order("created_at", { ascending: false });
      
      console.log("[API Actions] Sample game IDs in database:", {
        totalFound: allGames.data?.length || 0,
        gameIds: allGames.data?.map(g => ({ id: g.id, name: g.name })) || [],
        requestedGameId: gameId,
      });
      
      // Also check if there are any games at all
      const gameCount = await supabase
        .from("games")
        .select("id", { count: "exact", head: true });
      
      console.log("[API Actions] Total games in database:", gameCount.count);
      
      return NextResponse.json({ 
        error: `Game not found. Game ID: ${gameId}` 
      }, { status: 404 });
    }

    console.log("[API Actions] Game found:", {
      gameId: gameRes.data.id,
      currentTurn: gameRes.data.current_turn,
      status: gameRes.data.status,
    });

    const gameTurn = gameRes.data.current_turn as number;

    // Get current stats to validate action - use the game's current turn
    const statsRes = await supabase
      .from("country_stats")
      .select("budget, technology_level, infrastructure_level, military_strength")
      .eq("country_id", countryId)
      .eq("turn", gameTurn)
      .single();

    let stats;
    if (statsRes.error || !statsRes.data) {
      // Try to get the latest stats if exact turn match fails
      const latestStatsRes = await supabase
        .from("country_stats")
        .select("budget, technology_level, infrastructure_level, military_strength")
        .eq("country_id", countryId)
        .order("turn", { ascending: false })
        .limit(1)
        .single();

      if (latestStatsRes.error || !latestStatsRes.data) {
        return NextResponse.json({ error: "Country stats not found" }, { status: 404 });
      }
      
      // Use latest stats but create action for current turn
      stats = latestStatsRes.data;
    } else {
      stats = statsRes.data;
    }

    let cost = 0;
    let validationError: string | null = null;

    // Calculate cost and validate based on action type
    if (actionType === "research") {
      // Technology upgrade cost: increases exponentially
      const currentLevel = Math.floor(Number(stats.technology_level));
      cost = Math.floor(500 * Math.pow(1.5, currentLevel));
      
      if (Number(stats.budget) < cost) {
        validationError = `Insufficient budget. Need $${cost.toLocaleString()}, have $${Number(stats.budget).toLocaleString()}`;
      }
    } else if (actionType === "economic") {
      const actionSubType = (actionData as any).subType;
      
      if (actionSubType === "infrastructure") {
        // Infrastructure upgrade cost
        const currentLevel = stats.infrastructure_level || 0;
        cost = Math.floor(ECONOMIC_BALANCE.INFRASTRUCTURE.BUILD_COST_BASE * Math.pow(ECONOMIC_BALANCE.INFRASTRUCTURE.BUILD_COST_MULTIPLIER, currentLevel));
        
        if (Number(stats.budget) < cost) {
          validationError = `Insufficient budget. Need $${cost.toLocaleString()}, have $${Number(stats.budget).toLocaleString()}`;
        }
      }
    } else if (actionType === "military") {
      const actionSubType = (actionData as any).subType;
      
      if (actionSubType === "recruit") {
        const amount = (actionData as any).amount || 1;
        cost = amount * 100; // 100 per military strength point
        
        if (Number(stats.budget) < cost) {
          validationError = `Insufficient budget. Need $${cost.toLocaleString()}, have $${Number(stats.budget).toLocaleString()}`;
        }
      }
    }

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Create the action - use game's current turn, not the passed turn
    const now = new Date().toISOString();
    const inserted = await supabase
      .from("actions")
      .insert({
        game_id: gameId,
        country_id: countryId,
        turn: gameTurn,
        action_type: actionType,
        action_data: { ...actionData, cost },
        status: "pending",
        created_at: now,
      })
      .select("id, game_id, country_id, turn, action_type, action_data, status, created_at")
      .single();

    if (inserted.error) {
      console.error("[API Actions] Failed to create action:", {
        gameId,
        countryId,
        actionType,
        error: inserted.error,
        errorMessage: inserted.error.message,
        errorCode: inserted.error.code,
      });
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }

    console.log("[API Actions] Action created successfully:", {
      actionId: inserted.data.id,
      gameId: inserted.data.game_id,
      countryId: inserted.data.country_id,
      actionType: inserted.data.action_type,
      turn: inserted.data.turn,
      cost,
    });

    return NextResponse.json({
      action: {
        id: inserted.data.id,
        gameId: inserted.data.game_id,
        countryId: inserted.data.country_id,
        turn: inserted.data.turn,
        actionType: inserted.data.action_type,
        actionData: inserted.data.action_data,
        status: inserted.data.status,
        createdAt: inserted.data.created_at,
      },
      cost,
    });
  } catch (error) {
    console.error("[API Actions] Error creating action:", {
      gameId,
      countryId,
      actionType,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create action" },
      { status: 500 }
    );
  }
}
