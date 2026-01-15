"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { Country, CountryStats } from "@/types/country";
import type { Deal } from "@/types/deals";
import type { ChatMessage } from "@/types/chat";
import { Map } from "@/components/game/Map";
import { CountryPanel } from "@/components/game/CountryPanel";
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [turn, setTurn] = useState(1);
  const [playerCountryId, setPlayerCountryId] = useState<string>("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [statsByCountryId, setStatsByCountryId] = useState<Record<string, CountryStats>>({});
  const [chatByCounterpartCountryId, setChatByCounterpartCountryId] = useState<Record<string, string>>({});
  const [messagesByChatId, setMessagesByChatId] = useState<Record<string, ChatMessage[]>>({});
  const [deals, setDeals] = useState<Deal[]>([]);

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

  if (loading) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="text-sm text-gray-600">Loading game…</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-6xl p-6">
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        <button type="button" className="mt-4 rounded border px-3 py-2 text-sm" onClick={() => void load()}>
          Retry
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Strato</h1>
        <div className="text-sm text-gray-600">Game: {gameId}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Map countries={countries} />

          {activeChatCountryId && activeChatId ? (
            <DiplomacyChat
              gameId={gameId}
              chatId={activeChatId}
              playerCountryId={playerCountryId}
              counterpartCountryId={activeChatCountryId}
              messages={activeMessages}
              onNewMessages={(msgs) => setMessagesByChatId((prev) => ({ ...prev, [activeChatId]: msgs }))}
            />
          ) : (
            <div className="rounded-lg border bg-white p-4 text-sm text-gray-600">
              Open a chat from the map to negotiate diplomacy in natural language.
            </div>
          )}
        </div>

        <div className="space-y-6">
          <TurnIndicator turn={turn} />
          <CountryPanel country={selectedCountry} stats={selectedStats} />
          <ResourceDisplay resources={selectedStats?.resources ?? {}} />
          <ActionPanel onEndTurn={() => setTurn((t) => t + 1)} />

          {activeChatCountryId ? (
            <DealProposal
              gameId={gameId}
              proposingCountryId={playerCountryId}
              receivingCountryId={activeChatCountryId}
              turnCreated={turn}
              onCreated={(deal) => setDeals((prev) => [deal, ...prev])}
            />
          ) : null}

          <ActiveDeals deals={deals} />
        </div>
      </div>
    </main>
  );
}

