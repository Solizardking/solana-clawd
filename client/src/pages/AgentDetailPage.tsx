import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ArrowLeft, Bot, Cable, ExternalLink, Flame, Rocket, ShieldCheck, Waves } from "lucide-react";

type BrowserAgent = {
  id: string;
  title: string;
  description: string;
  category: string;
  avatar: string;
  tags: string[];
  featured: boolean;
  oneShot: boolean;
  tokenUsage: number | null;
  openingMessage: string;
  openingQuestions: string[];
  persona: string;
  capabilities: string[];
  metaplexSkills: string[];
  vulcanSkills: string[];
  skillPaths: string[];
  localeCoverage: {
    localeCount: number;
    locales: string[];
    defaultTitle: string;
    defaultDescription: string;
  } | null;
  source: {
    homepage: string;
    author: string;
    createdAt: string;
    deploy: Record<string, unknown> | null;
  };
  recommendation?: {
    runtime: string;
    provider: string;
    model: string;
    confidence: string;
    reasons: string[];
    setup: string[];
    recommendedSkills: Array<{ id: string; title: string }>;
    recommendedProjects: Array<{ id: string; title: string; kind: string }>;
    recommendedDocs: Array<{ id: string; title: string }>;
    localePack: { localeCount: number } | null;
    deployPaths: Array<{ label: string; path: string }>;
  };
  runtimeProfile?: {
    runtime: string;
    adapter: string;
    status: string;
    summary: string;
    missing: string[];
    relatedProjects: string[];
    deployPaths: Array<{ label: string; path: string }>;
    dependencies: Array<{ key: string; label: string; configured: boolean }>;
  };
  repoAssets?: {
    root: Array<{ id: string; filename: string; summary: string }>;
    schema: Array<{ id: string; filename: string; summary: string }>;
    scripts: Array<{ id: string; filename: string; summary: string }>;
    public: Array<{ id: string; filename: string; summary: string }>;
    cursor: Array<{ id: string; filename: string; summary: string }>;
  };
  platformContext?: {
    accessPatterns: Array<{ label: string; pattern: string }>;
    endpoints: Array<{ label: string; value: string }>;
    services: Array<{
      name: string;
      endpoint: string;
      version?: string;
      description?: string;
      domains?: string[];
      skills?: string[];
    }>;
    infrastructure: Array<{ key: string; value: string }>;
    supportedTrust: string[];
    discovery: string[];
    deployPaths: Array<{ id?: string; label: string; description?: string }>;
    constitution: {
      coreAxiom: string | null;
      principalHierarchy: string[];
      threeLaws: string[];
    } | null;
  };
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

const categoryMeta: Record<string, { icon: any; className: string }> = {
  trading: { icon: Rocket, className: "border-rose-500/30 text-rose-300 bg-rose-500/10" },
  security: { icon: ShieldCheck, className: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10" },
  defi: { icon: Waves, className: "border-cyan-500/30 text-cyan-300 bg-cyan-500/10" },
};

export default function AgentDetailPage() {
  const [location] = useLocation();
  const agentId = useMemo(() => location.split("/").pop() ?? "", [location]);

  const { data, isLoading } = useQuery<BrowserAgent>({
    queryKey: [`/api/clawd/browser-agents/${agentId}`],
    enabled: Boolean(agentId),
  });

  const { data: adapterStatus } = useQuery<AdapterStatus>({
    queryKey: [`/api/clawd/browser-agents/${agentId}/adapter-status`],
    enabled: Boolean(agentId),
  });

  const { data: runtimeBridge } = useQuery<RuntimeBridge>({
    queryKey: [`/api/clawd/browser-agents/${agentId}/bridge`],
    enabled: Boolean(agentId),
  });

  const { data: operationalData } = useQuery<OperationalData>({
    queryKey: [`/api/clawd/browser-agents/${agentId}/operational-data`],
    enabled: Boolean(agentId),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-white/60">Loading agent…</div>;
  }

  if (!data) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-white/60">Agent not found.</div>;
  }

  const meta = categoryMeta[data.category] ?? {
    icon: Bot,
    className: "border-white/10 text-white/70 bg-white/5",
  };
  const CategoryIcon = meta.icon;
  const operationalSummary = (() => {
    const payload = operationalData?.data ?? {};
    switch (operationalData?.kind) {
      case "perps":
        return [
          payload.marketCount ? `${payload.marketCount} markets tracked` : null,
          payload.activeMarkets ? `${payload.activeMarkets} active markets` : null,
          (payload.traderSnapshot as { positionCount?: number } | null)?.positionCount !== undefined
            ? `${(payload.traderSnapshot as { positionCount: number }).positionCount} live positions`
            : null,
        ].filter(Boolean);
      case "metaplex":
        return [
          payload.walletConfigured ? "wallet signer configured" : "wallet signer missing",
          (payload.treasury as { status?: { configured?: boolean } } | null)?.status?.configured ? "treasury live" : null,
          (payload.warnings as string[] | undefined)?.[0] ?? null,
        ].filter(Boolean);
      case "gateway":
        return [
          payload.routerModelCount ? `${payload.routerModelCount} routed models` : null,
          payload.authConfigured ? "router auth configured" : "router auth missing",
          (payload.recentTokens as unknown[] | undefined)?.length ? `${(payload.recentTokens as unknown[]).length} recent tokens` : null,
        ].filter(Boolean);
      case "oracle":
        return [
          payload.heliusApiConfigured ? "Helius key configured" : "Helius key missing",
          (payload.attestedTemplate as { vaultCustody?: boolean } | null)?.vaultCustody ? "vault custody enabled" : null,
          (payload.warnings as string[] | undefined)?.[0] ?? null,
        ].filter(Boolean);
      default:
        return Object.entries(payload)
          .slice(0, 3)
          .map(([key, value]) =>
            typeof value === "boolean"
              ? `${key}: ${value ? "yes" : "no"}`
              : typeof value === "string" || typeof value === "number"
                ? `${key}: ${value}`
                : null,
          )
          .filter(Boolean);
    }
  })();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/agents">
            <Button variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back To Hub
            </Button>
          </Link>
          <div className="flex gap-2">
            <Link href={`/agents/chat?agent=${encodeURIComponent(data.id)}`}>
              <Button variant="outline" className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10">
                <Bot className="mr-2 h-4 w-4" />
                Chat
              </Button>
            </Link>
            <Link href={`/agents/builder?starter=${encodeURIComponent(data.id)}`}>
              <Button className="bg-cyan-500 text-black hover:bg-cyan-400">Use In Builder</Button>
            </Link>
            <Link href="/metaplex-agents">
              <Button variant="outline" className="border-fuchsia-500/30 text-fuchsia-200 hover:bg-fuchsia-500/10">
                <Flame className="mr-2 h-4 w-4" />
                Mint
              </Button>
            </Link>
          </div>
        </div>

        <Card className="border-white/10 bg-white/[0.03]">
          <CardHeader className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-black/40 text-3xl">
                {data.avatar}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-3xl">{data.title}</CardTitle>
                  {data.featured && <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-200">featured</Badge>}
                  {data.oneShot && <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200">one-shot</Badge>}
                </div>
                <div className="text-sm text-white/45">{data.id}</div>
                <Badge className={meta.className}>
                  <CategoryIcon className="mr-1 h-3 w-3" />
                  {data.category}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-white/72">{data.description}</p>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-cyan-200">Opening Message</h2>
              <p className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/75">
                {data.openingMessage || "No opening message provided."}
              </p>
            </section>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-cyan-200">Source</h2>
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/70 space-y-2">
                <div>Author: {data.source.author || "unknown"}</div>
                <div>Created: {data.source.createdAt || "undated"}</div>
                {data.source.homepage ? (
                  <a href={data.source.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200">
                    Visit source
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>
            </section>
            {data.localeCoverage ? (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-emerald-200">Localization</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/70 space-y-3">
                  <div>{data.localeCoverage.localeCount} locale variants imported from `browser/agents/locales`.</div>
                  <div className="flex flex-wrap gap-2">
                    {data.localeCoverage.locales.slice(0, 10).map((locale) => (
                      <Badge key={locale} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                        {locale}
                      </Badge>
                    ))}
                  </div>
                  {data.localeCoverage.defaultDescription ? (
                    <p className="text-sm text-white/65">{data.localeCoverage.defaultDescription}</p>
                  ) : null}
                </div>
              </section>
            ) : null}
            {data.recommendation ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-amber-200">Cheshire Runtime Recommendation</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4 text-sm text-white/70">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-200">
                      runtime: {data.recommendation.runtime}
                    </Badge>
                    <Badge variant="outline" className="border-white/10 text-white/70">
                      {data.recommendation.provider} / {data.recommendation.model}
                    </Badge>
                    <Badge variant="outline" className="border-white/10 text-white/70">
                      {data.recommendation.confidence} confidence
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {data.recommendation.reasons.map((reason) => (
                      <div key={reason}>{reason}</div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium text-white">Setup</div>
                    {data.recommendation.setup.map((item) => (
                      <div key={item}>{item}</div>
                    ))}
                  </div>
                  {data.recommendation.deployPaths.length > 0 ? (
                    <div className="space-y-2">
                      <div className="font-medium text-white">Imported Deploy Paths</div>
                      {data.recommendation.deployPaths.map((item) => (
                        <div key={item.label} className="text-xs text-white/60">
                          {item.label}: {item.path}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <div className="mb-2 font-medium text-white">Skills</div>
                      <div className="flex flex-wrap gap-2">
                        {data.recommendation.recommendedSkills.map((skill) => (
                          <Badge key={skill.id} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                            {skill.title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 font-medium text-white">Projects</div>
                      <div className="flex flex-wrap gap-2">
                        {data.recommendation.recommendedProjects.map((project) => (
                          <Badge key={project.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                            {project.title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 font-medium text-white">Docs</div>
                      <div className="flex flex-wrap gap-2">
                        {data.recommendation.recommendedDocs.map((doc) => (
                          <Badge key={doc.id} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                            {doc.title}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
            {data.runtimeProfile ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-cyan-200">Imported Runtime Readiness</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4 text-sm text-white/70">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
                      adapter: {data.runtimeProfile.adapter}
                    </Badge>
                    <Badge variant="outline" className="border-white/10 text-white/70">
                      runtime: {data.runtimeProfile.runtime}
                    </Badge>
                    <Badge variant="outline" className={data.runtimeProfile.status === "ready" ? "border-emerald-500/20 text-emerald-200/80" : "border-amber-500/20 text-amber-200/80"}>
                      {data.runtimeProfile.status}
                    </Badge>
                  </div>
                  <div>{data.runtimeProfile.summary}</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="font-medium text-white">Dependencies</div>
                      {data.runtimeProfile.dependencies.map((dependency) => (
                        <div key={dependency.key} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs">
                          <span>{dependency.label}</span>
                          <span className={dependency.configured ? "text-emerald-200" : "text-amber-200"}>
                            {dependency.configured ? "configured" : "missing"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <div className="font-medium text-white">Imported Runtime Surface</div>
                      <div className="flex flex-wrap gap-2">
                        {data.runtimeProfile.relatedProjects.map((project) => (
                          <Badge key={project} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                            {project}
                          </Badge>
                        ))}
                      </div>
                      {data.runtimeProfile.missing.length ? (
                        <div className="text-xs text-amber-200/80">
                          Missing env/runtime pieces: {data.runtimeProfile.missing.join(", ")}
                        </div>
                      ) : (
                        <div className="text-xs text-emerald-200/80">All mapped prerequisites are currently configured.</div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
            {data.platformContext ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-emerald-200">Imported Platform Context</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4 text-sm text-white/70">
                  <div className="grid gap-4 md:grid-cols-2">
                    {data.platformContext.services.length ? (
                      <div className="space-y-2">
                        <div className="font-medium text-white">Services</div>
                        {data.platformContext.services.slice(0, 4).map((service) => (
                          <div key={service.name} className="rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65">
                            <div className="text-white/85">
                              {service.name} {service.version ? `(${service.version})` : ""}
                            </div>
                            <div className="mt-1 break-all">{service.endpoint}</div>
                            {service.description ? <div className="mt-1">{service.description}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {data.platformContext.infrastructure.length ? (
                      <div className="space-y-2">
                        <div className="font-medium text-white">Infrastructure</div>
                        {data.platformContext.infrastructure.map((item) => (
                          <div key={item.key} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/65">
                            <span>{item.key}</span>
                            <span className="max-w-[60%] truncate text-white/80">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {data.platformContext.deployPaths.length ? (
                      <div className="space-y-2">
                        <div className="font-medium text-white">Catalog Deploy Paths</div>
                        {data.platformContext.deployPaths.map((item) => (
                          <div key={item.label} className="rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65">
                            <div className="text-white/85">{item.label}</div>
                            {item.description ? <div className="mt-1">{item.description}</div> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {(data.platformContext.accessPatterns.length || data.platformContext.discovery.length) ? (
                      <div className="space-y-2">
                        <div className="font-medium text-white">Discovery & Access</div>
                        {data.platformContext.accessPatterns.slice(0, 4).map((item) => (
                          <div key={item.label} className="rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/65">
                            {item.label}: {item.pattern}
                          </div>
                        ))}
                        {data.platformContext.discovery.slice(0, 4).map((item) => (
                          <div key={item} className="rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/55">
                            {item}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {data.platformContext.supportedTrust.length ? (
                    <div>
                      <div className="mb-2 font-medium text-white">Supported Trust</div>
                      <div className="flex flex-wrap gap-2">
                        {data.platformContext.supportedTrust.map((item) => (
                          <Badge key={item} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {data.platformContext.constitution ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {data.platformContext.constitution.coreAxiom ? (
                        <div className="rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65">
                          <div className="mb-1 font-medium text-white">Core Axiom</div>
                          {data.platformContext.constitution.coreAxiom}
                        </div>
                      ) : null}
                      {data.platformContext.constitution.threeLaws.length ? (
                        <div className="rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65">
                          <div className="mb-1 font-medium text-white">Constitution</div>
                          <div className="space-y-1">
                            {data.platformContext.constitution.threeLaws.map((law) => (
                              <div key={law}>{law}</div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            {data.repoAssets ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-cyan-200">Repo-Level Browser-Agents Context</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4 text-sm text-white/70">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 font-medium text-white">Root Policy / Meta Files</div>
                      <div className="flex flex-wrap gap-2">
                        {data.repoAssets.root.slice(0, 8).map((item) => (
                          <Badge key={item.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                            {item.filename}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 font-medium text-white">Schema / Scripts / Public</div>
                      <div className="flex flex-wrap gap-2">
                        {data.repoAssets.schema.map((item) => (
                          <Badge key={item.id} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                            {item.filename}
                          </Badge>
                        ))}
                        {data.repoAssets.scripts.map((item) => (
                          <Badge key={item.id} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                            {item.filename}
                          </Badge>
                        ))}
                        {data.repoAssets.public.map((item) => (
                          <Badge key={item.id} variant="outline" className="border-amber-500/20 text-amber-200/80">
                            {item.filename}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  {(data.repoAssets.root[0] || data.repoAssets.schema[0] || data.repoAssets.scripts[0]) ? (
                    <div className="grid gap-3 md:grid-cols-3 text-xs text-white/60">
                      {data.repoAssets.root.slice(0, 1).map((item) => (
                        <div key={item.id} className="rounded border border-white/10 bg-black/30 p-3">
                          <div className="text-white/80">{item.filename}</div>
                          <div className="mt-1 whitespace-pre-line">{item.summary}</div>
                        </div>
                      ))}
                      {data.repoAssets.schema.slice(0, 1).map((item) => (
                        <div key={item.id} className="rounded border border-white/10 bg-black/30 p-3">
                          <div className="text-white/80">{item.filename}</div>
                          <div className="mt-1 whitespace-pre-line">{item.summary}</div>
                        </div>
                      ))}
                      {data.repoAssets.scripts.slice(0, 1).map((item) => (
                        <div key={item.id} className="rounded border border-white/10 bg-black/30 p-3">
                          <div className="text-white/80">{item.filename}</div>
                          <div className="mt-1 whitespace-pre-line">{item.summary}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            {(adapterStatus || runtimeBridge || operationalData) ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-fuchsia-200">Live Imported Runtime</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4 text-sm text-white/70">
                  <div className="flex flex-wrap gap-2">
                    {adapterStatus ? (
                      <Badge variant="outline" className={adapterStatus.ok ? "border-emerald-500/20 text-emerald-200/80" : "border-amber-500/20 text-amber-200/80"}>
                        adapter {adapterStatus.ok ? "ok" : "partial"}
                      </Badge>
                    ) : null}
                    {runtimeBridge ? (
                      <Badge variant="outline" className={runtimeBridge.status === "ready" ? "border-cyan-500/20 text-cyan-200/80" : "border-white/10 text-white/70"}>
                        bridge: {runtimeBridge.status}
                      </Badge>
                    ) : null}
                    {operationalData ? (
                      <Badge variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                        ops: {operationalData.kind}
                      </Badge>
                    ) : null}
                  </div>

                  {adapterStatus ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 font-medium text-white">
                        <Activity className="h-4 w-4 text-fuchsia-300" />
                        {adapterStatus.title}
                      </div>
                      <div className="space-y-1 text-sm text-white/65">
                        {adapterStatus.details.slice(0, 4).map((detail) => (
                          <div key={detail}>{detail}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {operationalData ? (
                    <div className="space-y-2">
                      <div className="font-medium text-white">Operational Summary</div>
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/65 space-y-1">
                        <div>{operationalData.summary}</div>
                        {operationalSummary.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {runtimeBridge?.actions.length ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 font-medium text-white">
                        <Cable className="h-4 w-4 text-cyan-300" />
                        Runtime Bridge Actions
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {runtimeBridge.actions.slice(0, 6).map((action) => (
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
                            <div className="mt-1 text-white/55">{action.details}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            <section className="space-y-3 md:col-span-2">
              <h2 className="text-sm font-semibold text-cyan-200">Capabilities</h2>
              <div className="flex flex-wrap gap-2">
                {data.capabilities.map((capability) => (
                  <Badge key={capability} variant="outline" className="border-white/10 text-white/70">
                    {capability}
                  </Badge>
                ))}
              </div>
            </section>
            {data.metaplexSkills.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-fuchsia-200">Metaplex Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {data.metaplexSkills.map((skill) => (
                    <Badge key={skill} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
            {data.vulcanSkills.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-amber-200">Vulcan Skills</h2>
                <div className="flex flex-wrap gap-2">
                  {data.vulcanSkills.map((skill) => (
                    <Badge key={skill} variant="outline" className="border-amber-500/20 text-amber-200/80">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
            {data.openingQuestions.length > 0 && (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-cyan-200">Opening Questions</h2>
                <div className="grid gap-2">
                  {data.openingQuestions.map((question) => (
                    <div key={question} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/70">
                      {question}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
