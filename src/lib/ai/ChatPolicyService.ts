import { getSupabaseServerClient } from "@/lib/supabase/server";
import { LLMUsageLogger, type LLMUsageEntry } from "./LLMUsageLogger";

export interface ChatPolicyContext {
  gameId: string;
  chatId: string;
  playerCountryId: string;
  turn: number;
  messageText: string;
}

export interface ChatPolicyDecision {
  allow: boolean;
  blockReason?: string;
  warning?: string;
  budgetCost?: number;
  budgetNotice?: string;
}

interface PolicyState {
  last_warning_at?: string;
  warning_count?: number;
  last_message_at?: string;
  last_message_text?: string;
}

const MAX_MESSAGE_LENGTH = 1400;
const MIN_CHAT_INTERVAL_MS = 2000;
const PER_MINUTE_CAP = 18;
const FREE_ALLOWANCE_PER_TURN = Number(process.env.LLM_CHAT_FREE_ALLOWANCE ?? 3);
const BUDGET_COST_STEPS = [5, 8, 12];
const WARNING_WINDOW_MS = 60_000;
const TOPIC_KEYWORDS = [
  "trade", "resource", "budget", "war", "alliance", "attack", "military", "city", "turn", "research", "deal", "diplomacy", "technology", "economy", "infrastructure", "quota", "policy"
];

const OFF_TOPIC_PATTERNS = [
  /write code/i,
  /programming/i,
  /python/i,
  /javascript/i,
  /math problem/i,
  /solve/i,
  /essay/i,
  /translate/i,
  /how to /i,
  /tutorial/i,
  /chatgpt/i,
  /gpt/i,
  /model/i,
];

export class ChatPolicyService {
  private usageLogger = new LLMUsageLogger();

  async evaluate(context: ChatPolicyContext): Promise<ChatPolicyDecision> {
    const { messageText, chatId, gameId, playerCountryId, turn } = context;
    const now = new Date();

    // Input validation
    if (messageText.length > MAX_MESSAGE_LENGTH) {
      return {
        allow: false,
        blockReason: "Your message is too long. Please keep it concise.",
      };
    }

    if (/[^\x09\x0a\x0d\x20-\x7e]/.test(messageText)) {
      return {
        allow: false,
        blockReason: "Your message contains unsupported characters.",
      };
    }

    const normalized = messageText.toLowerCase();
    const hasTopic = TOPIC_KEYWORDS.some((keyword) => normalized.includes(keyword));
    const isShort = normalized.split(/\s+/).length <= 3 && normalized.length < 40;
    const nowIso = now.toISOString();
    const messageMeta = {
      last_message_text: normalized,
      last_message_at: nowIso,
    };

    const policyState = await this.ensurePolicyState(chatId);
    const lastMessageText = policyState.last_message_text ?? "";
    const lastMessageAt = policyState.last_message_at ? new Date(policyState.last_message_at) : null;

    if (lastMessageText && lastMessageText === normalized && lastMessageAt && now.getTime() - lastMessageAt.getTime() < MIN_CHAT_INTERVAL_MS) {
      await this.updatePolicyState(chatId, messageMeta);
      return {
        allow: false,
        blockReason: "Please wait a moment before repeating that message in this chat.",
      };
    }

    const isOffTopicPattern = OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(normalized));
    if (!hasTopic && isOffTopicPattern) {
      await this.updatePolicyState(chatId, messageMeta);
      return {
        allow: false,
        blockReason: "I'm focused on in-world diplomacy, so I can't handle that topic right now.",
      };
    }

    if (!hasTopic && !isShort) {
      const lastWarning = policyState.last_warning_at ? new Date(policyState.last_warning_at) : null;
      const warningCount = policyState.warning_count ?? 0;
      const sinceWarning = lastWarning ? now.getTime() - lastWarning.getTime() : Number.POSITIVE_INFINITY;

      if (warningCount >= 1 && sinceWarning < WARNING_WINDOW_MS) {
        await this.updatePolicyState(chatId, messageMeta);
        return {
          allow: false,
          blockReason: "I'm focusing on in-world matters right now. Let's keep the chat about diplomacy.",
        };
      }

      await this.updatePolicyState(chatId, {
        warning_count: warningCount + 1,
        last_warning_at: nowIso,
        ...messageMeta,
      });

      return {
        allow: true,
        warning:
          "Please keep the conversation focused on diplomacy, trade, war, or plans. Off-topic chats will be blocked soon.",
      };
    }

