"use client";

import { create } from "zustand";

interface ChatKeyState {
  chatKey: string | null;
  isLoading: boolean;
  error: string | null;
  hasFetched: boolean;
}

interface ChatKeyStore extends ChatKeyState {
  fetchChatKey: () => Promise<void>;
  clearChatKey: () => void;
}

interface ChatKeyResponse {
  key: string;
}

export const useChatKeyStore = create<ChatKeyStore>((set, get) => ({
  chatKey: null,
  isLoading: false,
  error: null,
  hasFetched: false,

  fetchChatKey: async () => {
    const state = get();
    if (state.isLoading || (state.hasFetched && state.chatKey)) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await fetch("/api/keys/chat", {
        method: "GET",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch chat key: ${response.status}`);
      }

      const data: ChatKeyResponse = await response.json();

      set({
        chatKey: data.key,
        isLoading: false,
        error: null,
        hasFetched: true,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      set({
        chatKey: null,
        isLoading: false,
        error: errorMessage,
        hasFetched: true,
      });
    }
  },

  clearChatKey: () => {
    set({
      chatKey: null,
      isLoading: false,
      error: null,
      hasFetched: false,
    });
  },

  setError: (error: string | null) => {
    set({ error });
  },
}));
