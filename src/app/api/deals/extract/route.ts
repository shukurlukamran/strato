// In your /api/deals/extract route file
export async function POST(request: Request) {
  const body = await request.json();
  const { gameId, chatId, countryAId, countryBId } = body;

  // ⭐ ADD THIS DEBUG LOGGING ⭐
  console.log("=== EXTRACT API CALLED ===");
  console.log("Request body:", { gameId, chatId, countryAId, countryBId });
  
  // Verify the chatId matches what's in the UI
  const supabase = getSupabaseServerClient();
  const { data: messages, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("chat_id", chatId);
  
  console.log("Messages found in DB:", messages?.length || 0);
  if (messages && messages.length > 0) {
    console.log("Sample message:", messages[0]);
  }
  console.log("Query error:", error);
  console.log("=== END EXTRACT API DEBUG ===");

  const extractor = new DealExtractor();
  const result = await extractor.extractDealFromChat(gameId, chatId, countryAId, countryBId);
  
import { NextResponse } from "next/server";
import { z } from "zod";
import { DealExtractor } from "@/lib/deals/DealExtractor";

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

  try {
    const extractor = new DealExtractor();
    const result = await extractor.extractDealFromChat(gameId, chatId, countryAId, countryBId);

    if (!result) {
      return NextResponse.json({
        deal: null,
        message: "No deal detected in the conversation",
      });
    }

    return NextResponse.json({
      deal: result,
      message: "Deal extracted successfully",
    });
  } catch (error) {
    console.error("Deal extraction error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to extract deal";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
  // ... rest of your code
}