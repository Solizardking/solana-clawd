"use client";

import { useThreadPersistence } from "@/hooks/use-thread-persistence";
import { useChatStorageContext } from "@/lib/chat-storage-context";

/**
 * Component that handles thread persistence
 * Must be rendered inside AssistantRuntimeProvider
 */
export function ThreadPersistenceHandler() {
  const { currentChat } = useChatStorageContext();

  // Enable thread persistence - save assistant-ui messages to IndexedDB
  useThreadPersistence(currentChat?.id || null);

  return null;
}
