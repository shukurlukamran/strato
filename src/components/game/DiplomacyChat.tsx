"use client";

import { useMemo, useState } from "react";
import type { ChatMessage } from "@/types/chat";
import type { DealExtractionResult } from "@/lib/deals/DealExtractor";
import { Tooltip } from "@/components/game/Tooltip";

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
  const [confirmingDeal, setConfirmingDeal] = useState(false);
  const [dealExecuted, setDealExecuted] = useState(false);
  const [policyNotice, setPolicyNotice] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );

  async function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setPolicyNotice(null);
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
      const data = (await res.json()) as {
        messages: ChatMessage[];
        policyMessage?: string | null;
      };
      onNewMessages(data.messages);
      setPolicyNotice(data.policyMessage ?? null);
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
    setDealExecuted(false);
    setConfirmingDeal(false);
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
      const data = (await res.json()) as { deal: DealExtractionResult | null; message?: string; executed?: boolean };
      if (data.deal) {
        setExtractedDeal(data.deal);
        setDealExecuted(false);
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

  async function confirmDeal() {
    if (confirmingDeal || !extractedDeal) return;
    setConfirmingDeal(true);
    setExtractionError(null);
    try {
      const proposingCountryId = extractedDeal.proposerCountryId;
      const receivingCountryId = proposingCountryId === playerCountryId ? counterpartCountryId : playerCountryId;

      const res = await fetch("/api/deals/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameId,
          proposingCountryId,
          receivingCountryId,
          dealType: extractedDeal.dealType,
          dealTerms: extractedDeal.dealTerms,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to confirm deal");
      }

      setDealExecuted(true);
    } catch (e) {
      setExtractionError(e instanceof Error ? e.message : "Failed to confirm deal");
    } finally {
      setConfirmingDeal(false);
    }
  }

  // Debug: Log render to verify component is executing

  return (
    <div className="rounded-lg border bg-white p-4" style={{ overflow: 'visible' }}>
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

      {policyNotice && (
        <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
          <Tooltip content="Diplomacy replies use an in-world budget; extra replies cost credits.">
            <span className="cursor-help font-semibold">ℹ️</span>
          </Tooltip>
          <span className="whitespace-pre-wrap font-medium">{policyNotice}</span>
        </div>
      )}

      {/* Extract Deal Button - Always Visible */}
      <div 
        className="mt-2 flex items-center gap-2"
        style={{ 
          display: 'flex', 
          marginTop: '0.5rem', 
          minHeight: '2rem',
          visibility: 'visible',
          opacity: 1
        }}
      >
        <button
          type="button"
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ 
            display: 'inline-block',
            visibility: 'visible',
            minWidth: '100px',
            height: 'auto',
            padding: '0.375rem 0.75rem'
          }}
          onClick={() => {
            void extractDeal();
          }}
          disabled={extracting || busy || messages.length === 0}
          title={messages.length === 0 ? "Start a conversation to extract a deal" : undefined}
        >
          {extracting ? "Extracting..." : "Extract Deal"}
        </button>
        {extractionError && (
          <span className="text-xs text-red-600">{extractionError}</span>
        )}
      </div>

      {extractedDeal && (
        <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm">
          <div className="font-semibold text-blue-900">
            {dealExecuted ? "✓ Deal Confirmed & Executed!" : "Deal Extracted (Draft)"}
          </div>
          <div className="mt-1 text-xs text-blue-700">
            Type: <span className="font-medium">{extractedDeal.dealType}</span>
            {extractedDeal.reasoning && (
              <div className="mt-1 text-xs italic">{extractedDeal.reasoning}</div>
            )}
          </div>
          <div className="mt-2 text-xs text-blue-800">
            <div>
              <strong>{extractedDeal.proposerCountryId === playerCountryId ? "You" : "They"} commit:</strong>{" "}
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
              <strong>{extractedDeal.proposerCountryId === playerCountryId ? "They" : "You"} commit:</strong>{" "}
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

          {!dealExecuted && (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={() => void confirmDeal()}
                disabled={confirmingDeal}
              >
                {confirmingDeal ? "Confirming..." : "Confirm Deal"}
              </button>
              <button
                type="button"
                className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                onClick={() => {
                  setExtractedDeal(null);
                  setExtractionError(null);
                  setDealExecuted(false);
                  setConfirmingDeal(false);
                }}
                disabled={confirmingDeal}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 text-xs text-gray-600">Tip: Ctrl/⌘ + Enter to send.</div>
    </div>
  );
}

