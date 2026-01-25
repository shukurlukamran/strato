import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { executeDealTerms } from "@/lib/deals/DealExecutorHelper";

const DealCommitmentSchema = z.object({
  type: z.string().min(1),
  resource: z.string().min(1).optional(),
  amount: z.number().optional(),
  durationTurns: z.number().int().min(1).optional(),
});

const DealTermsSchema = z.object({
  proposerCommitments: z.array(DealCommitmentSchema),
  receiverCommitments: z.array(DealCommitmentSchema),
  conditions: z.array(z.string()).optional(),
});

const ConfirmDealSchema = z.object({
  gameId: z.string().uuid(),
  proposingCountryId: z.string().uuid(),
  receivingCountryId: z.string().uuid(),
  dealType: z.string().min(1),
  dealTerms: DealTermsSchema,
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }

  const parsed = ConfirmDealSchema.safeParse(json);
  if (!parsed.success) {
    const errors = parsed.error.flatten();
    const errorMessage =
      errors.formErrors?.length > 0
        ? errors.formErrors.join(", ")
        : Object.values(errors.fieldErrors).flat().join(", ") || "Validation failed";
    return NextResponse.json({ error: errorMessage, details: errors }, { status: 400 });
  }

  const { gameId, proposingCountryId, receivingCountryId, dealType, dealTerms } = parsed.data;

  try {
    const supabase = getSupabaseServerClient();

    // Verify both countries belong to the game
    const countriesRes = await supabase
      .from("countries")
      .select("id")
      .eq("game_id", gameId)
      .in("id", [proposingCountryId, receivingCountryId]);

    if (countriesRes.error || !countriesRes.data || countriesRes.data.length !== 2) {
      return NextResponse.json(
        { error: "One or both countries do not belong to this game" },
        { status: 403 }
      );
    }

    // Get current turn
    const gameRes = await supabase
      .from("games")
      .select("current_turn")
      .eq("id", gameId)
      .limit(1);

    if (gameRes.error || !gameRes.data || gameRes.data.length === 0) {
      return NextResponse.json({ error: "Failed to fetch game turn" }, { status: 500 });
    }

    const currentTurn = gameRes.data[0].current_turn as number;
    const now = new Date().toISOString();

    // Calculate expiration turn (default: 5 turns for alliances, 1 turn for trades)
    const defaultDuration = dealType === "alliance" || dealType === "non_aggression" ? 5 : 1;
    const maxDuration = Math.max(
      ...dealTerms.proposerCommitments.map((c) => c.durationTurns || 1),
      ...dealTerms.receiverCommitments.map((c) => c.durationTurns || 1),
      defaultDuration
    );
    const turnExpires = currentTurn + maxDuration;

    // Create deal as "accepted" (player explicitly confirmed), then execute immediately.
    const dealInsert = await supabase
      .from("deals")
      .insert({
        game_id: gameId,
        proposing_country_id: proposingCountryId,
        receiving_country_id: receivingCountryId,
        deal_type: dealType,
        deal_terms: dealTerms,
        status: "accepted",
        proposed_at: now,
        accepted_at: now,
        expires_at: null,
        turn_created: currentTurn,
        turn_expires: turnExpires,
        created_at: now,
        updated_at: now,
      })
      .select(
        "id, game_id, proposing_country_id, receiving_country_id, deal_type, deal_terms, status, proposed_at, accepted_at, expires_at, turn_created, turn_expires, created_at, updated_at"
      );

    if (dealInsert.error || !dealInsert.data || dealInsert.data.length === 0) {
      console.error("Failed to create deal:", dealInsert.error);
      return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
    }

    const created = dealInsert.data[0];

    const executionResult = await executeDealTerms(
      gameId,
      currentTurn,
      proposingCountryId,
      receivingCountryId,
      dealTerms,
      dealType
    );

    if (!executionResult.success) {
      // Mark as rejected to avoid phantom "active" deals.
      await supabase
        .from("deals")
        .update({ status: "rejected", accepted_at: null, updated_at: new Date().toISOString() })
        .eq("id", created.id);

      return NextResponse.json(
        {
          success: false,
          error: "Deal confirmation failed: could not execute deal terms",
          executionErrors: executionResult.errors,
        },
        { status: 400 }
      );
    }

    // Mark as active after successful execution
    await supabase
      .from("deals")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", created.id);

    return NextResponse.json({
      success: true,
      message: "Deal confirmed and executed",
      createdDeal: {
        id: created.id,
        gameId: created.game_id,
        proposingCountryId: created.proposing_country_id,
        receivingCountryId: created.receiving_country_id,
        dealType: created.deal_type,
        dealTerms: created.deal_terms,
        status: "active",
        proposedAt: created.proposed_at,
        acceptedAt: created.accepted_at,
        expiresAt: created.expires_at,
        turnCreated: created.turn_created,
        turnExpires: created.turn_expires,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
      executionResult,
    });
  } catch (error) {
    console.error("Deal confirm error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to confirm deal";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

