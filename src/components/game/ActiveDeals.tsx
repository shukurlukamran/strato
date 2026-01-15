"use client";

import type { Deal } from "@/types/deals";

export function ActiveDeals({ deals }: { deals: Deal[] }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm font-semibold">Deals</div>
      {deals.length === 0 ? (
        <div className="mt-2 text-sm text-gray-600">No deals yet.</div>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {deals.map((d) => (
            <li key={d.id} className="rounded border p-2">
              <div className="flex items-center justify-between">
                <div className="font-medium">{d.dealType}</div>
                <div className="text-xs text-gray-600">{d.status}</div>
              </div>
              <div className="mt-1 text-xs text-gray-600">
                Turn {d.turnCreated}
                {d.turnExpires != null ? ` → ${d.turnExpires}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

