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
      .single();

    if (gameRes.error || !gameRes.data) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const currentTurn = gameRes.data.current_turn as number;

    // Get current country stats
    const statsRes = await supabase
      .from("country_stats")
      .select("budget, technology_level, infrastructure_level, military_strength")
      .eq("country_id", countryId)
      .eq("turn", currentTurn)
      .single();

    if (statsRes.error || !statsRes.data) {
      return NextResponse.json({ error: "Country stats not found" }, { status: 404 });
    }

    const stats = statsRes.data;
    const currentBudget = Number(stats.budget);

    // Define action costs and effects
    let cost = 0;
    let newStats: Partial<typeof stats> = {};

    switch (actionType) {
      case "research": {
        const techLevel = Math.floor(Number(stats.technology_level));
        cost = Math.floor(1000 * Math.pow(1.3, techLevel));
        
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
        cost = Math.floor(800 * Math.pow(1.25, infraLevel));
        
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

    // Update stats in database
    const updateRes = await supabase
      .from("country_stats")
      .update(newStats)
      .eq("country_id", countryId)
      .eq("turn", currentTurn)
      .select()
      .single();

    if (updateRes.error) {
      console.error("Failed to update stats:", updateRes.error);
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
