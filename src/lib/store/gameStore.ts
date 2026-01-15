import { create } from "zustand";

export interface GameUIState {
  gameId: string | null;
  selectedCountryId: string | null;
  activeChatCountryId: string | null;
  setGameId: (id: string | null) => void;
  selectCountry: (id: string | null) => void;
  openChatWith: (countryId: string | null) => void;
  closeChat: () => void;
}

export const useGameStore = create<GameUIState>((set) => ({
  gameId: null,
  selectedCountryId: null,
  activeChatCountryId: null,
  setGameId: (gameId) => set({ gameId }),
  selectCountry: (selectedCountryId) => set({ selectedCountryId }),
  openChatWith: (activeChatCountryId) => {
    // #region agent log
    console.log('[DEBUG] gameStore: openChatWith called', activeChatCountryId);
    fetch('http://127.0.0.1:7242/ingest/5cfd136f-1fa7-464e-84d5-bcaf3c90cae7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gameStore.ts:openChatWith',message:'openChatWith called',data:{countryId:activeChatCountryId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    set({ activeChatCountryId });
    // #region agent log
    console.log('[DEBUG] gameStore: State updated', activeChatCountryId);
    fetch('http://127.0.0.1:7242/ingest/5cfd136f-1fa7-464e-84d5-bcaf3c90cae7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'gameStore.ts:openChatWith',message:'State updated',data:{countryId:activeChatCountryId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
  },
  closeChat: () => set({ activeChatCountryId: null }),
}));

