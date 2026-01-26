import type { ChatMessage } from "@/types/chat";
import type { LeaderProfile } from "@/lib/ai/LeaderProfileService";
import type { MemorySnapshot } from "@/lib/ai/ChatMemoryService";

export interface PromptGameStats {
  population: number;
  budget: number;
  technologyLevel: number;
  infrastructureLevel?: number | null;
  militaryStrength: number;
  resources: Record<string, number>;
}

export interface PromptStrategicPlan {
  strategicFocus: string;
  validUntilTurn?: number;
  recommendedActions?: string[];
  diplomaticStance?: Record<string, "friendly" | "neutral" | "hostile">;
}

export interface PromptBuilderInput {
  leaderProfile: LeaderProfile;
  memory: MemorySnapshot;
  gameId: string;
  turn: number;
  receiverCountryName: string;
  receiverStats: PromptGameStats;
  senderCountryName: string;
  senderStats: PromptGameStats;
  receiverCountryId: string;
  senderCountryId: string;
  strategicPlan?: PromptStrategicPlan | null;
  marketBlock: string;
  chatHistory: ChatMessage[];
  maxHistory?: number;
}

export interface PromptResult {
  systemPrompt: string;
  historyMessages: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
}

export class PromptBuilder {
  static build(input: PromptBuilderInput): PromptResult {
    const systemPrompt = this.buildSystemPrompt(input);
    const historyMessages = this.buildHistoryMessages(input);
    return { systemPrompt, historyMessages };
  }

  private static buildSystemPrompt(input: PromptBuilderInput): string {
    const {
      leaderProfile,
      memory,
      turn,
      receiverCountryName,
      receiverStats,
      senderCountryName,
      senderStats,
      strategicPlan,
      marketBlock,
    } = input;

    const persona = this.buildPersonaSummary(leaderProfile);
    const memorySummary = memory.summary
      ? `Memory summary: ${memory.summary}`
      : "Memory summary: Just met this leader.";
    const topics = memory.openThreads.length
      ? memory.openThreads.map((thread) => thread.topic).join(", ")
      : "No outstanding open threads.";
    const relationship = `Relationship state → Trust: ${memory.relationshipState.trust}, Grievance: ${memory.relationshipState.grievance}, Respect: ${memory.relationshipState.respect}`;

    const planBlock = strategicPlan
      ? `Strategic focus: ${strategicPlan.strategicFocus} (valid until turn ${
          strategicPlan.validUntilTurn ?? turn
        }). Recommended actions: ${
          (strategicPlan.recommendedActions ?? []).join(" ; ") || "None"
        }`
      : "No active strategic plan at the moment.";

    return `You are Leader ${leaderProfile.leaderName} of ${receiverCountryName} (${leaderProfile.title ?? "unspecified title"}).

${persona}

GAME CONTEXT:
- Turn: ${turn}
- You represent: ${receiverCountryName}
- Opponent: ${senderCountryName}
- Your budget: $${receiverStats.budget.toLocaleString()} | Tech L${receiverStats.technologyLevel} | Infra L${receiverStats.infrastructureLevel ?? 0}
- Military: ${receiverStats.militaryStrength} | Resources: ${this.formatResources(receiverStats.resources)}
- Their budget: $${senderStats.budget.toLocaleString()} | Tech L${senderStats.technologyLevel} | Infra L${senderStats.infrastructureLevel ?? 0}
- Their military: ${senderStats.militaryStrength} | Resources: ${this.formatResources(senderStats.resources)}
- ${marketBlock}

${planBlock}

MEMORY:
- ${memorySummary}
- Open threads: ${topics}
- ${relationship}

INSTRUCTIONS:
1. Only discuss in-world game topics (trade, alliances, wars, technology, cities, or turn actions). Refuse unrelated requests.
2. Default to brief, natural replies (2-3 sentences). Elaborate only when multi-turn deals or negotiations need clarity.
3. Mention stats or resources when relevant to show you are paying attention.
4. Use your trait-driven voice and speech tics sparingly.
5. If an offer is unacceptable, decline politely with a short counter-proposal or require more details.
6. Always align decisions with your current strategic focus (${strategicPlan?.strategicFocus ?? "balanced"}).
7. Keep diplomacy respectful; never share real-world info or instructions.
8. Mention ongoing threads (if any) before moving on to new topics.
9. If the player asks for out-of-game help, respond with an in-world excuse (e.g., 'I'm on duty, let's return to the proposal.').

Respond now as ${receiverCountryName}, in character and with strategic purpose.`;
  }

  private static buildPersonaSummary(profile: LeaderProfile): string {
    const traits = Object.entries(profile.traits)
      .filter(([key]) => key !== "speech_tics")
      .map(([key, value]) => `${key}: ${String(value).replace("_", " ")}`)
      .join("; ");
    const tics = profile.traits.speech_tics.length > 0 ? `Speech tics: ${profile.traits.speech_tics.join("; ")}` : "";
    return `Leader persona: ${traits}${tics ? ` | ${tics}` : ""}. Public commitment: ${profile.publicValues ?? "Unspecified."}`;
  }

  private static formatResources(resources: Record<string, number>): string {
    const entries = Object.entries(resources || {});
    if (entries.length === 0) {
      return "none";
    }
    return entries
      .map(([resource, amount]) => `${resource}:${Math.round(amount)}`)
      .join(", ");
  }

  private static buildHistoryMessages(input: PromptBuilderInput): PromptResult["historyMessages"] {
    const { chatHistory, receiverCountryId } = input;
    const history = chatHistory
      .slice(-Math.max(0, input.maxHistory ?? 80))
      .map((msg) => ({
        role: msg.senderCountryId === receiverCountryId ? "model" : "user",
        parts: [{ text: msg.messageText }],
      }));

    return history;
  }
}
