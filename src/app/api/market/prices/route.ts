import { NextResponse } from "next/server";
import { z } from "zod";
import { MarketPricing } from "@/lib/game-engine/MarketPricing";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const PricesRequestSchema = z.object({
  gameId: z.string().uuid(),
});

/**
 * GET /api/market/prices?gameId=<uuid>
 * Returns current market prices and black market rates for the current turn
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const gameId = searchParams.get("gameId");

    if (!gameId) {
      return NextResponse.json({ error: "gameId parameter is required" }, { status: 400 });
    }

    // Validate gameId format
    const parsed = PricesRequestSchema.safeParse({ gameId });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid gameId format" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    // Get the game's current turn
    const gameRes = await supabase
      .from("games")
      .select("current_turn, status")
      .eq("id", gameId)
      .limit(1);

    if (gameRes.error) {
      console.error("[Market Prices API] Game query error:", { gameId, error: gameRes.error });
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (!gameRes.data || gameRes.data.length === 0) {
      console.error("[Market Prices API] Game not found (no data):", { gameId });
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const game = gameRes.data[0];
    const currentTurn = game.current_turn as number;

    // Compute market prices for this game and turn
    const marketPrices = await MarketPricing.computeMarketPricesForGame(gameId, currentTurn);

    return NextResponse.json(marketPrices);

  } catch (error) {
    console.error("[Market Prices API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch market prices" },
      { status: 500 }
    );
  }
}