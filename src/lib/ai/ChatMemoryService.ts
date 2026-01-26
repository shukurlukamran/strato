import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/types/chat";
import { randomUUID } from "node:crypto";

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
  async captureMemory(params: {
    chatId: string;
    chatHistory: ChatMessage[];
    newMessageText: string;
    senderCountryId: string;
  }): Promise<MemorySnapshot> {
    const { chatId, chatHistory, newMessageText, senderCountryId } = params;
    const supabase = getSupabaseServerClient();

    let row = await supabase
      .from("chat_memory_summaries")
      .select("*")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (row.error) {
      console.error("[ChatMemoryService] Failed to load memory:", row.error);
    }

    if (!row.data) {
      const created = await supabase
        .from("chat_memory_summaries")
        .insert({ chat_id: chatId })
        .select("*")
        .single();
      if (created.error || !created.data) {
        throw new Error("Unable to create chat memory row");
      }
      row = created;
    }

    const memory: MemoryRow = {
      id: row.data.id,
      summary: row.data.summary,
      open_threads: row.data.open_threads ?? [],
      relationship_state: row.data.relationship_state ?? { trust: 50, grievance: 0, respect: 50 },
      last_summarized_message_at: row.data.last_summarized_message_at,
      last_message_id: row.data.last_message_id,
    };

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
        last_message_id: randomUUID(),
      })
      .eq("chat_id", chatId);

    return {
      summary,
      openThreads: updatedThreads,
      relationshipState: updatedRelationships,
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
}
