"use client";

import { useEffect, useState } from "react";

export type HistoryEvent = {
  type: string;
  message: string;
  data?: Record<string, unknown>;
};

export type TurnHistoryData = {
  turn: number;
  events: HistoryEvent[];
  createdAt: string;
};

interface HistoryLogProps {
  gameId: string;
  currentTurn: number;
}

export function HistoryLog({ gameId, currentTurn }: HistoryLogProps) {
  const [history, setHistory] = useState<TurnHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      if (currentTurn <= 1) {
        // No previous turn for turn 1
        setHistory(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        const previousTurn = currentTurn - 1;
        const res = await fetch(`/api/history?gameId=${encodeURIComponent(gameId)}&turn=${previousTurn}`);
        
        if (!res.ok) {
          throw new Error("Failed to load history");
        }
        
        const data = await res.json();
        setHistory(data.history);
      } catch (e) {
        console.error("Failed to load history:", e);
        setError(e instanceof Error ? e.message : "Failed to load history");
      } finally {
        setLoading(false);
      }
    }

    void fetchHistory();
  }, [gameId, currentTurn]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-white/60">Loading history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-red-400">Failed to load history</div>
      </div>
    );
  }

  // Don't filter - use events as-is from backend (already shuffled)
  const allEvents = history?.events || [];

  if (!history || allEvents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-white/40">No events in previous turn</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
        <h3 className="text-sm font-semibold text-white">Turn {history.turn} Events</h3>
        <span className="text-xs text-white/50">{allEvents.length}</span>
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {allEvents.map((event, idx) => (
          <EventItem key={`event-${idx}`} event={event} />
        ))}
      </div>
    </div>
  );
}

function EventItem({ event }: { event: HistoryEvent }) {
  // Determine icon and color based on event type
  let icon = "•";
  let textColor = "text-white/80";

  if (event.type === 'action.research') {
    icon = "🔬";
    textColor = "text-blue-300";
  } else if (event.type === 'action.military.capture') {
    icon = "⚔️";
    textColor = "text-red-400";
  } else if (event.type === 'action.military.defense') {
    icon = "🛡️";
    textColor = "text-blue-400";
  } else if (event.type === 'action.military') {
    icon = "⚔️";
    textColor = "text-red-300";
  } else if (event.type === 'action.economic') {
    icon = "🏗️";
    textColor = "text-green-300";
  } else if (event.type.startsWith('deal')) {
    icon = "🤝";
    textColor = "text-amber-300";
  } else if (event.type.startsWith('natural')) {
    icon = "🌍";
    textColor = "text-purple-300";
  } else if (event.type === 'statement.intent') {
    icon = "📢";
    textColor = "text-cyan-300";
  } else if (event.type === 'statement.rumor') {
    icon = "📰";
    textColor = "text-cyan-400";
  } else if (event.type.includes('error')) {
    icon = "⚠️";
    textColor = "text-red-400";
  }

  return (
    <div className={`rounded bg-slate-800/50 px-3 py-2 text-xs ${textColor}`}>
      <span className="mr-2 text-sm">{icon}</span>
      <span>{event.message}</span>
    </div>
  );
}
