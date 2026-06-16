import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type ThemeOption = "light" | "dark";

interface ChatSettingsState {
  theme: ThemeOption;
  messagesInContext: number;
  responseLanguage: string;
  model: string;
  temperature: number;
  maxTokens: number;
  autoGenerateTitles: boolean;
  setTheme: (theme: ThemeOption) => void;
  setMessagesInContext: (count: number) => void;
  setResponseLanguage: (language: string) => void;
  setModel: (model: string) => void;
  setTemperature: (temperature: number) => void;
  setMaxTokens: (maxTokens: number) => void;
  setAutoGenerateTitles: (enabled: boolean) => void;
}

const fallbackStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

export const useChatSettings = create<ChatSettingsState>()(
  persist(
    (set) => ({
      theme: "light",
      messagesInContext: 15,
      responseLanguage: "English",
      model: "",
      temperature: 1,
      maxTokens: 4096,
      autoGenerateTitles: true,
      setTheme: (theme) => set({ theme }),
      setMessagesInContext: (count) =>
        set({ messagesInContext: Math.min(Math.max(count, 1), 50) }),
      setResponseLanguage: (language) => set({ responseLanguage: language }),
      setModel: (model) => set({ model }),
      setTemperature: (temperature) =>
        set({ temperature: Math.min(Math.max(temperature, 0), 2) }),
      setMaxTokens: (maxTokens) =>
        set({ maxTokens: Math.min(Math.max(maxTokens, 1), 8192) }),
      setAutoGenerateTitles: (enabled) => set({ autoGenerateTitles: enabled }),
    }),
    {
      name: "redpill-chat-settings",
      storage: createJSONStorage(() =>
        typeof window === "undefined" ? fallbackStorage : window.localStorage,
      ),
      partialize: (state) => ({
        theme: state.theme,
        messagesInContext: state.messagesInContext,
        responseLanguage: state.responseLanguage,
        temperature: state.temperature,
        maxTokens: state.maxTokens,
        autoGenerateTitles: state.autoGenerateTitles,
      }),
    },
  ),
);

export type { ThemeOption };
