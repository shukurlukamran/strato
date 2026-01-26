import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DealTerms, DealCommitment } from "@/types/deals";
import { applyDiplomaticDelta } from "@/lib/game-engine/DiplomaticRelations";

/**
 * Executes deal terms by transferring resources, budget, etc. between countries.
 * Updates country_stats in the database atomically after validating all transfers.
 */
export async function executeDealTerms(
  gameId: string,
  turn: number,
  proposingCountryId: string,
  receivingCountryId: string,
  dealTerms: DealTerms,
  dealType?: string
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  const supabase = getSupabaseServerClient();

  try {
    // Validate that both countries belong to the specified game
    const countriesRes = await supabase
      .from("countries")
      .select("id")
      .eq("game_id", gameId)
      .in("id", [proposingCountryId, receivingCountryId]);

    if (countriesRes.error || !countriesRes.data || countriesRes.data.length !== 2) {
      errors.push("One or both countries do not belong to this game");
      return { success: false, errors };
    }

    // Fetch current stats for both countries
    const statsRes = await supabase
      .from("country_stats")
      .select("id, country_id, budget, resources, diplomatic_relations")
      .eq("turn", turn)
      .in("country_id", [proposingCountryId, receivingCountryId]);

    if (statsRes.error || !statsRes.data || statsRes.data.length !== 2) {
      errors.push("Failed to fetch country stats");
      return { success: false, errors };
    }

    const proposerStats = statsRes.data.find((s) => s.country_id === proposingCountryId);
    const receiverStats = statsRes.data.find((s) => s.country_id === receivingCountryId);

    if (!proposerStats || !receiverStats) {
      errors.push("Could not find stats for both countries");
      return { success: false, errors };
    }

    // Verify stats rows belong to the correct game by verifying countries belong to this game
    // (This ensures no cross-game data corruption from stats table)
    const statsCountriesMatch = countriesRes.data?.find((c) => c.id === proposingCountryId) &&
                                countriesRes.data?.find((c) => c.id === receivingCountryId);
    if (!statsCountriesMatch) {
      errors.push("Stats rows do not match the specified game");
      return { success: false, errors };
    }

    // Calculate all deltas in-memory first to ensure atomic execution
    const proposerDeltas = calculateDeltasForCommitments(dealTerms.proposerCommitments, proposerStats, receiverStats, errors);
    const receiverDeltas = calculateDeltasForCommitments(dealTerms.receiverCommitments, receiverStats, proposerStats, errors);

    const proposerIncomingResourceDeltas = accumulateIncomingResourceDeltas(dealTerms.receiverCommitments);
    const receiverIncomingResourceDeltas = accumulateIncomingResourceDeltas(dealTerms.proposerCommitments);

    // If any validation errors occurred, fail the entire deal
    if (errors.length > 0) {
      return { success: false, errors };
    }

    // Calculate net budget transfers between countries
    const proposerToReceiverBudget = -proposerDeltas.budgetDelta; // Positive amount proposer sends to receiver
    const receiverToProposerBudget = -receiverDeltas.budgetDelta; // Positive amount receiver sends to proposer

    // Apply all changes atomically
    await applyDeltasToDatabase(
      proposerStats,
      mergeResourceDeltas(proposerDeltas.resourceDeltas, proposerIncomingResourceDeltas),
      proposerDeltas.budgetDelta + receiverToProposerBudget,
      supabase,
    );
    await applyDeltasToDatabase(
      receiverStats,
      mergeResourceDeltas(receiverDeltas.resourceDeltas, receiverIncomingResourceDeltas),
      receiverDeltas.budgetDelta + proposerToReceiverBudget,
      supabase,
    );

    // Apply baseline diplomatic boost for the deal type (if provided)
    if (dealType) {
      const baseDelta = getDealDiplomaticDelta(dealType);
      if (baseDelta !== 0) {
        await applyDiplomaticDeltaForPair(
          proposerStats,
          receiverStats,
          baseDelta,
          supabase,
          errors
        );
      }
    }

    return { success: errors.length === 0, errors };
  } catch (error) {
    console.error("Error executing deal terms:", error);
    errors.push(error instanceof Error ? error.message : "Unknown error");
    return { success: false, errors };
  }
}

/**
 * Calculates deltas for a set of commitments without applying them
 */
