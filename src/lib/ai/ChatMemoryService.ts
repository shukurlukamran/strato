import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/types/chat";
import { randomUUID } from "node:crypto";
import { LLMUsageLogger } from "./LLMUsageLogger";

interface RelationshipState {
  trust: number;
  grievance: number;
  respect: number;
}

interface OpenThread {
  topic: string;
  snippet: string;
  lastMentionedAt: string;
}

export interface MemorySnapshot {
  summary: string | null;
  openThreads: OpenThread[];
  relationshipState: RelationshipState;
  didSummarize?: boolean;
}

interface MemoryRow {
  id: string;
  summary: string | null;
  open_threads: OpenThread[];
  relationship_state: RelationshipState;
  last_summarized_message_at: string | null;
  last_message_id: string | null;
}

const THREAD_PATTERNS: Array<[RegExp, string]> = [
  [/\btrade\b|\bdeal\b|\bexchange\b/, "trade"],
  [/\balliance\b|\bpact\b|\bnon[- ]aggression\b/, "diplomacy"],
  [/\battack\b|\bwar\b|\bconquer\b|\boffensive\b/, "military"],
  [/\bresearch\b|\btechnology\b|\bscience\b/, "research"],
  [/\bbudget\b|\bcredits\b|\bfunds\b/, "economy"],
  [/\bcity\b|\bterritory\b|\bcontrol\b/, "territory"],
];

const RESOLUTION_KEYWORDS = ["accepted", "agreed", "deal!", "deal.", "confirmed", "signed", "ratified"];

const SUMMARY_TRIGGER_COUNT = Number(process.env.LLM_CHAT_SUMMARY_THRESHOLD ?? 12);

export class ChatMemoryService {
  private usageLogger = new LLMUsageLogger();
  async captureMemory(params: {
    chatId: string;
    chatHistory: ChatMessage[];
    newMessageText: string;
    senderCountryId: string;
    usageContext?: { gameId: string; playerCountryId: string; turn: number };
  }): Promise<MemorySnapshot> {
    const { chatId, chatHistory, newMessageText, senderCountryId, usageContext } = params;
    const supabase = getSupabaseServerClient();

    const memoryRow = await this.ensureRow(chatId);
    const memory = this.normalizeRow(memoryRow);

    const updatedRelationships = this.applyRelationshipDelta(memory.relationship_state, newMessageText);
    const updatedThreads = this.updateThreads(memory.open_threads, newMessageText);

    const shouldSummarize = this.shouldSummarize(memory, chatHistory);
    const summary = shouldSummarize
      ? this.buildSummary([...chatHistory, this.mockMessage(newMessageText, senderCountryId)], updatedThreads, updatedRelationships)
      : memory.summary;

    await supabase
      .from("chat_memory_summaries")
      .update({
        summary,
        open_threads: updatedThreads,
        relationship_state: updatedRelationships,
        last_summarized_message_at: shouldSummarize ? new Date().toISOString() : memory.last_summarized_message_at,
      })
      .eq("chat_id", chatId);

    if (shouldSummarize && usageContext) {
      await this.usageLogger.log({
        gameId: usageContext.gameId,
        playerCountryId: usageContext.playerCountryId,
        operation: "summary_update",
        turn: usageContext.turn,
        inputChars: newMessageText.length,
        outputChars: summary?.length ?? 0,
      });
    }

    return {
      summary,
      openThreads: updatedThreads,
      relationshipState: updatedRelationships,
      didSummarize: shouldSummarize,
    };
  }

  private shouldSummarize(memory: MemoryRow, chatHistory: ChatMessage[]): boolean {
    const lastSummarized = memory.last_summarized_message_at
      ? new Date(memory.last_summarized_message_at).getTime()
      : 0;
    const messagesAfter = chatHistory.filter((msg) => new Date(msg.createdAt).getTime() > lastSummarized);
    return messagesAfter.length >= SUMMARY_TRIGGER_COUNT;
  }

  private updateThreads(threads: OpenThread[], message: string): OpenThread[] {
    const normalized = message.toLowerCase();
    const resolution = RESOLUTION_KEYWORDS.some((word) => normalized.includes(word));
    const matched = THREAD_PATTERNS.find(([pattern]) => pattern.test(normalized));
    const now = new Date().toISOString();

    const nextThreads = threads.filter((thread) => !(resolution && normalized.includes(thread.topic)));

    if (matched) {
      const [, topic] = matched;
      const snippet = message.length > 80 ? `${message.slice(0, 80)}…` : message;
      const existing = nextThreads.find((thread) => thread.topic === topic);
      if (existing) {
        existing.snippet = snippet;
        existing.lastMentionedAt = now;
      } else {
        nextThreads.unshift({ topic, snippet, lastMentionedAt: now });
      }
    }

    return nextThreads.slice(0, 5);
  }

