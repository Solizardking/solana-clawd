"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { AgentIcon } from "@/components/icons";

interface GrantData {
  capability: string;
  status: string;
  reason?: string | null;
  granted_by?: string | null;
  expires_at?: string | null;
  constraints?: Record<string, unknown> | null;
}

interface AgentData {
  agent_id: string;
  name: string;
  status: string;
  mode: string;
  host_id: string;
  host_name: string | null;
  agent_capability_grants: GrantData[];
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
}

function timeAgo(date: string | null) {
  if (!date) return "Never";
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "active"
      ? "bg-emerald-400"
      : status === "pending"
        ? "bg-amber-400"
        : status === "revoked"
          ? "bg-red-400"
          : "bg-white/20";
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} />;
}

const FIELD_LABELS: Record<string, string> = {
  amountCents: "Spend limit",
  currency: "Currency",
  merchantName: "Merchant",
  to: "Recipients",
  amount: "Amount",
};

function formatConstraintValue(field: string, value: unknown): string {
  const label = FIELD_LABELS[field] ?? field;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    if (field === "amountCents" && typeof value === "number")
      return `${label}: $${(value / 100).toFixed(2)}`;
    return `${label}: ${String(value)}`;
  }
  const ops = value as Record<string, unknown>;
  const parts: string[] = [];
  if (ops.eq !== undefined) parts.push(`${ops.eq}`);
  if (ops.in !== undefined && Array.isArray(ops.in)) parts.push(ops.in.map(String).join(", "));
  if (ops.max !== undefined && ops.min !== undefined) parts.push(`${ops.min}–${ops.max}`);
  else {
    if (ops.max !== undefined) {
      if (field === "amountCents") parts.push(`up to $${(Number(ops.max) / 100).toFixed(2)}`);
      else parts.push(`max ${ops.max}`);
    }
    if (ops.min !== undefined) parts.push(`min ${ops.min}`);
  }
  return parts.length > 0 ? `${label}: ${parts.join(", ")}` : `${label}: ${JSON.stringify(value)}`;
}

function MetaItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-white/[0.04] px-3 py-2">
      <span className="text-[10px] uppercase tracking-wider text-white/25 font-medium">
        {label}
      </span>
      <div className="text-[12px] text-white/70">{children}</div>
    </div>
  );
}

