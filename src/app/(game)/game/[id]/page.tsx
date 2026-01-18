"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Country, CountryStats } from "@/types/country";
import type { Deal } from "@/types/deals";
import type { ChatMessage } from "@/types/chat";
import { Map } from "@/components/game/Map";
import { CountryCard } from "@/components/game/CountryCard";
import { TurnIndicator } from "@/components/game/TurnIndicator";
import { ResourceDisplay } from "@/components/game/ResourceDisplay";
import { BudgetPanel } from "@/components/game/BudgetPanel";
import { ActionPanel } from "@/components/game/ActionPanel";
import { AllProfilesInfo } from "@/components/game/AllProfilesInfo";
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
  const router = useRouter();
  const gameId = params.id;
  const hasAttemptedRedirect = useRef(false);

  const setGameId = useGameStore((s) => s.setGameId);
  const selectedCountryId = useGameStore((s) => s.selectedCountryId);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gameExists, setGameExists] = useState<boolean | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [turn, setTurn] = useState(1);
  const [playerCountryId, setPlayerCountryId] = useState<string>("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [statsByCountryId, setStatsByCountryId] = useState<Record<string, CountryStats>>({});
  const [chatByCounterpartCountryId, setChatByCounterpartCountryId] = useState<Record<string, string>>({});
  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, ChatMessage[]>>({});
  const [deals, setDeals] = useState<Deal[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [endingTurn, setEndingTurn] = useState(false);
  const [turnProcessing, setTurnProcessing] = useState(false);

  useEffect(() => setGameId(gameId), [gameId, setGameId]);

  async function loadGameData(showLoadingScreen = true) {
    if (showLoadingScreen) {
      setLoading(true);
      setError(null);
      setGameExists(null);
    }
    
    // Validate gameId format first
    if (!gameId || typeof gameId !== 'string' || gameId.trim() === '') {
      setError("Invalid game ID");
      setGameExists(false);
      if (showLoadingScreen) {
        setLoading(false);
      }
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
        statsCount: data.stats.length,
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
          resourceProfile: (s as any).resource_profile, // Include resource profile
          diplomaticRelations: s.diplomatic_relations ?? {},
          createdAt: s.created_at,
        };
      }
      setStatsByCountryId(statsMap);
      
      console.log("GamePage: Stats loaded for turn", data.game.current_turn, ":", 
        Object.entries(statsMap).map(([countryId, stats]) => ({
          countryId,
          budget: stats.budget,
          population: stats.population,
          resources: stats.resources
        }))
      );

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
      if (showLoadingScreen) {
        setLoading(false);
      }
    }
  }

  async function load() {
    await loadGameData(true);
  }

  async function refreshGameData() {
    await loadGameData(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Automatically redirect to latest game if current game doesn't exist
  useEffect(() => {
    if (gameExists === false && !hasAttemptedRedirect.current) {
      hasAttemptedRedirect.current = true;
      console.log("GamePage: Game not found, attempting redirect to latest game");
      
      const redirectToLatestGame = async () => {
        try {
          setRedirecting(true);
          const res = await fetch('/api/game/list');
          if (res.ok) {
            const data = await res.json() as { games: Array<{ id: string; name: string }> };
            if (data.games && data.games.length > 0) {
              const latestGameId = data.games[0].id;
              // Only redirect if it's a different game
              if (latestGameId !== gameId) {
                console.log(`GamePage: Redirecting to latest game: ${latestGameId}`);
                router.push(`/game/${latestGameId}`);
                return;
              }
            }
          }
          // If no games found or redirect failed, stay on error page
          console.log("GamePage: No valid games found for redirect");
        } catch (e) {
          console.error("GamePage: Failed to redirect to latest game:", e);
        } finally {
          setRedirecting(false);
        }
      };

      // Delay redirect slightly to show the error message briefly
      const timer = setTimeout(() => {
        void redirectToLatestGame();
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [gameExists, gameId, router]);

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
    const handleFindLatestGame = async () => {
      setRedirecting(true);
      try {
        // Try to fetch a list of recent games
        const res = await fetch('/api/game/list');
        if (res.ok) {
          const data = await res.json() as { games: Array<{ id: string; name: string }> };
          if (data.games && data.games.length > 0) {
            // Redirect to the most recent game
            window.location.href = `/game/${data.games[0].id}`;
            return;
          }
        }
      } catch (e) {
        console.error("Failed to fetch games:", e);
      }
      // If no games found, redirect to new game page
      window.location.href = '/new-game';
    };

    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="rounded-lg border border-red-500 bg-red-900/50 p-6 text-white max-w-md">
          <div className="mb-4 text-xl font-semibold">Game Not Found</div>
          <div className="mb-4 text-sm text-red-200">
            {error || "This game no longer exists in the database. It may have been deleted or the URL is incorrect."}
          </div>
          {gameId && (
            <div className="mb-4 text-xs text-red-300 font-mono">
              Game ID: {gameId}
            </div>
          )}
          {redirecting ? (
            <div className="mb-4 text-sm text-blue-300 flex items-center gap-2">
              <span className="animate-pulse">●</span>
              Redirecting to latest game...
            </div>
          ) : (
            <>
              <div className="mb-4 text-xs text-red-200">
                You can create a new game or try to load the most recent game.
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                  onClick={() => void handleFindLatestGame()}
                  disabled={redirecting}
                >
                  Go to Latest Game
                </button>
                <button
                  type="button"
                  className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                  onClick={() => window.location.href = '/new-game'}
                >
                  Create New Game
                </button>
              </div>
            </>
          )}
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
      {/* Turn Processing Overlay */}
      {turnProcessing && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
          <div className="rounded-lg border border-blue-500/50 bg-slate-800/90 px-8 py-6 shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
              <div className="text-xl font-semibold text-white">Ending Turn...</div>
            </div>
            <div className="mt-2 text-sm text-white/60">Processing actions and updating game state</div>
          </div>
        </div>
      )}
      
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/new-game')}
            className="inline-flex items-center gap-1 rounded-full bg-blue-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
          >
            <span>+</span>
            <span>New Game</span>
          </button>
          <AllProfilesInfo />
          <TurnIndicator turn={turn} />
        </div>
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
                        resourceProfile: (s as any).resource_profile, // Include resource profile
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
                <ActionPanel
                  country={selectedCountry}
                  stats={selectedStats}
                  gameId={gameId}
                  playerCountryId={playerCountryId}
                  endingTurn={endingTurn}
                  onStatsUpdate={(updatedStats) => {
                    // Update stats locally without page reload
                    if (selectedCountry) {
                      setStatsByCountryId(prev => ({
                        ...prev,
                        [selectedCountry.id]: {
                          ...prev[selectedCountry.id],
                          ...updatedStats,
                        }
                      }));
                    }
                  }}
                  onEndTurn={async () => {
                    if (endingTurn || turnProcessing) return;
                    
                    setEndingTurn(true);
                    setTurnProcessing(true);
                    
                    try {
                      console.log("Starting turn end process...");
                      const res = await fetch("/api/turn", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ gameId }),
                      });
                      
                      if (!res.ok) {
                        const errorText = await res.text();
                        let errorMessage = "Failed to end turn";
                        try {
                          const errorData = JSON.parse(errorText);
                          errorMessage = errorData.error || errorMessage;
                        } catch {
                          errorMessage = errorText || errorMessage;
                        }
                        console.error("Failed to end turn:", errorMessage);
                        setTurnProcessing(false);
                        setEndingTurn(false);
                        return;
                      }
                      
                      const data = await res.json();
                      console.log("Turn ended successfully. New turn:", data.nextTurn);
                      
                      // Update turn number immediately
                      setTurn(data.nextTurn);
                      
                      // Refresh game state WITHOUT showing loading screen
                      await refreshGameData();
                      
                      console.log("Game data refreshed for turn", data.nextTurn);
                      
                      // Turn processing complete
                      setTurnProcessing(false);
                      setEndingTurn(false);
                    } catch (e) {
                      console.error("Error ending turn:", e instanceof Error ? e.message : "Unknown error");
                      setTurnProcessing(false);
                      setEndingTurn(false);
                    }
                  }}
                />
              </div>
            )}

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
