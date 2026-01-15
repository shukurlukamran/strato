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
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm font-semibold">Diplomacy Chat</div>
      <div className="mt-3 h-64 overflow-auto rounded border bg-gray-50 p-3 text-sm">
        {sorted.length === 0 ? (
          <div className="text-gray-600">Start a conversation.</div>
        ) : (
          <div className="space-y-2">
            {sorted.map((m) => (
              <div key={m.id} className="flex">
                <div
                  className={[
                    "max-w-[85%] rounded px-3 py-2",
                    m.senderCountryId === playerCountryId ? "ml-auto bg-black text-white" : "bg-white border",
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

      <div className="mt-3 flex gap-2">
        <input
          className="w-full rounded border px-3 py-2 text-sm"
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
          className="rounded bg-black px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
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
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            onClick={() => void extractDeal()}
            disabled={extracting || busy}
          >
            {extracting ? "Extracting..." : "Extract Deal"}
          </button>
          {extractionError && (
            <span className="text-xs text-red-600">{extractionError}</span>
          )}
        </div>
      )}

      {extractedDeal && (
        <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm">
          <div className="font-semibold text-blue-900">Deal Extracted!</div>
          <div className="mt-1 text-xs text-blue-700">
            Type: <span className="font-medium">{extractedDeal.dealType}</span>
            {extractedDeal.reasoning && (
              <div className="mt-1 text-xs italic">{extractedDeal.reasoning}</div>
            )}
          </div>
          <div className="mt-2 text-xs text-blue-800">
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
              <div className="mt-1 text-xs text-blue-600">
                Confidence: {Math.round(extractedDeal.confidence * 100)}%
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 text-xs text-gray-600">Tip: Ctrl/⌘ + Enter to send.</div>
    </div>
  );
}

