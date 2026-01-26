"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Country, CountryStats } from "@/types/country";
import type { City } from "@/types/city";
import type { Deal } from "@/types/deals";
import type { ChatMessage } from "@/types/chat";
import { Map } from "@/components/game/Map";
import { CountryCard } from "@/components/game/CountryCard";
import { TurnIndicator } from "@/components/game/TurnIndicator";
import { DefenseAlert } from "@/components/game/DefenseAlert";
import { TradeOfferAlert } from "@/components/game/TradeOfferAlert";
import { ResourceDisplay } from "@/components/game/ResourceDisplay";
import { BudgetPanel } from "@/components/game/BudgetPanel";
import { ActionPanel } from "@/components/game/ActionPanel";
import { AttackModal } from "@/components/game/AttackModal";
import { DefenseModal } from "@/components/game/DefenseModal";
import { TradeOfferModal } from "@/components/game/TradeOfferModal";
import { AllProfilesInfo } from "@/components/game/AllProfilesInfo";
import { HistoryLog } from "@/components/game/HistoryLog";
import { DiplomaticRelationsModal } from "@/components/game/DiplomaticRelationsModal";
import { MarketRatesModal } from "@/components/game/MarketRatesModal";
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
  const [cities, setCities] = useState<City[]>([]);
  const [statsByCountryId, setStatsByCountryId] = useState<Record<string, CountryStats>>({});
  const [chatByCounterpartCountryId, setChatByCounterpartCountryId] = useState<Record<string, string>>({});
  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, ChatMessage[]>>({});
  const [deals, setDeals] = useState<Deal[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showHistoryLog, setShowHistoryLog] = useState(true);
  const [showDiplomacyModal, setShowDiplomacyModal] = useState(false);
  const [showMarketRatesModal, setShowMarketRatesModal] = useState(false);
  const [endingTurn, setEndingTurn] = useState(false);
  const [turnProcessing, setTurnProcessing] = useState(false);
  const [attackTargetCity, setAttackTargetCity] = useState<City | null>(null);
  const [defenseCity, setDefenseCity] = useState<City | null>(null);
  const [defenseAttackerCountry, setDefenseAttackerCountry] = useState<Country | null>(null);
  const [defenseAttackerStats, setDefenseAttackerStats] = useState<CountryStats | null>(null);
  const [defenseDefenderCountry, setDefenseDefenderCountry] = useState<Country | null>(null);
  const [defenseDefenderStats, setDefenseDefenderStats] = useState<CountryStats | null>(null);
  // Track cities where defense modal was dismissed (so it doesn't auto-reopen)
  const [dismissedDefenseCities, setDismissedDefenseCities] = useState<Set<string>>(new Set());
  // Track cities where defense has already been submitted
  const [submittedDefenseCities, setSubmittedDefenseCities] = useState<Set<string>>(new Set());
  // Trade offer modal state
  const [tradeOfferDeal, setTradeOfferDeal] = useState<Deal | null>(null);
  const [tradeOfferProposer, setTradeOfferProposer] = useState<Country | null>(null);
  const [tradeOfferReceiver, setTradeOfferReceiver] = useState<Country | null>(null);
  // Track dismissed trade offers
  const [dismissedTradeOffers, setDismissedTradeOffers] = useState<Set<string>>(new Set());

  async function loadDeals() {
    if (!gameId) return;

    try {
      const res = await fetch(`/api/deals?gameId=${encodeURIComponent(gameId)}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load deals");
      }
      const data = (await res.json()) as { deals?: Deal[] };
      const fetchedDeals = Array.isArray(data.deals) ? data.deals : [];
      setDeals(fetchedDeals);
    } catch (error) {
      console.error("GamePage: Failed to load deals", error);
      setDeals([]);
    }
  }

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
        cities?: Array<{
          id: string;
          country_id: string;
          game_id: string;
          name: string;
          position_x: number;
          position_y: number;
          size: number;
          border_path: string;
          per_turn_resources: Record<string, number>;
          population: number;
          is_under_attack?: boolean;
          created_at: string;
        }>;
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
      
      // Load cities (if available)
      if (data.cities) {
        setCities(
          data.cities.map((c) => ({
            id: c.id,
            countryId: c.country_id,
            gameId: c.game_id,
            name: c.name,
            positionX: Number(c.position_x),
            positionY: Number(c.position_y),
            size: Number(c.size),
            borderPath: c.border_path,
            perTurnResources: c.per_turn_resources ?? {},
            population: c.population,
            isUnderAttack: c.is_under_attack,
            createdAt: c.created_at,
          })),
        );
      } else {
        setCities([]);
      }
      
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
      await loadDeals();
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

  // Check for cities under attack that belong to player - DETECTION ONLY
  // Split into two effects to prevent dependency issues
  useEffect(() => {
    if (!playerCountryId || cities.length === 0 || countries.length === 0) return;

    const playerCitiesUnderAttack = cities.filter(
      c => c.countryId === playerCountryId && c.isUnderAttack
    );

    // Only fetch attack info if there are cities under attack AND modal is not already open
    // AND city is not dismissed AND defense is not already submitted
    if (playerCitiesUnderAttack.length > 0 && !defenseCity) {
      // Find the first city under attack that hasn't been dismissed or submitted
      const cityUnderAttack = playerCitiesUnderAttack.find(
        c => !dismissedDefenseCities.has(c.id) && !submittedDefenseCities.has(c.id)
      );
      
      if (!cityUnderAttack) {
        // All cities are either dismissed or submitted, don't open modal
        return;
      }
      
      console.log(`[Defense] Player city ${cityUnderAttack.name} is under attack! Fetching attacker info...`);
      
      // Fetch pending attack action to get attacker info and check if defense already submitted
      fetch(`/api/actions?gameId=${encodeURIComponent(gameId)}&turn=${turn}&status=pending`)
        .then(res => res.json())
        .then((data: { actions?: Array<{ action_data: any; country_id: string }> }) => {
          const attackAction = data.actions?.find(
            (a: any) => {
              const actionData = a.action_data || {};
              return actionData.subType === "attack" && actionData.targetCityId === cityUnderAttack.id;
            }
          );
          
          if (attackAction) {
            const actionData = attackAction.action_data || {};
            
            // Check if defense has already been submitted
            if (actionData.defenseAllocation !== undefined && actionData.defenseAllocation !== null) {
              console.log(`[Defense] Defense already submitted for ${cityUnderAttack.name}, marking as submitted`);
              setSubmittedDefenseCities(prev => new Set(prev).add(cityUnderAttack.id));
              return;
            }
            
            const attackerId = actionData.attackerId || attackAction.country_id;
            const attackerCountry = countries.find(c => c.id === attackerId);
            const attackerStats = statsByCountryId[attackerId];
            
            // Find the country that owns the defending city (the actual defender)
            const defenderCountry = countries.find(c => c.id === cityUnderAttack.countryId);
            const defenderStats = defenderCountry ? statsByCountryId[cityUnderAttack.countryId] : null;
            
            if (attackerCountry && attackerStats && defenderCountry && defenderStats) {
              console.log(`[Defense] Opening defense modal for ${cityUnderAttack.name} - defended by ${defenderCountry.name}, attacked by ${attackerCountry.name}`);
              setDefenseCity(cityUnderAttack);
              setDefenseAttackerCountry(attackerCountry);
              setDefenseAttackerStats(attackerStats);
              setDefenseDefenderCountry(defenderCountry);
              setDefenseDefenderStats(defenderStats);
            } else {
              console.warn(`[Defense] Could not find attacker/defender info for ${cityUnderAttack.name}`, { 
                attackerId, attackerCountry, attackerStats,
                defenderId: cityUnderAttack.countryId, defenderCountry, defenderStats
              });
            }
          } else {
            console.warn(`[Defense] No attack action found for ${cityUnderAttack.name} (city may have been attacked in previous turn)`);
          }
        })
        .catch(err => console.error("[Defense] Failed to fetch attack action:", err));
    }
  }, [cities, playerCountryId, countries, statsByCountryId, gameId, turn, defenseCity, dismissedDefenseCities, submittedDefenseCities]);

  // Cleanup defense modal when no cities are under attack - CLEANUP ONLY
  useEffect(() => {
    if (!playerCountryId || cities.length === 0) return;

    const playerCitiesUnderAttack = cities.filter(
      c => c.countryId === playerCountryId && c.isUnderAttack
    );

    // Clear defense modal if no cities are under attack but modal is open
    // Also clear dismissed/submitted tracking for cities no longer under attack
    if (playerCitiesUnderAttack.length === 0) {
      if (defenseCity) {
        setDefenseCity(null);
        setDefenseAttackerCountry(null);
        setDefenseAttackerStats(null);
        setDefenseDefenderCountry(null);
        setDefenseDefenderStats(null);
      }
      // Clear tracking for cities no longer under attack
      setDismissedDefenseCities(new Set());
      setSubmittedDefenseCities(new Set());
    } else {
      // Remove tracking for cities that are no longer under attack
      const cityIdsUnderAttack = new Set(playerCitiesUnderAttack.map(c => c.id));
      setDismissedDefenseCities(prev => {
        const newSet = new Set(prev);
        for (const cityId of prev) {
          if (!cityIdsUnderAttack.has(cityId)) {
            newSet.delete(cityId);
          }
        }
        return newSet;
      });
      setSubmittedDefenseCities(prev => {
        const newSet = new Set(prev);
        for (const cityId of prev) {
          if (!cityIdsUnderAttack.has(cityId)) {
            newSet.delete(cityId);
          }
        }
        return newSet;
      });
    }
  }, [cities, playerCountryId, defenseCity]);

  // Check for pending trade offers and auto-open modal
  useEffect(() => {
    if (!playerCountryId || deals.length === 0) return;

    // Find proposed deals where player is the receiver
    const pendingTradeOffers = deals.filter(
      d => d.status === 'proposed' && 
           d.receivingCountryId === playerCountryId &&
           !dismissedTradeOffers.has(d.id)
    );

    // Only open modal if there are pending offers AND modal is not already open
    if (pendingTradeOffers.length > 0 && !tradeOfferDeal) {
      const firstOffer = pendingTradeOffers[0];
      const proposer = countries.find(c => c.id === firstOffer.proposingCountryId);
      const receiver = countries.find(c => c.id === firstOffer.receivingCountryId);

      if (proposer && receiver) {
        setTradeOfferDeal(firstOffer);
        setTradeOfferProposer(proposer);
        setTradeOfferReceiver(receiver);
      }
    }
  }, [deals, playerCountryId, countries, tradeOfferDeal, dismissedTradeOffers]);

  // Cleanup trade offer modal when no pending offers
  useEffect(() => {
    if (!playerCountryId || deals.length === 0) return;

    const pendingTradeOffers = deals.filter(
      d => d.status === 'proposed' && d.receivingCountryId === playerCountryId
    );

    // Clear modal if no pending offers but modal is open
    if (pendingTradeOffers.length === 0 && tradeOfferDeal) {
      setTradeOfferDeal(null);
      setTradeOfferProposer(null);
      setTradeOfferReceiver(null);
    }

    // Clean up dismissed tracking for offers that are no longer pending
    if (dismissedTradeOffers.size > 0) {
      const pendingOfferIds = new Set(pendingTradeOffers.map(d => d.id));
      setDismissedTradeOffers(prev => {
        const newSet = new Set<string>();
        for (const offerId of prev) {
          if (pendingOfferIds.has(offerId)) {
            newSet.add(offerId);
          }
        }
        return newSet;
      });
    }
  }, [deals, playerCountryId, tradeOfferDeal, dismissedTradeOffers]);

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

  const handleEndTurn = async () => {
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
      
    } catch (error) {
      console.error("Error ending turn:", error);
    } finally {
      setEndingTurn(false);
      setTurnProcessing(false);
    }
  };

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
  const attackerCountry = playerCountry ?? null;
  const attackerStats = attackerCountry ? statsByCountryId[attackerCountry.id] ?? null : null;
  const defenderCountry = attackTargetCity ? countries.find((c) => c.id === attackTargetCity.countryId) ?? null : null;
  const defenderStats = defenderCountry ? statsByCountryId[defenderCountry.id] ?? null : null;

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
          <button
            type="button"
            disabled={endingTurn || turnProcessing}
            onClick={handleEndTurn}
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-green-600 to-green-700 px-3 py-1 text-xs font-medium text-white hover:from-green-500 hover:to-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {endingTurn ? "Ending..." : "End Turn"}
          </button>
          <button
            type="button"
            onClick={() => setShowMarketRatesModal(true)}
            className="inline-flex items-center gap-1 rounded-full bg-purple-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-purple-600 transition-colors"
            title="View current market rates and black market prices"
          >
            <span>📊</span>
            <span>Market Rates</span>
          </button>
          <button
            type="button"
            onClick={() => setShowDiplomacyModal(true)}
            className="inline-flex items-center gap-1 rounded-full bg-blue-600/80 px-3 py-1 text-xs font-medium text-white hover:bg-blue-600 transition-colors"
            title="View all diplomatic relations"
          >
            <span>🤝</span>
            <span>Diplomacy</span>
          </button>
          <AllProfilesInfo />
          {(() => {
            // Show defense alert for dismissed cities that are still under attack
            const dismissedCitiesUnderAttack = cities.filter(
              c => c.countryId === playerCountryId && 
                   c.isUnderAttack && 
                   dismissedDefenseCities.has(c.id) &&
                   !submittedDefenseCities.has(c.id)
            );
            
            if (dismissedCitiesUnderAttack.length > 0) {
              return (
                <DefenseAlert
                  cities={dismissedCitiesUnderAttack}
                  onClick={(city) => {
                    // Reopen modal for this city
                    setDismissedDefenseCities(prev => {
                      const newSet = new Set(prev);
                      newSet.delete(city.id);
                      return newSet;
                    });
                    // Fetch attacker info and open modal
                    fetch(`/api/actions?gameId=${encodeURIComponent(gameId)}&turn=${turn}&status=pending`)
                      .then(res => res.json())
                      .then((data: { actions?: Array<{ action_data: any; country_id: string }> }) => {
                        const attackAction = data.actions?.find(
                          (a: any) => {
                            const actionData = a.action_data || {};
                            return actionData.subType === "attack" && actionData.targetCityId === city.id;
                          }
                        );
                        
                        if (attackAction) {
                          const actionData = attackAction.action_data || {};
                          const attackerId = actionData.attackerId || attackAction.country_id;
                          const attackerCountry = countries.find(c => c.id === attackerId);
                          const attackerStats = statsByCountryId[attackerId];
                          
                          // Find the country that owns the defending city (the actual defender)
                          const defenderCountry = countries.find(c => c.id === city.countryId);
                          const defenderStats = defenderCountry ? statsByCountryId[city.countryId] : null;
                          
                          if (attackerCountry && attackerStats && defenderCountry && defenderStats) {
                            setDefenseCity(city);
                            setDefenseAttackerCountry(attackerCountry);
                            setDefenseAttackerStats(attackerStats);
                            setDefenseDefenderCountry(defenderCountry);
                            setDefenseDefenderStats(defenderStats);
                          }
                        }
                      })
                      .catch(err => console.error("[Defense] Failed to fetch attack action:", err));
                  }}
                />
              );
            }
            return null;
          })()}
          {(() => {
            // Show trade offer alert for dismissed offers that are still pending
            const dismissedPendingOffers = deals.filter(
              d => d.status === 'proposed' && 
                   d.receivingCountryId === playerCountryId &&
                   dismissedTradeOffers.has(d.id)
            );
            
            if (dismissedPendingOffers.length > 0) {
              return (
                <TradeOfferAlert
                  deals={dismissedPendingOffers}
                  onClick={(deal) => {
                    // Reopen modal for this deal
                    setDismissedTradeOffers(prev => {
                      const newSet = new Set(prev);
                      newSet.delete(deal.id);
                      return newSet;
                    });
                    
                    const proposer = countries.find(c => c.id === deal.proposingCountryId);
                    const receiver = countries.find(c => c.id === deal.receivingCountryId);
                    
                    if (proposer && receiver) {
                      setTradeOfferDeal(deal);
                      setTradeOfferProposer(proposer);
                      setTradeOfferReceiver(receiver);
                    }
                  }}
                />
              );
            }
            return null;
          })()}
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
                />
              </div>
            )}

          </div>
        </div>

        {/* Center - Map */}
        <div className="flex-1">
          <Map
            countries={countries}
            cities={cities}
            onAttackCity={(city) => setAttackTargetCity(city)}
          />
        </div>

        {/* Right Sidebar - History Log */}
        <div
          className={`absolute right-0 top-12 z-10 h-[calc(100vh-3rem)] w-80 transform border-l border-white/10 bg-slate-900/95 backdrop-blur-md transition-transform duration-300 ${
            showHistoryLog ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col p-4">
            {/* Toggle button */}
            <button
              type="button"
              onClick={() => setShowHistoryLog(!showHistoryLog)}
              className="absolute -left-10 top-4 rounded-l bg-slate-800/90 px-2 py-4 text-white hover:bg-slate-700"
            >
              {showHistoryLog ? "▶" : "◀"}
            </button>

            {/* History Log Content */}
            <HistoryLog gameId={gameId} currentTurn={turn} />
          </div>
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

      {/* Attack Modal (Phase 3) */}
      {attackTargetCity && attackerCountry && attackerStats && defenderCountry && defenderStats && (
        <AttackModal
          gameId={gameId}
          attackerCountry={attackerCountry}
          attackerStats={attackerStats}
          targetCity={attackTargetCity}
          defenderCountry={defenderCountry}
          defenderStats={defenderStats}
          onClose={() => setAttackTargetCity(null)}
          onSubmitted={() => void refreshGameData()}
        />
      )}

      {/* Defense Modal */}
      {defenseCity && defenseAttackerCountry && defenseAttackerStats && 
       defenseDefenderCountry && defenseDefenderStats && (
        <DefenseModal
          gameId={gameId}
          defendingCity={defenseCity}
          defenderCountry={defenseDefenderCountry}
          defenderStats={defenseDefenderStats}
          attackerCountry={defenseAttackerCountry}
          attackerStats={defenseAttackerStats}
          onClose={() => {
            // Mark city as dismissed so modal doesn't auto-reopen
            setDismissedDefenseCities(prev => new Set(prev).add(defenseCity.id));
            setDefenseCity(null);
            setDefenseAttackerCountry(null);
            setDefenseAttackerStats(null);
            setDefenseDefenderCountry(null);
            setDefenseDefenderStats(null);
          }}
          onSubmitted={() => {
            // Mark city as submitted so modal doesn't reopen
            setSubmittedDefenseCities(prev => new Set(prev).add(defenseCity.id));
            setDefenseCity(null);
            setDefenseAttackerCountry(null);
            setDefenseAttackerStats(null);
            setDefenseDefenderCountry(null);
            setDefenseDefenderStats(null);
            void refreshGameData();
          }}
        />
      )}

      {/* Market Rates Modal */}
      {showMarketRatesModal && (
        <MarketRatesModal
          gameId={gameId}
          turn={turn}
          onClose={() => setShowMarketRatesModal(false)}
        />
      )}

      {/* Diplomatic Relations Modal */}
      {showDiplomacyModal && (
        <DiplomaticRelationsModal
          countries={countries}
          statsByCountryId={statsByCountryId}
          playerCountryId={playerCountryId}
          onClose={() => setShowDiplomacyModal(false)}
        />
      )}

      {/* Trade Offer Modal */}
      {tradeOfferDeal && tradeOfferProposer && tradeOfferReceiver && (
        <TradeOfferModal
          gameId={gameId}
          deal={tradeOfferDeal}
          proposerCountry={tradeOfferProposer}
          receiverCountry={tradeOfferReceiver}
          onClose={() => {
            // Mark deal as dismissed so modal doesn't auto-reopen
            setDismissedTradeOffers(prev => new Set(prev).add(tradeOfferDeal.id));
            setTradeOfferDeal(null);
            setTradeOfferProposer(null);
            setTradeOfferReceiver(null);
            void loadDeals();
          }}
          onResponded={() => {
            setTradeOfferDeal(null);
            setTradeOfferProposer(null);
            setTradeOfferReceiver(null);
            void refreshGameData();
          }}
        />
      )}
    </div>
  );
}

