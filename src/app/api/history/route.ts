import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const GetHistorySchema = z.object({
  gameId: z.string().uuid(),
  turn: z.coerce.number().int().positive(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const gameId = url.searchParams.get("gameId");
    const turn = url.searchParams.get("turn");

    const parsed = GetHistorySchema.safeParse({ gameId, turn });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    // Fetch turn history for the specified turn
    const historyRes = await supabase
      .from("turn_history")
      .select("turn, events, created_at")
      .eq("game_id", parsed.data.gameId)
      .eq("turn", parsed.data.turn)
      .limit(1);

    if (historyRes.error) {
      console.error("[History API] Query error:", historyRes.error);
      return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
    }

    if (!historyRes.data || historyRes.data.length === 0) {
      // No history found for this turn (might be turn 1 or history not created yet)
      return NextResponse.json({
        history: {
          turn: parsed.data.turn,
          events: [],
          createdAt: new Date().toISOString(),
        },
      });
    }

    const history = historyRes.data[0];

    return NextResponse.json({
      history: {
        turn: history.turn,
        events: history.events || [],
        createdAt: history.created_at,
      },
    });
  } catch (error) {
    console.error("[History API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch history" },
      { status: 500 }
    );
  }
}
