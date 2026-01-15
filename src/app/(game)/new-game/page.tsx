"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewGamePage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function create() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/game", { method: "POST", headers: { "content-type": "application/json" } });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { gameId: string };
      router.push(`/game/${data.gameId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create game.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Start a new Strato game</h1>
      <p className="mt-2 text-gray-700">
        MVP setup: 6 imaginary countries, turn-based. Built to scale to many countries and multiplayer later.
      </p>

      {error && <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <div className="mt-6">
        <button
          type="button"
          className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-50"
          onClick={() => void create()}
          disabled={busy}
        >
          {busy ? "Creating..." : "Create game"}
        </button>
      </div>
    </main>
  );
}

