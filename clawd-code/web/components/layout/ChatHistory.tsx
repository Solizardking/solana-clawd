"use client";

import { MessageSquare, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { useChatStore } from "@/lib/store";
import { cn, extractTextContent, formatDate } from "@/lib/utils";

interface ChatHistoryProps {
  onNavigate?: () => void;
}

export function ChatHistory({ onNavigate }: ChatHistoryProps) {
  const {
    conversations,
    activeConversationId,
    pinnedIds,
    searchQuery,
    createConversation,
    setActiveConversation,
    deleteConversation,
    pinConversation,
    setSearchQuery,
  } = useChatStore();

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = conversations.filter((conversation) => {
    if (!normalizedQuery) return true;
    const haystack = [
      conversation.title,
      conversation.model ?? "",
      ...conversation.messages.map((message) => extractTextContent(message.content)),
    ].join(" ").toLowerCase();
    return haystack.includes(normalizedQuery);
  });

  const sorted = [...filtered].sort((a, b) => {
    const aPinned = pinnedIds.includes(a.id) ? 1 : 0;
    const bPinned = pinnedIds.includes(b.id) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    return b.updatedAt - a.updatedAt;
  });

  const handleCreate = () => {
    createConversation();
    onNavigate?.();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-surface-800 p-3">
        <label htmlFor="conversation-search" className="sr-only">
          Search conversations
        </label>
        <input
          id="conversation-search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search"
          className="min-w-0 flex-1 rounded-md border border-surface-700 bg-surface-950 px-2.5 py-1.5 text-xs text-surface-100 placeholder:text-surface-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={handleCreate}
          aria-label="New conversation"
          title="New conversation"
          className="rounded-md p-1.5 text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-100"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-surface-500">
            <MessageSquare className="h-5 w-5" aria-hidden="true" />
            <span>No conversations</span>
          </div>
        ) : (
          <div className="space-y-1">
            {sorted.map((conversation) => {
              const pinned = pinnedIds.includes(conversation.id);
              const active = conversation.id === activeConversationId;
              const lastMessage = conversation.messages[conversation.messages.length - 1];
              const preview = lastMessage
                ? extractTextContent(lastMessage.content).slice(0, 96)
                : "New conversation";

              return (
                <div
                  key={conversation.id}
                  className={cn(
                    "group rounded-md border border-transparent transition-colors",
                    active ? "bg-surface-800 text-surface-100" : "hover:bg-surface-800/70"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveConversation(conversation.id);
                      onNavigate?.();
                    }}
                    className="w-full px-2.5 py-2 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {conversation.title}
                      </span>
                      {pinned && <Pin className="h-3 w-3 text-brand-400" aria-hidden="true" />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-surface-500">{preview}</p>
                    <p className="mt-1 text-[11px] text-surface-600">
                      {formatDate(conversation.updatedAt)}
                    </p>
                  </button>
                  <div className="flex justify-end gap-1 px-2 pb-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => pinConversation(conversation.id)}
                      aria-label={pinned ? "Unpin conversation" : "Pin conversation"}
                      title={pinned ? "Unpin conversation" : "Pin conversation"}
                      className="rounded p-1 text-surface-500 hover:bg-surface-700 hover:text-surface-100"
                    >
                      {pinned ? (
                        <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteConversation(conversation.id)}
                      aria-label="Delete conversation"
                      title="Delete conversation"
                      className="rounded p-1 text-surface-500 hover:bg-error-bg hover:text-error"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
