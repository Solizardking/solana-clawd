"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Bot, Monitor, Cloud, Server, Smartphone, Globe, Terminal } from "lucide-react";

interface AgentPayment {
  id: string;
  amountCents: number;
  currency: string;
  merchantName: string;
  itemDescription: string;
  status: string;
  createdAt: string;
}

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

const AGENT_COLORS = [
  "#1a1f36",
  "#533afe",
  "#0A8754",
  "#DF1B41",
  "#00A0D2",
  "#F7B955",
  "#7C3AED",
  "#059669",
  "#DC2626",
  "#2563EB",
];

function getAgentColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

function getHostIcon(hostName: string | null) {
  const name = (hostName ?? "").toLowerCase();
  if (name.includes("local") || name.includes("device") || name.includes("desktop")) return Monitor;
  if (
    name.includes("cloud") ||
    name.includes("aws") ||
    name.includes("gcp") ||
    name.includes("azure")
  )
    return Cloud;
  if (name.includes("server") || name.includes("node")) return Server;
  if (
    name.includes("mobile") ||
    name.includes("phone") ||
    name.includes("ios") ||
    name.includes("android")
  )
    return Smartphone;
  if (name.includes("web") || name.includes("browser")) return Globe;
  if (name.includes("terminal") || name.includes("cli") || name.includes("shell")) return Terminal;
  return Bot;
}