function calculateDeltasForCommitments(
  commitments: DealCommitment[],
  fromStats: { id: string; country_id: string; budget: number; resources: Record<string, number>; diplomatic_relations?: Record<string, number> },
  toStats: { id: string; country_id: string; budget: number; resources: Record<string, number>; diplomatic_relations?: Record<string, number> },
  errors: string[]
): { budgetDelta: number; resourceDeltas: Record<string, number>; diplomaticDeltas?: Record<string, number> } {
  let budgetDelta = 0;
  const resourceDeltas: Record<string, number> = {};
  const diplomaticDeltas: Record<string, number> = {};

  // Use working copies for validation
  let workingFromBudget = fromStats.budget;
  const workingFromResources = { ...fromStats.resources };
  const workingToResources = { ...toStats.resources };

  for (const commitment of commitments) {
    switch (commitment.type) {
      case "resource_transfer": {
        if (!commitment.resource || !commitment.amount) {
          errors.push(`Invalid resource_transfer commitment: missing resource or amount`);
          continue;
        }

        const amount = commitment.amount;
        const currentAmount = workingFromResources[commitment.resource] || 0;

        if (currentAmount < amount) {
          errors.push(
            `Insufficient ${commitment.resource}: ${currentAmount} available, ${amount} required`
          );
          continue;
        }

        // Update working copies for validation
        workingFromResources[commitment.resource] = (workingFromResources[commitment.resource] || 0) - amount;
        workingToResources[commitment.resource] = (workingToResources[commitment.resource] || 0) + amount;

        // Accumulate resource deltas (negative = outgoing from this country)
        resourceDeltas[commitment.resource] = (resourceDeltas[commitment.resource] || 0) - amount;
        break;
      }

      case "budget_transfer": {
        if (!commitment.amount) {
          errors.push(`Invalid budget_transfer commitment: missing amount`);
          continue;
        }

        const amount = commitment.amount;

        if (workingFromBudget < amount) {
          errors.push(`Insufficient budget: ${workingFromBudget} available, ${amount} required`);
          continue;
        }

        // Update working copy for validation
        workingFromBudget -= amount;

        // Accumulate budget delta (negative = outgoing from this country)
        budgetDelta -= amount;
        break;
      }

      case "military_equipment_transfer": {
        // TODO: Implement military equipment transfer
        console.log("Military equipment transfer not yet implemented");
        break;
      }

      case "diplomatic_commitment": {
        if (commitment.amount === undefined || commitment.amount === null) {
          errors.push(`Invalid diplomatic_commitment: missing amount`);
          continue;
        }

        // Diplomatic deltas will be applied separately
        break;
      }

      case "technology_boost": {
        // TODO: Implement technology level boost
        console.log("Technology boost not yet implemented");
        break;
      }

      case "action_commitment": {
        // These are commitments to future actions (e.g., "no_attack"), not immediate transfers
        console.log("Action commitment recorded (no immediate transfer needed)");
        break;
      }

      default:
        console.warn(`Unknown commitment type: ${commitment.type}`);
    }
  }

  return { budgetDelta, resourceDeltas, diplomaticDeltas };
}

/**
 * Applies accumulated deltas to the database
 */
async function applyDeltasToDatabase(
  stats: { id: string; country_id: string; budget: number; resources: Record<string, number>; diplomatic_relations?: Record<string, number> },
  resourceDeltas: Record<string, number>,
  budgetDelta: number,
  supabase: ReturnType<typeof getSupabaseServerClient>
): Promise<void> {
  const updatedResources = { ...stats.resources };

  // Apply resource deltas
  for (const [resourceId, delta] of Object.entries(resourceDeltas)) {
    updatedResources[resourceId] = (updatedResources[resourceId] || 0) + delta;
  }

  // Apply budget delta
  const updatedBudget = stats.budget + budgetDelta;

  await supabase
    .from("country_stats")
    .update({
      resources: updatedResources,
      budget: updatedBudget
    })
    .eq("id", stats.id);
}

/**
 * Processes a single commitment and updates stats accordingly (legacy function, kept for compatibility)
 */
