"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Country, CountryStats } from "@/types/country";
import type { Deal } from "@/types/deals";
import type { ChatMessage } from "@/types/chat";
import { Map } from "@/components/game/Map";
import { CountryCard } from "@/components/game/CountryCard";
import { TurnIndicator } from "@/components/game/TurnIndicator";
import { ResourceDisplay } from "@/components/game/ResourceDisplay";
import { ActionPanel } from "@/components/game/ActionPanel";
import { DiplomacyChat } from "@/components/game/DiplomacyChat";
import { DealProposal } from "@/components/game/DealProposal";
import { ActiveDeals } from "@/components/game/ActiveDeals";
import { useGameStore } from "@/lib/store/gameStore";

type ApiGame = { id: string; name: string; current_turn: number; status: string; player_country_id: string };
type ApiCountry = {
  id: string;
  game_id: string;
  name: string;
  is_player_controlled: boolean;
  color: string;
  position_x: number;
  position_y: number;
};
type ApiStats = {
  id: string;
  country_id: string;
  turn: number;
  population: number;
  budget: number;
  technology_level: number;
  military_strength: number;
  military_equipment: Record<string, unknown>;
  resources: Record<string, number>;
  diplomatic_relations: Record<string, number>;
  created_at: string;
};
type ApiChat = { id: string; game_id: string; country_a_id: string; country_b_id: string };

