import { NextResponse } from "next/server";
import { z } from "zod";
import { ChatHandler, ChatTurnSchema } from "@/lib/ai/ChatHandler";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const BodySchema = ChatTurnSchema.extend({
  gameId: z.string().min(1),
  chatId: z.string().min(1),
  senderCountryId: z.string().min(1),
  receiverCountryId: z.string().min(1),
});

// Fallback store (dev only when Supabase env isn't set)
const memoryMessagesByChatId = new Map<
  string,
  Array<{
    id: string;
    chat_id: string;
    sender_country_id: string;
    message_text: string;
    is_ai_generated: boolean;
    created_at: string;
  }>
>();

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chatId = url.searchParams.get("chatId");
  
  if (!chatId) {
    return NextResponse.json({ error: "chatId is required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServerClient();
    const list = await supabase
      .from("chat_messages")
      .select("id, chat_id, sender_country_id, message_text, is_ai_generated, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(50);
    
    if (list.error) throw list.error;

    return NextResponse.json({
      messages: (list.data ?? []).map((m) => ({
        id: m.id,
        chatId: m.chat_id,
        senderCountryId: m.sender_country_id,
        messageText: m.message_text,
        isAiGenerated: m.is_ai_generated,
        createdAt: m.created_at,
      })),
    });
  } catch {
    const existing = memoryMessagesByChatId.get(chatId) ?? [];
    return NextResponse.json({
      messages: existing.map((m) => ({
        id: m.id,
        chatId: m.chat_id,
        senderCountryId: m.sender_country_id,
        messageText: m.message_text,
        isAiGenerated: m.is_ai_generated,
        createdAt: m.created_at,
      })),
      note: "Supabase not configured; using in-memory chat store.",
    });
  }
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { gameId, chatId, senderCountryId, receiverCountryId, messageText } = parsed.data;
  const handler = new ChatHandler();
  const ai = await handler.respond({ gameId, chatId, senderCountryId, receiverCountryId, messageText });

  // Try Supabase first; if env missing, use in-memory fallback.
  try {
    const supabase = getSupabaseServerClient();

    // Ensure chat exists (idempotent-ish). For now we rely on chatId being created elsewhere.
    // We still update last_message_at.
    await supabase
      .from("diplomacy_chats")
      .update({ last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", chatId);

    const now = new Date().toISOString();
    const humanInsert = await supabase
      .from("chat_messages")
      .insert({
        chat_id: chatId,
        sender_country_id: senderCountryId,
        message_text: messageText,
        is_ai_generated: false,
        created_at: now,
      })
      .select("id, chat_id, sender_country_id, message_text, is_ai_generated, created_at")
      .single();
    if (humanInsert.error) throw humanInsert.error;

    const aiInsert = await supabase
      .from("chat_messages")
      .insert({
        chat_id: chatId,
        sender_country_id: receiverCountryId,
        message_text: ai.messageText,
        is_ai_generated: true,
        created_at: new Date().toISOString(),
      })
      .select("id, chat_id, sender_country_id, message_text, is_ai_generated, created_at")
      .single();
    if (aiInsert.error) throw aiInsert.error;

    const list = await supabase
      .from("chat_messages")
      .select("id, chat_id, sender_country_id, message_text, is_ai_generated, created_at")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true })
      .limit(50);
    if (list.error) throw list.error;

    return NextResponse.json({
      messages: (list.data ?? []).map((m) => ({
        id: m.id,
        chatId: m.chat_id,
        senderCountryId: m.sender_country_id,
        messageText: m.message_text,
        isAiGenerated: m.is_ai_generated,
        createdAt: m.created_at,
      })),
      suggestedDeal: ai.suggestedDeal ?? null,
    });
  } catch {
    const now = new Date().toISOString();
    const human = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      sender_country_id: senderCountryId,
      message_text: messageText,
      is_ai_generated: false,
      created_at: now,
    };
    const bot = {
      id: crypto.randomUUID(),
      chat_id: chatId,
      sender_country_id: receiverCountryId,
      message_text: ai.messageText,
      is_ai_generated: true,
      created_at: new Date().toISOString(),
    };
    const existing = memoryMessagesByChatId.get(chatId) ?? [];
    const next = [...existing, human, bot].slice(-50);
    memoryMessagesByChatId.set(chatId, next);

    return NextResponse.json({
      messages: next.map((m) => ({
        id: m.id,
        chatId: m.chat_id,
        senderCountryId: m.sender_country_id,
        messageText: m.message_text,
        isAiGenerated: m.is_ai_generated,
        createdAt: m.created_at,
      })),
      suggestedDeal: ai.suggestedDeal ?? null,
      note: "Supabase not configured; using in-memory chat store.",
    });
  }
}

