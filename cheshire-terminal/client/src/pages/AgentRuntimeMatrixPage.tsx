import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  ArrowLeft,
  Bot,
  Cable,
  Cpu,
  ExternalLink,
  Gauge,
  Link2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

type RuntimeDependency = {
  key: string;
  label: string;
  configured: boolean;
};

type RuntimeProfile = {
  runtime: string;
  adapter: string;
  status: string;
  summary: string;
  missing: string[];
  relatedProjects: string[];
  deployPaths: Array<{ label: string; path: string }>;
  dependencies: RuntimeDependency[];
};

type Recommendation = {
  provider: string;
  model: string;
  confidence: string;
};

type AdapterStatus = {
  adapter: string;
  ok: boolean;
  title: string;
  details: string[];
  metrics: Record<string, unknown>;
};

type BridgeAction = {
  label: string;
  method: "GET" | "POST";
  path: string;
  kind: "health" | "launch" | "read" | "write" | "ui";
  ready: boolean;
  details: string;
};

type RuntimeBridge = {
  adapter: string;
  status: "ready" | "partial";
  summary: string;
  actions: BridgeAction[];
};

type OperationalData = {
  adapter: string;
  kind: "perps" | "metaplex" | "pumpfun" | "gateway" | "oracle" | "telegram" | "generic";
  ok: boolean;
  summary: string;
  data: Record<string, unknown>;
};

type LiveRuntime = {
  adapterStatus: AdapterStatus;
  bridge: RuntimeBridge;
  operationalData: OperationalData;
};

type BrowserAgentLive = {
  id: string;
  title: string;
  runtimeProfile: RuntimeProfile;
  recommendation?: Recommendation;
  platformContext?: {
    services: Array<{ name: string; endpoint: string; version?: string }>;
    supportedTrust: string[];
    deployPaths: Array<{ label: string; description?: string }>;
  };
  live: LiveRuntime | null;
};

type BrowserAgentsLiveResponse = {
  importedAt: string;
  count: number;
  agents: BrowserAgentLive[];
};

function summarizeOperationalData(operationalData: OperationalData | undefined | null) {
  if (!operationalData) return [];
  const data = operationalData.data ?? {};

  switch (operationalData.kind) {
    case "perps":
      return [
        data.marketCount ? `${data.marketCount} markets tracked` : null,
        data.activeMarkets ? `${data.activeMarkets} active markets` : null,
        (data.traderSnapshot as { positionCount?: number } | null)?.positionCount !== undefined
          ? `${(data.traderSnapshot as { positionCount: number }).positionCount} live positions`
          : null,
      ].filter(Boolean) as string[];
    case "metaplex":
      return [
        data.walletConfigured ? "wallet signer configured" : "wallet signer missing",
        (data.staking as { stats?: { totalStaked?: number } } | null)?.stats?.totalStaked !== undefined
          ? `${(data.staking as { stats: { totalStaked: number } }).stats.totalStaked} staked`
          : null,
        (data.treasury as { status?: { configured?: boolean } } | null)?.status?.configured ? "treasury live" : null,
      ].filter(Boolean) as string[];
    case "gateway":
      return [
        data.routerModelCount ? `${data.routerModelCount} routed models` : null,
        (data.recentTokens as Array<unknown> | undefined)?.length ? `${(data.recentTokens as Array<unknown>).length} recent tokens` : null,
        data.authConfigured ? "router auth configured" : "router auth missing",
      ].filter(Boolean) as string[];
    case "oracle":
      return [
        data.heliusApiConfigured ? "Helius key configured" : "Helius key missing",
        (data.attestedTemplate as { vaultCustody?: boolean } | null)?.vaultCustody ? "vault custody enabled" : null,
        (data.heliusSpecialist as { recommendation?: { model?: string } } | null)?.recommendation?.model
          ? `model ${(data.heliusSpecialist as { recommendation: { model: string } }).recommendation.model}`
          : null,
      ].filter(Boolean) as string[];
    case "generic":
    case "telegram":
    case "pumpfun":
    default:
      return Object.entries(data)
        .slice(0, 3)
        .map(([key, value]) =>
          typeof value === "boolean"
            ? `${key}: ${value ? "yes" : "no"}`
            : typeof value === "string" || typeof value === "number"
              ? `${key}: ${value}`
              : null,
        )
        .filter(Boolean) as string[];
  }
}

