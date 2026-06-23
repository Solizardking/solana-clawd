"use client";

import { FileText, FolderOpen, X } from "lucide-react";
import { useFileViewerStore } from "@/lib/fileViewerStore";
import { cn } from "@/lib/utils";

export function FileExplorer() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useFileViewerStore();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-surface-800 px-3 py-2.5 text-xs font-medium text-surface-400">
        <FolderOpen className="h-4 w-4" aria-hidden="true" />
        <span>Files</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tabs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-surface-500">
            <FileText className="h-5 w-5" aria-hidden="true" />
            <span>No open files</span>
          </div>
        ) : (
          <div className="space-y-1">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  tab.id === activeTabId
                    ? "bg-surface-800 text-surface-100"
                    : "text-surface-300 hover:bg-surface-800/70"
                )}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <FileText className="h-4 w-4 flex-shrink-0 text-surface-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{tab.filename}</span>
                  {tab.isDirty && <span className="text-brand-400" aria-hidden="true">•</span>}
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(tab.id)}
                  aria-label={`Close ${tab.filename}`}
                  title={`Close ${tab.filename}`}
                  className="rounded p-1 text-surface-600 opacity-0 transition-opacity hover:bg-surface-700 hover:text-surface-100 group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
