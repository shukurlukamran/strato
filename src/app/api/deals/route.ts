import { NextResponse } from "next/server";
import { z } from "zod";
import type { Deal, DealStatus } from "@/types/deals";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

const CreateDealSchema = z.object({
  gameId: z.string().min(1),
  proposingCountryId: z.string().min(1),
  receivingCountryId: z.string().min(1),
  dealType: z.string().min(1),
  dealTerms: DealTermsSchema,
  turnCreated: z.number().int().min(1),
  turnExpires: z.number().int().min(1).nullable().optional(),
});

const dealStatusValues: DealStatus[] = [
  "draft",
  "proposed",
  "accepted",
  "rejected",
  "active",
  "completed",
  "violated",
];

const GetDealsSchema = z.object({
  gameId: z.string().min(1),
  status: z.enum(dealStatusValues).optional(),
});

const memoryDealsByGameId = new Map<string, Deal[]>();

export async function POST(req: Request) {
  let json;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
  }
  
  const parsed = CreateDealSchema.safeParse(json);
  if (!parsed.success) {
    const errors = parsed.error.flatten();
    const errorMessage = errors.formErrors?.length 
      ? errors.formErrors.join(", ")
      : Object.values(errors.fieldErrors).flat().join(", ") || "Validation failed";
    return NextResponse.json({ error: errorMessage, details: errors }, { status: 400 });
  }

  const { gameId, proposingCountryId, receivingCountryId, dealType, dealTerms, turnCreated, turnExpires } =
    parsed.data;

  const now = new Date().toISOString();

  try {
    const supabase = getSupabaseServerClient();
    const inserted = await supabase
      .from("deals")
      .insert({
        game_id: gameId,
        proposing_country_id: proposingCountryId,
        receiving_country_id: receivingCountryId,
        deal_type: dealType,
        deal_terms: dealTerms,
        status: "proposed",
        proposed_at: now,
        accepted_at: null,
        expires_at: null,
        turn_created: turnCreated,
        turn_expires: turnExpires ?? null,
        created_at: now,
        updated_at: now,
      })
      .select(
        "id, game_id, proposing_country_id, receiving_country_id, deal_type, deal_terms, status, proposed_at, accepted_at, expires_at, turn_created, turn_expires, created_at, updated_at",
      );

    if (inserted.error || !inserted.data || inserted.data.length === 0) {
      console.error("Supabase insert error:", inserted.error);
      throw new Error(`Database error: ${inserted.error?.message || "Failed to create deal"}`);
    }
    const d = inserted.data[0];

    return NextResponse.json({
      deal: {
        id: d.id,
        gameId: d.game_id,
        proposingCountryId: d.proposing_country_id,
        receivingCountryId: d.receiving_country_id,
        dealType: d.deal_type,
        dealTerms: d.deal_terms,
        status: d.status,
        proposedAt: d.proposed_at,
        acceptedAt: d.accepted_at,
        expiresAt: d.expires_at,
        turnCreated: d.turn_created,
        turnExpires: d.turn_expires,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      } satisfies Deal,
    });
  } catch (error) {
    // If Supabase is not configured (missing env vars), fall back to in-memory storage
    if (error instanceof Error && error.message.includes("Missing env")) {
      const deal: Deal = {
        id: crypto.randomUUID(),
        gameId,
        proposingCountryId,
        receivingCountryId,
        dealType: dealType as Deal["dealType"],
        dealTerms: dealTerms,
        status: "proposed",
        proposedAt: now,
        acceptedAt: null,
        expiresAt: null,
        turnCreated,
        turnExpires: turnExpires ?? null,
        createdAt: now,
        updatedAt: now,
      };
      const existing = memoryDealsByGameId.get(gameId) ?? [];
      const next = [deal, ...existing];
      memoryDealsByGameId.set(gameId, next);

      return NextResponse.json({ deal, note: "Supabase not configured; using in-memory deals store." });
    }
    
    // For other errors, return error response
    console.error("Deal creation error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to create deal";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const parsed = GetDealsSchema.safeParse({
    gameId: url.searchParams.get("gameId"),
    status: url.searchParams.get("status") || undefined,
  });

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

  const { gameId, status } = parsed.data;

  try {
    const supabase = getSupabaseServerClient();

    let query = supabase
      .from("deals")
      .select(
        "id, game_id, proposing_country_id, receiving_country_id, deal_type, deal_terms, status, proposed_at, accepted_at, expires_at, turn_created, turn_expires, created_at, updated_at",
      )
      .eq("game_id", gameId);

    if (status) {
      query = query.eq("status", status);
    }

    query = query.order("created_at", { ascending: false });
    const result = await query;

    if (result.error) {
      throw result.error;
    }

    return NextResponse.json({
      deals: (result.data ?? []).map((d) => ({
        id: d.id,
        gameId: d.game_id,
        proposingCountryId: d.proposing_country_id,
        receivingCountryId: d.receiving_country_id,
        dealType: d.deal_type,
        dealTerms: d.deal_terms,
        status: d.status,
        proposedAt: d.proposed_at,
        acceptedAt: d.accepted_at,
        expiresAt: d.expires_at,
        turnCreated: d.turn_created,
        turnExpires: d.turn_expires,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      } satisfies Deal)),
    });
  } catch (error) {
    console.error("Deal fetch error:", error);

    // Fallback to in-memory store if Supabase is unavailable
    const fallbackDeals = memoryDealsByGameId.get(gameId) ?? [];
    const filtered = status ? fallbackDeals.filter((d) => d.status === status) : fallbackDeals;

    if (fallbackDeals.length > 0) {
      return NextResponse.json({
        deals: filtered,
        note: "Supabase not configured; using in-memory deals store.",
      });
    }

    const errorMessage = error instanceof Error ? error.message : "Failed to fetch deals";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

