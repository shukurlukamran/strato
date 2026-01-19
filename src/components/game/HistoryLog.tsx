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

  if (!history || history.events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-white/40">No events in previous turn</div>
      </div>
    );
  }

  // Group events by type
  const economicEvents = history.events.filter(e => e.type.startsWith('economic'));
  const actionEvents = history.events.filter(e => e.type.startsWith('action'));
  const otherEvents = history.events.filter(e => !e.type.startsWith('economic') && !e.type.startsWith('action'));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
        <h3 className="text-sm font-semibold text-white">Turn {history.turn} Events</h3>
        <span className="text-xs text-white/50">{history.events.length} events</span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto">
        {/* Economic Events */}
        {economicEvents.length > 0 && (
          <div className="space-y-1">
            <div className="mb-1 text-xs font-medium text-blue-400">Economic</div>
            {economicEvents.map((event, idx) => (
              <EventItem key={`economic-${idx}`} event={event} />
            ))}
          </div>
        )}

        {/* Action Events */}
        {actionEvents.length > 0 && (
          <div className="space-y-1">
            <div className="mb-1 text-xs font-medium text-green-400">Actions</div>
            {actionEvents.map((event, idx) => (
              <EventItem key={`action-${idx}`} event={event} />
            ))}
          </div>
        )}

        {/* Other Events */}
        {otherEvents.length > 0 && (
          <div className="space-y-1">
            <div className="mb-1 text-xs font-medium text-purple-400">Other</div>
            {otherEvents.map((event, idx) => (
              <EventItem key={`other-${idx}`} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EventItem({ event }: { event: HistoryEvent }) {
  // Determine icon and color based on event type
  let icon = "•";
  let textColor = "text-white/70";

  if (event.type.includes('economic')) {
    icon = "💰";
    textColor = "text-blue-300";
  } else if (event.type.includes('action')) {
    icon = "⚡";
    textColor = "text-green-300";
  } else if (event.type.includes('error')) {
    icon = "⚠️";
    textColor = "text-red-300";
  }

  return (
    <div className={`rounded bg-slate-800/50 px-2 py-1.5 text-xs ${textColor}`}>
      <span className="mr-1.5">{icon}</span>
      <span>{event.message}</span>
    </div>
  );
}