function AgentAvatar({
  name,
  hostName,
  size = "sm",
}: {
  name: string;
  hostName: string | null;
  size?: "sm" | "lg";
}) {
  const color = getAgentColor(name);
  const Icon = getHostIcon(hostName);
  const iconSize = size === "lg" ? "h-6 w-6" : "h-3.5 w-3.5";
  return (
    <div
      className={`flex items-center justify-center text-white shrink-0 rounded-full ${
        size === "lg" ? "h-14 w-14" : "h-7 w-7"
      }`}
      style={{ backgroundColor: color }}
    >
      <Icon className={iconSize} strokeWidth={1.75} />
    </div>
  );
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
      ? "bg-emerald-500"
      : status === "pending"
        ? "bg-amber-500"
        : status === "revoked"
          ? "bg-red-500"
          : "bg-muted-foreground/30";
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

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [agentPayments, setAgentPayments] = useState<AgentPayment[]>([]);

  const selected = agents.find((a) => a.agent_id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) {
      setAgentPayments([]);
      return;
    }
    fetch(`/api/payments?agent_id=${selectedId}`)
      .then((r) => r.json())
      .then((data) => setAgentPayments(data.payments ?? []))
      .catch(() => setAgentPayments([]));
  }, [selectedId]);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    const params = filter !== "all" ? `?status=${filter}` : "";
    const res = await fetch(`/api/auth/agent/list${params}`);
    const data = await res.json();
    const all = data.agents ?? [];
    setAgents(all);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    if (selectedId === null && agents.length > 0) {
      setSelectedId(agents[0].agent_id);
    }
  }, [agents, selectedId]);

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

  const filters = ["active", "all", "pending", "revoked"];

  return (
    <div className="flex h-full">
      <div className="flex-1 border-r border-border overflow-y-auto">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-[20px] font-semibold text-foreground">Agents</h1>
            <span className="text-[13px] text-muted-foreground">
              {loading ? "..." : `${agents.length} agent${agents.length !== 1 ? "s" : ""}`}
            </span>
          </div>
          <div className="flex rounded-lg border border-border overflow-hidden">
            {filters.map((f, i) => (
              <button
                key={f}
                onClick={() => {
                  setFilter(f);
                  setSelectedId(null);
                }}
                className={`flex-1 px-3 py-1.5 text-[12px] font-medium capitalize transition-colors cursor-pointer ${
                  i > 0 ? "border-l border-border" : ""
                } ${
                  filter === f
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="px-3 space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-10 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="px-6 py-20 text-center">
            <Bot className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-[14px] text-muted-foreground">No agents found</p>
            <p className="text-[13px] text-muted-foreground/70 mt-1">
              Agents will appear here once they connect.
            </p>
          </div>
        ) : (
          <div className="px-3">
            {agents.map((agent) => {
              const activeGrants = agent.agent_capability_grants.filter(
                (g) => g.status === "active",
              );
              return (
                <button
                  key={agent.agent_id}
                  onClick={() => setSelectedId(agent.agent_id)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors cursor-pointer ${
                    selectedId === agent.agent_id ? "bg-[#f5f5f5]" : "hover:bg-[#f5f5f5]/60"
                  }`}
                >
                  <AgentAvatar name={agent.name} hostName={agent.host_name} />
                  <span className="text-[13px] font-medium text-foreground truncate min-w-[100px] shrink-0">
                    {agent.name}
                  </span>
                  <span className="text-[13px] text-muted-foreground truncate flex-1 min-w-0">
                    {agent.host_name ?? "Unknown host"}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${
                      agent.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : agent.status === "pending"
                          ? "bg-amber-50 text-amber-700"
                          : agent.status === "revoked"
                            ? "bg-red-50 text-red-700"
                            : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <StatusDot status={agent.status} />
                    {agent.status}
                  </span>
                  <span className="text-[12px] text-muted-foreground shrink-0 tabular-nums">
                    {activeGrants.length} cap{activeGrants.length !== 1 ? "s" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="w-[380px] shrink-0 overflow-y-auto bg-white hidden lg:block">
          <div className="flex flex-col items-center pt-10 pb-6 px-6">
            <AgentAvatar name={selected.name} hostName={selected.host_name} size="lg" />
            <p className="mt-4 text-[16px] font-semibold text-foreground">{selected.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  selected.status === "active"
                    ? "bg-emerald-50 text-emerald-700"
                    : selected.status === "pending"
                      ? "bg-amber-50 text-amber-700"
                      : selected.status === "revoked"
                        ? "bg-red-50 text-red-700"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                <StatusDot status={selected.status} />
                {selected.status}
              </span>
              <span className="text-[11px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                {selected.mode}
              </span>
            </div>
          </div>

          <div className="px-5 space-y-3">
            <div className="rounded-2xl bg-[#f5f5f5] px-4 py-1">
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] text-foreground">Host</span>
                <span className="text-[14px] text-muted-foreground truncate ml-4 max-w-[180px]">
                  {selected.host_name ?? "Unknown"}
                </span>
              </div>
              <div className="border-t border-border/60" />
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] text-foreground">Host ID</span>
                <span className="text-[12px] text-muted-foreground font-mono truncate ml-4 max-w-[160px]">
                  {selected.host_id}
                </span>
              </div>
              <div className="border-t border-border/60" />
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] text-foreground">Last active</span>
                <span className="text-[14px] text-muted-foreground">
                  {timeAgo(selected.last_used_at)}
                </span>
              </div>
              <div className="border-t border-border/60" />
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] text-foreground">Expires</span>
                <span className="text-[14px] text-muted-foreground">
                  {selected.expires_at
                    ? new Date(selected.expires_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "No expiration"}
                </span>
              </div>
              <div className="border-t border-border/60" />
              <div className="flex items-center justify-between py-3">
                <span className="text-[14px] text-foreground">Agent ID</span>
                <span className="text-[12px] text-muted-foreground font-mono truncate ml-4 max-w-[160px]">
                  {selected.agent_id}
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-[#f5f5f5] px-4 py-3">
              <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                Capabilities
              </p>
              {selected.agent_capability_grants.length > 0 ? (
                <div className="space-y-2">
                  {selected.agent_capability_grants.map((g, i) => (
                    <div key={i} className="rounded-xl bg-white px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <code className="text-[12px] font-mono text-foreground">
                          {g.capability}
                        </code>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            g.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : g.status === "pending"
                                ? "bg-amber-50 text-amber-700"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <StatusDot status={g.status} />
                          {g.status}
                        </span>
                      </div>
                      {g.reason && (
                        <p className="text-[11px] text-muted-foreground italic mt-1">
                          &ldquo;{g.reason}&rdquo;
                        </p>
                      )}
                      {g.constraints && Object.keys(g.constraints).length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {Object.entries(g.constraints).map(([field, value]) => (
                            <span
                              key={field}
                              className="inline-flex items-center rounded bg-[#f5f5f5] px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                            >
                              {formatConstraintValue(field, value)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-muted-foreground">No capabilities granted yet.</p>
              )}
            </div>

            {agentPayments.length > 0 && (
              <div className="rounded-2xl bg-[#f5f5f5] px-4 py-3">
                <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  Activity
                </p>
                <div className="space-y-0">
                  {agentPayments.slice(0, 10).map((p, i) => (
                    <div key={p.id}>
                      {i > 0 && <div className="border-t border-border/40" />}
                      <div className="flex items-center justify-between py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium text-foreground truncate">
                            {p.merchantName}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {p.itemDescription}
                          </p>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          <p className="text-[13px] font-semibold tabular-nums text-foreground">
                            ${(p.amountCents / 100).toFixed(2)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(p.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {agentPayments.length > 10 && (
                  <p className="text-[11px] text-muted-foreground text-center pt-1">
                    +{agentPayments.length - 10} more
                  </p>
                )}
              </div>
            )}

            {selected.status === "active" && (
              <div className="rounded-2xl bg-[#f5f5f5] px-4 py-1">
                <button
                  onClick={() => handleRevoke(selected.agent_id)}
                  disabled={revoking === selected.agent_id}
                  className="flex w-full items-center justify-between py-3 text-[14px] text-red-600 hover:text-red-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <span>{revoking === selected.agent_id ? "Revoking..." : "Revoke Agent"}</span>
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            )}
          </div>

          <div className="h-6" />
        </div>
      )}
    </div>
  );
}
