"use client";

import type { Deal } from "@/types/deals";

interface TradeOfferAlertProps {
  deals: Deal[];
  onClick: (deal: Deal) => void;
}

export function TradeOfferAlert({ deals, onClick }: TradeOfferAlertProps) {
  if (deals.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm space-y-2">
      {deals.map((deal) => (
        <div
          key={deal.id}
          className="rounded-lg border border-blue-500/40 bg-blue-900/90 px-4 py-3 shadow-xl backdrop-blur cursor-pointer hover:bg-blue-900/95 transition-colors"
          onClick={() => onClick(deal)}
        >
          <div className="flex items-center gap-2 text-blue-200">
            <span className="text-lg">🤝</span>
            <span className="text-sm font-semibold">Trade Offer Pending</span>
          </div>
          <div className="mt-1 text-xs text-blue-100">
            Click to review and respond to this trade offer
          </div>
        </div>
      ))}
    </div>
  );
}
