import { NextResponse } from "next/server";
import { z } from "zod";
import { DealExtractor } from "@/lib/deals/DealExtractor";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { executeDealTerms } from "@/lib/deals/DealExecutorHelper";

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

    // Automatically create and execute the deal
    const supabase = getSupabaseServerClient();
    
    // Get current turn
    const gameRes = await supabase
      .from("games")
      .select("current_turn")
      .eq("id", gameId)
      .single();
    
    if (gameRes.error) {
      console.error("Failed to fetch game turn:", gameRes.error);
      return NextResponse.json({
        deal: result,
        message: "Deal extracted but failed to create (could not fetch game turn)",
        warning: true,
      });
    }

    const currentTurn = gameRes.data.current_turn as number;
    const now = new Date().toISOString();

    // Calculate expiration turn (default: 5 turns for alliances, 1 turn for trades)
    const defaultDuration = result.dealType === "alliance" || result.dealType === "non_aggression" ? 5 : 1;
    const maxDuration = Math.max(
      ...result.dealTerms.proposerCommitments.map((c) => c.durationTurns || 1),
      ...result.dealTerms.receiverCommitments.map((c) => c.durationTurns || 1),
      defaultDuration
    );
    const turnExpires = currentTurn + maxDuration;

    // Create deal with status "accepted" (both parties agreed in chat)
    const dealInsert = await supabase
      .from("deals")
      .insert({
        game_id: gameId,
        proposing_country_id: countryAId,
        receiving_country_id: countryBId,
        deal_type: result.dealType,
        deal_terms: result.dealTerms,
        status: "accepted", // Automatically accepted since extracted from agreed conversation
        proposed_at: now,
        accepted_at: now, // Immediately accepted
        expires_at: null, // Will be set when activated
        turn_created: currentTurn,
        turn_expires: turnExpires,
        created_at: now,
        updated_at: now,
      })
      .select("id, game_id, proposing_country_id, receiving_country_id, deal_type, deal_terms, status, proposed_at, accepted_at, expires_at, turn_created, turn_expires, created_at, updated_at")
      .single();

    if (dealInsert.error) {
      console.error("Failed to create deal:", dealInsert.error);
      return NextResponse.json({
        deal: result,
        message: "Deal extracted but failed to create in database",
        warning: true,
      });
    }

    // Execute deal terms immediately (transfer resources, budget, etc.)
    const executionResult = await executeDealTerms(
      gameId,
      currentTurn,
      countryAId,
      countryBId,
      result.dealTerms
    );

    if (!executionResult.success) {
      console.error("Failed to execute deal terms:", executionResult.errors);
      // Still return the deal, but with a warning
      return NextResponse.json({
        deal: result,
        createdDeal: dealInsert.data,
        message: "Deal created but some terms failed to execute",
        executionErrors: executionResult.errors,
        warning: true,
      });
    }

    // Update deal status to "active" after successful execution
    await supabase
      .from("deals")
      .update({ 
        status: "active",
        updated_at: new Date().toISOString()
      })
      .eq("id", dealInsert.data.id);

    console.log(`Deal ${dealInsert.data.id} automatically created, accepted, and executed`);

    return NextResponse.json({
      deal: result,
      createdDeal: {
        id: dealInsert.data.id,
        gameId: dealInsert.data.game_id,
        proposingCountryId: dealInsert.data.proposing_country_id,
        receivingCountryId: dealInsert.data.receiving_country_id,
        dealType: dealInsert.data.deal_type,
        dealTerms: dealInsert.data.deal_terms,
        status: "active", // Updated status
        proposedAt: dealInsert.data.proposed_at,
        acceptedAt: dealInsert.data.accepted_at,
        expiresAt: dealInsert.data.expires_at,
        turnCreated: dealInsert.data.turn_created,
        turnExpires: dealInsert.data.turn_expires,
        createdAt: dealInsert.data.created_at,
        updatedAt: dealInsert.data.updated_at,
      },
      message: "Deal extracted, automatically confirmed, and implemented successfully",
      executed: true,
    });
  } catch (error) {
    console.error("Deal extraction error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to extract deal";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
