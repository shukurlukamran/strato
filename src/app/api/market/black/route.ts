import { NextResponse } from "next/server";
import { z } from "zod";
import { MarketPricing } from "@/lib/game-engine/MarketPricing";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const BlackMarketRequestSchema = z.object({
  gameId: z.string().uuid(),
  countryId: z.string().uuid(),
  side: z.enum(["buy", "sell"]),
  resourceId: z.string(),
  amount: z.number().int().positive(),
});

/**
 * POST /api/market/black
 * Execute black market buy/sell transactions
 */
export async function POST(req: Request) {
  try {
    const json = await req.json().catch(() => null);
    if (!json) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const parsed = BlackMarketRequestSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { gameId, countryId, side, resourceId, amount } = parsed.data;
    const supabase = getSupabaseServerClient();

    // Verify country belongs to game
    const countryGameRes = await supabase
      .from("countries")
      .select("id")
      .eq("id", countryId)
      .eq("game_id", gameId)
      .limit(1);

    if (countryGameRes.error || !countryGameRes.data || countryGameRes.data.length === 0) {
      return NextResponse.json({ error: "Country does not belong to this game" }, { status: 403 });
    }

    // Get the game's current turn
    const gameRes = await supabase
      .from("games")
      .select("current_turn, status")
      .eq("id", gameId)
      .limit(1);

    if (gameRes.error) {
      console.error("[Black Market API] Game query error:", { gameId, error: gameRes.error });
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (!gameRes.data || gameRes.data.length === 0) {
      console.error("[Black Market API] Game not found (no data):", { gameId });
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const game = gameRes.data[0];
    const currentTurn = game.current_turn as number;

    // Get current country stats
    const statsRes = await supabase
      .from("country_stats")
      .select("id, budget, resources")
      .eq("country_id", countryId)
      .eq("turn", currentTurn)
      .limit(1);

    if (statsRes.error) {
      console.error("[Black Market API] Country stats query error:", { countryId, currentTurn, error: statsRes.error });
      return NextResponse.json({ error: "Country stats not found" }, { status: 404 });
    }

    if (!statsRes.data || statsRes.data.length === 0) {
      console.error("[Black Market API] Country stats not found (no data):", { countryId, currentTurn });
      return NextResponse.json({ error: "Country stats not found" }, { status: 404 });
    }

    const stats = statsRes.data[0];
    const statsId = stats.id;
    const currentBudget = Number(stats.budget);
    const currentResources = (stats.resources as Record<string, number>) || {};

    // Get country name for logging
    const countryRes = await supabase
      .from("countries")
      .select("name")
      .eq("id", countryId)
      .limit(1);

    const countryName = countryRes.data?.[0]?.name || "Unknown Country";

    // Compute current market prices
    const marketPrices = await MarketPricing.computeMarketPricesForGame(gameId, currentTurn);

    if (side === "buy") {
      const unitPrice = marketPrices.blackMarketBuyPrices[resourceId];
      if (!unitPrice) {
        return NextResponse.json({ error: `Invalid resource: ${resourceId}` }, { status: 400 });
      }

      const cost = amount * unitPrice;

      // Validate transaction
      if (currentBudget < cost) {
        return NextResponse.json({
          error: `Insufficient budget. Need $${cost.toLocaleString()}, have $${currentBudget.toLocaleString()}.`
        }, { status: 400 });
      }

      // Execute transaction
      const newBudget = currentBudget - cost;
      const newResources = { ...currentResources };
      newResources[resourceId] = (newResources[resourceId] || 0) + amount;

      // Update stats
      const updateRes = await supabase
        .from("country_stats")
        .update({
          budget: newBudget,
          resources: newResources
        })
        .eq("id", statsId)
        .select();

      if (updateRes.error) {
        console.error("[Black Market API] Failed to update stats for buy:", updateRes.error);
        return NextResponse.json({ error: "Failed to complete transaction" }, { status: 500 });
      }

      // Log transaction
      await logBlackMarketTransaction(supabase, {
        gameId,
        countryId,
        turn: currentTurn,
        side: "buy",
        resourceId,
        amount,
        unitPrice,
        totalCost: cost
      });

      // Turn history logging is handled by the turn processing API

      return NextResponse.json({
        success: true,
        side: "buy",
        resourceId,
        amount,
        unitPrice,
        totalCost: cost,
        newBudget,
        newResources
      });

    } else { // sell
      const unitPrice = marketPrices.blackMarketSellPrices[resourceId];
      if (!unitPrice) {
        return NextResponse.json({ error: `Invalid resource: ${resourceId}` }, { status: 400 });
      }

      const revenue = amount * unitPrice;
      const availableAmount = currentResources[resourceId] || 0;

      // Validate transaction
      if (availableAmount < amount) {
        return NextResponse.json({
          error: `Insufficient resources. Need ${amount}x ${resourceId}, have ${availableAmount}x.`
        }, { status: 400 });
      }

      // Execute transaction
      const newBudget = currentBudget + revenue;
      const newResources = { ...currentResources };
      newResources[resourceId] = availableAmount - amount;

      // Update stats
      const updateRes = await supabase
        .from("country_stats")
        .update({
          budget: newBudget,
          resources: newResources
        })
        .eq("id", statsId)
        .select();

      if (updateRes.error) {
        console.error("[Black Market API] Failed to update stats for sell:", updateRes.error);
        return NextResponse.json({ error: "Failed to complete transaction" }, { status: 500 });
      }

      // Log transaction
      await logBlackMarketTransaction(supabase, {
        gameId,
        countryId,
        turn: currentTurn,
        side: "sell",
        resourceId,
        amount,
        unitPrice,
        totalCost: revenue
      });

      // Turn history logging is handled by the turn processing API

      return NextResponse.json({
        success: true,
        side: "sell",
        resourceId,
        amount,
        unitPrice,
        totalRevenue: revenue,
        newBudget,
        newResources
      });
    }

  } catch (error) {
    console.error("[Black Market API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to process black market transaction" },
      { status: 500 }
    );
  }
}

/**
 * Log black market transaction to actions table
 */
async function logBlackMarketTransaction(
  supabase: any,
  params: {
    gameId: string;
    countryId: string;
    turn: number;
    side: "buy" | "sell";
    resourceId: string;
    amount: number;
    unitPrice: number;
    totalCost: number;
  }
) {
  try {
    await supabase.from("actions").insert({
      game_id: params.gameId,
      country_id: params.countryId,
      turn: params.turn,
      action_type: 'market',
      action_data: {
        subType: 'black_market',
        side: params.side,
        resourceId: params.resourceId,
        amount: params.amount,
        unitPrice: params.unitPrice,
        totalCost: params.totalCost,
        immediate: true
      },
      status: "executed",
    });
  } catch (error) {
    console.error("[Black Market API] Failed to log transaction:", error);
    // Don't fail the transaction if logging fails
  }
}
