import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  Bot,
  Copy,
  Database,
  ExternalLink,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Webhook,
  Wifi,
  Zap,
} from "lucide-react";

type AgentExplorerItem = {
  id?: number;
  assetAddress: string;
  signature?: string | null;
  slot?: number | null;
  blockTime?: number | null;
  network?: string | null;
  name?: string | null;
  image?: string | null;
  description?: string | null;
  registrationUri?: string | null;
  services?: unknown[];
  active?: boolean | null;
  supportedTrust?: unknown[];
  ownerWallet?: string | null;
  payerWallet?: string | null;
  authorityWallet?: string | null;
  agentIdentityPda?: string | null;
  assetSignerPda?: string | null;
  tokenMint?: string | null;
  genesisAccount?: string | null;
  lifecycleTransfer?: boolean | null;
  lifecycleUpdate?: boolean | null;
  lifecycleExecute?: boolean | null;
  metadata?: { eventType?: string; source?: string } | Record<string, unknown> | null;
  updatedAt?: string | Date | null;
  insertedAt?: string | Date | null;
  solscanUrl?: string | null;
  explorerUrl?: string | null;
};

type FeedResponse = {
  success: boolean;
  items: AgentExplorerItem[];
};

type StatusResponse = {
  success: boolean;
  status: {
    databaseConfigured: boolean;
    feedTableReady: boolean;
    feedTableIssue?: string | null;
    rpcConfigured: boolean;
    wssConfigured: boolean;
    apiKeyConfigured: boolean;
    webhookUrl: string;
    webhookUrlConfigured: boolean;
    canCreateWebhook: boolean;
    webhookAuthConfigured: boolean;
    network: string;
    watchAddresses: string[];
    stream: {
      enabled: boolean;
      connected: boolean;
      subscriptionId?: number | string | null;
      lastMessageAt?: number;
      watchAddresses: string[];
    };
    lastIngestedAt: number;
    subscriberCount: number;
  };
};

const truncate = (value?: string | null, lead = 5, tail = 5) => {
  if (!value) return "—";
  return value.length > lead + tail + 3 ? `${value.slice(0, lead)}...${value.slice(-tail)}` : value;
};

const toTime = (item: AgentExplorerItem) => {
  if (item.blockTime) return new Date(item.blockTime * 1000);
  if (item.updatedAt) return new Date(item.updatedAt);
  if (item.insertedAt) return new Date(item.insertedAt);
  return null;
};

const formatTime = (item: AgentExplorerItem) => {
  const date = toTime(item);
  if (!date || Number.isNaN(date.getTime())) return "pending";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
};

const metadataText = (item: AgentExplorerItem, key: "eventType" | "source") => {
  const value = item.metadata && typeof item.metadata === "object" ? item.metadata[key] : null;
  return typeof value === "string" ? value : null;
};

const serviceNames = (item: AgentExplorerItem) => {
  return (item.services ?? [])
    .map((service) => {
      if (service && typeof service === "object" && "name" in service) return String((service as { name?: unknown }).name ?? "");
      return "";
    })
    .filter(Boolean);
};

function StateBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <Badge className={active ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-zinc-500/30 bg-zinc-500/10 text-zinc-300"}>
      {label}
    </Badge>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-black/35 p-3">
      <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-md ${tone}`}>{icon}</div>
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function AddressRow({ label, value }: { label: string; value?: string | null }) {
  const { toast } = useToast();
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({ title: "Copied", description: truncate(value, 8, 8) });
  };
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 py-2 last:border-b-0">
      <span className="text-xs text-white/45">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <code className="truncate font-mono text-xs text-cyan-200">{truncate(value, 8, 8)}</code>
        {value && (
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={copy} title={`Copy ${label}`}>
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AgentExplorerPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [liveItems, setLiveItems] = useState<AgentExplorerItem[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);

  const feedQuery = useQuery<FeedResponse>({
    queryKey: ["/api/agent-explorer/feed"],
    refetchInterval: 15_000,
  });

  const statusQuery = useQuery<StatusResponse>({
    queryKey: ["/api/agent-explorer/status"],
    refetchInterval: 10_000,
  });

  const registerWebhook = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/agent-explorer/webhooks/helius/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Webhook registration failed");
      return data;
    },
    onSuccess: () => {
      toast({ title: "Helius webhook created", description: "Agent explorer webhook is registered." });
      void statusQuery.refetch();
    },
    onError: (error: Error) => {
      toast({ title: "Webhook registration failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const source = new EventSource("/api/agent-explorer/events");
    const onAgent = (event: MessageEvent) => {
      const item = JSON.parse(event.data) as AgentExplorerItem;
      setLiveItems((current) => [item, ...current.filter((row) => row.assetAddress !== item.assetAddress)].slice(0, 40));
      queryClient.setQueryData<FeedResponse>(["/api/agent-explorer/feed"], (current) => {
        const existing = current?.items ?? [];
        return {
          success: true,
          items: [item, ...existing.filter((row) => row.assetAddress !== item.assetAddress)].slice(0, 100),
        };
      });
    };
    source.addEventListener("agent_observed", onAgent as EventListener);
    return () => source.close();
  }, [queryClient]);

  const items = useMemo(() => {
    const merged = [...liveItems, ...(feedQuery.data?.items ?? [])];
    const byAddress = new Map<string, AgentExplorerItem>();
    for (const item of merged) byAddress.set(item.assetAddress, item);
    return Array.from(byAddress.values()).sort((a, b) => {
      const at = toTime(a)?.getTime() ?? 0;
      const bt = toTime(b)?.getTime() ?? 0;
      return bt - at;
    });
  }, [feedQuery.data?.items, liveItems]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      return [
        item.assetAddress,
        item.name,
        item.description,
        item.ownerWallet,
        item.agentIdentityPda,
        item.assetSignerPda,
        item.tokenMint,
        item.signature,
        metadataText(item, "eventType"),
        metadataText(item, "source"),
        ...serviceNames(item),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [items, query]);

  const selected = filtered.find((item) => item.assetAddress === selectedAddress) ?? filtered[0] ?? null;
  const status = statusQuery.data?.status;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-3 py-5 sm:px-4 lg:px-6">
        <section className="rounded-md border border-white/10 bg-zinc-900/70 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
                  <Radio className="mr-1 h-3 w-3" />
                  {status?.network ?? "solana-mainnet"}
                </Badge>
                <StateBadge active={Boolean(status?.stream.connected)} label={status?.stream.connected ? "WSS live" : "WSS idle"} />
                <StateBadge active={Boolean(status?.webhookUrlConfigured)} label={status?.webhookUrlConfigured ? "Webhook URL set" : "Webhook URL missing"} />
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-normal text-white sm:text-3xl">Agent Explorer</h1>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-white/50">
                <span>Identity {truncate("1DREGFgysWYxLnRnKQnwrxnJQeSMk2HmGaC6whw2B2p", 6, 6)}</span>
                <span>Tools {truncate("TLREGni9ZEyGC3vnPZtqUh95xQ8oPqJSvNjvB7FGK8S", 6, 6)}</span>
                <span>{items.length} observed</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-white/10 text-white/75 hover:bg-white/5"
                onClick={() => {
                  void feedQuery.refetch();
                  void statusQuery.refetch();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
              <Button
                type="button"
                className="bg-cyan-500 text-black hover:bg-cyan-400"
                disabled={!status?.canCreateWebhook || registerWebhook.isPending}
                onClick={() => registerWebhook.mutate()}
              >
                <Webhook className="mr-2 h-4 w-4" />
                {registerWebhook.isPending ? "Creating" : "Create Helius Webhook"}
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <Metric
            icon={<Database className="h-4 w-4" />}
            label="Feed Store"
            value={status?.feedTableReady ? "ready" : status?.databaseConfigured ? "migration" : "offline"}
            tone="bg-emerald-500/15 text-emerald-200"
          />
          <Metric icon={<Wifi className="h-4 w-4" />} label="Helius RPC" value={status?.rpcConfigured ? "configured" : "missing"} tone="bg-cyan-500/15 text-cyan-200" />
          <Metric icon={<Activity className="h-4 w-4" />} label="Realtime" value={status?.stream.connected ? "connected" : status?.wssConfigured ? "waiting" : "disabled"} tone="bg-fuchsia-500/15 text-fuchsia-200" />
          <Metric icon={<ShieldCheck className="h-4 w-4" />} label="Watch List" value={`${status?.watchAddresses.length ?? 0} addresses`} tone="bg-amber-500/15 text-amber-200" />
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
          <Card className="border-white/10 bg-zinc-900/65">
            <CardHeader className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Bot className="h-4 w-4 text-cyan-300" />
                  Live Agents
                </CardTitle>
                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search agents"
                    className="border-white/10 bg-black/35 pl-9 text-white placeholder:text-white/35"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[680px] overflow-y-auto">
                {feedQuery.isLoading && filtered.length === 0 ? (
                  <div className="flex h-48 items-center justify-center text-sm text-white/45">Loading agent feed...</div>
                ) : filtered.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 text-sm text-white/45">
                    <Zap className="h-5 w-5 text-cyan-300" />
                    No agent events observed yet.
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {filtered.map((item) => {
                      const isSelected = selected?.assetAddress === item.assetAddress;
                      const eventType = metadataText(item, "eventType") ?? "observed";
                      return (
                        <button
                          key={`${item.assetAddress}-${item.signature ?? "event"}`}
                          type="button"
                          onClick={() => setSelectedAddress(item.assetAddress)}
                          className={`grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:items-center ${
                            isSelected ? "bg-cyan-500/10" : ""
                          }`}
                        >
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md border border-white/10 bg-black/45">
                            {item.image ? (
                              <img src={item.image} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <Bot className="h-5 w-5 text-cyan-200" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate font-medium text-white">{item.name || truncate(item.assetAddress, 8, 8)}</span>
                              <Badge variant="outline" className="border-white/10 text-[10px] text-white/55">
                                {eventType}
                              </Badge>
                              {item.active === true && (
                                <Badge className="border-emerald-400/25 bg-emerald-500/10 text-[10px] text-emerald-200">active</Badge>
                              )}
                            </div>
                            <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-white/45">
                              <code>{truncate(item.assetAddress, 7, 7)}</code>
                              <span>{formatTime(item)}</span>
                              {item.slot != null && <span>slot {item.slot.toLocaleString()}</span>}
                            </div>
                          </div>
                          <div className="text-xs text-white/45 sm:text-right">
                            <div>{metadataText(item, "source") ?? "helius"}</div>
                            <div className="mt-1 font-mono">{truncate(item.signature, 5, 5)}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-zinc-900/65">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 text-base text-white">
                <span className="flex min-w-0 items-center gap-2">
                  <Activity className="h-4 w-4 text-fuchsia-300" />
                  <span className="truncate">{selected?.name ?? "Agent Detail"}</span>
                </span>
                {selected?.solscanUrl && (
                  <a href={selected.solscanUrl} target="_blank" rel="noreferrer" className="text-cyan-200 hover:text-cyan-100" title="Open Solscan">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selected ? (
                <div className="space-y-5">
                  <div className="overflow-hidden rounded-md border border-white/10 bg-black/30">
                    {selected.image && <img src={selected.image} alt="" className="h-44 w-full object-cover" />}
                    <div className="p-3">
                      <p className="text-sm leading-6 text-white/70">{selected.description || "Observed Solana agent registry event."}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(serviceNames(selected).length ? serviceNames(selected) : [metadataText(selected, "eventType") ?? "agent"]).slice(0, 6).map((service) => (
                          <Badge key={service} className="border-cyan-400/20 bg-cyan-500/10 text-cyan-100">
                            {service}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-white/10 bg-black/30 px-3">
                    <AddressRow label="Asset" value={selected.assetAddress} />
                    <AddressRow label="Agent Identity" value={selected.agentIdentityPda} />
                    <AddressRow label="Agent Wallet" value={selected.assetSignerPda} />
                    <AddressRow label="Owner" value={selected.ownerWallet} />
                    <AddressRow label="Authority" value={selected.authorityWallet} />
                    <AddressRow label="Token Mint" value={selected.tokenMint} />
                    <AddressRow label="Signature" value={selected.signature} />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-md border border-white/10 bg-black/30 p-2 text-center">
                      <div className="text-[10px] text-white/40">Transfer</div>
                      <div className={selected.lifecycleTransfer ? "text-emerald-200" : "text-white/45"}>{selected.lifecycleTransfer ? "on" : "off"}</div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/30 p-2 text-center">
                      <div className="text-[10px] text-white/40">Update</div>
                      <div className={selected.lifecycleUpdate ? "text-emerald-200" : "text-white/45"}>{selected.lifecycleUpdate ? "on" : "off"}</div>
                    </div>
                    <div className="rounded-md border border-white/10 bg-black/30 p-2 text-center">
                      <div className="text-[10px] text-white/40">Execute</div>
                      <div className={selected.lifecycleExecute ? "text-emerald-200" : "text-white/45"}>{selected.lifecycleExecute ? "on" : "off"}</div>
                    </div>
                  </div>

                  {selected.registrationUri && (
                    <a
                      href={selected.registrationUri}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-black/30 px-3 py-2 text-xs text-cyan-200 hover:bg-white/[0.04]"
                    >
                      <span className="truncate">{selected.registrationUri}</span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center text-sm text-white/45">No agent selected.</div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
