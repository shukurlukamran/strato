"use client";

import { useState } from "react";
import type { Deal, DealTerms, DealType } from "@/types/deals";

export function DealProposal({
  gameId,
  proposingCountryId,
  receivingCountryId,
  turnCreated,
  onCreated,
}: {
  gameId: string;
  proposingCountryId: string;
  receivingCountryId: string;
  turnCreated: number;
  onCreated: (deal: Deal) => void;
}) {
  const [dealType, setDealType] = useState<DealType>("trade");
  const [termsJson, setTermsJson] = useState<string>(
    JSON.stringify(
      {
        proposerCommitments: [{ type: "resource_transfer", resource: "oil", amount: 100, durationTurns: 1 }],
        receiverCommitments: [{ type: "budget_transfer", amount: 200, durationTurns: 1 }],
        conditions: [],
      } satisfies DealTerms,
      null,
      2,
    ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function propose() {
    setError(null);
    let dealTerms: DealTerms;
    try {
      dealTerms = JSON.parse(termsJson) as DealTerms;
    } catch {
      setError("Invalid JSON in deal terms.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameId,
          proposingCountryId,
          receivingCountryId,
          dealType,
          dealTerms,
          turnCreated,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { deal: Deal };
      onCreated(data.deal);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to propose deal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm font-semibold">Deal Proposal (structured)</div>
      <div className="mt-2 text-sm text-gray-600">
        For now this is manual JSON. Next step is: extract these terms from chat automatically (LLM) and show a clean
        summary UI.
      </div>

      <div className="mt-3 grid gap-3">
        <label className="text-sm">
          <div className="mb-1 text-xs text-gray-600">Deal type</div>
          <select
            className="w-full rounded border px-3 py-2"
            value={dealType}
            onChange={(e) => setDealType(e.target.value as DealType)}
            disabled={busy}
          >
            <option value="trade">trade</option>
            <option value="alliance">alliance</option>
            <option value="non_aggression">non_aggression</option>
            <option value="military_aid">military_aid</option>
            <option value="technology_share">technology_share</option>
            <option value="custom">custom</option>
          </select>
        </label>

        <label className="text-sm">
          <div className="mb-1 text-xs text-gray-600">Deal terms (JSON)</div>
          <textarea
            className="h-40 w-full rounded border px-3 py-2 font-mono text-xs"
            value={termsJson}
            onChange={(e) => setTermsJson(e.target.value)}
            disabled={busy}
          />
        </label>

        {error && <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800">{error}</div>}

        <button
          type="button"
          className="rounded bg-black px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
          onClick={() => void propose()}
          disabled={busy}
        >
          Propose deal
        </button>
      </div>
    </div>
  );
}

