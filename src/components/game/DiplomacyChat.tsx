"use client";

import { useMemo, useState } from "react";
import type { ChatMessage } from "@/types/chat";

export function DiplomacyChat({
  gameId,
  chatId,
  playerCountryId,
  counterpartCountryId,
  messages,
  onNewMessages,
}: {
  gameId: string;
  chatId: string;
  playerCountryId: string;
  counterpartCountryId: string;
  messages: ChatMessage[];
  onNewMessages: (msgs: ChatMessage[]) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

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
    } finally {
      setBusy(false);
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
      <div className="mt-2 text-xs text-gray-600">Tip: Ctrl/⌘ + Enter to send.</div>
    </div>
  );
}

