import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ArrowLeft, Bot, Cable, ExternalLink, Sparkles } from "lucide-react";

type RuntimeBridge = {
  adapter: string;
  status: string;
  summary: string;
  actions: Array<{
    label: string;
    method: "GET" | "POST";
    path: string;
    kind: string;
    ready: boolean;
    details: string;
  }>;
};

type AdapterStatus = {
  adapter: string;
  ok: boolean;
  title: string;
  details: string[];
};

type OperationalData = {
  adapter: string;
  kind: string;
  ok: boolean;
  summary: string;
  data: Record<string, unknown>;
};

type DeployedAgentResponse = {
  agent: {
    id: number;
    slug: string;
    name: string;
    persona: string;
    greeting: string | null;
    provider: string;
    model: string;
    avatarUrl: string | null;
    sourceAgentId?: string | null;
    launchRuntime?: string | null;
  };
  runtimeProfile?: {
    adapter: string;
    runtime: string;
    status: string;
    summary: string;
    missing: string[];
    relatedProjects: string[];
    dependencies: Array<{ key: string; label: string; configured: boolean }>;
  };
  runtimeBridge?: RuntimeBridge;
  importedContext?: {
    sourceAgent: {
      id: string;
      title: string;
      category: string;
      description: string;
      capabilities: string[];
      openingMessage: string;
      openingQuestions: string[];
      skillPaths: string[];
      metaplexSkills: string[];
      vulcanSkills: string[];
    } | null;
    docs: Array<{ id: string; title: string; summary: string }>;
    skills: Array<{ id: string; title: string; summary: string }>;
    projects: Array<{ id: string; title: string; kind: string; summary: string }>;
    localePack: {
      id: string;
      localeCount: number;
      locales: string[];
      defaultTitle: string;
      defaultDescription: string;
    } | null;
    character: {
      id: string;
      name: string;
      adjectives: string[];
      topics: string[];
      bio: string[];
    } | null;
    template: {
      id: string;
      name: string;
      category: string | null;
      avatar: string | null;
      openingQuestions: string[];
      commandHints: string[];
      toolNames: string[];
      capabilityKeys: string[];
    } | null;
    launchDefaults: {
      systemRole: string | null;
      openingMessage: string | null;
      openingQuestions: string[];
      commandHints: string[];
      toolNames: string[];
      capabilityKeys: string[];
      traitHints: string[];
      topicHints: string[];
    } | null;
    discovery: Array<{ id: string; scope: string; filename: string; summary: string }>;
    repoAssets: {
      root: Array<{ id: string; filename: string; summary: string }>;
      schema: Array<{ id: string; filename: string; summary: string }>;
      scripts: Array<{ id: string; filename: string; summary: string }>;
      public: Array<{ id: string; filename: string; summary: string }>;
      cursor: Array<{ id: string; filename: string; summary: string }>;
    };
    platformContext: {
      accessPatterns: Array<{ label: string; pattern: string }>;
      endpoints: Array<{ label: string; value: string }>;
      services: Array<{
        name: string;
        endpoint: string;
        version?: string;
        description?: string;
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
    recommendation?: {
      deployPaths?: Array<{ label: string; path: string }>;
    } | null;
  } | null;
};

function renderValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export default function DeployedAgentDetailPage() {
  const [location] = useLocation();
  const slug = useMemo(() => location.split("/").pop() ?? "", [location]);

  const { data, isLoading } = useQuery<DeployedAgentResponse>({
    queryKey: ["/api/user-agents/by-slug", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const res = await fetch(`/api/user-agents/by-slug/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("Agent not found");
      return res.json();
    },
  });

  const { data: adapterStatus } = useQuery<{ adapterStatus: AdapterStatus }>({
    queryKey: ["/api/user-agents/by-slug", slug, "adapter-status"],
    enabled: Boolean(slug),
    queryFn: async () => {
      const res = await fetch(`/api/user-agents/by-slug/${encodeURIComponent(slug)}/adapter-status`);
      if (!res.ok) throw new Error("adapter status unavailable");
      return res.json();
    },
  });

  const { data: operationalData } = useQuery<{ operationalData: OperationalData }>({
    queryKey: ["/api/user-agents/by-slug", slug, "operational-data"],
    enabled: Boolean(slug),
    queryFn: async () => {
      const res = await fetch(`/api/user-agents/by-slug/${encodeURIComponent(slug)}/operational-data`);
      if (!res.ok) throw new Error("operational data unavailable");
      return res.json();
    },
  });

  if (isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-white/60">Loading deployed agent…</div>;
  }
  if (!data?.agent) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-white/60">Deployed agent not found.</div>;
  }

  const imported = data.importedContext;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/agents/builder">
            <Button variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back To Builder
            </Button>
          </Link>
          {data.agent.sourceAgentId ? (
            <Link href={`/agents/${encodeURIComponent(data.agent.sourceAgentId)}`}>
              <Button className="bg-cyan-500 text-black hover:bg-cyan-400">
                <Sparkles className="mr-2 h-4 w-4" />
                View Imported Source
              </Button>
            </Link>
          ) : null}
        </div>

        <Card className="border-white/10 bg-white/[0.03]">
          <CardHeader className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-black/40 text-3xl">
                {data.agent.avatarUrl ? <img src={data.agent.avatarUrl} alt={data.agent.name} className="h-full w-full rounded-3xl object-cover" /> : <Bot className="h-8 w-8 text-cyan-200" />}
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-3xl">{data.agent.name}</CardTitle>
                  <Badge variant="outline" className="border-white/10 text-white/70">/{data.agent.slug}</Badge>
                  {data.runtimeProfile ? (
                    <Badge variant="outline" className={data.runtimeProfile.status === "ready" ? "border-emerald-500/20 text-emerald-200/80" : "border-amber-500/20 text-amber-200/80"}>
                      {data.runtimeProfile.status}
                    </Badge>
                  ) : null}
                </div>
                <div className="text-sm text-white/45">
                  {data.agent.provider} / {data.agent.model}
                </div>
              </div>
            </div>
            <p className="text-sm text-white/72 whitespace-pre-line">{data.agent.persona}</p>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-cyan-200">Runtime Profile</h2>
              {data.runtimeProfile ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/70 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200">{data.runtimeProfile.adapter}</Badge>
                    <Badge variant="outline" className="border-white/10 text-white/70">{data.runtimeProfile.runtime}</Badge>
                  </div>
                  <div>{data.runtimeProfile.summary}</div>
                  {data.runtimeProfile.missing.length ? (
                    <div className="text-xs text-amber-200/80">Missing: {data.runtimeProfile.missing.join(", ")}</div>
                  ) : (
                    <div className="text-xs text-emerald-200/80">All mapped prerequisites are currently configured.</div>
                  )}
                </div>
              ) : null}
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-fuchsia-200">Live Runtime</h2>
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/70 space-y-3">
                {adapterStatus?.adapterStatus ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 font-medium text-white">
                      <Activity className="h-4 w-4 text-fuchsia-300" />
                      {adapterStatus.adapterStatus.title}
                    </div>
                    {adapterStatus.adapterStatus.details.slice(0, 4).map((detail) => (
                      <div key={detail} className="text-white/65">{detail}</div>
                    ))}
                  </div>
                ) : null}
                {data.runtimeBridge?.actions?.length ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 font-medium text-white">
                      <Cable className="h-4 w-4 text-cyan-300" />
                      Runtime Bridge
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {data.runtimeBridge.actions.slice(0, 6).map((action) => (
                        action.method === "GET" ? (
                          <a
                            key={`${action.method}:${action.path}`}
                            href={action.path}
                            className={`rounded border px-2 py-1 text-xs ${action.ready ? "border-emerald-500/20 text-emerald-200/80" : "border-amber-500/20 text-amber-200/80"}`}
                          >
                            {action.label}
                          </a>
                        ) : (
                          <span key={`${action.method}:${action.path}`} className="rounded border border-white/10 px-2 py-1 text-xs text-white/55">
                            {action.label}
                          </span>
                        )
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {imported ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-cyan-200">Imported Browser-Agent Context</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4 text-sm text-white/70">
                  {imported.sourceAgent ? (
                    <div className="space-y-2">
                      <div className="font-medium text-white">Source Persona</div>
                      <div>{imported.sourceAgent.title} ({imported.sourceAgent.category})</div>
                      <div className="text-white/60">{imported.sourceAgent.description}</div>
                    </div>
                  ) : null}

                  {imported.sourceAgent?.openingQuestions?.length ? (
                    <div className="space-y-2">
                      <div className="font-medium text-white">Opening Questions</div>
                      <div className="grid gap-2">
                        {imported.sourceAgent.openingQuestions.slice(0, 5).map((question) => (
                          <div key={question} className="rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/65">
                            {question}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    {imported.projects?.length ? (
                      <div>
                        <div className="mb-2 font-medium text-white">Projects</div>
                        <div className="flex flex-wrap gap-2">
                          {imported.projects.map((project) => (
                            <Badge key={project.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                              {project.title}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {imported.skills?.length ? (
                      <div>
                        <div className="mb-2 font-medium text-white">Skills</div>
                        <div className="flex flex-wrap gap-2">
                          {imported.skills.map((skill) => (
                            <Badge key={skill.id} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                              {skill.title}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {imported.docs?.length ? (
                      <div>
                        <div className="mb-2 font-medium text-white">Docs</div>
                        <div className="space-y-2">
                          {imported.docs.slice(0, 4).map((doc) => (
                            <div key={doc.id} className="rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/65">
                              <div className="text-white/80">{doc.title}</div>
                              <div>{doc.summary}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {imported.localePack ? (
                      <div>
                        <div className="mb-2 font-medium text-white">Locale Pack</div>
                        <div className="text-xs text-white/65">
                          {imported.localePack.localeCount} locales: {imported.localePack.locales.slice(0, 8).join(", ")}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {imported.discovery?.length ? (
                    <div className="space-y-2">
                      <div className="font-medium text-white">Discovery</div>
                      <div className="space-y-1 text-xs text-white/60">
                        {imported.discovery.slice(0, 4).map((item) => (
                          <div key={item.id}>
                            {item.scope}: {item.filename} - {item.summary}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {(imported.character || imported.template || imported.launchDefaults) ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {imported.character ? (
                        <div className="rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65 space-y-2">
                          <div className="font-medium text-white">Character Pack</div>
                          <div>{imported.character.name}</div>
                          <div className="flex flex-wrap gap-2">
                            {imported.character.adjectives.slice(0, 6).map((item) => (
                              <Badge key={item} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {imported.template ? (
                        <div className="rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65 space-y-2">
                          <div className="font-medium text-white">Template Pack</div>
                          <div>{imported.template.name}</div>
                          <div className="flex flex-wrap gap-2">
                            {imported.template.commandHints.slice(0, 4).map((item) => (
                              <Badge key={item} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                                {item}
                              </Badge>
                            ))}
                            {imported.template.toolNames.slice(0, 4).map((item) => (
                              <Badge key={item} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {imported.launchDefaults ? (
                        <div className="rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65 space-y-2 md:col-span-2">
                          <div className="font-medium text-white">Persisted Launch Defaults</div>
                          {imported.launchDefaults.systemRole ? (
                            <div className="text-white/55">
                              {imported.launchDefaults.systemRole.slice(0, 240)}
                              {imported.launchDefaults.systemRole.length > 240 ? "…" : ""}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {imported.launchDefaults.capabilityKeys.slice(0, 4).map((item) => (
                              <Badge key={item} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                                {item}
                              </Badge>
                            ))}
                            {imported.launchDefaults.traitHints.slice(0, 4).map((item) => (
                              <Badge key={item} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                                {item}
                              </Badge>
                            ))}
                            {imported.launchDefaults.topicHints.slice(0, 4).map((item) => (
                              <Badge key={item} variant="outline" className="border-amber-500/20 text-amber-200/80">
                                {item}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
            {imported?.platformContext ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-emerald-200">Imported Platform Context</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4 text-sm text-white/70">
                  <div className="grid gap-4 md:grid-cols-2">
                    {imported.platformContext.services.length ? (
                      <div className="space-y-2">
                        <div className="font-medium text-white">Services</div>
                        {imported.platformContext.services.slice(0, 4).map((service) => (
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
                    {imported.platformContext.infrastructure.length ? (
                      <div className="space-y-2">
                        <div className="font-medium text-white">Infrastructure</div>
                        {imported.platformContext.infrastructure.map((item) => (
                          <div key={item.key} className="flex items-center justify-between gap-3 rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/65">
                            <span>{item.key}</span>
                            <span className="max-w-[60%] truncate text-white/80">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {(imported.platformContext.accessPatterns.length || imported.platformContext.discovery.length || imported.platformContext.deployPaths.length) ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <div className="font-medium text-white">Access & Discovery</div>
                        {imported.platformContext.accessPatterns.slice(0, 4).map((item) => (
                          <div key={item.label} className="rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/65">
                            {item.label}: {item.pattern}
                          </div>
                        ))}
                        {imported.platformContext.discovery.slice(0, 4).map((item) => (
                          <div key={item} className="rounded border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/55">
                            {item}
                          </div>
                        ))}
                      </div>
                      <div className="space-y-2">
                        <div className="font-medium text-white">Deploy Paths</div>
                        {imported.platformContext.deployPaths.map((item) => (
                          <div key={item.label} className="rounded border border-white/10 bg-black/30 p-3 text-xs text-white/65">
                            <div className="text-white/85">{item.label}</div>
                            {item.description ? <div className="mt-1">{item.description}</div> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {imported.platformContext.supportedTrust.length ? (
                    <div>
                      <div className="mb-2 font-medium text-white">Supported Trust</div>
                      <div className="flex flex-wrap gap-2">
                        {imported.platformContext.supportedTrust.map((item) => (
                          <Badge key={item} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {imported?.repoAssets ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-fuchsia-200">Repo-Level Imported Context</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-4 text-sm text-white/70">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <div className="mb-2 font-medium text-white">Policy / Meta Files</div>
                      <div className="flex flex-wrap gap-2">
                        {imported.repoAssets.root.slice(0, 8).map((item) => (
                          <Badge key={item.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                            {item.filename}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 font-medium text-white">Execution Assets</div>
                      <div className="flex flex-wrap gap-2">
                        {imported.repoAssets.schema.map((item) => (
                          <Badge key={item.id} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                            {item.filename}
                          </Badge>
                        ))}
                        {imported.repoAssets.scripts.map((item) => (
                          <Badge key={item.id} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                            {item.filename}
                          </Badge>
                        ))}
                        {imported.repoAssets.public.map((item) => (
                          <Badge key={item.id} variant="outline" className="border-amber-500/20 text-amber-200/80">
                            {item.filename}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3 text-xs text-white/60">
                    {imported.repoAssets.root.slice(0, 1).map((item) => (
                      <div key={item.id} className="rounded border border-white/10 bg-black/30 p-3">
                        <div className="text-white/80">{item.filename}</div>
                        <div className="mt-1 whitespace-pre-line">{item.summary}</div>
                      </div>
                    ))}
                    {imported.repoAssets.schema.slice(0, 1).map((item) => (
                      <div key={item.id} className="rounded border border-white/10 bg-black/30 p-3">
                        <div className="text-white/80">{item.filename}</div>
                        <div className="mt-1 whitespace-pre-line">{item.summary}</div>
                      </div>
                    ))}
                    {imported.repoAssets.scripts.slice(0, 1).map((item) => (
                      <div key={item.id} className="rounded border border-white/10 bg-black/30 p-3">
                        <div className="text-white/80">{item.filename}</div>
                        <div className="mt-1 whitespace-pre-line">{item.summary}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {operationalData?.operationalData ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-amber-200">Operational Data</h2>
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/70 space-y-2">
                  <div>{operationalData.operationalData.summary}</div>
                  {Object.entries(operationalData.operationalData.data).slice(0, 12).map(([key, value]) => (
                    <div key={key} className="text-xs text-white/60">
                      {key}: {renderValue(value)}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {data.agent.sourceAgentId ? (
              <section className="space-y-3 md:col-span-2">
                <h2 className="text-sm font-semibold text-cyan-200">Linked Surfaces</h2>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/agents/${encodeURIComponent(data.agent.sourceAgentId)}`}>
                    <Button size="sm" variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                      Imported Agent Detail
                    </Button>
                  </Link>
                  <Link href={`/agents/runtime`}>
                    <Button size="sm" variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                      Runtime Matrix
                    </Button>
                  </Link>
                  <a href={`/api/user-agents/by-slug/${encodeURIComponent(data.agent.slug)}/bridge`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </a>
                </div>
              </section>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
