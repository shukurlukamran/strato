"use client";

import type { ResourceProfile } from "@/lib/game-engine/ResourceProfile";
import { Tooltip } from "./Tooltip";
import { ProfileModifiers } from "@/lib/game-engine/ProfileModifiers";

export function ResourceProfileBadge({ profile }: { profile: ResourceProfile | null | undefined }) {
  if (!profile) return null;

  // Build tooltip content showing all modifiers
  const bonuses = profile.modifiers.filter(m => m.multiplier > 1.0).sort((a, b) => b.multiplier - a.multiplier);
  const penalties = profile.modifiers.filter(m => m.multiplier < 1.0).sort((a, b) => a.multiplier - b.multiplier);
  
  // Get cost modifiers
  const costMods = ProfileModifiers.getCostModifiers(profile);

  const tooltipContent = (
    <div className="max-w-xs">
      <div className="font-semibold text-white mb-1">{profile.name}</div>
      <div className="text-xs text-white/80 mb-2">{profile.description}</div>
      
      {bonuses.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-semibold text-green-400 mb-1">Resource Production:</div>
          {bonuses.map((mod, idx) => (
            <div key={idx} className="text-xs text-green-300">
              • {formatResourceName(mod.resourceId)}: {Math.round(mod.multiplier * 100)}% production
              {mod.startingBonus > 0 && ` (+${mod.startingBonus} start)`}
            </div>
          ))}
        </div>
      )}
      
      {penalties.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-semibold text-red-400 mb-1">Resource Penalties:</div>
          {penalties.map((mod, idx) => (
            <div key={idx} className="text-xs text-red-300">
              • {formatResourceName(mod.resourceId)}: {Math.round(mod.multiplier * 100)}% production
              {mod.startingBonus < 0 && ` (${mod.startingBonus} start)`}
            </div>
          ))}
        </div>
      )}
      
      {/* Cost Modifiers Section */}
      {(costMods.techCostMultiplier !== undefined || 
        costMods.infraCostMultiplier !== undefined || 
        costMods.militaryCostMultiplier !== undefined ||
        costMods.tradeEfficiencyMultiplier !== undefined) && (
        <div className="border-t border-white/10 pt-2 mt-2">
          <div className="text-xs font-semibold text-blue-400 mb-1">Upgrade Cost Modifiers:</div>
          
          {costMods.techCostMultiplier !== undefined && (
            <div className={`text-xs ${costMods.techCostMultiplier < 1 ? 'text-green-300' : costMods.techCostMultiplier > 1 ? 'text-red-300' : 'text-white/70'}`}>
              • Technology: {Math.round(costMods.techCostMultiplier * 100)}% {costMods.techCostMultiplier < 1 ? '✓' : costMods.techCostMultiplier > 1 ? '⚠' : ''}
            </div>
          )}
          
          {costMods.infraCostMultiplier !== undefined && (
            <div className={`text-xs ${costMods.infraCostMultiplier < 1 ? 'text-green-300' : costMods.infraCostMultiplier > 1 ? 'text-red-300' : 'text-white/70'}`}>
              • Infrastructure: {Math.round(costMods.infraCostMultiplier * 100)}% {costMods.infraCostMultiplier < 1 ? '✓' : costMods.infraCostMultiplier > 1 ? '⚠' : ''}
            </div>
          )}
          
          {costMods.militaryCostMultiplier !== undefined && (
            <div className={`text-xs ${costMods.militaryCostMultiplier < 1 ? 'text-green-300' : costMods.militaryCostMultiplier > 1 ? 'text-red-300' : 'text-white/70'}`}>
              • Military: {Math.round(costMods.militaryCostMultiplier * 100)}% {costMods.militaryCostMultiplier < 1 ? '✓' : costMods.militaryCostMultiplier > 1 ? '⚠' : ''}
            </div>
          )}
          
          {costMods.tradeEfficiencyMultiplier !== undefined && costMods.tradeEfficiencyMultiplier !== 1 && (
            <div className={`text-xs ${costMods.tradeEfficiencyMultiplier > 1 ? 'text-green-300' : 'text-red-300'}`}>
              • Trade Efficiency: {Math.round(costMods.tradeEfficiencyMultiplier * 100)}% {costMods.tradeEfficiencyMultiplier > 1 ? '✓' : '⚠'}
            </div>
          )}
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