  private applyRelationshipDelta(state: RelationshipState, message: string): RelationshipState {
    const delta = this.classifyMessageTone(message);
    return {
      trust: this.clamp(state.trust + delta.trust),
      grievance: this.clamp(state.grievance + delta.grievance),
      respect: this.clamp(state.respect + delta.respect),
    };
  }

  private classifyMessageTone(message: string): RelationshipState {
    const normalized = message.toLowerCase();
    const positive = ["agree", "thanks", "welcome", "trade", "deal", "ally"];
    const negative = ["attack", "threat", "war", "surrender", "refuse", "punish"];
    const isPositive = positive.some((word) => normalized.includes(word));
    const isNegative = negative.some((word) => normalized.includes(word));

    if (isPositive) {
      return { trust: 2, grievance: -1, respect: 1 };
    }

    if (isNegative) {
      return { trust: -3, grievance: 3, respect: -2 };
    }

    return { trust: 0, grievance: 0, respect: 0 };
  }

  private buildSummary(
    messages: ChatMessage[],
    openThreads: OpenThread[],
    relationshipState: RelationshipState
  ): string {
    const topics = openThreads.length > 0 ? openThreads.map((thread) => thread.topic).join(", ") : "general diplomacy";
    const preview = messages.length > 0 ? messages.at(-1)?.messageText ?? "" : "";
    return `Recent exchange touched on ${topics}. Latest point: "${preview.slice(0, 120)}"`;
  }

  private mockMessage(text: string, senderCountryId: string): ChatMessage {
    return {
      id: randomUUID(),
      chatId: "",
      senderCountryId,
      messageText: text,
      isAiGenerated: false,
      createdAt: new Date().toISOString(),
    };
  }

  private clamp(value: number): number {
    return Math.max(0, Math.min(100, value));
  }

  private normalizeRow(row: any): MemoryRow {
    return {
      id: row.id,
      summary: row.summary,
      open_threads: Array.isArray(row.open_threads) ? row.open_threads : [],
      relationship_state: row.relationship_state ?? { trust: 50, grievance: 0, respect: 50 },
      last_summarized_message_at: row.last_summarized_message_at,
      last_message_id: row.last_message_id,
    };
  }

  private toSnapshot(row: MemoryRow): MemorySnapshot {
    return {
      summary: row.summary,
      openThreads: row.open_threads,
      relationshipState: row.relationship_state,
      didSummarize: row.last_summarized_message_at !== null,
    };
  }

  private async ensureRow(chatId: string): Promise<MemoryRow> {
    const supabase = getSupabaseServerClient();
    const row = await supabase
      .from("chat_memory_summaries")
      .select("*")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (row.error) {
      console.error("[ChatMemoryService] Failed to load memory:", row.error);
    }

    if (row.data) {
      return this.normalizeRow(row.data);
    }

    const created = await supabase
      .from("chat_memory_summaries")
      .insert({ chat_id: chatId })
      .select("*")
      .single();
    if (created.error || !created.data) {
      throw new Error("Unable to create chat memory row");
    }

    return this.normalizeRow(created.data);
  }

  private async fetchRow(chatId: string): Promise<MemoryRow | null> {
    const supabase = getSupabaseServerClient();
    const row = await supabase
      .from("chat_memory_summaries")
      .select("*")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (row.error || !row.data) {
      return null;
    }
    return this.normalizeRow(row.data);
  }

  async loadMemoryByChatId(chatId?: string): Promise<MemorySnapshot | null> {
    if (!chatId) return null;
    const row = await this.fetchRow(chatId);
    if (!row) return null;
    return this.toSnapshot(row);
  }

  async loadMemoryByCountries(gameId: string, countryAId: string, countryBId: string): Promise<MemorySnapshot | null> {
    const supabase = getSupabaseServerClient();
    const chatRes = await supabase
      .from("diplomacy_chats")
      .select("id")
      .eq("game_id", gameId)
      .or(
        `and(country_a_id.eq.${countryAId},country_b_id.eq.${countryBId}),and(country_a_id.eq.${countryBId},country_b_id.eq.${countryAId})`
      )
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (chatRes.error || !chatRes.data?.id) {
      return null;
    }

    return this.loadMemoryByChatId(chatRes.data.id);
  }

  async setLastMessageId(chatId: string, messageId: string): Promise<void> {
    const supabase = getSupabaseServerClient();
    await supabase
      .from("chat_memory_summaries")
      .update({ last_message_id: messageId, updated_at: new Date().toISOString() })
      .eq("chat_id", chatId);
  }
}
