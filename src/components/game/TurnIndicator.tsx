"use client";

export function TurnIndicator({ turn }: { turn: number }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/20 bg-slate-800/80 px-3 py-1.5">
      <div className="text-xs text-white/60">Turn</div>
      <div className="text-lg font-bold text-white">{turn}</div>
    </div>
  );
}