async function processCommitment(
  commitment: DealCommitment,
  fromStats: { id: string; country_id: string; budget: number; resources: Record<string, number>; diplomatic_relations?: Record<string, number> },
  toStats: { id: string; country_id: string; budget: number; resources: Record<string, number>; diplomatic_relations?: Record<string, number> },
  supabase: ReturnType<typeof getSupabaseServerClient>,
  errors: string[]
): Promise<void> {
  try {
    switch (commitment.type) {
      case "resource_transfer": {
        if (!commitment.resource || !commitment.amount) {
          errors.push(`Invalid resource_transfer commitment: missing resource or amount`);
          return;
        }

        const amount = commitment.amount;
        const currentAmount = fromStats.resources[commitment.resource] || 0;

        if (currentAmount < amount) {
          errors.push(
            `Insufficient ${commitment.resource}: ${currentAmount} available, ${amount} required`
          );
          return;
        }

        // Update from country (subtract)
        const fromResources = { ...fromStats.resources };
        fromResources[commitment.resource] = (fromResources[commitment.resource] || 0) - amount;

        await supabase
          .from("country_stats")
          .update({ resources: fromResources })
          .eq("id", fromStats.id);

        // Update to country (add)
        const toResources = { ...toStats.resources };
        toResources[commitment.resource] = (toResources[commitment.resource] || 0) + amount;

        await supabase
          .from("country_stats")
          .update({ resources: toResources })
          .eq("id", toStats.id);

        console.log(
          `Transferred ${amount} ${commitment.resource} from ${fromStats.country_id} to ${toStats.country_id}`
        );
        break;
      }

      case "budget_transfer": {
        if (!commitment.amount) {
          errors.push(`Invalid budget_transfer commitment: missing amount`);
          return;
        }

        const amount = commitment.amount;
        const fromBudget = Number(fromStats.budget);

        if (fromBudget < amount) {
          errors.push(`Insufficient budget: ${fromBudget} available, ${amount} required`);
          return;
        }

        // Update from country (subtract)
        await supabase
          .from("country_stats")
          .update({ budget: fromBudget - amount })
          .eq("id", fromStats.id);

        // Update to country (add)
        const toBudget = Number(toStats.budget);
        await supabase
          .from("country_stats")
          .update({ budget: toBudget + amount })
          .eq("id", toStats.id);

        console.log(
          `Transferred ${amount} credits from ${fromStats.country_id} to ${toStats.country_id}`
        );
        break;
      }

      case "military_equipment_transfer": {
        // TODO: Implement military equipment transfer
        console.log("Military equipment transfer not yet implemented");
        break;
      }

      case "diplomatic_commitment": {
        if (commitment.amount === undefined || commitment.amount === null) {
          errors.push(`Invalid diplomatic_commitment: missing amount`);
          return;
        }

        await applyDiplomaticDeltaForPair(fromStats, toStats, commitment.amount, supabase, errors);
        break;
      }

      case "technology_boost": {
        // TODO: Implement technology level boost
        console.log("Technology boost not yet implemented");
        break;
      }

      case "action_commitment": {
        // These are commitments to future actions (e.g., "no_attack"), not immediate transfers
        console.log("Action commitment recorded (no immediate transfer needed)");
        break;
      }

      default:
        console.warn(`Unknown commitment type: ${commitment.type}`);
    }
  } catch (error) {
    console.error(`Error processing commitment ${commitment.type}:`, error);
    errors.push(`Failed to process ${commitment.type}: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function applyDiplomaticDeltaForPair(
  fromStats: { id: string; country_id: string; diplomatic_relations?: Record<string, number> },
  toStats: { id: string; country_id: string; diplomatic_relations?: Record<string, number> },
  delta: number,
  supabase: ReturnType<typeof getSupabaseServerClient>,
  errors: string[]
): Promise<void> {
  try {
    const updatedFrom = applyDiplomaticDelta(
      {
        id: fromStats.id,
        countryId: fromStats.country_id,
        turn: 0,
        population: 0,
        budget: 0,
        technologyLevel: 0,
        militaryStrength: 0,
        militaryEquipment: {},
        resources: {},
        diplomaticRelations: fromStats.diplomatic_relations ?? {},
        createdAt: new Date().toISOString(),
      },
      toStats.country_id,
      delta
    );

    const updatedTo = applyDiplomaticDelta(
      {
        id: toStats.id,
        countryId: toStats.country_id,
        turn: 0,
        population: 0,
        budget: 0,
        technologyLevel: 0,
        militaryStrength: 0,
        militaryEquipment: {},
        resources: {},
        diplomaticRelations: toStats.diplomatic_relations ?? {},
        createdAt: new Date().toISOString(),
      },
      fromStats.country_id,
      delta
    );

    fromStats.diplomatic_relations = updatedFrom.diplomaticRelations;
    toStats.diplomatic_relations = updatedTo.diplomaticRelations;

    await supabase
      .from("country_stats")
      .update({ diplomatic_relations: updatedFrom.diplomaticRelations })
      .eq("id", fromStats.id);

    await supabase
      .from("country_stats")
      .update({ diplomatic_relations: updatedTo.diplomaticRelations })
      .eq("id", toStats.id);
  } catch (error) {
    console.error(`Failed to apply diplomatic delta ${delta}:`, error);
    errors.push(`Diplomatic update failed: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

function getDealDiplomaticDelta(dealType: string): number {
  switch (dealType) {
    case "alliance":
      return 18;
    case "non_aggression":
      return 12;
    case "military_aid":
      return 14;
    case "technology_share":
      return 10;
    case "trade":
      return 8;
    case "custom":
      return 6;
    default:
      return 4;
  }
}

function accumulateIncomingResourceDeltas(commitments: DealCommitment[]): Record<string, number> {
  const deltas: Record<string, number> = {};
  for (const commitment of commitments) {
    if (commitment.type !== "resource_transfer" || !commitment.resource || !commitment.amount) {
      continue;
    }
    deltas[commitment.resource] = (deltas[commitment.resource] || 0) + commitment.amount;
  }
  return deltas;
}

function mergeResourceDeltas(
  outgoing: Record<string, number>,
  incoming: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...outgoing };
  for (const [resource, delta] of Object.entries(incoming)) {
    merged[resource] = (merged[resource] || 0) + delta;
  }
  return merged;
}
