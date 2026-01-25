"use client";

import { useState, useMemo } from "react";
import type { Deal } from "@/types/deals";
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