export default function AgentRuntimeMatrixPage() {
  const { data, isLoading } = useQuery<BrowserAgentsLiveResponse>({
    queryKey: ["/api/clawd/browser-agents/runtime-live"],
  });

  const agents = data?.agents ?? [];
  const summary = useMemo(() => {
    const ready = agents.filter((agent) => agent.runtimeProfile?.status === "ready").length;
    const partial = agents.filter((agent) => agent.runtimeProfile?.status === "partial").length;
    const liveOk = agents.filter((agent) => agent.live?.adapterStatus.ok).length;
    const byAdapter = agents.reduce<Record<string, number>>((acc, agent) => {
      const key = agent.runtimeProfile?.adapter ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return { ready, partial, liveOk, byAdapter };
  }, [agents]);

  return (
    <div className="min-h-screen bg-black bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.10),transparent_30%)] text-white">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/agents">
            <Button variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back To Hub
            </Button>
          </Link>
          <Link href="/agents/builder">
            <Button className="bg-cyan-500 text-black hover:bg-cyan-400">
              <Sparkles className="mr-2 h-4 w-4" />
              Open Builder
            </Button>
          </Link>
        </div>

        <section className="rounded-3xl border border-cyan-500/20 bg-black/50 p-6 backdrop-blur-sm">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
                <Gauge className="mr-1 h-3 w-3" />
                Imported Runtime Matrix
              </Badge>
              <Badge variant="outline" className="border-white/15 text-white/70">
                {data?.count ?? 0} imported agents
              </Badge>
              <Badge variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                {summary.ready} ready
              </Badge>
              <Badge variant="outline" className="border-amber-500/20 text-amber-200/80">
                {summary.partial} partial
              </Badge>
              <Badge variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                {summary.liveOk} live adapters ok
              </Badge>
            </div>
            <h1 className="bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text text-4xl font-black tracking-tight text-transparent">
              Cheshire Runtime Readiness
            </h1>
            <p className="max-w-3xl text-sm text-white/70">
              Live operator view for imported browser-agents: static dependency readiness, adapter health, bridgeable actions,
              and operational data pulled through Cheshire runtime surfaces.
            </p>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Card className="border-white/10 bg-white/[0.03] md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg text-cyan-200">Adapter Coverage</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {Object.entries(summary.byAdapter).map(([adapter, count]) => (
                <Badge key={adapter} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                  {adapter}: {count}
                </Badge>
              ))}
            </CardContent>
          </Card>
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-lg text-emerald-200">Ready Profiles</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-black text-emerald-200">{summary.ready}</CardContent>
          </Card>
          <Card className="border-white/10 bg-white/[0.03]">
            <CardHeader>
              <CardTitle className="text-lg text-fuchsia-200">Live Adapter OK</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-black text-fuchsia-200">{summary.liveOk}</CardContent>
          </Card>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
            <Cpu className="h-4 w-4 text-fuchsia-300" />
            Imported Agent Runtime Matrix
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {isLoading ? (
              <div className="text-sm text-white/60">Loading runtime matrix…</div>
            ) : agents.map((agent) => {
              const live = agent.live;
              const operationalSummary = summarizeOperationalData(live?.operationalData);
              const bridgeActions = live?.bridge.actions ?? [];
              const liveDetails = live?.adapterStatus.details ?? [];

              return (
                <Card key={agent.id} className="border-white/10 bg-white/[0.03]">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-2xl">
                          <Bot className="h-6 w-6 text-cyan-200" />
                        </div>
                        <div>
                          <div className="font-semibold leading-tight">{agent.title}</div>
                          <div className="mt-1 text-[11px] text-white/40">{agent.id}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge
                          variant="outline"
                          className={
                            agent.runtimeProfile?.status === "ready"
                              ? "border-emerald-500/20 text-emerald-200/80"
                              : "border-amber-500/20 text-amber-200/80"
                          }
                        >
                          {agent.runtimeProfile?.status ?? "unknown"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            live?.adapterStatus.ok
                              ? "border-fuchsia-500/20 text-fuchsia-200/80"
                              : "border-white/10 text-white/60"
                          }
                        >
                          {live?.adapterStatus.ok ? "live ok" : "live partial"}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
                        {agent.runtimeProfile?.adapter ?? "unknown"}
                      </Badge>
                      <Badge variant="outline" className="border-white/10 text-white/70">
                        {agent.runtimeProfile?.runtime ?? "unknown runtime"}
                      </Badge>
                      {agent.recommendation ? (
                        <Badge variant="outline" className="border-white/10 text-white/60">
                          {agent.recommendation.provider} / {agent.recommendation.model}
                        </Badge>
                      ) : null}
                      {agent.platformContext?.services.slice(0, 1).map((service) => (
                        <Badge key={service.name} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                          {service.name}
                        </Badge>
                      ))}
                    </div>

                    <p className="text-sm text-white/68">{live?.operationalData.summary ?? agent.runtimeProfile?.summary}</p>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Dependencies</div>
                        {(agent.runtimeProfile?.dependencies ?? []).slice(0, 5).map((dependency) => (
                          <div key={dependency.key} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs">
                            <span>{dependency.label}</span>
                            <span className={dependency.configured ? "text-emerald-200" : "text-amber-200"}>
                              {dependency.configured ? "configured" : "missing"}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Imported Surface</div>
                        <div className="flex flex-wrap gap-1.5">
                          {(agent.runtimeProfile?.relatedProjects ?? []).slice(0, 4).map((project) => (
                            <Badge key={project} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                              {project}
                            </Badge>
                          ))}
                          {(agent.platformContext?.supportedTrust ?? []).slice(0, 2).map((item) => (
                            <Badge key={item} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                              {item}
                            </Badge>
                          ))}
                        </div>
                        {agent.runtimeProfile?.missing?.length ? (
                          <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/80">
                            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>{agent.runtimeProfile.missing.join(", ")}</span>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200/80">
                            All mapped prerequisites configured.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
                          <Activity className="h-3.5 w-3.5" />
                          Live Adapter
                        </div>
                        <div className="text-sm font-medium text-white/85">
                          {live?.adapterStatus.title ?? "Runtime adapter"}
                        </div>
                        <div className="space-y-1 text-xs text-white/60">
                          {liveDetails.slice(0, 3).map((detail) => (
                            <div key={detail}>{detail}</div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
                          <Cable className="h-3.5 w-3.5" />
                          Live Operations
                        </div>
                        <div className="space-y-1 text-xs text-white/60">
                          {operationalSummary.length ? (
                            operationalSummary.map((item) => <div key={item}>{item}</div>)
                          ) : (
                            <div>No live operational summary exposed yet.</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {bridgeActions.length ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
                          <Link2 className="h-3.5 w-3.5" />
                          Runtime Bridge
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {bridgeActions.slice(0, 4).map((action) => (
                            <div key={`${action.method}:${action.path}`} className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-white/80">{action.label}</span>
                                <span className={action.ready ? "text-emerald-200" : "text-amber-200"}>
                                  {action.ready ? "ready" : "partial"}
                                </span>
                              </div>
                              <div className="mt-1 text-white/45">
                                {action.method} {action.path}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {agent.runtimeProfile?.deployPaths?.length ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
                          <Link2 className="h-3.5 w-3.5" />
                          Deploy Paths
                        </div>
                        <div className="space-y-1 text-xs text-white/55">
                          {agent.runtimeProfile.deployPaths.slice(0, 4).map((item) => (
                            <div key={item.label}>
                              {item.label}: {item.path}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex gap-2">
                      <Link href={`/agents/${encodeURIComponent(agent.id)}`}>
                        <Button size="sm" variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                          Details
                        </Button>
                      </Link>
                      <Link href={`/agents/builder?starter=${encodeURIComponent(agent.id)}`}>
                        <Button size="sm" className="bg-fuchsia-500 text-black hover:bg-fuchsia-400">
                          Use Starter
                        </Button>
                      </Link>
                      <a href={`/api/clawd/browser-agents/${encodeURIComponent(agent.id)}/bridge`} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
