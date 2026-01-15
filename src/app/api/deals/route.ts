import { NextResponse } from "next/server";
import { z } from "zod";
import type { Deal } from "@/types/deals";
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

const memoryDealsByGameId = new Map<string, Deal[]>();

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = CreateDealSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

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
      )
      .single();

    if (inserted.error) throw inserted.error;
    const d = inserted.data;

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
  } catch {
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
}

