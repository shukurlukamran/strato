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
import { BudgetPanel } from "@/components/game/BudgetPanel";
import { ActionPanel } from "@/components/game/ActionPanel";
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
  infrastructure_level?: number;
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameExists, setGameExists] = useState<boolean | null>(null);
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
    setGameExists(null);
    
    // Validate gameId format first
    if (!gameId || typeof gameId !== 'string' || gameId.trim() === '') {
      setError("Invalid game ID");
      setGameExists(false);
      setLoading(false);
      return;
    }

    try {
      console.log("GamePage: Loading game", { gameId });
      const res = await fetch(`/api/game?id=${encodeURIComponent(gameId)}`);
      
      if (!res.ok) {
        const errorText = await res.text();
        let errorMessage = "Failed to load game";
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        // Check if it's a 404 (game not found)
        if (res.status === 404) {
          setGameExists(false);
          setError(`Game not found. Game ID: ${gameId}`);
        } else {
          setGameExists(false);
          setError(errorMessage);
        }
        console.error("GamePage: Failed to load game", { gameId, status: res.status, error: errorMessage });
        return;
      }

      const data = (await res.json()) as {
        game: ApiGame;
        countries: ApiCountry[];
        stats: ApiStats[];
        chats: ApiChat[];
      };

      // Verify we got valid game data
      if (!data.game || !data.game.id) {
        setGameExists(false);
        setError(`Invalid game data received. Game ID: ${gameId}`);
        console.error("GamePage: Invalid game data", { gameId, data });
        return;
      }

      // CRITICAL: Verify the gameId from URL matches the gameId from database
      if (data.game.id !== gameId) {
        console.error("GamePage: GameId mismatch!", {
          urlGameId: gameId,
          dbGameId: data.game.id,
          mismatch: true,
        });
        setGameExists(false);
        setError(`Game ID mismatch. URL: ${gameId}, Database: ${data.game.id}`);
        return;
      }

      console.log("GamePage: Game loaded successfully", { 
        gameId, 
        dbGameId: data.game.id,
        gameName: data.game.name, 
        turn: data.game.current_turn,
        gameIdsMatch: data.game.id === gameId,
      });
      setGameExists(true);
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
          infrastructureLevel: s.infrastructure_level ?? 0,
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
      const errorMessage = e instanceof Error ? e.message : "Failed to load game.";
      setGameExists(false);
      setError(errorMessage);
      console.error("GamePage: Error loading game", { gameId, error: errorMessage });
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

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-lg text-white">Loading game…</div>
      </div>
    );
  }

  // Show error if game doesn't exist or failed to load
  if (error || gameExists === false) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="rounded-lg border border-red-500 bg-red-900/50 p-6 text-white max-w-md">
          <div className="mb-4 text-xl font-semibold">Game Not Found</div>
          <div className="mb-4 text-sm text-red-200">{error || "The game you're looking for doesn't exist."}</div>
          {gameId && (
            <div className="mb-4 text-xs text-red-300 font-mono">
              Game ID: {gameId}
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-gray-100"
              onClick={() => void load()}
            >
              Retry
            </button>
            <button
              type="button"
              className="rounded bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
              onClick={() => window.location.href = '/new-game'}
            >
              Create New Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Don't render game interface until we've confirmed game exists
  if (gameExists === null) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="text-lg text-white">Verifying game…</div>
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
            <CountryCard 
              country={selectedCountry} 
              stats={selectedStats}
              gameId={gameId}
              playerCountryId={playerCountryId}
              chatId={selectedCountry ? chatByCounterpartCountryId[selectedCountry.id] : undefined}
              onChatIdCreated={(countryId: string, newChatId: string) => {
                // Update the chat mapping when a new chat is created
                setChatByCounterpartCountryId(prev => ({
                  ...prev,
                  [countryId]: newChatId
                }));
                console.log(`[Game Page] New chat created: ${countryId} -> ${newChatId}`);
              }}
              onStatsUpdate={async (countryIds: string[]) => {
                // Refresh stats for specified countries after deal execution
                try {
                  const res = await fetch(`/api/game?id=${encodeURIComponent(gameId)}`);
                  if (!res.ok) throw new Error(await res.text());
                  const data = (await res.json()) as {
                    game: ApiGame;
                    countries: ApiCountry[];
                    stats: ApiStats[];
                    chats: ApiChat[];
                  };
                  
                  const statsMap: Record<string, CountryStats> = {};
                  for (const s of data.stats) {
                    if (countryIds.includes(s.country_id)) {
                      statsMap[s.country_id] = {
                        id: s.id,
                        countryId: s.country_id,
                        turn: s.turn,
                        population: s.population,
                        budget: Number(s.budget),
                        technologyLevel: Number(s.technology_level),
                        infrastructureLevel: s.infrastructure_level ?? 0,
                        militaryStrength: s.military_strength,
                        militaryEquipment: s.military_equipment ?? {},
                        resources: s.resources ?? {},
                        diplomaticRelations: s.diplomatic_relations ?? {},
                        createdAt: s.created_at,
                      };
                    }
                  }
                  
                  // Update only the affected countries' stats
                  setStatsByCountryId(prev => ({
                    ...prev,
                    ...statsMap
                  }));
                  
                  console.log(`[Game Page] Stats updated for countries:`, countryIds);
                } catch (e) {
                  console.error("Failed to refresh stats:", e);
                }
              }}
            />

            {/* Budget Panel */}
            <div className="mt-4">
              <BudgetPanel 
                country={selectedCountry} 
                stats={selectedStats}
                activeDealsValue={deals
                  .filter(d => d.status === 'active' && 
                    (d.proposingCountryId === selectedCountry?.id || d.receivingCountryId === selectedCountry?.id))
                  .reduce((total) => total + 100, 0)} // Placeholder: calculate actual deal value
              />
            </div>

            {/* Resources */}
            <div className="mt-4">
              <ResourceDisplay 
                country={selectedCountry}
                stats={selectedStats}
                resources={selectedStats?.resources}
              />
            </div>

            {/* Actions - Only render if game exists and gameId is valid */}
            {gameExists && gameId && (
              <div className="mt-4">
                {(() => {
                  // Log the gameId being passed to ActionPanel for debugging
                  console.log("GamePage: Rendering ActionPanel with gameId", {
                    gameId,
                    gameExists,
                    urlParams: params.id,
                    gameIdFromUrl: params.id,
                    gameIdsMatch: gameId === params.id,
                  });
                  return null;
                })()}
                <ActionPanel
                  country={selectedCountry}
                  stats={selectedStats}
                  gameId={gameId}
                  currentTurn={turn}
                  playerCountryId={playerCountryId}
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
                  onActionCreated={async () => {
                    // Reload stats after action is created
                    await load();
                  }}
                />
              </div>
            )}

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
            <span>Turn {turn}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
