"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { RESOURCE_PROFILES } from "@/lib/game-engine/ResourceProfile";
import { getAllProfileModifiers } from "@/lib/game-engine/ProfileModifiers";

// Gameplay guidance for each profile
const PROFILE_GUIDANCE: Record<string, string> = {
  "Oil Kingdom": "Focus on exporting oil and coal to fund expensive upgrades. Build infrastructure early to maximize trade capacity. Military is slightly cheaper, but tech upgrades are expensive.",
  "Agriculture": "Excellent for population growth and food security. Export surplus food and timber. Tech upgrades are expensive, so focus on infrastructure and trade instead.",
  "Mining Empire": "Strong military recruitment and resource extraction. Export iron and rare earth minerals. Tech upgrades are expensive, but military is cheaper - perfect for aggressive expansion.",
  "Technological Hub": "Best for tech-focused strategies. Research is 25% cheaper! Military recruitment is also cheaper. Focus on reaching high tech levels quickly for production and military bonuses.",
  "Precious Metals Trader": "Wealthy but expensive upgrades. Export gold and gems for high trade value. All upgrades cost 20% more, so focus on trade efficiency and infrastructure for capacity.",
  "Balanced Nation": "Versatile profile with no major weaknesses. Standard costs across the board. Good for learning the game or flexible strategies that adapt to the situation.",
  "Industrial Complex": "Infrastructure is 20% cheaper! Perfect for building capacity and trade. Export manufactured goods (coal, steel). Focus on infrastructure to maximize trade deals and population capacity.",
  "Coastal Trading Hub": "Trade powerhouse! Infrastructure is 15% cheaper and trade revenue is 25% higher. Focus on making many trade deals and building infrastructure for maximum trade capacity."
};

