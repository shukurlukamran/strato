"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { Country, CountryStats } from "@/types/country";
import { DiplomacyChat } from "./DiplomacyChat";
import type { ChatMessage } from "@/types/chat";
import type { DealExtractionResult } from "@/lib/deals/DealExtractor";

export function CountryCard({ 
  country, 
  stats,
  gameId,
  playerCountryId
}: { 
  country: Country | null;
  stats: CountryStats | null;
  gameId?: string;
  playerCountryId?: string;
}) {
  const [showChat, setShowChat] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingChat, setLoadingChat] = useState(false);

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

  // Load or create chat when opening
  useEffect(() => {
    if (showChat && gameId && playerCountryId && country.id && !chatId && !loadingChat) {
      setLoadingChat(true);
      fetch("/api/chats/get-or-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId,
          countryAId: playerCountryId,
          countryBId: country.id,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.chatId) {
            setChatId(data.chatId);
            // Load existing messages
            return fetch(`/api/chat?chatId=${data.chatId}`);
          }
          throw new Error("Failed to get chat ID");
        })
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) {
            setMessages(data.messages);
          }
        })
        .catch((error) => {
          console.error("Error loading chat:", error);
        })
        .finally(() => {
          setLoadingChat(false);
        });
    }
  }, [showChat, gameId, playerCountryId, country.id, chatId, loadingChat]);

  const handleProposeDeal = () => {
    setShowChat(true);
  };

  const handleCloseChat = () => {
    setShowChat(false);
  };

  const handleNewMessages = (newMessages: ChatMessage[]) => {
    setMessages(newMessages);
  };

  const handleDealExtracted = (deal: DealExtractionResult) => {
    // Could show a notification or open deal proposal UI here
    console.log("Deal extracted:", deal);
  };

  // Map existing data to display format
  const flag = "🏳️"; // Default flag emoji
  const government = country.isPlayerControlled ? "Your Country" : "AI Controlled";
  const gdp = Number(stats.budget);
  const population = stats.population;
  const militaryStrength = stats.militaryStrength;
  const techLevel = Number(stats.technologyLevel);

  return (
    <>
      <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
        <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
          <span
            className="inline-block h-4 w-4 rounded border-2 border-white/30 shadow-md"
            style={{ backgroundColor: country.color }}
          />
          <div className="flex-1">
            <div className="text-lg font-bold text-white">{country.name}</div>
            <div className="text-xs text-white/60">{government}</div>
          </div>
          {country.isPlayerControlled && (
            <span className="text-xl text-yellow-400">⚜</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded border border-white/10 bg-slate-800/50 p-3">
            <div className="text-xs text-white/60">Budget (GDP)</div>
            <div className="mt-1 text-lg font-bold text-green-400">
              {gdp.toLocaleString()}
            </div>
          </div>
          <div className="rounded border border-white/10 bg-slate-800/50 p-3">
            <div className="text-xs text-white/60">Population</div>
            <div className="mt-1 text-lg font-bold text-white">
              {population.toLocaleString()}
            </div>
          </div>
          <div className="rounded border border-white/10 bg-slate-800/50 p-3">
            <div className="text-xs text-white/60">Military</div>
            <div className="mt-1 text-lg font-bold text-red-400">
              {militaryStrength}
            </div>
          </div>
          <div className="rounded border border-white/10 bg-slate-800/50 p-3">
            <div className="text-xs text-white/60">Technology</div>
            <div className="mt-1 text-lg font-bold text-blue-400">
              {techLevel.toFixed(1)}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleProposeDeal}
          className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-500 hover:to-blue-600 hover:shadow-xl active:scale-95"
        >
          Propose Deal
        </button>
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

            {/* Chat Component */}
            <div className="flex-1 overflow-hidden p-4">
              {loadingChat ? (
                <div className="flex h-full items-center justify-center text-white/60">
                  <p>Loading chat...</p>
                </div>
              ) : chatId && gameId && playerCountryId ? (
                <div className="h-full">
                  <DiplomacyChat
                    gameId={gameId}
                    chatId={chatId}
                    playerCountryId={playerCountryId}
                    counterpartCountryId={country.id}
                    messages={messages}
                    onNewMessages={handleNewMessages}
                    onDealExtracted={handleDealExtracted}
                  />
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-white/60">
                  <p>Failed to load chat</p>
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
