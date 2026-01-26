import { getSupabaseServerClient } from "@/lib/supabase/server";

export type LLMUsageOperation =
  | "chat_reply"
  | "deal_extract"
  | "military_decision"
  | "strategic_plan"
  | "summary_update";

export interface LLMUsageEntry {
  gameId: string;
  playerCountryId: string;
  chatId?: string | null;
  operation: LLMUsageOperation;
  turn: number;
  inputChars: number;
  outputChars?: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  usdEstimate?: number;
  budgetCostCharged?: number;
}

export class LLMUsageLogger {
  async log(entry: LLMUsageEntry): Promise<void> {
    try {
      const supabase = getSupabaseServerClient();
      await supabase.from("llm_usage_ledger").insert({
        game_id: entry.gameId,
        player_country_id: entry.playerCountryId,
        chat_id: entry.chatId,
        operation: entry.operation,
        turn: entry.turn,
        input_chars: entry.inputChars,
        output_chars: entry.outputChars ?? 0,
        input_tokens: entry.inputTokens ?? null,
        output_tokens: entry.outputTokens ?? null,
        usd_estimate: entry.usdEstimate ?? 0,
        budget_cost_charged: entry.budgetCostCharged ?? 0,
      });
    } catch (error) {
      console.error("[LLMUsageLogger] Failed to log usage:", error);
    }
  }
}
