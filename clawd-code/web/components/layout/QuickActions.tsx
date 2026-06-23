"use client";

import { MessageSquarePlus, Settings } from "lucide-react";
import { useChatStore } from "@/lib/store";

interface QuickActionsProps {
  onNavigate?: () => void;
}

export function QuickActions({ onNavigate }: QuickActionsProps) {
  const { createConversation, openSettings } = useChatStore();

  return (
    <div className="border-t border-surface-800 p-2">
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => {
            createConversation();
            onNavigate?.();
          }}
          className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-100"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          <span>New</span>
        </button>
        <button
          type="button"
          onClick={() => {
            openSettings();
            onNavigate?.();
          }}
          className="flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs text-surface-400 transition-colors hover:bg-surface-800 hover:text-surface-100"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
}