function CapabilityRow({ grant }: { grant: GrantData }) {
  const hasConstraints = grant.constraints && Object.keys(grant.constraints).length > 0;
  return (
    <div className="rounded-lg bg-white/[0.04] px-3 py-2 hover:bg-white/[0.06] transition-colors">
      <div className="flex items-center gap-2.5">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-white/[0.06]">
          <svg
            className="h-3 w-3 text-white/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <code className="text-[12px] font-mono text-white/70 truncate block">
            {grant.capability}
          </code>
          {grant.reason && (
            <p className="text-[11px] text-white/30 italic truncate mt-0.5">
              &ldquo;{grant.reason}&rdquo;
            </p>
          )}
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            grant.status === "active"
              ? "bg-emerald-500/15 text-emerald-400"
              : grant.status === "pending"
                ? "bg-amber-500/15 text-amber-400"
                : "bg-white/[0.06] text-white/30"
          }`}
        >
          <StatusDot status={grant.status} />
          {grant.status}
        </span>
      </div>
      {hasConstraints && (
        <div className="mt-1.5 ml-[34px] flex flex-wrap gap-1">
          {Object.entries(grant.constraints!).map(([field, value]) => (
            <span
              key={field}
              className="inline-flex items-center gap-0.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40 font-mono"
            >
              {formatConstraintValue(field, value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const params = filter !== "all" ? `?status=${filter}` : "";
    const res = await fetch(`/api/auth/agent/list${params}`);
    const data = await res.json();
    setAgents(data.agents ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  async function handleRevoke(agentId: string) {
    setRevoking(agentId);
    try {
      const res = await fetch("/api/auth/agent/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });
      if (res.ok) {
        toast.success("Agent revoked");
        fetchAgents();
      } else {
        const d = await res.json();
        toast.error(d.message ?? "Failed to revoke");
      }
    } finally {
      setRevoking(null);
    }
  }

  async function handleRevokeAll() {
    const active = agents.filter((a) => a.status === "active");
    if (active.length === 0) return;
    if (!confirm(`Revoke all ${active.length} active agent(s)?`)) return;
    setRevokingAll(true);
    try {
      await Promise.all(
        active.map((a) =>
          fetch("/api/auth/agent/revoke", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent_id: a.agent_id }),
          }),
        ),
      );
      toast.success(`Revoked ${active.length} agent(s)`);
      fetchAgents();
    } finally {
      setRevokingAll(false);
    }
  }

  const filters = ["active", "all", "pending", "revoked"];

  return (
    <div className="px-8 py-8 max-w-[1000px]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-semibold">Agents</h1>
          <p className="mt-0.5 text-[13px] text-white/40">
            {loading ? "Loading..." : `${agents.length} agent${agents.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {agents.some((a) => a.status === "active") && (
            <button
              onClick={handleRevokeAll}
              disabled={revokingAll}
              className="px-3 py-1.5 text-[12px] font-medium rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50 cursor-pointer"
            >
              {revokingAll ? "Revoking..." : "Revoke All"}
            </button>
          )}
          <div className="flex rounded-md border border-white/[0.1] overflow-hidden">
            {filters.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[12px] font-medium capitalize transition-colors cursor-pointer ${
                  f !== filters[0] ? "border-l border-white/[0.1]" : ""
                } ${filter === f ? "bg-white/[0.1] text-white" : "text-white/40 hover:text-white/60"}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-lg border border-white/[0.08] bg-white/[0.02] animate-pulse"
            />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-white/[0.08] border-dashed py-16 text-center">
          <AgentIcon className="h-8 w-8 text-white/15 mx-auto mb-3" />
          <h3 className="text-[13px] font-medium text-white/50">No agents found</h3>
          <p className="mt-1 text-[12px] text-white/25">
            Agents will appear here once they connect.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {agents.map((agent) => {
            const isExpanded = expanded === agent.agent_id;
            const activeGrants = agent.agent_capability_grants.filter((g) => g.status === "active");
            const pendingGrants = agent.agent_capability_grants.filter(
              (g) => g.status === "pending",
            );

            return (
              <div
                key={agent.agent_id}
                className={`rounded-lg border transition-all ${
                  isExpanded
                    ? "border-white/[0.15] bg-white/[0.02]"
                    : "border-white/[0.08] hover:border-white/[0.12]"
                }`}
              >
                <button
                  onClick={() => setExpanded(isExpanded ? null : agent.agent_id)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left"
                >
                  <div
                    className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 ${
                      agent.status === "active"
                        ? "bg-emerald-500/15"
                        : agent.status === "pending"
                          ? "bg-amber-500/15"
                          : "bg-white/[0.06]"
                    }`}
                  >
                    <AgentIcon
                      className={`h-4 w-4 ${
                        agent.status === "active"
                          ? "text-emerald-400"
                          : agent.status === "pending"
                            ? "text-amber-400"
                            : "text-white/25"
                      }`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium truncate">{agent.name}</span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          agent.status === "active"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : agent.status === "pending"
                              ? "bg-amber-500/15 text-amber-400"
                              : agent.status === "revoked"
                                ? "bg-red-500/15 text-red-400"
                                : "bg-white/[0.06] text-white/30"
                        }`}
                      >
                        <StatusDot status={agent.status} />
                        {agent.status}
                      </span>
                      <span className="text-[10px] text-white/20 bg-white/[0.04] rounded px-1.5 py-0.5">
                        {agent.mode}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/30">
                      <span>
                        {activeGrants.length} cap{activeGrants.length !== 1 ? "s" : ""}
                      </span>
                      {pendingGrants.length > 0 && (
                        <>
                          <span className="text-white/15">·</span>
                          <span className="text-amber-400">{pendingGrants.length} pending</span>
                        </>
                      )}
                      <span className="text-white/15">·</span>
                      <span>{timeAgo(agent.created_at)}</span>
                    </div>
                  </div>
                  <svg
                    className={`h-4 w-4 shrink-0 text-white/20 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="border-t border-white/[0.06] px-4 py-4">
                    <div className="grid grid-cols-2 gap-1.5 mb-4">
                      <MetaItem label="Agent ID">
                        <code className="text-[11px] font-mono break-all">{agent.agent_id}</code>
                      </MetaItem>
                      <MetaItem label="Host">
                        {agent.host_name ?? (
                          <code className="text-[11px] font-mono break-all">{agent.host_id}</code>
                        )}
                      </MetaItem>
                      <MetaItem label="Last Active">{timeAgo(agent.last_used_at)}</MetaItem>
                      <MetaItem label="Expires">
                        {agent.expires_at
                          ? new Date(agent.expires_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "No expiration"}
                      </MetaItem>
                    </div>

                    <div className="mb-4">
                      <span className="text-[10px] uppercase tracking-wider text-white/25 font-medium block mb-2">
                        Capabilities
                      </span>
                      {agent.agent_capability_grants.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {agent.agent_capability_grants.map((g, i) => (
                            <CapabilityRow key={i} grant={g} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-white/25 py-2">
                          No capabilities granted yet.
                        </p>
                      )}
                    </div>

                    {agent.status === "active" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRevoke(agent.agent_id);
                        }}
                        disabled={revoking === agent.agent_id}
                        className="px-3.5 py-1.5 text-[12px] font-medium rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50 cursor-pointer"
                      >
                        {revoking === agent.agent_id ? "Revoking..." : "Revoke Agent"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
