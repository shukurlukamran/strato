"use client";

import { useGameStore } from "@/lib/store/gameStore";
import { useEffect } from "react";

export function ActionPanel({ onEndTurn }: { onEndTurn: () => void }) {
  const selectedCountryId = useGameStore((s) => s.selectedCountryId);
  const openChatWith = useGameStore((s) => s.openChatWith);
  const activeChatCountryId = useGameStore((s) => s.activeChatCountryId);
  
  // #region agent log
  useEffect(() => {
    console.log('[DEBUG] ActionPanel: State changed', { selectedCountryId, activeChatCountryId });
  }, [selectedCountryId, activeChatCountryId]);
  // #endregion
  
  const handleProposeDeal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // #region agent log
    console.log('[DEBUG] ActionPanel: Propose Deal clicked', { selectedCountryId, activeChatCountryId, eventType: e.type });
    fetch('http://127.0.0.1:7242/ingest/5cfd136f-1fa7-464e-84d5-bcaf3c90cae7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionPanel.tsx:handleProposeDeal',message:'Propose Deal button clicked',data:{selectedCountryId,activeChatCountryId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
    // #endregion
    
    // If chat is already open, just ensure it stays open (button might be used to reopen)
    if (activeChatCountryId) {
      // #region agent log
      console.log('[DEBUG] ActionPanel: Chat already open with', activeChatCountryId);
      // #endregion
      return;
    }
    
    if (selectedCountryId) {
      // #region agent log
      console.log('[DEBUG] ActionPanel: Opening chat with selected country', selectedCountryId);
      fetch('http://127.0.0.1:7242/ingest/5cfd136f-1fa7-464e-84d5-bcaf3c90cae7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'ActionPanel.tsx:handleProposeDeal',message:'Opening chat with selected country',data:{selectedCountryId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      openChatWith(selectedCountryId);
      // #region agent log
      setTimeout(() => {
        const newState = useGameStore.getState();
        console.log('[DEBUG] ActionPanel: State after openChatWith (delayed check)', { 
          newActiveChatCountryId: newState.activeChatCountryId,
        });
      }, 100);
      // #endregion
    } else {
      // #region agent log
      console.log('[DEBUG] ActionPanel: No country selected');
      // #endregion
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      <div className="mb-3 text-sm font-semibold text-white">Actions</div>
      <div className="space-y-2">
        <button
          type="button"
          className="w-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:from-blue-500 hover:to-blue-600 hover:shadow-xl active:scale-95"
          onClick={onEndTurn}
        >
          End Turn
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-white/20 bg-slate-700/50 px-4 py-2 text-sm text-white/80 hover:bg-slate-700/70 hover:text-white disabled:opacity-50"
          disabled={!selectedCountryId}
          onClick={handleProposeDeal}
        >
          Propose Deal (via chat)
        </button>
      </div>
      <div className="mt-3 text-xs text-white/50">
        More actions coming: Military, Economy, Research
      </div>
    </div>
  );
}
