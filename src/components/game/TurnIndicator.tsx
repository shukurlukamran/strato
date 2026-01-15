"use client";

export function TurnIndicator({ turn }: { turn: number }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs text-gray-600">Current Turn</div>
      <div className="text-2xl font-semibold">{turn}</div>
    </div>
  );
}

