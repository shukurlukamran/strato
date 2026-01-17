import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const ActionRequestSchema = z.object({
  gameId: z.string().uuid(),
  countryId: z.string().uuid(),
  actionType: z.enum(["research", "infrastructure", "military"]),
});

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

    const { gameId, countryId, actionType } = parsed.data;
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

    // Get current country stats for the current turn
    const statsRes = await supabase
      .from("country_stats")
      .select("id, turn, budget, technology_level, infrastructure_level, military_strength")
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

    // Define action costs and effects
    let cost = 0;
    let newStats: Partial<typeof stats> = {};

    switch (actionType) {
      case "research": {
        const techLevel = Math.floor(Number(stats.technology_level));
        cost = Math.floor(500 * Math.pow(1.4, techLevel)); // Lower base, steeper curve
        
        if (currentBudget < cost) {
          return NextResponse.json({ 
            error: `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}` 
          }, { status: 400 });
        }
        
        newStats = {
          budget: currentBudget - cost,
          technology_level: Number(stats.technology_level) + 1,
        };
        break;
      }

      case "infrastructure": {
        const infraLevel = stats.infrastructure_level || 0;
        cost = Math.floor(600 * Math.pow(1.3, infraLevel)); // Slightly cheaper
        
        if (currentBudget < cost) {
          return NextResponse.json({ 
            error: `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}` 
          }, { status: 400 });
        }
        
        newStats = {
          budget: currentBudget - cost,
          infrastructure_level: infraLevel + 1,
        };
        break;
      }

      case "military": {
        cost = 500; // Cost per military unit
        
        if (currentBudget < cost) {
          return NextResponse.json({ 
            error: `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}` 
          }, { status: 400 });
        }
        
        newStats = {
          budget: currentBudget - cost,
          military_strength: stats.military_strength + 10, // Add 10 strength
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

    return NextResponse.json({
      success: true,
      cost,
      updatedStats: {
        budget: newStats.budget,
        technologyLevel: newStats.technology_level,
        infrastructureLevel: newStats.infrastructure_level,
        militaryStrength: newStats.military_strength,
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
