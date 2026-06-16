"use client";

import { useThread } from "@assistant-ui/react";
import { useEffect } from "react";
import { useChatKey } from "@/hooks/use-chat-key";
import { useChatSettings } from "@/hooks/use-chat-settings";
import type { Chat, ChatMessage } from "@/hooks/use-chat-storage";
import { generateChatTitle } from "@/services/inference/title-generator";
import { chatEvents } from "@/services/storage/chat-events";
import { indexedDBStorage } from "@/services/storage/indexed-db";

/**
 * Hook to persist assistant-ui threads to IndexedDB
 * This syncs the current thread's messages to our storage
 */
export function useThreadPersistence(currentChatId: string | null) {
  const messages = useThread((state) => state.messages);
  const model = useChatSettings((state) => state.model);
  const autoGenerateTitles = useChatSettings(
    (state) => state.autoGenerateTitles,
  );
  const { chatKey } = useChatKey();

  useEffect(() => {
    const saveThread = async () => {
      try {
        if (!currentChatId) return;
        const chatId = currentChatId;

        // Convert assistant-ui messages to our format
        const chatMessages: ChatMessage[] = messages.map((msg, index) => {
          // Keep original content parts for accurate replay (reasoning, tool calls, etc.)
          const contentParts = Array.isArray(msg.content)
            ? msg.content
            : undefined;

          const summaryParts = [
            ...(contentParts ?? []),
            ...(msg.attachments?.flatMap(
              (attachment) => attachment.content ?? [],
            ) ?? []),
          ];

          // Build a plain-text summary for title generation/search fallbacks
          const plainText = summaryParts.length
            ? summaryParts
                .map((part) => {
                  if (part.type === "text") return part.text;
                  if (part.type === "reasoning")
                    return `[Reasoning] ${part.text}`;
                  if (part.type === "tool-call") {
                    return `[Tool Call: ${part.toolName}] ${part.argsText}${part.result ? `\nResult: ${JSON.stringify(part.result)}` : ""}`;
                  }
                  if (part.type === "image")
                    return `[Image${part.filename ? `: ${part.filename}` : ""}]`;
                  if (part.type === "file")
                    return `[File: ${part.filename || "unknown"}]`;
                  if (part.type === "audio") return "[Audio]";
                  if (part.type === "source")
                    return `[Source: ${part.title || part.url}]`;
                  return "";
                })
                .filter(Boolean)
                .join("\n")
            : typeof msg.content === "string"
              ? msg.content
              : "";

          return {
            id: msg.id || `msg_${Date.now()}_${index}`,
            role: msg.role === "user" ? "user" : "assistant",
            content: plainText,
            contentParts,
            attachments: msg.role === "user" ? msg.attachments : undefined,
            timestamp: msg.createdAt || new Date(),
          };
        });

        // Get existing chat or create new one
        const existingChat = await indexedDBStorage.getChat(chatId);

        let chat: Chat = existingChat
          ? {
              ...existingChat,
              messages: chatMessages,
              updatedAt: new Date().toISOString(),
              createdAt: new Date(existingChat.createdAt),
            }
          : {
              id: chatId,
              title: "New Chat",
              messages: chatMessages,
              createdAt: new Date(),
              updatedAt: new Date().toISOString(),
            };

        // Only save if there are messages
        if (chatMessages.length > 0) {
          // Auto-generate title for first message if still "New Chat"
          const isFirstMessage = chatMessages.length <= 2; // User + Assistant
          if (
            autoGenerateTitles &&
            isFirstMessage &&
            chat.title === "New Chat"
          ) {
            try {
              const titleMessages = chatMessages.map((msg) => ({
                role: msg.role,
                content: msg.content,
              }));

              const generatedTitle = await generateChatTitle(titleMessages);

              if (generatedTitle && generatedTitle !== "New Chat") {
                chat = {
                  ...chat,
                  title: generatedTitle,
                };
              }
            } catch (error) {
              console.error("Failed to generate title", error);
              // Continue with default title
            }
          }

          await indexedDBStorage.saveChat(chat);

          // Emit event to trigger UI reload
          chatEvents.emit({ reason: "save", chatId });
        }
      } catch (error) {
        console.error("Failed to save thread to IndexedDB", error);
      }
    };

    // Debounce saves to avoid too many writes
    const timeoutId = setTimeout(() => {
      void saveThread();
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [messages, currentChatId, model, chatKey, autoGenerateTitles]);

  return null;
}
