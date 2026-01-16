import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    
    // Get the most recent games
    const gamesRes = await supabase
      .from("games")
      .select("id, name, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (gamesRes.error) {
      console.error("[API Game List] Error fetching games:", gamesRes.error);
      return NextResponse.json({ 
        error: "Failed to fetch games",
        games: []
      }, { status: 500 });
    }

    console.log("[API Game List] Found games:", {
      count: gamesRes.data?.length || 0,
      games: gamesRes.data?.map(g => ({ id: g.id, name: g.name })) || [],
    });

    return NextResponse.json({
      games: gamesRes.data?.map(g => ({
        id: g.id,
        name: g.name,
        createdAt: g.created_at,
        updatedAt: g.updated_at,
      })) || [],
    });
  } catch (error) {
    console.error("[API Game List] Error:", error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : "Failed to fetch games",
      games: []
    }, { status: 500 });
  }
}
