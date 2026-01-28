"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Country, CountryStats } from "@/types/country";
import type { DealExtractionResult } from "@/lib/deals/DealExtractor";
import { ResourceProfileBadge } from "./ResourceProfileBadge";
import { LeaderProfileService, type LeaderProfile } from "@/lib/ai/LeaderProfileService";
import { Tooltip } from "./Tooltip";

interface ChatMessage {
  id: string;
  sender: "player" | "country";
  text: string;
  timestamp: Date;
}

// Generate a comprehensive tooltip summary for a leader
function generateLeaderTooltipContent(profile: LeaderProfile, countryName?: string): string {
  const { traits, decisionWeights } = profile;

  // Personality summary based on key traits
  const personalityTraits = [
    traits.temperament === 'fiery' ? 'passionate and quick-tempered' :
    traits.temperament === 'icy' ? 'cold and calculating' : 'calm and composed',
    traits.directness === 'blunt' ? 'straightforward and direct' :
    traits.directness === 'diplomatic' ? 'diplomatic and tactful' : 'flowery and elaborate',
    traits.patience === 'impatient' ? 'impatient and quick to act' :
    traits.patience === 'long_game' ? 'patient and strategic' : 'steady and methodical'
  ].filter(Boolean);

  // Decision style summary
  const decisionStyle =
    decisionWeights.aggression > 0.6 ? 'aggressive and expansionist' :
    decisionWeights.aggression < 0.4 ? 'peaceful and defensive' : 'balanced in approach';

  const cooperationStyle =
    decisionWeights.cooperativeness > 0.6 ? 'highly cooperative and alliance-focused' :
    decisionWeights.cooperativeness < 0.4 ? 'isolationist and independent' : 'transactional in diplomacy';

  const riskStyle =
    decisionWeights.riskTolerance > 0.6 ? 'bold and risk-taking' :
    decisionWeights.riskTolerance < 0.4 ? 'cautious and risk-averse' : 'measured in risk assessment';

  // Key behavioral tendencies
  const keyTendencies = [
    traits.honor === 'keeps_word' ? 'honorable and reliable in agreements' :
    traits.honor === 'pragmatic' ? 'pragmatic and flexible with commitments' : 'vengeful toward betrayals',
    traits.fairness === 'generous' ? 'generous in negotiations' :
    traits.fairness === 'hard_bargainer' ? 'tough and demanding in deals' : 'fair and market-oriented',
    traits.paranoia === 'trusting' ? 'trusting of others' :
    traits.paranoia === 'paranoid' ? 'highly suspicious and distrustful' : 'wary but open to cooperation'
  ].filter(Boolean);

  // Speech and interaction style
  const speechStyle = [
    traits.verbosity === 'expansive' ? 'verbose and detailed in communication' :
    traits.verbosity === 'terse' ? 'concise and to-the-point' : 'balanced in expression',
    traits.register === 'formal' ? 'formal and diplomatic in tone' :
    traits.register === 'streetwise' ? 'pragmatic and direct' : 'conversational and approachable',
    traits.humor === 'playful' ? 'witty and humorous' :
    traits.humor === 'dry' ? 'subtly humorous' : 'serious and focused'
  ].filter(Boolean);

  // Craft 5-6 sentences
  const sentences = [
    `${profile.leaderName} is a ${personalityTraits.slice(0, 2).join(' and ')} leader who serves as ${profile.title}.`,
    `${traits.pride === 'arrogant' ? 'Confident to the point of arrogance' : traits.pride === 'humble' ? 'Humbly aware of their limitations' : 'Proud of their achievements'}, they lead ${profile.publicValues ? `with values emphasizing ${profile.publicValues.toLowerCase()}` : 'with a clear vision for their nation'}.`,
    `In decision-making, they tend to be ${decisionStyle}, ${cooperationStyle}, and ${riskStyle}.`,
    `Their approach to diplomacy and agreements shows they are ${keyTendencies.slice(0, 2).join(' and ')}.`,
    `Communication-wise, they are ${speechStyle.slice(0, 2).join(' and ')}, making them ${traits.empathy === 'high' ? 'attuned to others\' perspectives' : traits.empathy === 'low' ? 'focused on their own objectives' : 'moderately considerate of others\' views'}.`,
    `Overall, ${profile.leaderName} represents a ${traits.ideology === 'idealist' ? 'principled and values-driven' : traits.ideology === 'opportunist' ? 'opportunistic and adaptable' : 'pragmatic and realistic'} leadership style that shapes ${countryName || 'their nation'}\'s interactions with the world.`
  ];

  return sentences.join(' ');
}

