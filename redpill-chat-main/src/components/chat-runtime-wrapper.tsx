"use client";

import type { ThreadMessageLike } from "@assistant-ui/react";
import {
  AssistantRuntimeProvider,
  type ChatModelAdapter,
  useLocalRuntime,
} from "@assistant-ui/react";
import { type ReactNode, useMemo } from "react";
import { ThreadPersistenceHandler } from "@/components/thread-persistence-handler";
import { useChatStorageContext } from "@/lib/chat-storage-context";
import { createLocalAttachmentAdapter } from "@/lib/local-attachment-adapter";

interface ChatRuntimeWrapperProps {
  chatModelAdapter: ChatModelAdapter;
  children: ReactNode;
}

/**
 * Wrapper that creates a new runtime instance for each chat
 * Uses the chat ID as key to force recreation when switching chats
 */
export function ChatRuntimeWrapper({
  chatModelAdapter,
  children,
}: ChatRuntimeWrapperProps) {
  const { currentChat } = useChatStorageContext();

  // Convert chat messages to assistant-ui format for initialMessages
  const initialMessages: ThreadMessageLike[] | undefined =
    currentChat && currentChat.messages.length > 0
      ? currentChat.messages.map((msg) => {
          const contentParts =
            msg.contentParts && msg.contentParts.length > 0
              ? msg.contentParts
              : [{ type: "text" as const, text: msg.content }];

          // Older saved messages may include attachment parts directly in content.
          const sanitizedContent =
            msg.attachments?.length && Array.isArray(contentParts)
              ? contentParts.filter(
                  (part) => part.type !== "image" && part.type !== "file",
                )
              : contentParts;

          return {
            role: msg.role,
            content: sanitizedContent,
            attachments: msg.attachments,
          };
        })
      : undefined;

  const attachmentsAdapter = useMemo(() => createLocalAttachmentAdapter(), []);

  // Create runtime with initial messages
  const runtime = useLocalRuntime(chatModelAdapter, {
    initialMessages,
    adapters: { attachments: attachmentsAdapter },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPersistenceHandler />
      {children}
    </AssistantRuntimeProvider>
  );
}
