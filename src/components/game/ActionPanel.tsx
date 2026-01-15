"use client";

export function ActionPanel({ onEndTurn }: { onEndTurn: () => void }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm font-semibold">Actions (placeholder)</div>
      <div className="mt-2 text-sm text-gray-600">
        V1: we’ll start with a minimal action set and expand into rich economy/military/diplomacy.
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          className="rounded bg-black px-3 py-2 text-sm text-white hover:bg-gray-800"
          onClick={onEndTurn}
        >
          End Turn
        </button>
        <button type="button" className="rounded border px-3 py-2 text-sm hover:bg-gray-50" disabled>
          Propose Deal (via chat)
        </button>
      </div>
    </div>
  );
}

