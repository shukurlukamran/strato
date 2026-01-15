"use client";

import type { Country } from "@/types/country";
import { useGameStore } from "@/lib/store/gameStore";

export function Map({ countries }: { countries: Country[] }) {
  const selectedCountryId = useGameStore((s) => s.selectedCountryId);
  const selectCountry = useGameStore((s) => s.selectCountry);
  const openChatWith = useGameStore((s) => s.openChatWith);

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">World Board (placeholder)</div>
        <div className="text-xs text-gray-600">Scales to many countries later</div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {countries.map((c) => {
          const selected = c.id === selectedCountryId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => selectCountry(c.id)}
              className={[
                "rounded-md border p-3 text-left transition",
                selected ? "border-black bg-gray-50" : "border-gray-200 hover:border-gray-400",
              ].join(" ")}
            >
              <div className="flex items-center gap-2">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: c.color }} />
                <div className="text-sm font-medium">{c.name}</div>
              </div>
              <div className="mt-2 flex gap-2">
                <span className="text-[11px] text-gray-600">
                  {c.isPlayerControlled ? "You" : "AI"}
                </span>
                {!c.isPlayerControlled && (
                  <button
                    type="button"
                    className="ml-auto rounded border px-2 py-1 text-[11px] hover:bg-gray-50"
                    onClick={(e) => {
                      e.stopPropagation();
                      openChatWith(c.id);
                    }}
                  >
                    Chat
                  </button>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

