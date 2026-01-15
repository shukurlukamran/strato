"use client";

import { useMemo, useState } from "react";
import type { ChatMessage } from "@/types/chat";
import type { DealExtractionResult } from "@/lib/deals/DealExtractor";

export function DiplomacyChat({
  gameId,
  chatId,
  playerCountryId,
  counterpartCountryId,
  messages,
  onNewMessages,
  onDealExtracted,
}: {
  gameId: string;
  chatId: string;
  playerCountryId: string;
  counterpartCountryId: string;
  messages: ChatMessage[];
  onNewMessages: (msgs: ChatMessage[]) => void;
  onDealExtracted?: (deal: DealExtractionResult) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractedDeal, setExtractedDeal] = useState<DealExtractionResult | null>(null);
  const [extractionError, setExtractionError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );

  async function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameId,
          chatId,
          senderCountryId: playerCountryId,
          receiverCountryId: counterpartCountryId,
          messageText: trimmed,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { messages: ChatMessage[] };
      onNewMessages(data.messages);
      setText("");
      // Clear extracted deal when new message is sent
      setExtractedDeal(null);
      setExtractionError(null);
    } finally {
      setBusy(false);
    }
  }

  async function extractDeal() {
    if (messages.length === 0) return;
    setExtracting(true);
    setExtractionError(null);
    setExtractedDeal(null);
    try {
      const res = await fetch("/api/deals/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameId,
          chatId,
          countryAId: playerCountryId,
          countryBId: counterpartCountryId,
        }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to extract deal");
      }
      const data = (await res.json()) as { deal: DealExtractionResult | null; message?: string };
      if (data.deal) {
        setExtractedDeal(data.deal);
        if (onDealExtracted) {
          onDealExtracted(data.deal);
        }
      } else {
        setExtractionError(data.message || "No deal detected in the conversation");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to extract deal";
      setExtractionError(errorMessage);
      console.error("Deal extraction error:", error);
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="text-sm font-semibold text-white mb-3">Diplomacy Chat</div>
      <div className="flex-1 overflow-auto rounded border border-white/10 bg-slate-800/50 p-3 text-sm mb-3">
        {sorted.length === 0 ? (
          <div className="text-white/60">Start a conversation.</div>
        ) : (
          <div className="space-y-2">
            {sorted.map((m) => (
              <div key={m.id} className="flex">
                <div
                  className={[
                    "max-w-[85%] rounded-lg px-3 py-2",
                    m.senderCountryId === playerCountryId 
                      ? "ml-auto bg-blue-600 text-white" 
                      : "bg-slate-700 text-white border border-white/10",
                  ].join(" ")}
                >
                  <div className="whitespace-pre-wrap">{m.messageText}</div>
                  <div className="mt-1 text-[11px] opacity-70">{new Date(m.createdAt).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded-lg border border-white/20 bg-slate-800/50 px-3 py-2 text-sm text-white placeholder:text-white/50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
          placeholder="Negotiate in natural language..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
          }}
          disabled={busy}
        />
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => void send()}
          disabled={busy}
        >
          Send
        </button>
      </div>

      {messages.length > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-slate-700 px-3 py-1.5 text-xs text-white hover:bg-slate-600 disabled:opacity-50"
            onClick={() => void extractDeal()}
            disabled={extracting || busy}
          >
            {extracting ? "Extracting..." : "Extract Deal"}
          </button>
          {extractionError && (
            <span className="text-xs text-red-400">{extractionError}</span>
          )}
        </div>
      )}

      {extractedDeal && (
        <div className="mt-3 rounded-lg border border-blue-500/50 bg-blue-900/30 p-3 text-sm">
          <div className="font-semibold text-blue-300">Deal Extracted!</div>
          <div className="mt-1 text-xs text-blue-200">
            Type: <span className="font-medium">{extractedDeal.dealType}</span>
            {extractedDeal.reasoning && (
              <div className="mt-1 text-xs italic text-blue-300">{extractedDeal.reasoning}</div>
            )}
          </div>
          <div className="mt-2 text-xs text-blue-200">
            <div>
              <strong>You commit:</strong>{" "}
              {extractedDeal.dealTerms.proposerCommitments.length > 0
                ? extractedDeal.dealTerms.proposerCommitments
                    .map((c) => {
                      if (c.type === "resource_transfer") {
                        return `${c.amount} ${c.resource}`;
                      } else if (c.type === "budget_transfer") {
                        return `${c.amount} credits`;
                      }
                      return c.type;
                    })
                    .join(", ")
                : "Nothing"}
            </div>
            <div className="mt-1">
              <strong>They commit:</strong>{" "}
              {extractedDeal.dealTerms.receiverCommitments.length > 0
                ? extractedDeal.dealTerms.receiverCommitments
                    .map((c) => {
                      if (c.type === "resource_transfer") {
                        return `${c.amount} ${c.resource}`;
                      } else if (c.type === "budget_transfer") {
                        return `${c.amount} credits`;
                      }
                      return c.type;
                    })
                    .join(", ")
                : "Nothing"}
            </div>
            {extractedDeal.confidence && (
              <div className="mt-1 text-xs text-blue-300">
                Confidence: {Math.round(extractedDeal.confidence * 100)}%
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 text-xs text-white/50">Tip: Ctrl/⌘ + Enter to send.</div>
    </div>
  );
}

