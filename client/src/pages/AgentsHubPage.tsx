import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Bot,
  BrainCircuit,
  Flame,
  Layers3,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Wand2,
  Waves,
} from "lucide-react";

type StarterAgent = {
  id: string;
  title: string;
  description: string;
  category: string;
  avatar: string;
  tags: string[];
  featured: boolean;
  oneShot: boolean;
  tokenUsage: number | null;
  capabilities: string[];
  metaplexSkills: string[];
  source: {
    homepage: string;
    author: string;
    createdAt: string;
  };
  recommendation?: {
    runtime: string;
    provider: string;
    model: string;
    confidence: string;
  };
  runtimeProfile?: {
    runtime: string;
    adapter: string;
    status: string;
    summary: string;
    missing: string[];
    relatedProjects: string[];
  };
  platformContext?: {
    services: Array<{ name: string; endpoint: string; version?: string }>;
    supportedTrust: string[];
    deployPaths: Array<{ label: string; description?: string }>;
    discovery: string[];
  };
};

type StarterCatalogResponse = {
  importedAt: string;
  count: number;
  sourceRoot: string;
  manifest?: {
    accessPatterns?: Record<string, string>;
    agents?: Record<string, { count?: number; description?: string }>;
  };
  clawd?: {
    services?: Array<{ name: string; endpoint: string; description?: string }>;
  };
  catalogMeta?: {
    stats?: {
      totalAgents?: number;
      byCategory?: Record<string, number>;
    };
  };
  docs?: Array<{ id: string; title: string; summary: string; file: string }>;
  locales?: Array<{ id: string; localeCount: number; defaultTitle: string; defaultDescription: string }>;
  wellKnown?: Array<{ id: string; scope: string; filename: string; summary: string }>;
  skills?: Array<{ id: string; title: string; summary: string; file: string }>;
  projects?: Array<{ id: string; title: string; kind: string; path: string; summary: string }>;
  repoAssets?: {
    schema?: Array<{ id: string; filename: string; summary: string }>;
    scripts?: Array<{ id: string; filename: string; summary: string }>;
    public?: Array<{ id: string; filename: string; summary: string }>;
    cursor?: Array<{ id: string; filename: string; summary: string }>;
    root?: Array<{ id: string; filename: string; summary: string }>;
  };
  agents: StarterAgent[];
};

const categoryMeta: Record<string, { icon: any; className: string }> = {
  trading: { icon: Rocket, className: "border-rose-500/30 text-rose-300 bg-rose-500/10" },
  security: { icon: ShieldCheck, className: "border-emerald-500/30 text-emerald-300 bg-emerald-500/10" },
  defi: { icon: Waves, className: "border-cyan-500/30 text-cyan-300 bg-cyan-500/10" },
  payments: { icon: Layers3, className: "border-amber-500/30 text-amber-300 bg-amber-500/10" },
  research: { icon: BrainCircuit, className: "border-purple-500/30 text-purple-300 bg-purple-500/10" },
};