    const rateLimitIssue = await this.checkRateLimits(chatId, gameId, playerCountryId, now);
    if (rateLimitIssue) {
      await this.updatePolicyState(chatId, messageMeta);
      return {
        allow: false,
        blockReason: rateLimitIssue,
      };
    }

    const usageCountThisTurn = await this.countTurnUsage(gameId, playerCountryId, turn);
    const budgetCost =
      usageCountThisTurn < FREE_ALLOWANCE_PER_TURN
        ? 0
        : BUDGET_COST_STEPS[Math.min(usageCountThisTurn - FREE_ALLOWANCE_PER_TURN, BUDGET_COST_STEPS.length - 1)];

    if (budgetCost > 0) {
      const charged = await this.chargeDiplomacyBudget(gameId, playerCountryId, turn, budgetCost);
      if (!charged) {
        await this.updatePolicyState(chatId, messageMeta);
        return {
          allow: false,
          blockReason:
            "Your diplomacy credits are depleted for this turn. Please wait until the next turn to continue.",
        };
      }
    }

    await this.updatePolicyState(chatId, messageMeta);
    return {
      allow: true,
      budgetCost,
      budgetNotice:
        budgetCost > 0
          ? `You are using extra diplomacy replies this turn. This reply costs ${budgetCost} credits.`
          : "Within your free allowance for this turn.",
    };
  }

  private async chargeDiplomacyBudget(
    gameId: string,
    playerCountryId: string,
    turn: number,
    amount: number
  ): Promise<boolean> {
    if (amount <= 0) return true;
    const supabase = getSupabaseServerClient();
    const statsRes = await supabase
      .from("country_stats")
      .select("budget")
      .eq("game_id", gameId)
      .eq("country_id", playerCountryId)
      .eq("turn", turn)
      .single();

    if (statsRes.error || !statsRes.data) {
      console.warn("[ChatPolicyService] Could not load budget for charging:", statsRes.error);
      return false;
    }

    const currentBudget = Number(statsRes.data.budget ?? 0);
    if (Number.isNaN(currentBudget) || currentBudget < amount) {
      return false;
    }

    const newBudget = currentBudget - amount;
    const updateRes = await supabase
      .from("country_stats")
      .update({
        budget: newBudget,
        updated_at: new Date().toISOString(),
      })
      .eq("game_id", gameId)
      .eq("country_id", playerCountryId)
      .eq("turn", turn)
      .eq("budget", currentBudget)
      .select("budget")
      .maybeSingle();

    if (updateRes.error || !updateRes.data) {
      console.warn("[ChatPolicyService] Failed to charge diplomacy budget:", updateRes.error);
      return false;
    }

    return true;
  }

  async logUsage(entry: LLMUsageEntry): Promise<void> {
    await this.usageLogger.log(entry);
  }

  private async ensurePolicyState(chatId: string): Promise<PolicyState & { id: string }> {
    const supabase = getSupabaseServerClient();
    let row = await supabase
      .from("chat_memory_summaries")
      .select("id, policy_state")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (row.error) {
      // Table doesn't exist - return empty state (migrations not run)
      if (row.error.code === "PGRST205" || row.error.message?.includes("Could not find the table")) {
        console.warn("[ChatPolicyService] chat_memory_summaries table not found, using in-memory policy tracking");
        return {
          id: chatId,
        } as PolicyState & { id: string };
      }
      console.error("[ChatPolicyService] Failed to fetch policy state:", row.error);
    }

    if (!row.data) {
      const created = await supabase
        .from("chat_memory_summaries")
        .insert({ chat_id: chatId })
        .select("id, policy_state")
        .single();
      if (created.error || !created.data) {
        // If insert fails due to missing table, return empty state
        if (created.error?.code === "PGRST205" || created.error?.message?.includes("Could not find the table")) {
          console.warn("[ChatPolicyService] chat_memory_summaries table not found, using in-memory policy tracking");
          return {
            id: chatId,
          } as PolicyState & { id: string };
        }
        console.error("[ChatPolicyService] Failed to create policy state:", created.error);
        return {
          id: chatId,
        } as PolicyState & { id: string };
      }
      row = created;
    }

    const data = row.data;
    if (!data) {
      return {
        id: chatId,
      } as PolicyState & { id: string };
    }

    return {
      id: data.id,
      ...(data.policy_state ?? {}),
    } as PolicyState & { id: string };
  }

  private async updatePolicyState(chatId: string, updates: Partial<PolicyState>): Promise<void> {
    const supabase = getSupabaseServerClient();
    const existing = await supabase
      .from("chat_memory_summaries")
      .select("policy_state")
      .eq("chat_id", chatId)
      .maybeSingle();

    // Skip update if table doesn't exist
    if (existing.error?.code === "PGRST205" || existing.error?.message?.includes("Could not find the table")) {
      return;
    }

    const baseState: PolicyState = existing?.data?.policy_state ?? {};
    const merged = { ...baseState, ...updates };

    const result = await supabase.from("chat_memory_summaries").update({ policy_state: merged }).eq("chat_id", chatId);
    
    // Ignore errors if table doesn't exist
    if (result.error?.code === "PGRST205" || result.error?.message?.includes("Could not find the table")) {
      return;
    }
  }

  private async checkRateLimits(
    chatId: string,
    gameId: string,
    playerCountryId: string,
    now: Date
  ): Promise<string | null> {
    const supabase = getSupabaseServerClient();
    const lastEntry = await supabase
      .from("llm_usage_ledger")
      .select("created_at")
      .eq("chat_id", chatId)
      .eq("player_country_id", playerCountryId)
      .eq("operation", "chat_reply")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Skip rate limiting if table doesn't exist
    if (lastEntry.error?.code === "PGRST205" || lastEntry.error?.message?.includes("Could not find the table")) {
      console.warn("[ChatPolicyService] llm_usage_ledger table not found, skipping rate limit checks");
      return null;
    }

    if (lastEntry.data && lastEntry.data.created_at) {
      const lastTime = new Date(lastEntry.data.created_at).getTime();
      if (now.getTime() - lastTime < MIN_CHAT_INTERVAL_MS) {
        return "Please wait a moment before sending another message in this chat.";
      }
    }

    const minuteAgo = new Date(now.getTime() - 60_000).toISOString();
    const burstRes = await supabase
      .from("llm_usage_ledger")
      .select("id", { count: "estimated" })
      .gte("created_at", minuteAgo)
      .eq("player_country_id", playerCountryId)
      .eq("game_id", gameId)
      .eq("operation", "chat_reply");

    if (burstRes.error?.code === "PGRST205" || burstRes.error?.message?.includes("Could not find the table")) {
      console.warn("[ChatPolicyService] llm_usage_ledger table not found, skipping rate limit checks");
      return null;
    }

    if (burstRes.error) {
      console.warn("[ChatPolicyService] Failed to count recent replies:", burstRes.error);
    }

    if ((burstRes.count ?? 0) >= PER_MINUTE_CAP) {
      return "You have reached the cap for diplomacy messages per minute. Try again soon.";
    }

    return null;
  }

  private async countTurnUsage(gameId: string, playerCountryId: string, turn: number): Promise<number> {
    const supabase = getSupabaseServerClient();
    const res = await supabase
      .from("llm_usage_ledger")
      .select("id", { count: "estimated" })
      .eq("game_id", gameId)
      .eq("player_country_id", playerCountryId)
      .eq("turn", turn)
      .eq("operation", "chat_reply");

    // Return 0 if table doesn't exist (no usage counted)
    if (res.error?.code === "PGRST205" || res.error?.message?.includes("Could not find the table")) {
      console.warn("[ChatPolicyService] llm_usage_ledger table not found, returning 0 usage");
      return 0;
    }

    if (res.error) {
      console.warn("[ChatPolicyService] Failed to count turn usage:", res.error);
      return 0;
    }

    return res.count ?? 0;
  }
}
