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

        // Try to find existing chat - check both possible orderings of countries
        const chatRes1 = await supabase
          .from("diplomacy_chats")
          .select("id")
          .eq("game_id", gameId)
          .eq("country_a_id", playerCountryId)
          .eq("country_b_id", countryId)
          .maybeSingle();

        let chatRes2 = null;
        if (!chatRes1.data) {
          chatRes2 = await supabase
            .from("diplomacy_chats")
            .select("id")
            .eq("game_id", gameId)
            .eq("country_a_id", countryId)
            .eq("country_b_id", playerCountryId)
            .maybeSingle();
        }

        if (chatRes1.data) {
          chatId = chatRes1.data.id;
        } else if (chatRes2 && chatRes2.data) {
          chatId = chatRes2.data.id;
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

          if (newChatRes.data && !newChatRes.error) {
            chatId = newChatRes.data.id;
          } else {
            console.error("Failed to create chat:", newChatRes.error);
          }
        }

        // Use ChatHandler with Gemini
        const handler = new ChatHandler();
        
        // Log request details for debugging
        console.log("ChatHandler request:", {
          gameId,
          chatId: chatId || "none",
          senderCountryId: playerCountryId,
          receiverCountryId: countryId,
          messageLength: message.length,
          hasChatHistory: !!chatHistory && chatHistory.length > 0,
        });
        
        const aiResponse = await handler.respond({
          gameId,
          chatId: chatId || undefined, // Pass undefined if chatId couldn't be created
          senderCountryId: playerCountryId,
          receiverCountryId: countryId,
          messageText: message,
        });

        // Log if we got a fallback response (indicates an issue)
        if (aiResponse.messageText.includes("I've received your message") || 
            aiResponse.messageText.includes("I need more context")) {
          console.warn("ChatHandler returned fallback response. Context might be missing.");
          console.warn("Request data:", { gameId, chatId, playerCountryId, countryId });
          console.warn("This usually means:");
          console.warn("1. Supabase is not configured or connection failed");
          console.warn("2. Game/country data not found in database");
          console.warn("3. Gemini API key is invalid or quota exceeded");
        }

        return NextResponse.json({ 
          response: aiResponse.messageText,
          chatId: chatId || undefined
        });
      } catch (error) {
        console.error("Error using ChatHandler:", error);
        // Log the full error for debugging
        if (error instanceof Error) {
          console.error("Error details:", error.message, error.stack);
        }
        // Fall through to fallback response
      }
    }

    // Fallback response if ChatHandler fails or required data is missing
    return NextResponse.json({
      response: "I'm interested in your proposal. What terms do you suggest?",
      chatId: undefined,
    });
  } catch (error) {
    console.error("Error in diplomacy chat route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
