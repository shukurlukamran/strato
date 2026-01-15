"use client";

export function ActionPanel({ onEndTurn }: { onEndTurn: () => void }) {
  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      <div className="mb-3 text-sm font-semibold text-white">Actions</div>
      <div className="space-y-2">
        <button
          type="button"
          className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-500 hover:to-blue-600 hover:shadow-xl active:scale-95"
          onClick={onEndTurn}
        >
          End Turn
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-white/20 bg-slate-700/50 px-4 py-2 text-sm text-white/80 hover:bg-slate-700/70 hover:text-white disabled:opacity-50"
          disabled
        >
          Propose Deal (via chat)
        </button>
      </div>
      <div className="mt-3 text-xs text-white/50">
        More actions coming: Military, Economy, Research
      </div>
    </div>
  );
}
