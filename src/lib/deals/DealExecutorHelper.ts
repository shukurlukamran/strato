import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { DealTerms, DealCommitment } from "@/types/deals";

/**
 * Executes deal terms by transferring resources, budget, etc. between countries.
 * Updates country_stats in the database immediately.
 */
export async function executeDealTerms(
  gameId: string,
  turn: number,
  proposingCountryId: string,
  receivingCountryId: string,
  dealTerms: DealTerms
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];
  const supabase = getSupabaseServerClient();

  try {
    // Fetch current stats for both countries
    const statsRes = await supabase
      .from("country_stats")
      .select("id, country_id, budget, resources")
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

    // Process proposer commitments (proposer gives to receiver)
    for (const commitment of dealTerms.proposerCommitments) {
      await processCommitment(
        commitment,
        proposerStats,
        receiverStats,
        supabase,
        errors
      );
    }

    // Process receiver commitments (receiver gives to proposer)
    for (const commitment of dealTerms.receiverCommitments) {
      await processCommitment(
        commitment,
        receiverStats,
        proposerStats,
        supabase,
        errors
      );
    }

    return { success: errors.length === 0, errors };
  } catch (error) {
    console.error("Error executing deal terms:", error);
    errors.push(error instanceof Error ? error.message : "Unknown error");
    return { success: false, errors };
  }
}

/**
 * Processes a single commitment and updates stats accordingly
 */
async function processCommitment(
  commitment: DealCommitment,
  fromStats: { id: string; country_id: string; budget: number; resources: Record<string, number> },
  toStats: { id: string; country_id: string; budget: number; resources: Record<string, number> },
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
        // TODO: Implement diplomatic relations update
        console.log("Diplomatic commitment not yet implemented");
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
