"use client";

import type { CompleteAttachment } from "@assistant-ui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { chatEvents } from "@/services/storage/chat-events";
import type { StoredChat } from "@/services/storage/indexed-db";
import { indexedDBStorage } from "@/services/storage/indexed-db";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  contentParts?: import("@assistant-ui/react").ThreadMessageLike["content"];
  attachments?: readonly CompleteAttachment[];
  timestamp: Date;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: string;
}

export interface UseChatStorageReturn {
  chats: Chat[];
  currentChat: Chat | null;
  isLoading: boolean;
  createChat: () => string;
  selectChat: (chatId: string) => void;
  updateChatTitle: (chatId: string, newTitle: string) => void;
  deleteChat: (chatId: string) => void;
}

// Helper function to format chats from storage
const formatChats = (loadedChats: StoredChat[]): Chat[] => {
  const formattedChats: Chat[] = loadedChats.map((chat) => ({
    id: chat.id,
    title: chat.title,
    messages: chat.messages,
    createdAt: new Date(chat.createdAt),
    updatedAt: chat.updatedAt,
  }));

  // Sort by creation time (newest first)
  formattedChats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return formattedChats;
};

export function useChatStorage(): UseChatStorageReturn {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initializedRef = useRef(false);
  const hasAutoCreatedChatRef = useRef(false);

  const createChat = useCallback(() => {
    const newChat: Chat = {
      id: `chat_${Date.now()}`,
      title: "New Chat",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date().toISOString(),
    };
    setChats((prev) => [newChat, ...prev]);
    setCurrentChat(newChat);
    return newChat.id;
  }, []);

  // Initialize IndexedDB and load chats
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const initializeStorage = async () => {
      try {
        await indexedDBStorage.initialize();
        const loadedChats = await indexedDBStorage.getAllChats();
        const formatted = formatChats(loadedChats);
        setChats(formatted);
        if (formatted.length === 0) {
          createChat();
        }
      } catch (error) {
        console.error("Failed to initialize storage", error);
      } finally {
        setIsLoading(false);
      }
    };

    void initializeStorage();
  }, [createChat]);

  // Listen for chat change events and reload
  useEffect(() => {
    const cleanup = chatEvents.on(async (event) => {
      // Reload chats from IndexedDB
      try {
        const loadedChats = await indexedDBStorage.getAllChats();
        const formattedChats = formatChats(loadedChats);
        setChats(formattedChats);

        // Handle different event types
        if (event.reason === "delete" && event.chatId) {
          // If deleted chat was current, switch to first available chat
          setCurrentChat((prev) => {
            if (prev?.id === event.chatId) {
              return formattedChats.length > 0 ? formattedChats[0] : null;
            }
            return prev;
          });
        } else if (event.chatId) {
          // Update currentChat if it was updated
          const updatedChat = formattedChats.find((c) => c.id === event.chatId);
          if (updatedChat) {
            setCurrentChat(updatedChat);
          }
        }
      } catch (error) {
        console.error("Failed to reload chats after event", error);
      }
    });

    return cleanup;
  }, []);

  // Reset auto-create guard when chat list changes (e.g., emptied)
  useEffect(() => {
    if (chats.length === 0) {
      hasAutoCreatedChatRef.current = false;
    }
  }, [chats.length]);

  // Auto-create a chat if none exists
  useEffect(() => {
    if (isLoading || hasAutoCreatedChatRef.current) return;
    if (currentChat) return;

    hasAutoCreatedChatRef.current = true;
    createChat();
  }, [currentChat, isLoading, createChat]);

  // Reset auto-create guard when chats reappear
  useEffect(() => {
    if (chats.length > 0) {
      hasAutoCreatedChatRef.current = false;
    }
  }, [chats.length]);

  const selectChat = useCallback(
    async (chatId: string) => {
      // Load from IndexedDB first to get latest data
      try {
        const loadedChat = await indexedDBStorage.getChat(chatId);
        if (loadedChat) {
          const chat: Chat = {
            id: loadedChat.id,
            title: loadedChat.title,
            messages: loadedChat.messages,
            createdAt: new Date(loadedChat.createdAt),
            updatedAt: loadedChat.updatedAt,
          };
          setCurrentChat(chat);
          return;
        }
      } catch (error) {
        console.error("Failed to load chat from IndexedDB", error);
      }

      // Fallback to memory
      const chat = chats.find((c) => c.id === chatId);
      if (chat) {
        setCurrentChat(chat);
      }
    },
    [chats],
  );

  const updateChatTitle = useCallback(
    async (chatId: string, newTitle: string) => {
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? { ...chat, title: newTitle, updatedAt: new Date().toISOString() }
            : chat,
        ),
      );

      // Update in IndexedDB
      const chat = chats.find((c) => c.id === chatId);
      if (chat && chat.messages.length > 0) {
        try {
          await indexedDBStorage.saveChat({
            ...chat,
            title: newTitle,
            updatedAt: new Date().toISOString(),
          });
        } catch (error) {
          console.error("Failed to update chat title in IndexedDB", error);
        }
      }
    },
    [chats],
  );

  const deleteChat = useCallback(async (chatId: string) => {
    // Delete from IndexedDB
    try {
      await indexedDBStorage.deleteChat(chatId);

      // Emit event to trigger reload
      chatEvents.emit({ reason: "delete", chatId });
    } catch (error) {
      console.error("Failed to delete chat from IndexedDB", error);
    }
  }, []);

  return {
    chats,
    currentChat,
    isLoading,
    createChat,
    selectChat,
    updateChatTitle,
    deleteChat,
  };
}
