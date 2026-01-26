"use client";

import type { Deal } from "@/types/deals";

interface TradeOfferAlertProps {
  deals: Deal[];
  onClick: (deal: Deal) => void;
}

export function TradeOfferAlert({ deals, onClick }: TradeOfferAlertProps) {
  if (deals.length === 0) return null;

  const deal = deals[0];

  return (
    <button
      type="button"
      onClick={() => onClick(deal)}
      className="inline-flex items-center gap-2 rounded-full border-2 border-emerald-400/80 bg-emerald-900/40 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition-all hover:bg-emerald-900/60 hover:border-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      title="Review and respond to the pending trade offer"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
      </span>
      <span className="animate-pulse">Trade Offer</span>
      {deals.length > 1 && (
        <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {deals.length}
        </span>
      )}
    </button>
  );
}
