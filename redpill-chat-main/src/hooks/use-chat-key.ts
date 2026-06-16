"use client";

import { useEffect } from "react";
import { useChatKeyStore } from "@/store/chat-key";
import { useAuth } from "./use-auth";

export function useChatKey() {
  const { isAuthenticated, user, status: authStatus } = useAuth();
  const chatKey = useChatKeyStore((state) => state.chatKey);
  const isChatKeyLoading = useChatKeyStore((state) => state.isLoading);
  const error = useChatKeyStore((state) => state.error);
  const hasFetched = useChatKeyStore((state) => state.hasFetched);
  const fetchChatKey = useChatKeyStore((state) => state.fetchChatKey);
  const clearChatKey = useChatKeyStore((state) => state.clearChatKey);

  useEffect(() => {
    if (isAuthenticated && user) {
      if (!chatKey && !isChatKeyLoading && !hasFetched) {
        void fetchChatKey();
      }
    } else if (authStatus === "unauthenticated") {
      clearChatKey();
    }
  }, [
    isAuthenticated,
    user?.id,
    chatKey,
    isChatKeyLoading,
    hasFetched,
    authStatus,
    fetchChatKey,
    clearChatKey,
    user,
  ]);

  const isLoading =
    authStatus === "idle" || authStatus === "loading" || isChatKeyLoading;

  // Return empty string if user credits equal 0
  const effectiveChatKey =
    isAuthenticated && user?.credits && parseFloat(user.credits) === 0
      ? ""
      : chatKey;

  return {
    chatKey: effectiveChatKey,
    isLoading,
    error,
    refetch: fetchChatKey,
    isAuthenticated,
  };
}
