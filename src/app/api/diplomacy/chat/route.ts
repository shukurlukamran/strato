import { NextResponse } from "next/server";
import { ChatHandler } from "@/lib/ai/ChatHandler";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { gameId, countryId, playerCountryId, message, chatHistory } = body;

    if (!countryId || !message) {
      return NextResponse.json(
        { error: "countryId and message are required" },
        { status: 400 }
      );
    }

    // If we have gameId and playerCountryId, use ChatHandler with Gemini
    if (gameId && playerCountryId) {
      try {
        // Try to find or create a chatId for this conversation
        const supabase = getSupabaseServerClient();
        let chatId: string | undefined;

        // Try to find existing chat
        const chatRes = await supabase
          .from("diplomacy_chats")
          .select("id")
          .eq("game_id", gameId)
          .or(`country_a_id.eq.${playerCountryId},country_b_id.eq.${playerCountryId}`)
          .or(`country_a_id.eq.${countryId},country_b_id.eq.${countryId}`)
          .limit(1)
          .single();

        if (chatRes.data) {
          chatId = chatRes.data.id;
        } else {
          // Create a new chat if it doesn't exist
          const newChatRes = await supabase
            .from("diplomacy_chats")
            .insert({
              game_id: gameId,
              country_a_id: playerCountryId,
              country_b_id: countryId,
            })
            .select("id")
            .single();

          if (newChatRes.data) {
            chatId = newChatRes.data.id;
          }
        }

        // Use ChatHandler with Gemini
        const handler = new ChatHandler();
        const aiResponse = await handler.respond({
          gameId,
          chatId,
          senderCountryId: playerCountryId,
          receiverCountryId: countryId,
          messageText: message,
        });

        return NextResponse.json({ response: aiResponse.messageText });
      } catch (error) {
        console.error("Error using ChatHandler:", error);
        // Fall through to fallback response
      }
    }

    // Fallback response if ChatHandler fails or required data is missing
    return NextResponse.json({
      response: "I'm interested in your proposal. What terms do you suggest?",
    });
  } catch (error) {
    console.error("Error in diplomacy chat route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
