import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const GetOrCreateChatSchema = z.object({
  gameId: z.string().uuid(),
  countryAId: z.string().uuid(),
  countryBId: z.string().uuid(),
});

export async function POST(req: Request) {
  let json;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const parsed = GetOrCreateChatSchema.safeParse(json);
  if (!parsed.success) {
    const errors = parsed.error.flatten();
    const errorMessage =
      errors.formErrors?.length > 0
        ? errors.formErrors.join(", ")
        : Object.values(errors.fieldErrors)
            .flat()
            .join(", ") || "Validation failed";
    return NextResponse.json({ error: errorMessage, details: errors }, { status: 400 });
  }

  const { gameId, countryAId, countryBId } = parsed.data;

  try {
    const supabase = getSupabaseServerClient();

    // Try to find existing chat - check both possible orderings
    const chatRes1 = await supabase
      .from("diplomacy_chats")
      .select("id")
      .eq("game_id", gameId)
      .eq("country_a_id", countryAId)
      .eq("country_b_id", countryBId)
      .maybeSingle();

    if (chatRes1.data) {
      return NextResponse.json({ chatId: chatRes1.data.id });
    }

    const chatRes2 = await supabase
      .from("diplomacy_chats")
      .select("id")
      .eq("game_id", gameId)
      .eq("country_a_id", countryBId)
      .eq("country_b_id", countryAId)
      .maybeSingle();

    if (chatRes2.data) {
      return NextResponse.json({ chatId: chatRes2.data.id });
    }

    // Create a new chat if it doesn't exist
    const newChatRes = await supabase
      .from("diplomacy_chats")
      .insert({
        game_id: gameId,
        country_a_id: countryAId,
        country_b_id: countryBId,
      })
      .select("id")
      .single();

    if (newChatRes.error) {
      console.error("Failed to create chat:", newChatRes.error);
      return NextResponse.json(
        { error: `Failed to create chat: ${newChatRes.error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ chatId: newChatRes.data.id });
  } catch (error) {
    console.error("Error getting or creating chat:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to get or create chat";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