export default function AgentsHubPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const { data, isLoading } = useQuery<StarterCatalogResponse>({
    queryKey: ["/api/clawd/browser-agents"],
  });

  const agents = data?.agents ?? [];

  const categories = useMemo(() => {
    return ["all", ...Array.from(new Set(agents.map((agent) => agent.category))).sort()];
  }, [agents]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (category !== "all" && agent.category !== category) return false;
      if (!term) return true;
      return [
        agent.title,
        agent.description,
        agent.id,
        ...agent.tags,
        ...agent.capabilities,
        ...agent.metaplexSkills,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [agents, category, query]);

  const featured = filtered.filter((agent) => agent.featured);

  return (
    <div className="min-h-screen bg-black bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.12),transparent_32%),radial-gradient(circle_at_right,rgba(244,114,182,0.08),transparent_28%)] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
        <section className="rounded-3xl border border-cyan-500/20 bg-black/50 p-6 backdrop-blur-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="border-cyan-400/30 bg-cyan-500/10 text-cyan-200">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Imported browser-agents catalog
                </Badge>
                <Badge variant="outline" className="border-white/15 text-white/70">
                  {data?.catalogMeta?.stats?.totalAgents ?? data?.count ?? 0} imported agents
                </Badge>
              </div>
              <h1 className="text-4xl font-black tracking-tight text-transparent bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text">
                Cheshire Agent Hub
              </h1>
              <p className="max-w-2xl text-sm text-white/70">
                Solana-native agents imported from the browser-agents repo and adapted for Cheshire deployment,
                on-chain registry minting, and persistent agent creation. Use the hub for discovery and the builder for
                bootstrap deployment.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href="/agents/builder">
                <Button className="bg-cyan-500 text-black hover:bg-cyan-400">
                  <Wand2 className="mr-2 h-4 w-4" />
                  Open Builder
                </Button>
              </Link>
              <Link href="/agents/runtime">
                <Button variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                  <Layers3 className="mr-2 h-4 w-4" />
                  Runtime Matrix
                </Button>
              </Link>
              <Link href="/metaplex-agents">
                <Button variant="outline" className="border-fuchsia-500/30 text-fuchsia-200 hover:bg-fuchsia-500/10">
                  <Flame className="mr-2 h-4 w-4" />
                  Mint Registry Agent
                </Button>
              </Link>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, tag, capability, skill, or id"
                className="border-white/10 bg-white/5 pl-9 text-white placeholder:text-white/35"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setCategory(value)}
                  className={
                    value === category
                      ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-100"
                      : "border-white/10 text-white/70 hover:bg-white/5"
                  }
                >
                  {value}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {((data?.projects?.length ?? 0) > 0 || (data?.skills?.length ?? 0) > 0) && (
          <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-lg text-cyan-200">Imported Project Surfaces</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(data?.projects ?? []).map((project) => (
                  <div key={project.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-white">{project.title}</div>
                      <Badge variant="outline" className="border-white/10 text-white/55">
                        {project.kind}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-white/40">{project.path}</div>
                    <p className="mt-2 text-sm text-white/65 whitespace-pre-line">
                      {project.summary.split("\n").slice(0, 4).join("\n")}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-lg text-fuchsia-200">Skill Registry</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(data?.skills ?? []).slice(0, 8).map((skill) => (
                  <div key={skill.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="font-medium text-white">{skill.title}</div>
                    <div className="mt-1 text-xs text-white/40">{skill.id}</div>
                    <p className="mt-2 text-sm text-white/65">{skill.summary || "No summary provided."}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        )}

        {((data?.locales?.length ?? 0) > 0 || (data?.docs?.length ?? 0) > 0 || (data?.wellKnown?.length ?? 0) > 0) && (
          <section className="grid gap-4 xl:grid-cols-3">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-lg text-emerald-200">Locale Coverage</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(data?.locales ?? []).slice(0, 6).map((locale) => (
                  <div key={locale.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="font-medium text-white">{locale.defaultTitle}</div>
                    <div className="mt-1 text-xs text-white/40">{locale.id}</div>
                    <p className="mt-2 text-sm text-white/65">{locale.defaultDescription || "Localized delivery pack."}</p>
                    <div className="mt-2 text-xs text-emerald-200">{locale.localeCount} locales available</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-lg text-amber-200">Deployment Docs</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {(data?.docs ?? []).slice(0, 6).map((doc) => (
                  <div key={doc.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="font-medium text-white">{doc.title}</div>
                    <div className="mt-1 text-xs text-white/40">{doc.file}</div>
                    <p className="mt-2 text-sm text-white/65 whitespace-pre-line">{doc.summary}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-lg text-cyan-200">Discovery Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-sm font-medium text-white">ACP / plugin registry</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(data?.wellKnown ?? []).map((record) => (
                      <Badge key={record.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                        {record.scope}:{record.filename}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-sm font-medium text-white">Manifest access patterns</div>
                  <div className="mt-2 space-y-1 text-xs text-white/60">
                    {Object.entries(data?.manifest?.accessPatterns ?? {}).slice(0, 5).map(([key, value]) => (
                      <div key={key}>
                        {key}: {value}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <div className="text-sm font-medium text-white">Clawd services</div>
                  <div className="mt-2 space-y-1 text-xs text-white/60">
                    {(data?.clawd?.services ?? []).slice(0, 4).map((service) => (
                      <div key={service.name}>
                        {service.name}: {service.endpoint}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {featured.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200">
              <Rocket className="h-4 w-4" />
              Featured Imports
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {featured.map((agent) => (
                <Card key={agent.id} className="border-cyan-500/20 bg-cyan-500/5">
                  <CardHeader className="space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/20 bg-black/40 text-2xl">
                          {agent.avatar}
                        </div>
                        <div>
                          <CardTitle className="text-xl">{agent.title}</CardTitle>
                          <div className="mt-1 text-xs text-white/45">{agent.id}</div>
                        </div>
                      </div>
                      <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-200">featured</Badge>
                    </div>
                    <p className="text-sm text-white/70">{agent.description}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {agent.runtimeProfile ? (
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/65 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                            {agent.runtimeProfile.adapter}
                          </Badge>
                          <Badge variant="outline" className={agent.runtimeProfile.status === "ready" ? "border-emerald-500/20 text-emerald-200/80" : "border-amber-500/20 text-amber-200/80"}>
                            {agent.runtimeProfile.status}
                          </Badge>
                          {agent.recommendation ? (
                            <Badge variant="outline" className="border-white/10 text-white/60">
                              {agent.recommendation.provider} / {agent.recommendation.model}
                            </Badge>
                          ) : null}
                        </div>
                        <div>{agent.runtimeProfile.summary}</div>
                        {agent.runtimeProfile.missing?.length ? (
                          <div className="text-amber-200/80">Missing: {agent.runtimeProfile.missing.slice(0, 3).join(", ")}</div>
                        ) : (
                          <div className="text-emerald-200/80">Runtime prerequisites configured.</div>
                        )}
                      </div>
                    ) : null}
                    {agent.platformContext ? (
                      <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/62 space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {agent.platformContext.services.slice(0, 2).map((service) => (
                            <Badge key={service.name} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                              {service.name}
                            </Badge>
                          ))}
                          {agent.platformContext.supportedTrust.slice(0, 2).map((trust) => (
                            <Badge key={trust} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                              {trust}
                            </Badge>
                          ))}
                        </div>
                        {agent.platformContext.deployPaths.length ? (
                          <div>
                            Deploy: {agent.platformContext.deployPaths.slice(0, 2).map((item) => item.label).join(" · ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {(agent.tags ?? []).slice(0, 8).map((tag) => (
                        <Badge key={tag} variant="outline" className="border-white/10 text-white/65">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/agents/chat?agent=${encodeURIComponent(agent.id)}`}>
                        <Button size="sm" variant="outline" className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10">
                          Chat
                        </Button>
                      </Link>
                      <Link href={`/agents/${encodeURIComponent(agent.id)}`}>
                        <Button size="sm" variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                          Details
                        </Button>
                      </Link>
                      <Link href={`/agents/builder?starter=${encodeURIComponent(agent.id)}`}>
                        <Button size="sm" className="bg-cyan-500 text-black hover:bg-cyan-400">
                          Use In Builder
                        </Button>
                      </Link>
                      {agent.source.homepage ? (
                        <a href={agent.source.homepage} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                            Source Repo
                          </Button>
                        </a>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {data?.repoAssets ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-lg text-cyan-200">Imported Repo Assets</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                {[
                  ["schema", data.repoAssets.schema ?? []],
                  ["scripts", data.repoAssets.scripts ?? []],
                  ["public", data.repoAssets.public ?? []],
                  [".cursor", data.repoAssets.cursor ?? []],
                  ["root", data.repoAssets.root ?? []],
                ].map(([scope, items]) => (
                  <div key={scope as string} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="mb-2 font-medium text-white">{scope as string}</div>
                    <div className="flex flex-wrap gap-2">
                      {(items as Array<{ id: string; filename: string }>).slice(0, 6).map((item) => (
                        <Badge key={item.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                          {item.filename}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/[0.03]">
              <CardHeader>
                <CardTitle className="text-lg text-fuchsia-200">Repo-Level Context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-white/65">
                {(data.repoAssets.root ?? []).slice(0, 4).map((item) => (
                  <div key={item.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="font-medium text-white">{item.filename}</div>
                    <div className="mt-1 whitespace-pre-line">{item.summary}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white/80">
              <Bot className="h-4 w-4 text-fuchsia-300" />
              Imported Catalog
            </div>
            <div className="text-xs text-white/40">
              {isLoading ? "Loading…" : `${filtered.length} shown`}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((agent) => {
              const meta = categoryMeta[agent.category] ?? {
                icon: Bot,
                className: "border-white/10 text-white/70 bg-white/5",
              };
              const CategoryIcon = meta.icon;

              return (
                <Card key={agent.id} className="border-white/10 bg-white/[0.03]">
                  <CardContent className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-xl">
                          {agent.avatar}
                        </div>
                        <div>
                          <div className="font-semibold leading-tight">{agent.title}</div>
                          <div className="mt-1 text-[11px] text-white/40">{agent.id}</div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {agent.oneShot && (
                          <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200">one-shot</Badge>
                        )}
                        {agent.featured && (
                          <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-200">featured</Badge>
                        )}
                      </div>
                    </div>

                    <p className="min-h-[66px] text-sm text-white/68">{agent.description}</p>

                    <div className="flex flex-wrap gap-2">
                      <Badge className={meta.className}>
                        <CategoryIcon className="mr-1 h-3 w-3" />
                        {agent.category}
                      </Badge>
                      {agent.metaplexSkills.slice(0, 2).map((skill) => (
                        <Badge key={skill} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                          {skill}
                        </Badge>
                      ))}
                    </div>

                    <div className="space-y-2">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Capabilities</div>
                      <div className="flex flex-wrap gap-1.5">
                        {agent.capabilities.slice(0, 4).map((capability) => (
                          <Badge key={capability} variant="outline" className="border-white/10 text-white/65">
                            {capability}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {agent.runtimeProfile?.relatedProjects?.length ? (
                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Imported Runtime Surface</div>
                        <div className="flex flex-wrap gap-1.5">
                          {agent.runtimeProfile.relatedProjects.slice(0, 3).map((project) => (
                            <Badge key={project} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                              {project}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {agent.platformContext ? (
                      <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Platform Signals</div>
                        <div className="flex flex-wrap gap-1.5">
                          {agent.platformContext.services.slice(0, 2).map((service) => (
                            <Badge key={service.name} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                              {service.name}
                            </Badge>
                          ))}
                          {agent.platformContext.supportedTrust.slice(0, 2).map((item) => (
                            <Badge key={item} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                              {item}
                            </Badge>
                          ))}
                          {agent.platformContext.deployPaths.slice(0, 1).map((item) => (
                            <Badge key={item.label} variant="outline" className="border-amber-500/20 text-amber-200/80">
                              {item.label}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex items-center justify-between text-xs text-white/40">
                      <span>{agent.source.author || "unknown author"}</span>
                      <span>{agent.source.createdAt || "undated"}</span>
                    </div>

                    <div className="flex gap-2">
                      <Link href={`/agents/chat?agent=${encodeURIComponent(agent.id)}`}>
                        <Button size="sm" variant="outline" className="border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10">
                          Chat
                        </Button>
                      </Link>
                      <Link href={`/agents/${encodeURIComponent(agent.id)}`}>
                        <Button size="sm" variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                          Details
                        </Button>
                      </Link>
                      <Link href={`/agents/builder?starter=${encodeURIComponent(agent.id)}`}>
                        <Button size="sm" className="flex-1 bg-fuchsia-500 text-black hover:bg-fuchsia-400">
                          Use Starter
                        </Button>
                      </Link>
                      <Link href="/metaplex-agents">
                        <Button size="sm" variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                          Mint
                        </Button>
                      </Link>
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
