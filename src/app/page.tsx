"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Game = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export default function Home() {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadGames() {
      try {
        const res = await fetch('/api/game/list');
        if (res.ok) {
          const data = await res.json();
          setGames(data.games || []);
        } else {
          setError("Failed to load games");
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load games");
      } finally {
        setLoading(false);
      }
    }
    void loadGames();
  }, []);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-semibold">Strato</h1>
      <p className="mt-2 text-gray-700">
        Global political country management strategy game. MVP: 6 imaginary countries, turn-based. Designed to scale to
        many countries + multiplayer later.
      </p>

      <div className="mt-6 flex gap-3">
        <Link className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800" href="/new-game">
          Start new game
        </Link>
      </div>

      <div className="mt-10 rounded-lg border bg-white p-4 text-sm text-gray-700">
        <div className="font-semibold">Core differentiator</div>
        <div className="mt-2">
          Diplomacy is done through <span className="font-medium">free-form chat</span> with AI countries, then formalized
          into a <span className="font-medium">structured deal</span> both sides confirm.
        </div>
      </div>

      {/* Recent Games */}
      <div className="mt-10">
        <h2 className="text-xl font-semibold mb-4">Recent Games</h2>
        {loading ? (
          <div className="text-gray-600">Loading games...</div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : games.length === 0 ? (
          <div className="text-gray-600">No games found. Create your first game!</div>
        ) : (
          <div className="space-y-2">
            {games.slice(0, 10).map((game) => (
              <Link
                key={game.id}
                href={`/game/${game.id}`}
                className="block rounded border border-gray-300 p-3 hover:bg-gray-50 transition"
              >
                <div className="font-medium">{game.name}</div>
                <div className="text-xs text-gray-500 mt-1">
                  Last updated: {new Date(game.updatedAt).toLocaleDateString()} at{" "}
                  {new Date(game.updatedAt).toLocaleTimeString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
