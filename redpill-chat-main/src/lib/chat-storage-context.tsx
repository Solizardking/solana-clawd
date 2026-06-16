"use client";

import { createContext, type ReactNode, useContext } from "react";
import {
  type UseChatStorageReturn,
  useChatStorage,
} from "@/hooks/use-chat-storage";

const ChatStorageContext = createContext<UseChatStorageReturn | null>(null);

export function ChatStorageProvider({ children }: { children: ReactNode }) {
  const chatStorage = useChatStorage();

  return (
    <ChatStorageContext.Provider value={chatStorage}>
      {children}
    </ChatStorageContext.Provider>
  );
}

export function useChatStorageContext(): UseChatStorageReturn {
  const context = useContext(ChatStorageContext);
  if (!context) {
    throw new Error(
      "useChatStorageContext must be used within ChatStorageProvider",
    );
  }
  return context;
}
