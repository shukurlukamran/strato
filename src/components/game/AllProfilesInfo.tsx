"use client";

import { RESOURCE_PROFILES } from "@/lib/game-engine/ResourceProfile";
import { Tooltip } from "./Tooltip";

export function AllProfilesInfo() {
  const tooltipContent = (
    <div className="max-w-2xl max-h-96 overflow-y-auto">
      <div className="font-semibold text-white mb-2">All Resource Profiles</div>
      <div className="text-xs text-white/70 mb-3">
        Each country has a unique resource specialization that affects production rates
      </div>
      
      <div className="space-y-3">
        {RESOURCE_PROFILES.map((profile, idx) => {
          const bonuses = profile.modifiers.filter(m => m.multiplier > 1.0).sort((a, b) => b.multiplier - a.multiplier);
          const penalties = profile.modifiers.filter(m => m.multiplier < 1.0).sort((a, b) => a.multiplier - b.multiplier);
          
          return (
            <div key={idx} className="border-l-2 border-purple-400/30 pl-2">
              <div className="font-semibold text-purple-300 text-xs">{profile.name}</div>
              <div className="text-[10px] text-white/60 mb-1">{profile.description}</div>
              
              <div className="flex gap-3">
                {bonuses.length > 0 && (
                  <div className="flex-1">
                    <div className="text-[10px] font-semibold text-green-400">Bonuses:</div>
                    {bonuses.slice(0, 3).map((mod, i) => (
                      <div key={i} className="text-[10px] text-green-300">
                        • {formatResourceName(mod.resourceId)} {Math.round(mod.multiplier * 100)}%
                      </div>
                    ))}
                  </div>
                )}
                
                {penalties.length > 0 && (
                  <div className="flex-1">
                    <div className="text-[10px] font-semibold text-red-400">Penalties:</div>
                    {penalties.slice(0, 3).map((mod, i) => (
                      <div key={i} className="text-[10px] text-red-300">
                        • {formatResourceName(mod.resourceId)} {Math.round(mod.multiplier * 100)}%
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2 py-1 text-[10px] font-medium text-white/70 hover:bg-slate-600/50 hover:text-white transition-colors border border-white/10"
      >
        <span>ⓘ</span>
        <span>All Profiles</span>
      </button>
    </Tooltip>
  );
}

function formatResourceName(resourceId: string): string {
  return resourceId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
