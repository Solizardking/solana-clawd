"use client";

import { useState, useEffect } from "react";

interface Agent {
  agent_id: string;
  name: string;
  status: string;
  mode: string;
  host_name: string;
  agent_capability_grants: Array<{
    capability: string;
    status: string;
  }>;
  created_at: string;
}

function OpenCodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M12 2L9.5 8.5 2 12l7.5 3.5L12 22l2.5-6.5L22 12l-7.5-3.5Z" fill="#00DC82" />
    </svg>
  );
}

function isOpenCode(name: string) {
  return /opencode/i.test(name);
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/agent/list")
      .then((r) => r.json())
      .then((data) => setAgents(data.agents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="max-w-[1000px] mx-auto px-6 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight mb-1">My Agents</h1>
      <p className="text-[13px] text-foreground/40 mb-6">
        Agents connected to your account. Claim autonomous agents to take ownership of their orders.
      </p>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg border border-border animate-pulse" />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <h3 className="text-[13px] font-medium text-foreground/60">No agents linked</h3>
          <p className="mt-1 text-[12px] text-foreground/35 max-w-sm mx-auto">
            When an AI agent shops on your behalf, it will appear here. You can claim autonomous
            agents to link their orders to your account.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((a) => (
            <div key={a.agent_id} className="rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${
                    isOpenCode(a.name)
                      ? "bg-[#00DC82]/10"
                      : a.status === "active"
                        ? "bg-emerald-500/10"
                        : a.status === "claimed"
                          ? "bg-blue-500/10"
                          : "bg-foreground/[0.04]"
                  }`}
                >
                  {isOpenCode(a.name) ? (
                    <OpenCodeIcon className="h-4 w-4" />
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className={
                        a.status === "active"
                          ? "text-emerald-500"
                          : a.status === "claimed"
                            ? "text-blue-500"
                            : "text-foreground/30"
                      }
                    >
                      <rect x="3" y="11" width="18" height="10" rx="2" />
                      <circle cx="9" cy="16" r="1.5" fill="currentColor" stroke="none" />
                      <circle cx="15" cy="16" r="1.5" fill="currentColor" stroke="none" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">{a.name}</span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded capitalize ${
                        a.status === "active"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : a.status === "claimed"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "bg-foreground/[0.06] text-foreground/40"
                      }`}
                    >
                      {a.status}
                    </span>
                    <span className="text-[10px] text-foreground/30 bg-foreground/[0.04] rounded px-1.5 py-0.5">
                      {a.mode}
                    </span>
                  </div>
                  <span className="text-[11px] text-foreground/30 font-mono">{a.agent_id}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {a.agent_capability_grants
                    .filter((g) => g.status === "active")
                    .map((g) => (
                      <span
                        key={g.capability}
                        className="text-[10px] font-mono rounded bg-foreground/[0.04] px-1.5 py-0.5 text-foreground/40"
                      >
                        {g.capability}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