export function CountryCard({ 
  country, 
  stats,
  gameId,
  playerCountryId,
  chatId: initialChatId,
  onChatIdCreated,
  onStatsUpdate
}: { 
  country: Country | null;
  stats: CountryStats | null;
  gameId?: string;
  playerCountryId?: string;
  chatId?: string;
  onChatIdCreated?: (countryId: string, chatId: string) => void;
  onStatsUpdate?: (countryIds: string[]) => void;
}) {
  const [showChat, setShowChat] = useState(false);
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedDeal, setExtractedDeal] = useState<DealExtractionResult | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [dealExecuted, setDealExecuted] = useState(false);
  const [confirmingDeal, setConfirmingDeal] = useState(false);
  // Use the chatId from props (from game page state) or local state as fallback
  const [chatId, setChatId] = useState<string>(initialChatId || "");
  const [leaderProfile, setLeaderProfile] = useState<LeaderProfile | null>(null);

  // Update chatId when initialChatId prop changes (e.g., when selecting a different country)
  useEffect(() => {
    if (initialChatId && initialChatId !== chatId) {
      setChatId(initialChatId);
      console.log("ChatId updated from props:", initialChatId);
    }
  }, [initialChatId]);

  // Reset chat history when country changes
  useEffect(() => {
    setChatHistory([]);
    setExtractedDeal(null);
    setExtractionError(null);
    setDealExecuted(false);
    setConfirmingDeal(false);
    setLeaderProfile(null);
  }, [country?.id]);

  // Fetch leader profile for AI countries
  useEffect(() => {
    if (!country || country.isPlayerControlled || !gameId) {
      setLeaderProfile(null);
      return;
    }

    const fetchLeaderProfile = async () => {
      try {
        const service = new LeaderProfileService();
        const profile = await service.getOrCreateProfile({
          gameId,
          countryId: country.id,
          resourceProfile: stats?.resourceProfile,
          countryName: country.name,
        });
        setLeaderProfile(profile);
      } catch (error) {
        console.error("Failed to fetch leader profile:", error);
        setLeaderProfile(null);
      }
    };

    void fetchLeaderProfile();
  }, [country, gameId, stats?.resourceProfile]);

  if (!country || !stats) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-800/50 p-4 text-sm text-white/60">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-white/20" />
          <span>Select a country on the map</span>
        </div>
      </div>
    );
  }

  const handleProposeDeal = async () => {
    setShowChat(true);
    
    // Load existing chat history from database if we have a chatId
    if (chatId && gameId && playerCountryId && country.id) {
      try {
        console.log(`Loading chat history for chatId: ${chatId}`);
        const response = await fetch(`/api/chat?chatId=${encodeURIComponent(chatId)}`);
        
        if (response.ok) {
          const data = await response.json();
          
          // Convert database messages to our ChatMessage format
          if (data.messages && Array.isArray(data.messages)) {
            const loadedHistory: ChatMessage[] = data.messages.map((msg: any) => ({
              id: msg.id,
              sender: msg.senderCountryId === playerCountryId ? "player" : "country",
              text: msg.messageText,
              timestamp: new Date(msg.createdAt),
            }));
            
            setChatHistory(loadedHistory);
            console.log(`Loaded ${loadedHistory.length} messages from database`);
          }
        } else {
          console.warn("Failed to load chat history:", await response.text());
        }
      } catch (error) {
        console.error("Failed to load chat history:", error);
      }
    } else if (!chatId) {
      // No chatId yet - will be created on first message
      console.log("No chatId yet - chat will be created on first message");
    }
  };

  const handleSendMessage = async () => {
    if (!chatMessage.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: "player",
      text: chatMessage.trim(),
      timestamp: new Date(),
    };

    const updatedHistory = [...chatHistory, userMessage];
    setChatHistory(updatedHistory);
    setChatMessage("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/diplomacy/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          gameId: gameId || "",
          countryId: country.id,
          playerCountryId: playerCountryId || "",
          message: userMessage.text,
          chatHistory: updatedHistory.map((msg) => ({
            sender: msg.sender,
            text: msg.text,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();
      
      // Store chatId if returned and it's a valid UUID
      if (data.chatId && typeof data.chatId === 'string' && data.chatId.length > 0) {
        // Validate it's a UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(data.chatId)) {
          // Only update if it's different (to avoid unnecessary re-renders)
          if (chatId !== data.chatId) {
            setChatId(data.chatId);
            console.log("ChatId stored:", data.chatId);
            
            // Notify parent component that a new chat was created
            if (onChatIdCreated && country) {
              onChatIdCreated(country.id, data.chatId);
            }
          }
        } else {
          console.warn("Invalid chatId format received:", data.chatId);
        }
      } else {
        console.warn("No valid chatId in response:", data);
      }
      
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "country",
        text: data.response,
        timestamp: new Date(),
      };

      setChatHistory([...updatedHistory, aiMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "country",
        text: "Sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setChatHistory([...updatedHistory, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseChat = () => {
    setShowChat(false);
  };

  // Helper function to validate UUID
  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  const handleExtractDeal = async () => {
    if (!gameId || !playerCountryId || !country.id || chatHistory.length === 0) {
      setExtractionError("Cannot extract deal: missing information or no messages");
      return;
    }

    // Use stored chatId or try to get/create it
    let currentChatId = chatId;
    
    // Validate that chatId is a valid UUID
    if (!currentChatId || !isValidUUID(currentChatId)) {
      console.log("ChatId missing or invalid, attempting to get/create chat:", { 
        currentChatId, 
        gameId, 
        playerCountryId, 
        countryId: country.id 
      });
      
      // Try to get chatId by making a request to find/create the chat
      try {
        const findChatRes = await fetch("/api/diplomacy/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            gameId,
            countryId: country.id,
            playerCountryId,
            message: " ", // Minimal message to trigger chat creation
            chatHistory: [],
          }),
        });

        if (findChatRes.ok) {
          const findData = await findChatRes.json();
          if (findData.chatId && isValidUUID(findData.chatId)) {
            currentChatId = findData.chatId;
            setChatId(currentChatId);
            console.log("ChatId obtained from API:", currentChatId);
          } else {
            setExtractionError("Chat not properly initialized. Please send a message first.");
            return;
          }
        } else {
          setExtractionError("Failed to initialize chat. Please send a message first.");
          return;
        }
      } catch (e) {
        console.error("Failed to get chatId:", e);
        setExtractionError("Chat not initialized. Send a message first.");
        return;
      }
    }

    // Final validation
    if (!currentChatId || !isValidUUID(currentChatId)) {
      setExtractionError("Invalid chat ID. Please send a message first.");
      console.error("Invalid chatId before extraction:", currentChatId);
      return;
    }

    console.log("Extracting deal with:", { gameId, chatId: currentChatId, countryAId: playerCountryId, countryBId: country.id });

    setExtracting(true);
    setExtractionError(null);
    setExtractedDeal(null);
    setDealExecuted(false);
    setConfirmingDeal(false);

    try {
      const res = await fetch("/api/deals/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameId,
          chatId: currentChatId,
          countryAId: playerCountryId,
          countryBId: country.id,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to extract deal");
      }

      const data = (await res.json()) as { 
        deal: DealExtractionResult | null; 
        message?: string;
        executed?: boolean;
      };
      
      if (data.deal) {
        setExtractedDeal(data.deal);
        setDealExecuted(false);
      } else {
        setExtractionError(data.message || "No deal detected in the conversation");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to extract deal";
      setExtractionError(errorMessage);
      console.error("Deal extraction error:", error);
    } finally {
      setExtracting(false);
    }
  };

  const handleConfirmDeal = async () => {
    if (confirmingDeal || !extractedDeal) return;
    if (!gameId || !playerCountryId) {
      setExtractionError("Cannot confirm deal: missing game or player information");
      return;
    }

    // Receiver is the "other" party in the extracted deal.
    const counterpartId = country.id;
    const proposingCountryId = extractedDeal.proposerCountryId;
    const receivingCountryId = proposingCountryId === playerCountryId ? counterpartId : playerCountryId;

    setConfirmingDeal(true);
    setExtractionError(null);
    try {
      const res = await fetch("/api/deals/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameId,
          proposingCountryId,
          receivingCountryId,
          dealType: extractedDeal.dealType,
          dealTerms: extractedDeal.dealTerms,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to confirm deal");
      }

      setDealExecuted(true);

      // Refresh stats for both countries involved in the deal
      if (onStatsUpdate && playerCountryId && counterpartId) {
        onStatsUpdate([playerCountryId, counterpartId]);
      }
    } catch (e) {
      setExtractionError(e instanceof Error ? e.message : "Failed to confirm deal");
    } finally {
      setConfirmingDeal(false);
    }
  };

  // Map existing data to display format
  const government = country.isPlayerControlled ? "Your Country" : "AI Controlled";

  return (
    <>
      <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
        <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
          <span
            className="inline-block h-4 w-4 rounded border-2 border-white/30 shadow-md"
            style={{ backgroundColor: country.color }}
          />
          <div className="flex-1">
            <div className="text-lg font-bold text-white">
              {!country.isPlayerControlled && leaderProfile ? (
                <span>
                  <Tooltip content={generateLeaderTooltipContent(leaderProfile, country.name)}>
                    <span className="text-blue-300 cursor-help hover:text-blue-200 transition-colors">
                      {leaderProfile.leaderName}
                    </span>
                  </Tooltip> of {country.name}
                </span>
              ) : (
                country.name
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="text-xs text-white/60">{government}</div>
              <ResourceProfileBadge profile={stats.resourceProfile} />
            </div>
            {/* Diplomatic Relations - only show for non-player countries */}
            {!country.isPlayerControlled && playerCountryId && (
              <div className="mt-2 flex items-center gap-2">
                {(() => {
                  // Get the player's stats to check their diplomatic relations
                  const playerStats = playerCountryId ? stats : null;
                  // Get the relation score from the selected country's perspective towards the player
                  const relationScore = stats.diplomaticRelations?.[playerCountryId] ?? 50;
                  
                  // Determine status based on score
                  let statusText = "Neutral";
                  let statusColor = "text-gray-400";
                  let statusIcon = "●";
                  
                  if (relationScore >= 70) {
                    statusText = "Friendly";
                    statusColor = "text-green-400";
                    statusIcon = "●";
                  } else if (relationScore >= 50) {
                    statusText = "Neutral";
                    statusColor = "text-gray-400";
                    statusIcon = "●";
                  } else if (relationScore >= 30) {
                    statusText = "Cold";
                    statusColor = "text-yellow-400";
                    statusIcon = "●";
                  } else {
                    statusText = "Hostile";
                    statusColor = "text-red-400";
                    statusIcon = "●";
                  }
                  
                  return (
                    <>
                      <span className={`text-xs ${statusColor}`}>{statusIcon}</span>
                      <span className="text-xs text-white/70">
                        Relations: <span className={statusColor}>{statusText}</span> ({relationScore}/100)
                      </span>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          {country.isPlayerControlled && (
            <span className="text-xl text-yellow-400">⚜</span>
          )}
        </div>

        {/* Only show Propose Deal button for other countries, not player's own country */}
        {!country.isPlayerControlled && (
          <button
            type="button"
            onClick={handleProposeDeal}
            className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-500 hover:to-blue-600 hover:shadow-xl active:scale-95"
          >
            Propose Deal
          </button>
        )}
      </div>

      {showChat && typeof window !== "undefined" && createPortal(
        <div className="fixed inset-0 z-50 bg-black/50" onClick={handleCloseChat}>
          <div 
            className="fixed right-0 top-0 h-full w-96 flex flex-col border-l border-white/20 bg-gradient-to-br from-slate-800 to-slate-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="flex items-center gap-3">
                <span
                  className="inline-block h-4 w-4 rounded border-2 border-white/30 shadow-md"
                  style={{ backgroundColor: country.color }}
                />
                <span className="text-lg font-semibold text-white">{country.name}</span>
              </div>
              <button
                type="button"
                onClick={handleCloseChat}
                className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                aria-label="Close chat"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatHistory.length === 0 ? (
                <div className="flex h-full items-center justify-center text-white/60">
                  <p>Start a conversation with {country.name}...</p>
                </div>
              ) : (
                chatHistory.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender === "player" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-4 py-2 ${
                        msg.sender === "player"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-700 text-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                      <p className="mt-1 text-xs opacity-70">
                        {msg.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-slate-700 px-4 py-2 text-white">
                    <p>Thinking...</p>
                  </div>
                </div>
              )}
            </div>

            {/* Input Field */}
            <div className="border-t border-white/10 p-4 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessage}
                  onChange={(e) => setChatMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Type your message..."
                  disabled={isLoading}
                  className="flex-1 rounded-lg border border-white/20 bg-slate-800/50 px-4 py-2 text-white placeholder:text-white/50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={isLoading || !chatMessage.trim()}
                  className="rounded-lg bg-blue-600 px-6 py-2 font-semibold text-white transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
              
              {/* Extract Deal Button - Always Visible */}
              <div className="flex items-center gap-2" style={{ display: 'flex', minHeight: '2rem' }}>
                <button
                  type="button"
                  onClick={() => void handleExtractDeal()}
                  disabled={extracting || isLoading || chatHistory.length === 0}
                  className="rounded-lg border border-white/20 bg-slate-700/50 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-slate-600/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  style={{ 
                    display: 'inline-block',
                    visibility: 'visible',
                    minWidth: '100px'
                  }}
                  title={chatHistory.length === 0 ? "Start a conversation to extract a deal" : undefined}
                >
                  {extracting ? "Extracting..." : "Extract Deal"}
                </button>
                {extractionError && (
                  <span className="text-xs text-red-400">{extractionError}</span>
                )}
              </div>

              {/* Extracted Deal Display */}
              {extractedDeal && (
                <div className={`mt-2 rounded-lg border p-3 text-xs ${
                  dealExecuted 
                    ? "border-green-400/30 bg-green-900/20" 
                    : "border-blue-400/30 bg-blue-900/20"
                }`}>
                  <div className="flex items-center gap-2">
                    <div className={`font-semibold ${dealExecuted ? "text-green-300" : "text-blue-300"}`}>
                      {dealExecuted ? "✓ Deal Confirmed & Executed!" : "Deal Extracted (Draft)"}
                    </div>
                    {dealExecuted && (
                      <span className="text-green-400 text-lg">✓</span>
                    )}
                  </div>
                  {!dealExecuted && (
                    <div className="mt-1 text-xs text-blue-200/80">
                      Review the terms below, then click Confirm to execute the deal.
                    </div>
                  )}
                  <div className="mt-1 text-blue-200">
                    Type: <span className="font-medium">{extractedDeal.dealType}</span>
                    {extractedDeal.reasoning && (
                      <div className="mt-1 italic text-blue-300/80">{extractedDeal.reasoning}</div>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-blue-200">
                    <div>
                      <strong>{extractedDeal.proposerCountryId === playerCountryId ? "You" : "They"} commit:</strong>{" "}
                      {extractedDeal.dealTerms.proposerCommitments.length > 0
                        ? extractedDeal.dealTerms.proposerCommitments
                            .map((c) => {
                              if (c.type === "resource_transfer") {
                                return `${c.amount} ${c.resource}`;
                              } else if (c.type === "budget_transfer") {
                                return `${c.amount} credits`;
                              }
                              return c.type;
                            })
                            .join(", ")
                        : "Nothing"}
                    </div>
                    <div>
                      <strong>{extractedDeal.proposerCountryId === playerCountryId ? "They" : "You"} commit:</strong>{" "}
                      {extractedDeal.dealTerms.receiverCommitments.length > 0
                        ? extractedDeal.dealTerms.receiverCommitments
                            .map((c) => {
                              if (c.type === "resource_transfer") {
                                return `${c.amount} ${c.resource}`;
                              } else if (c.type === "budget_transfer") {
                                return `${c.amount} credits`;
                              }
                              return c.type;
                            })
                            .join(", ")
                        : "Nothing"}
                    </div>
                    {extractedDeal.confidence && (
                      <div className="text-blue-300/80">
                        Confidence: {Math.round(extractedDeal.confidence * 100)}%
                      </div>
                    )}
                  </div>

                  {!dealExecuted && (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConfirmDeal()}
                        disabled={confirmingDeal}
                        className="rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-all hover:from-green-500 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {confirmingDeal ? "Confirming..." : "Confirm Deal"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExtractedDeal(null);
                          setExtractionError(null);
                          setDealExecuted(false);
                          setConfirmingDeal(false);
                        }}
                        disabled={confirmingDeal}
                        className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