export default function GamePage() {
  const params = useParams<{ id: string }>();
  const gameId = params.id;

  const setGameId = useGameStore((s) => s.setGameId);
  const selectedCountryId = useGameStore((s) => s.selectedCountryId);
  const activeChatCountryId = useGameStore((s) => s.activeChatCountryId);
  
  // #region agent log - Force re-render test
  const [renderKey, setRenderKey] = useState(0);
  useEffect(() => {
    if (activeChatCountryId) {
      console.log('[DEBUG] page: activeChatCountryId is set, forcing re-render', activeChatCountryId);
      setRenderKey(prev => prev + 1);
    }
  }, [activeChatCountryId]);
  // #endregion
  
  // #region agent log
  useEffect(() => {
    console.log('[DEBUG] page: activeChatCountryId changed', { activeChatCountryId, selectedCountryId });
    fetch('http://127.0.0.1:7242/ingest/5cfd136f-1fa7-464e-84d5-bcaf3c90cae7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:useEffect',message:'activeChatCountryId changed',data:{activeChatCountryId,selectedCountryId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
  }, [activeChatCountryId, selectedCountryId]);
  // #endregion

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [turn, setTurn] = useState(1);
  const [playerCountryId, setPlayerCountryId] = useState<string>("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [statsByCountryId, setStatsByCountryId] = useState<Record<string, CountryStats>>({});
  const [chatByCounterpartCountryId, setChatByCounterpartCountryId] = useState<Record<string, string>>({});
  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, ChatMessage[]>>({});
  const [deals, setDeals] = useState<Deal[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => setGameId(gameId), [gameId, setGameId]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/game?id=${encodeURIComponent(gameId)}`);
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        game: ApiGame;
        countries: ApiCountry[];
        stats: ApiStats[];
        chats: ApiChat[];
      };

      setTurn(data.game.current_turn);
      setPlayerCountryId(data.game.player_country_id);
      setCountries(
        data.countries.map((c) => ({
          id: c.id,
          gameId: c.game_id,
          name: c.name,
          isPlayerControlled: c.is_player_controlled,
          color: c.color,
          positionX: Number(c.position_x),
          positionY: Number(c.position_y),
        })),
      );
      const statsMap: Record<string, CountryStats> = {};
      for (const s of data.stats) {
        statsMap[s.country_id] = {
          id: s.id,
          countryId: s.country_id,
          turn: s.turn,
          population: s.population,
          budget: Number(s.budget),
          technologyLevel: Number(s.technology_level),
          militaryStrength: s.military_strength,
          militaryEquipment: s.military_equipment ?? {},
          resources: s.resources ?? {},
          diplomaticRelations: s.diplomatic_relations ?? {},
          createdAt: s.created_at,
        };
      }
      setStatsByCountryId(statsMap);

      const chatMap: Record<string, string> = {};
      for (const ch of data.chats) {
        // map by "other" country relative to player
        const other = ch.country_a_id === data.game.player_country_id ? ch.country_b_id : ch.country_a_id;
        chatMap[other] = ch.id;
      }
      // #region agent log
      console.log('[DEBUG] page: Chat mapping loaded', { chatMap, playerCountryId: data.game.player_country_id, chats: data.chats });
      // #endregion
      setChatByCounterpartCountryId(chatMap);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load game.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const selectedCountry = useMemo(
    () => countries.find((c) => c.id === selectedCountryId) ?? null,
    [countries, selectedCountryId],
  );
  const selectedStats = selectedCountry ? statsByCountryId[selectedCountry.id] ?? null : null;

  const activeChatId = activeChatCountryId ? chatByCounterpartCountryId[activeChatCountryId] : null;
  const activeMessages = activeChatId ? messagesByChatId[activeChatId] ?? [] : [];
  
  // #region agent log
  useEffect(() => {
    console.log('[DEBUG] page: Computed values', { 
      activeChatCountryId, 
      activeChatId, 
      chatByCounterpartCountryId, 
      hasChatMapping: activeChatCountryId ? chatByCounterpartCountryId[activeChatCountryId] !== undefined : false
    });
  }, [activeChatCountryId, activeChatId, chatByCounterpartCountryId]);
  // #endregion

  // Load messages when a chat is opened, and ensure chat exists
  useEffect(() => {
    if (!activeChatCountryId || !playerCountryId) return;

    const counterpartId = activeChatCountryId;
    const currentChatId = chatByCounterpartCountryId[counterpartId];

    // If chat doesn't exist in mapping, reload game data to get updated chats
    if (!currentChatId) {
      void load();
      return;
    }

    async function loadMessages() {
      try {
        const res = await fetch(`/api/chat?chatId=${encodeURIComponent(currentChatId)}`);
        if (res.ok) {
          const data = (await res.json()) as { messages: ChatMessage[] };
          setMessagesByChatId((prev) => ({ ...prev, [currentChatId]: data.messages }));
        }
      } catch (e) {
        console.error("Failed to load messages:", e);
      }
    }

    // Only load if we don't already have messages for this chat
    if (!messagesByChatId[currentChatId]) {
      void loadMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatCountryId, playerCountryId]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-lg text-white">Loading game…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="rounded-lg border border-red-500 bg-red-900/50 p-6 text-white">
          <div className="mb-4 font-semibold">Error</div>
          <div className="mb-4">{error}</div>
          <button
            type="button"
            className="rounded bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-gray-100"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const playerCountry = countries.find((c) => c.isPlayerControlled);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      {/* Top HUD Bar */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between border-b border-white/10 bg-slate-900/80 backdrop-blur-sm px-4 py-2">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white">STRATO</h1>
          <div className="h-4 w-px bg-white/20" />
          {playerCountry && (
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded border border-white/30"
                style={{ backgroundColor: playerCountry.color }}
              />
              <span className="text-sm text-white">{playerCountry.name}</span>
            </div>
          )}
        </div>
        <TurnIndicator turn={turn} />
      </div>

      {/* Main Game Area */}
      <div className="flex h-full pt-12">
        {/* Left Sidebar - Country Info & Actions */}
        <div
          className={`absolute left-0 top-12 z-10 h-[calc(100vh-3rem)] w-80 transform border-r border-white/10 bg-slate-900/95 backdrop-blur-md transition-transform duration-300 ${
            showSidebar ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col overflow-y-auto p-4">
            {/* Toggle button */}
            <button
              type="button"
              onClick={() => setShowSidebar(!showSidebar)}
              className="absolute -right-10 top-4 rounded-r bg-slate-800/90 px-2 py-4 text-white hover:bg-slate-700"
            >
              {showSidebar ? "◀" : "▶"}
            </button>

            {/* Country Card */}
            <CountryCard country={selectedCountry} stats={selectedStats} />

            {/* Resources */}
            <div className="mt-4">
              <ResourceDisplay resources={selectedStats?.resources ?? {}} />
            </div>

            {/* Actions */}
            <div className="mt-4">
              <ActionPanel
                onEndTurn={async () => {
                  try {
                    const res = await fetch("/api/turn", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ gameId }),
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setTurn(data.nextTurn);
                      await load(); // Reload game state
                    }
                  } catch (e) {
                    console.error("Failed to end turn:", e);
                  }
                }}
              />
            </div>

            {/* Active Deals */}
            <div className="mt-4">
              <ActiveDeals deals={deals} />
            </div>
          </div>
        </div>

        {/* Center - Map */}
        <div className="flex-1">
          <Map countries={countries} />
        </div>

        {/* Right Sidebar - Diplomacy Chat */}
        {/* #region agent log - Always show panel for debugging */}
        {activeChatCountryId && (
          <div className="fixed right-4 top-16 z-50 bg-red-600 text-white p-4 rounded shadow-lg">
            DEBUG: activeChatCountryId = {activeChatCountryId}
          </div>
        )}
        {/* #endregion */}
        <div
          key={renderKey}
          className={`fixed right-0 top-12 z-30 h-[calc(100vh-3rem)] w-96 transform border-l border-white/10 bg-slate-900/95 backdrop-blur-md transition-transform duration-300 shadow-2xl ${
            activeChatCountryId ? "translate-x-0" : "translate-x-full"
          }`}
          style={{
            // #region agent log
            transform: activeChatCountryId ? 'translateX(0) !important' : 'translateX(100%)',
            ...(activeChatCountryId ? { 
              border: '3px solid red', // Visual debug indicator
              display: 'block',
              visibility: 'visible',
            } : {}),
            // #endregion
          }}
          ref={(el) => {
            // #region agent log
            if (el) {
              const computedStyle = window.getComputedStyle(el);
              console.log('[DEBUG] page: Chat panel render', { 
                activeChatCountryId, 
                hasActiveChatId: !!activeChatId, 
                className: activeChatCountryId ? "translate-x-0" : "translate-x-full",
                transform: computedStyle.transform,
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                zIndex: computedStyle.zIndex
              });
              fetch('http://127.0.0.1:7242/ingest/5cfd136f-1fa7-464e-84d5-bcaf3c90cae7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:chatPanel',message:'Panel render',data:{activeChatCountryId,hasActiveChatId:!!activeChatId,className:activeChatCountryId ? "translate-x-0" : "translate-x-full",computedStyle:computedStyle.transform},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            }
            // #endregion
          }}
        >
          {activeChatCountryId ? (
            activeChatId ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/10 p-4">
                  <div className="flex items-center gap-2">
                    {countries
                      .find((c) => c.id === activeChatCountryId)
                      ?.color && (
                      <span
                        className="inline-block h-3 w-3 rounded border border-white/30"
                        style={{
                          backgroundColor: countries.find((c) => c.id === activeChatCountryId)?.color,
                        }}
                      />
                    )}
                    <span className="font-semibold text-white">
                      {countries.find((c) => c.id === activeChatCountryId)?.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => useGameStore.getState().closeChat()}
                    className="text-white/70 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <DiplomacyChat
                    gameId={gameId}
                    chatId={activeChatId}
                    playerCountryId={playerCountryId}
                    counterpartCountryId={activeChatCountryId}
                    messages={activeMessages}
                    onNewMessages={(msgs) => setMessagesByChatId((prev) => ({ ...prev, [activeChatId]: msgs }))}
                  />
                </div>
                <div className="border-t border-white/10 p-4">
                  <DealProposal
                    gameId={gameId}
                    proposingCountryId={playerCountryId}
                    receivingCountryId={activeChatCountryId}
                    turnCreated={turn}
                    onCreated={(deal) => setDeals((prev) => [deal, ...prev])}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between border-b border-white/10 p-4">
                  <div className="flex items-center gap-2">
                    {countries
                      .find((c) => c.id === activeChatCountryId)
                      ?.color && (
                      <span
                        className="inline-block h-3 w-3 rounded border border-white/30"
                        style={{
                          backgroundColor: countries.find((c) => c.id === activeChatCountryId)?.color,
                        }}
                      />
                    )}
                    <span className="font-semibold text-white">
                      {countries.find((c) => c.id === activeChatCountryId)?.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => useGameStore.getState().closeChat()}
                    className="text-white/70 hover:text-white"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex h-full items-center justify-center p-4">
                  <div className="text-center text-white/60">
                    <div className="mb-2 text-lg">💬</div>
                    <div className="text-sm">Loading chat...</div>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="flex h-full items-center justify-center p-4">
              <div className="text-center text-white/60">
                <div className="mb-2 text-lg">💬</div>
                <div className="text-sm">Click a country on the map to start diplomacy</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-slate-900/80 backdrop-blur-sm px-4 py-2">
        <div className="flex items-center justify-between text-xs text-white/70">
          <div>Game ID: {gameId.slice(0, 8)}...</div>
          <div className="flex items-center gap-4">
            {selectedCountry && (
              <>
                <span>Selected: {selectedCountry.name}</span>
                <span className="h-2 w-px bg-white/20" />
              </>
            )}
            {/* #region agent log */}
            {activeChatCountryId && (
              <>
                <span className="text-yellow-400 font-bold">CHAT OPEN: {activeChatCountryId.slice(0, 8)}</span>
                <span className="h-2 w-px bg-white/20" />
              </>
            )}
            {/* #endregion */}
            <span>Turn {turn}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
