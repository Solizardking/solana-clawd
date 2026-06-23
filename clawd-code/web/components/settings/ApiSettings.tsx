"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useChatStore } from "@/lib/store";
import { SettingRow, SectionHeader, Toggle } from "./SettingRow";
import { cn } from "@/lib/utils";

type ConnectionStatus = "idle" | "checking" | "ok" | "error";

export function ApiSettings() {
  const { settings, updateSettings, resetSettings } = useChatStore();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  async function checkConnection() {
    setConnectionStatus("checking");
    setLatencyMs(null);
    const start = Date.now();
    try {
      const res = await fetch("/api/chat", {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      const ms = Date.now() - start;
      setLatencyMs(ms);
      if (!res.ok) {
        setConnectionStatus("error");
        return;
      }

      const body = (await res.json()) as { configured?: boolean };
      setConnectionStatus(body.configured ? "ok" : "error");
    } catch {
      setConnectionStatus("error");
    }
  }

  const statusIcon = {
    idle: null,
    checking: <Loader2 className="w-4 h-4 animate-spin text-surface-400" />,
    ok: <CheckCircle className="w-4 h-4 text-green-400" />,
    error: <XCircle className="w-4 h-4 text-red-400" />,
  }[connectionStatus];

  const statusText = {
    idle: "Not checked",
    checking: "Checking...",
    ok: latencyMs !== null ? `Connected — ${latencyMs}ms` : "Connected",
    error: "Connection failed",
  }[connectionStatus];

  return (
    <div>
      <SectionHeader title="API & OpenRouter" onReset={() => resetSettings("api")} />

      <SettingRow
        label="Companion API base URL"
        description="Used by local helper APIs. Chat runs through the server-side OpenRouter route."
        stack
      >
        <input
          type="url"
          value={settings.apiUrl}
          onChange={(e) => updateSettings({ apiUrl: e.target.value })}
          placeholder="http://localhost:3001"
          className={cn(
            "w-full bg-surface-800 border border-surface-700 rounded-md px-3 py-1.5 text-sm",
            "text-surface-200 placeholder-surface-600 focus:outline-none focus:ring-1 focus:ring-brand-500 font-mono"
          )}
        />
      </SettingRow>

      <SettingRow
        label="OpenRouter status"
        description="Verify that the local chat route has server-side OpenRouter credentials."
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {statusIcon}
            <span
              className={cn(
                "text-xs",
                connectionStatus === "ok" && "text-green-400",
                connectionStatus === "error" && "text-red-400",
                connectionStatus === "idle" && "text-surface-500",
                connectionStatus === "checking" && "text-surface-400"
              )}
            >
              {statusText}
            </span>
          </div>
          <button
            onClick={checkConnection}
            disabled={connectionStatus === "checking"}
            className={cn(
              "px-3 py-1 text-xs rounded-md border border-surface-700 transition-colors",
              "text-surface-300 hover:text-surface-100 hover:bg-surface-800",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            Check
          </button>
        </div>
      </SettingRow>

      <SettingRow
        label="Streaming"
        description="Stream responses token by token as they are generated."
      >
        <Toggle
          checked={settings.streamingEnabled}
          onChange={(v) => updateSettings({ streamingEnabled: v })}
        />
      </SettingRow>
    </div>
  );
}