export function AllProfilesInfo() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2 py-1 text-[10px] font-medium text-white/70 hover:bg-slate-600/50 hover:text-white transition-colors border border-white/10"
      >
        <span>ⓘ</span>
        <span>All Profiles</span>
      </button>

      {mounted && typeof window !== 'undefined' && isOpen && createPortal(
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-[9998]"
            onClick={() => setIsOpen(false)}
          />
          
          {/* Modal */}
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[700px] max-h-[80vh] rounded-lg border border-white/20 bg-slate-900/98 shadow-2xl backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="font-semibold text-white">All Resource Profiles</div>
                <div className="text-xs text-white/60 mt-1">
                  Each country has unique specializations affecting production, costs, and strategy
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-white/60 hover:text-white text-xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto max-h-[calc(80vh-80px)] p-4">
              <div className="space-y-4">
                {RESOURCE_PROFILES.map((profile, idx) => {
                  const bonuses = profile.modifiers.filter(m => m.multiplier > 1.0).sort((a, b) => b.multiplier - a.multiplier);
                  const penalties = profile.modifiers.filter(m => m.multiplier < 1.0).sort((a, b) => a.multiplier - b.multiplier);
                  const costMods = getAllProfileModifiers(profile);
                  
                  return (
                    <div key={idx} className="border-l-4 border-purple-400/40 pl-4 py-3 rounded-r bg-slate-800/30">
                      {/* Profile Header */}
                      <div className="font-semibold text-purple-300 text-base mb-1">{profile.name}</div>
                      <div className="text-xs text-white/70 mb-3">{profile.description}</div>
                      
                      {/* Gameplay Guidance */}
                      <div className="mb-3 p-2 rounded bg-blue-900/20 border border-blue-500/20">
                        <div className="text-xs font-semibold text-blue-300 mb-1">💡 Strategy:</div>
                        <div className="text-xs text-blue-200 leading-relaxed">{PROFILE_GUIDANCE[profile.name] || "Standard gameplay with balanced approach."}</div>
                      </div>
                      
                      {/* Resource Production Modifiers */}
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {bonuses.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-green-400 mb-1">📈 Production Bonuses:</div>
                            {bonuses.map((mod, i) => (
                              <div key={i} className="text-xs text-green-300">
                                • {formatResourceName(mod.resourceId)}: {Math.round(mod.multiplier * 100)}%
                                {mod.startingBonus > 0 && <span className="text-green-400"> (+{mod.startingBonus} start)</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {penalties.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-red-400 mb-1">📉 Production Penalties:</div>
                            {penalties.map((mod, i) => (
                              <div key={i} className="text-xs text-red-300">
                                • {formatResourceName(mod.resourceId)}: {Math.round(mod.multiplier * 100)}%
                                {mod.startingBonus < 0 && <span className="text-red-400"> ({mod.startingBonus} start)</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {/* Cost & Economic Modifiers */}
                      <div className="border-t border-white/10 pt-2">
                        <div className="text-xs font-semibold text-yellow-400 mb-2">💰 Economic Modifiers:</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {/* Tech Cost */}
                          <div className={costMods.techCost < 1 ? 'text-green-300' : costMods.techCost > 1 ? 'text-red-300' : 'text-white/70'}>
                            🔬 Tech Cost: {Math.round(costMods.techCost * 100)}%
                            {costMods.techCost < 1 && <span className="text-green-400"> ✓</span>}
                            {costMods.techCost > 1 && <span className="text-red-400"> ⚠</span>}
                          </div>
                          
                          {/* Infra Cost */}
                          <div className={costMods.infraCost < 1 ? 'text-green-300' : costMods.infraCost > 1 ? 'text-red-300' : 'text-white/70'}>
                            🏗️ Infra Cost: {Math.round(costMods.infraCost * 100)}%
                            {costMods.infraCost < 1 && <span className="text-green-400"> ✓</span>}
                            {costMods.infraCost > 1 && <span className="text-red-400"> ⚠</span>}
                          </div>
                          
                          {/* Military Cost */}
                          <div className={costMods.militaryCost < 1 ? 'text-green-300' : costMods.militaryCost > 1 ? 'text-red-300' : 'text-white/70'}>
                            ⚔️ Military Cost: {Math.round(costMods.militaryCost * 100)}%
                            {costMods.militaryCost < 1 && <span className="text-green-400"> ✓</span>}
                            {costMods.militaryCost > 1 && <span className="text-red-400"> ⚠</span>}
                          </div>
                          
                          {/* Trade Revenue */}
                          <div className={costMods.tradeRevenue > 1 ? 'text-green-300' : costMods.tradeRevenue < 1 ? 'text-red-300' : 'text-white/70'}>
                            🤝 Trade Revenue: {Math.round(costMods.tradeRevenue * 100)}%
                            {costMods.tradeRevenue > 1 && <span className="text-green-400"> ✓</span>}
                            {costMods.tradeRevenue < 1 && <span className="text-red-400"> ⚠</span>}
                          </div>
                          
                          {/* Tax Revenue */}
                          {costMods.taxRevenue !== 1 && (
                            <div className={costMods.taxRevenue > 1 ? 'text-green-300' : 'text-red-300'}>
                              💵 Tax Revenue: {Math.round(costMods.taxRevenue * 100)}%
                              {costMods.taxRevenue > 1 && <span className="text-green-400"> ✓</span>}
                              {costMods.taxRevenue < 1 && <span className="text-red-400"> ⚠</span>}
                            </div>
                          )}
                          
                          {/* Military Effectiveness */}
                          {costMods.militaryEffectiveness !== 1 && (
                            <div className={costMods.militaryEffectiveness > 1 ? 'text-green-300' : 'text-red-300'}>
                              ⚡ Combat Power: {Math.round(costMods.militaryEffectiveness * 100)}%
                              {costMods.militaryEffectiveness > 1 && <span className="text-green-400"> ✓</span>}
                              {costMods.militaryEffectiveness < 1 && <span className="text-red-400"> ⚠</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

function formatResourceName(resourceId: string): string {
  return resourceId
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
