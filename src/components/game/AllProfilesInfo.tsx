"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { RESOURCE_PROFILES } from "@/lib/game-engine/ResourceProfile";

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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[600px] max-h-[600px] rounded-lg border border-white/20 bg-slate-900/98 shadow-2xl backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <div className="font-semibold text-white">All Resource Profiles</div>
                <div className="text-xs text-white/60 mt-1">
                  Each country has a unique resource specialization
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
            <div className="overflow-y-auto max-h-[500px] p-4">
              <div className="space-y-3">
                {RESOURCE_PROFILES.map((profile, idx) => {
                  const bonuses = profile.modifiers.filter(m => m.multiplier > 1.0).sort((a, b) => b.multiplier - a.multiplier);
                  const penalties = profile.modifiers.filter(m => m.multiplier < 1.0).sort((a, b) => a.multiplier - b.multiplier);
                  
                  return (
                    <div key={idx} className="border-l-2 border-purple-400/30 pl-3 py-2">
                      <div className="font-semibold text-purple-300 text-sm">{profile.name}</div>
                      <div className="text-xs text-white/60 mb-2">{profile.description}</div>
                      
                      <div className="flex gap-4">
                        {bonuses.length > 0 && (
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-green-400 mb-1">Bonuses:</div>
                            {bonuses.map((mod, i) => (
                              <div key={i} className="text-xs text-green-300">
                                • {formatResourceName(mod.resourceId)} {Math.round(mod.multiplier * 100)}%
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {penalties.length > 0 && (
                          <div className="flex-1">
                            <div className="text-xs font-semibold text-red-400 mb-1">Penalties:</div>
                            {penalties.map((mod, i) => (
                              <div key={i} className="text-xs text-red-300">
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
