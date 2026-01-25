import { NextResponse } from "next/server";
import { z } from "zod";
import { DealExtractor } from "@/lib/deals/DealExtractor";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const ExtractDealSchema = z.object({
  gameId: z.string().uuid(),
  chatId: z.string().uuid(),
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

  const parsed = ExtractDealSchema.safeParse(json);
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

  const { gameId, chatId, countryAId, countryBId } = parsed.data;

  // Verify both countries belong to the game
  const supabase = getSupabaseServerClient();
  const countriesRes = await supabase
    .from("countries")
    .select("id")
    .eq("game_id", gameId)
    .in("id", [countryAId, countryBId]);

  if (countriesRes.error || !countriesRes.data || countriesRes.data.length !== 2) {
    return NextResponse.json({ error: "One or both countries do not belong to this game" }, { status: 403 });
  }

  try {
    const extractor = new DealExtractor();
    const result = await extractor.extractDealFromChat(gameId, chatId, countryAId, countryBId);

    if (!result) {
      return NextResponse.json({
        deal: null,
        message: "No deal detected in the conversation",
      });
    }
    // IMPORTANT: Do NOT auto-create/execute deals on extraction.
    // Extraction is a "draft" step; the player must explicitly confirm.
    return NextResponse.json({
      deal: result,
      message: "Deal extracted. Click Confirm to finalize and execute.",
      executed: false,
    });
  } catch (error) {
    console.error("Deal extraction error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to extract deal";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
