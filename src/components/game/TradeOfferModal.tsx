"use client";

import { useEffect, useMemo, useState } from "react";
import { TradeValuation, TradeCommitment } from "@/lib/ai/TradeValuation";
import type { Deal, DealCommitment } from "@/types/deals";
import type { Country } from "@/types/country";

interface TradeOfferModalProps {
  gameId: string;
  deal: Deal;
  proposerCountry: Country;
  receiverCountry: Country;
  onClose: () => void;
  onResponded?: () => void;
}

export function TradeOfferModal({
  gameId,
  deal,
  proposerCountry,
  receiverCountry,
  onClose,
  onResponded,
}: TradeOfferModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marketPrices, setMarketPrices] = useState<Record<string, number> | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();
    setMarketError(null);
    setMarketLoading(true);

    fetch(`/api/market/prices?gameId=${gameId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data?.error || "Failed to load market prices");
        }
        return res.json();
      })
      .then((data) => {
        if (isMounted && data?.marketPrices) {
          setMarketPrices(data.marketPrices);
        }
      })
      .catch((fetchError) => {
        if (!isMounted) return;
        setMarketError(
          fetchError instanceof Error ? fetchError.message : "Unable to load market data"
        );
      })
      .finally(() => {
        if (isMounted) {
          setMarketLoading(false);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [gameId]);

  const normalizeCommitments = (commitments: DealCommitment[]): TradeCommitment[] => {
    return commitments
      .map((commitment) => ({
        type: commitment.type as TradeCommitment['type'],
        resource: commitment.resource,
        amount: commitment.amount || 0,
      }))
      .filter((commitment) => commitment.amount > 0);
  };

  const marketEvaluation = useMemo(() => {
    if (!marketPrices || deal.dealType !== 'trade') return null;
    const proposerCommitments = normalizeCommitments(deal.dealTerms.proposerCommitments);
    const receiverCommitments = normalizeCommitments(deal.dealTerms.receiverCommitments);
    if (proposerCommitments.length === 0 && receiverCommitments.length === 0) {
      return null;
    }

    const evaluation = TradeValuation.evaluateProposal(
      proposerCommitments,
      receiverCommitments,
      marketPrices
    );

    return {
      proposerValueGiven: evaluation.proposerValueGiven,
      proposerValueReceived: evaluation.proposerValueReceived,
      fairnessPercent: evaluation.normalizedNet * 100,
      normalizedNet: evaluation.normalizedNet,
    };
  }, [deal, marketPrices]);

  const formatValue = (value: number) =>
    `$${Math.round(value).toLocaleString("en-US")}`;

  // Format commitments for display
  const formatCommitments = (commitments: any[]) => {
    return commitments.map((c, idx) => {
      if (c.type === 'resource_transfer') {
        return (
          <div key={idx} className="flex items-center justify-between py-1">
            <span className="text-white/70 capitalize">{c.resource}</span>
            <span className="font-semibold text-white">{c.amount}x</span>
          </div>
        );
      } else if (c.type === 'budget_transfer') {
        return (
          <div key={idx} className="flex items-center justify-between py-1">
            <span className="text-white/70">Budget</span>
            <span className="font-semibold text-white">${c.amount}</span>
          </div>
        );
      }
      return (
        <div key={idx} className="text-xs text-white/50 italic">
          {c.type}
        </div>
      );
    });
  };

  const respondToDeal = async (action: "accept" | "reject") => {
    if (submitting) return;
    
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/deals/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: deal.id,
          action,
          respondingCountryId: receiverCountry.id,
        }),
      });
      
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `Failed to ${action} deal`);
      }
      
      onResponded?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} deal`);
    } finally {
      setSubmitting(false);
    }
  };

  const turnsRemaining = deal.turnExpires ? deal.turnExpires - (deal.turnCreated || 0) : 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-slate-900/95 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <div className="text-xs text-white/60">Trade Offer</div>
            <div className="text-lg font-bold text-white">From {proposerCountry.name}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-white/70 hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {error && (
            <div className="rounded border border-red-500/40 bg-red-900/20 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="rounded border border-blue-500/40 bg-blue-900/20 px-4 py-3">
            <div className="flex items-center gap-2 text-blue-300">
              <span className="text-lg">🤝</span>
              <span className="text-sm font-semibold">Trade Proposal</span>
            </div>
            <div className="mt-2 text-xs text-blue-200/80">
              {proposerCountry.name} has proposed a trade agreement with {receiverCountry.name}.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* What they're offering */}
            <div className="rounded border border-white/10 bg-slate-800/50 p-3">
              <div className="text-xs text-white/60 mb-2">They Offer</div>
              <div className="space-y-1">
                {deal.dealTerms.proposerCommitments.length > 0 ? (
                  formatCommitments(deal.dealTerms.proposerCommitments)
                ) : (
                  <div className="text-xs text-white/50 italic">Nothing</div>
                )}
              </div>
            </div>

            {/* What they want */}
            <div className="rounded border border-white/10 bg-slate-800/50 p-3">
              <div className="text-xs text-white/60 mb-2">They Request</div>
              <div className="space-y-1">
                {deal.dealTerms.receiverCommitments.length > 0 ? (
                  formatCommitments(deal.dealTerms.receiverCommitments)
                ) : (
                  <div className="text-xs text-white/50 italic">Nothing</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded border border-yellow-500/40 bg-yellow-900/20 px-4 py-3">
            <div className="flex items-center gap-2 text-yellow-300">
              <span className="text-base">⏰</span>
              <span className="text-xs font-semibold">
                Offer expires in {turnsRemaining} turn{turnsRemaining !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="mt-1 text-xs text-yellow-200/80">
              You must accept or reject this offer before it expires.
            </div>
          </div>

          <div className="rounded border border-white/10 bg-slate-800/40 p-4">
            <div className="text-xs font-semibold text-white mb-2">Trade Details</div>
            <div className="text-xs text-white/70 space-y-1">
              <div>• Resources will be transferred immediately upon acceptance</div>
              <div>• This is a one-time trade (not recurring)</div>
              <div>• Rejecting this offer will notify {proposerCountry.name}</div>
            </div>
          </div>
          <div className="rounded border border-emerald-500/40 bg-emerald-900/20 p-4 text-white">
            <div className="text-xs font-semibold text-white mb-2">Market comparison</div>
            {marketLoading ? (
              <div className="text-xs text-white/60">Loading market prices...</div>
            ) : marketError ? (
              <div className="text-xs text-red-300">{marketError}</div>
            ) : marketEvaluation ? (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-white/70">
                  <span>{proposerCountry.name} gives</span>
                  <span className="font-semibold text-white">
                    {formatValue(marketEvaluation.proposerValueGiven)}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-white/70">
                  <span>{receiverCountry.name} gives</span>
                  <span className="font-semibold text-white">
                    {formatValue(marketEvaluation.proposerValueReceived)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-white">
                  <span>Fairness</span>
                  <span>
                    {marketEvaluation.fairnessPercent >= 0 ? "+" : ""}
                    {marketEvaluation.fairnessPercent.toFixed(1)}%
                  </span>
                </div>
                <div className="text-[10px] text-white/60">
                  {marketEvaluation.normalizedNet >= 0
                    ? `${proposerCountry.name} advantage`
                    : `${receiverCountry.name} advantage`}
                </div>
              </div>
            ) : (
              <div className="text-xs text-white/60">Market data unavailable</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={() => respondToDeal("reject")}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white/80 hover:text-white hover:bg-slate-700"
            disabled={submitting}
          >
            {submitting ? "Processing..." : "Reject"}
          </button>
          <button
            type="button"
            onClick={() => respondToDeal("accept")}
            disabled={submitting}
            className="rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-2 text-sm font-semibold text-white shadow-lg transition-all hover:from-green-500 hover:to-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Accepting..." : "Accept Trade"}
          </button>
        </div>
      </div>
    </div>
  );
}
