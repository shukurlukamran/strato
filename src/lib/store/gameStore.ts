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
  openChatWith: (activeChatCountryId) => set({ activeChatCountryId }),
  closeChat: () => set({ activeChatCountryId: null }),
}));

