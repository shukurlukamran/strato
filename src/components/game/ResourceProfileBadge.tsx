"use client";

import type { ResourceProfile } from "@/lib/game-engine/ResourceProfile";
import { Tooltip } from "./Tooltip";

export function ResourceProfileBadge({ profile }: { profile: ResourceProfile | null | undefined }) {
  if (!profile) return null;

  // Build tooltip content showing all modifiers
  const bonuses = profile.modifiers.filter(m => m.multiplier > 1.0).sort((a, b) => b.multiplier - a.multiplier);
  const penalties = profile.modifiers.filter(m => m.multiplier < 1.0).sort((a, b) => a.multiplier - b.multiplier);

  const tooltipContent = (
    <div className="max-w-xs">
      <div className="font-semibold text-white mb-1">{profile.name}</div>
      <div className="text-xs text-white/80 mb-2">{profile.description}</div>
      
      {bonuses.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-semibold text-green-400 mb-1">Advantages:</div>
          {bonuses.map((mod, idx) => (
            <div key={idx} className="text-xs text-green-300">
              • {formatResourceName(mod.resourceId)}: {Math.round(mod.multiplier * 100)}% production
              {mod.startingBonus > 0 && ` (+${mod.startingBonus} start)`}
            </div>
          ))}
        </div>
      )}
      
      {penalties.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-red-400 mb-1">Disadvantages:</div>
          {penalties.map((mod, idx) => (
            <div key={idx} className="text-xs text-red-300">
              • {formatResourceName(mod.resourceId)}: {Math.round(mod.multiplier * 100)}% production
              {mod.startingBonus < 0 && ` (${mod.startingBonus} start)`}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <div className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 px-2 py-0.5 text-[10px] font-medium text-purple-300 border border-purple-400/30">
        <span className="opacity-70">⚙</span>
        <span>{profile.name}</span>
      </div>
    </Tooltip>
  );
}

function formatResourceName(resourceId: string): string {
  return resourceId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
