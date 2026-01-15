"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Country, CountryStats } from "@/types/country";

interface ChatMessage {
  id: string;
  sender: "player" | "country";
  text: string;
  timestamp: Date;
}

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
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

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

  const handleProposeDeal = () => {
    setShowChat(true);
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
            <div className="border-t border-white/10 p-4">
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
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
