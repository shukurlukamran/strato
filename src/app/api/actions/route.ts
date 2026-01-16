import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ECONOMIC_BALANCE } from "@/lib/game-engine/EconomicBalance";

const CreateActionSchema = z.object({
  gameId: z.string().min(1),
  countryId: z.string().min(1),
  actionType: z.enum(["diplomacy", "military", "economic", "research"]),
  actionData: z.record(z.unknown()),
  turn: z.number().int().positive(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateActionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { gameId, countryId, actionType, actionData, turn } = parsed.data;

  try {
    const supabase = getSupabaseServerClient();

    // Get current stats to validate action
    const statsRes = await supabase
      .from("country_stats")
      .select("budget, technology_level, infrastructure_level, military_strength")
      .eq("country_id", countryId)
      .eq("turn", turn)
      .single();

    if (statsRes.error || !statsRes.data) {
      return NextResponse.json({ error: "Country stats not found" }, { status: 404 });
    }

    const stats = statsRes.data;
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

    // Create the action
    const now = new Date().toISOString();
    const inserted = await supabase
      .from("actions")
      .insert({
        game_id: gameId,
        country_id: countryId,
        turn,
        action_type: actionType,
        action_data: { ...actionData, cost },
        status: "pending",
        created_at: now,
      })
      .select("id, game_id, country_id, turn, action_type, action_data, status, created_at")
      .single();

    if (inserted.error) {
      console.error("Failed to create action:", inserted.error);
      return NextResponse.json({ error: inserted.error.message }, { status: 500 });
    }

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
    console.error("Error creating action:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create action" },
      { status: 500 }
    );
  }
}
