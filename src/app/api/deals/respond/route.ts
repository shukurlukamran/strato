import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { executeDealTerms } from "@/lib/deals/DealExecutorHelper";

const RespondToDealSchema = z.object({
  dealId: z.string().min(1),
  action: z.enum(["accept", "reject"]),
  respondingCountryId: z.string().min(1),
});

export async function POST(req: Request) {
  let json;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const parsed = RespondToDealSchema.safeParse(json);
  if (!parsed.success) {
    const errors = parsed.error.flatten();
    const errorMessage = errors.formErrors?.length 
      ? errors.formErrors.join(", ")
      : Object.values(errors.fieldErrors).flat().join(", ") || "Validation failed";
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  const { dealId, action, respondingCountryId } = parsed.data;

  try {
    const supabase = getSupabaseServerClient();
    
    // Fetch the deal
    const { data: deal, error: fetchError } = await supabase
      .from("deals")
      .select("*")
      .eq("id", dealId)
      .single();

    if (fetchError || !deal) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    // Verify the responding country is the receiver
    if (deal.receiving_country_id !== respondingCountryId) {
      return NextResponse.json({ error: "Only the receiving country can respond to this deal" }, { status: 403 });
    }

    // Verify deal is in proposed status
    if (deal.status !== "proposed") {
      return NextResponse.json({ error: `Deal is already ${deal.status}` }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (action === "reject") {
      // Reject the deal
      const { error: updateError } = await supabase
        .from("deals")
        .update({
          status: "rejected",
          updated_at: now,
        })
        .eq("id", dealId);

      if (updateError) {
        throw new Error(`Failed to reject deal: ${updateError.message}`);
      }

      return NextResponse.json({ 
        success: true, 
        message: "Deal rejected",
        deal: { ...deal, status: "rejected", updated_at: now }
      });
    }

    // Accept the deal
    const { error: updateError } = await supabase
      .from("deals")
      .update({
        status: "accepted",
        accepted_at: now,
        updated_at: now,
      })
      .eq("id", dealId);

    if (updateError) {
      throw new Error(`Failed to accept deal: ${updateError.message}`);
    }

    // Execute the deal immediately (transfer resources/budget/etc.)
    try {
      // Use the game's current turn so we apply transfers to the correct stats row
      const gameRes = await supabase
        .from("games")
        .select("current_turn")
        .eq("id", deal.game_id)
        .limit(1);

      if (gameRes.error || !gameRes.data || gameRes.data.length === 0) {
        throw new Error("Failed to fetch game current turn");
      }

      const currentTurn = gameRes.data[0].current_turn as number;

      const executionResult = await executeDealTerms(
        deal.game_id,
        currentTurn,
        deal.proposing_country_id,
        deal.receiving_country_id,
        deal.deal_terms,
        deal.deal_type
      );

      if (!executionResult.success) {
        // Revert the deal status if execution failed
        await supabase
          .from("deals")
          .update({
            status: "proposed",
            accepted_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", dealId);

        return NextResponse.json(
          {
            error: `Deal accepted but execution failed`,
            executionErrors: executionResult.errors,
            success: false,
          },
          { status: 500 }
        );
      }

      // Mark as active after successful execution (single-turn trades are effectively completed immediately,
      // but the rest of the codebase treats executed deals as "active")
      await supabase
        .from("deals")
        .update({
          status: "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", dealId);

      return NextResponse.json({
        success: true,
        message: "Deal accepted and executed",
        deal: { ...deal, status: "active", accepted_at: now, updated_at: now },
        executionResult,
      });
    } catch (execError) {
      // Revert the deal status if execution failed
      await supabase
        .from("deals")
        .update({
          status: "proposed",
          accepted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", dealId);

      const errorMessage = execError instanceof Error ? execError.message : "Execution failed";
      return NextResponse.json(
        {
          error: `Deal accepted but execution failed: ${errorMessage}`,
          success: false,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Deal response error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to respond to deal";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
