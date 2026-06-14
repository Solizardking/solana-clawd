import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Bot, Lock, Sparkles, Trash2, Wallet, Wand2, Rocket, ShieldCheck, Waves } from "lucide-react";
import { MintAsNftButton } from "@/components/MintAsNftButton";
import type { UserAgent } from "@shared/schema";

const formSchema = z.object({
  slug: z.string().min(2).max(32).regex(/^[a-z0-9_]+$/, "lowercase / numbers / underscore only"),
  name: z.string().min(2).max(64),
  persona: z.string().min(20, "At least 20 characters").max(4000),
  greeting: z.string().max(500).optional(),
  provider: z.enum(["xai", "deepseek", "kimi", "openai"]),
  model: z.string().min(2).max(64),
  avatarUrl: z.string().url().optional().or(z.literal("")),
});
type FormValues = z.infer<typeof formSchema>;

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
  openingMessage?: string;
  openingQuestions?: string[];
  persona?: string;
  skillPaths?: string[];
  vulcanSkills?: string[];
  localeCoverage?: {
    localeCount: number;
    locales: string[];
    defaultTitle: string;
    defaultDescription: string;
  } | null;
  source: {
    homepage: string;
    author: string;
    createdAt: string;
    deploy?: Record<string, unknown> | null;
  };
  recommendation?: {
    runtime: string;
    provider: "xai" | "deepseek" | "kimi" | "openai";
    model: string;
    confidence: string;
    reasons: string[];
    setup: string[];
    recommendedSkills: Array<{ id: string; title: string }>;
    recommendedProjects: Array<{ id: string; title: string; kind: string }>;
    recommendedDocs: Array<{ id: string; title: string }>;
    deployPaths: Array<{ label: string; path: string }>;
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
    services: Array<{ name: string; endpoint: string; version?: string; description?: string }>;
    supportedTrust: string[];
    discovery: string[];
    deployPaths: Array<{ label: string; description?: string }>;
    infrastructure: Array<{ key: string; value: string }>;
  };
};

type BrowserCharacter = {
  id: string;
  name: string;
  bio: string[];
  lore?: string[];
  adjectives: string[];
  topics: string[];
  style?: Record<string, unknown>;
};

type BrowserTemplateSummary = {
  id: string;
  filename: string;
  description: string;
};

type BrowserTemplateDetail = {
  id: string;
  filename: string;
  description: string;
  raw: Record<string, any>;
};

type CreateUserAgentResponse = {
  agent: UserAgent & {
    runtimeProfile?: {
      adapter: string;
      status: string;
      missing: string[];
      sourceTitle: string | null;
    };
    importedContext?: {
      sourceAgent: {
        id: string;
        title: string;
        category: string;
        capabilities: string[];
        openingQuestions: string[];
        metaplexSkills: string[];
        vulcanSkills: string[];
      } | null;
      docs: Array<{ id: string; title: string; summary: string }>;
      skills: Array<{ id: string; title: string; summary: string }>;
      projects: Array<{ id: string; title: string; kind: string; summary: string }>;
      localePack: {
        localeCount: number;
        locales: string[];
      } | null;
    } | null;
  };
  error?: string;
  recommendation?: StarterAgent["recommendation"];
};

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
  metrics: Record<string, unknown>;
};

type OperationalData = {
  adapter: string;
  kind: string;
  ok: boolean;
  summary: string;
  data: Record<string, unknown>;
};

function renderOperationalValue(value: unknown): string {
  if (value == null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "object" && item !== null ? JSON.stringify(item) : String(item)))
      .join(" | ");
  }
  return JSON.stringify(value);
}

function OperationalDataCard({ operationalData }: { operationalData: OperationalData }) {
  const entries = Object.entries(operationalData.data);

  return (
    <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-xs text-white/60">
      <div className="text-white/75">{operationalData.summary}</div>
      <div className="mt-2 space-y-2">
        {entries.map(([key, value]) => {
          if (value == null || value === "") return null;

          if (Array.isArray(value)) {
            return (
              <div key={key}>
                <div className="text-white/80">{key}</div>
                <div className="mt-1 space-y-1 text-white/55">
                  {value.length === 0 ? <div>none</div> : value.slice(0, 5).map((item, index) => (
                    <div key={`${key}:${index}`}>{renderOperationalValue(item)}</div>
                  ))}
                </div>
              </div>
            );
          }

          if (typeof value === "object") {
            return (
              <div key={key}>
                <div className="text-white/80">{key}</div>
                <div className="mt-1 space-y-1 text-white/55">
                  {Object.entries(value as Record<string, unknown>).map(([nestedKey, nestedValue]) => (
                    <div key={`${key}:${nestedKey}`}>
                      {nestedKey}: {renderOperationalValue(nestedValue)}
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div key={key}>
              {key}: {renderOperationalValue(value)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STARTER_ICONS: Record<string, any> = {
  trading: Rocket,
  security: ShieldCheck,
  defi: Waves,
};

const PROVIDER_MODELS: Record<string, { label: string; value: string }[]> = {
  deepseek: [
    { label: "DeepSeek V4 Pro (thinking)", value: "deepseek-v4-pro" },
    { label: "DeepSeek V4 Flash", value: "deepseek-v4-flash" },
  ],
  kimi: [
    { label: "Kimi K2.6 (thinking)", value: "kimi-k2.6" },
  ],
  xai: [
    { label: "Grok 4", value: "grok-4" },
    { label: "Grok 3", value: "grok-3" },
    { label: "Grok 3 Mini", value: "grok-3-mini" },
  ],
  openai: [
    { label: "GPT-4o mini", value: "gpt-4o-mini" },
    { label: "GPT-4o", value: "gpt-4o" },
  ],
};

type AgentBuilderHandoff = {
  source: string;
  prompt: string;
  name?: string;
  slug?: string;
  provider?: FormValues["provider"];
  model?: string;
  greeting?: string;
  starter?: string;
};

function slugFromRemoteValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32) || "remote_agent";
}

function coerceProvider(value: string | null): FormValues["provider"] {
  if (value === "xai" || value === "deepseek" || value === "kimi" || value === "openai") return value;
  return "deepseek";
}

function readAgentBuilderHandoff(): AgentBuilderHandoff | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const prompt = params.get("prompt") || params.get("task") || params.get("role") || "";
  const starter = params.get("starter") || "";
  if (!prompt && !starter) return null;
  const provider = coerceProvider(params.get("provider"));
  return {
    source: params.get("source") || "remote",
    prompt,
    name: params.get("name") || undefined,
    slug: params.get("slug") || undefined,
    provider,
    model: params.get("model") || PROVIDER_MODELS[provider]?.[0]?.value || "deepseek-v4-pro",
    greeting: params.get("greeting") || undefined,
    starter: starter || undefined,
  };
}

export default function AgentBuilderPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const { toast } = useToast();
  const [handoff] = useState<AgentBuilderHandoff | null>(() => readAgentBuilderHandoff());
  const handoffAppliedRef = useRef(false);
  const [provider, setProvider] = useState<"xai" | "deepseek" | "kimi" | "openai">("deepseek");
  const [activeStarterRecommendation, setActiveStarterRecommendation] = useState<StarterAgent["recommendation"] | null>(null);
  const [selectedStarterId, setSelectedStarterId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplateDetail, setSelectedTemplateDetail] = useState<BrowserTemplateDetail | null>(null);

  const { data: gate } = useQuery<{ balance: number; required: number; canDeploy: boolean }>({
    queryKey: ["/api/user-agents/gate", wallet],
    enabled: !!wallet,
  });

  const { data: mine } = useQuery<{ agents: Array<UserAgent & { runtimeProfile?: any; importedContext?: any }> }>({
    queryKey: ["/api/user-agents/by-owner", wallet],
    enabled: !!wallet,
  });

  const { data: starterCatalog } = useQuery<{ importedAt: string; count: number; agents: StarterAgent[] }>({
    queryKey: ["/api/clawd/starter-agents"],
  });

  const { data: browserCharacters } = useQuery<{ importedAt: string; count: number; characters: BrowserCharacter[] }>({
    queryKey: ["/api/clawd/browser-characters"],
  });

  const { data: browserTemplates } = useQuery<{ importedAt: string; count: number; templates: BrowserTemplateSummary[] }>({
    queryKey: ["/api/clawd/browser-templates"],
  });

  const { data: activeStarterDetail } = useQuery<StarterAgent>({
    queryKey: ["/api/clawd/starter-agents", selectedStarterId],
    enabled: Boolean(selectedStarterId),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      slug: "",
      name: "",
      persona: "",
      greeting: "",
      provider: "deepseek",
      model: "deepseek-v4-pro",
      avatarUrl: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const matchedStarter = starterAgents.find((agent) => {
        const suggestedSlug = agent.id.replace(/^solana-/, "").replace(/-/g, "_").slice(0, 32);
        return suggestedSlug === values.slug || agent.title === values.name;
      });
      const selectedCharacter = characters.find((character) => character.id === selectedCharacterId) ?? null;
      const rawTemplate = selectedTemplateDetail?.raw ?? {};
      const templateAgent = (rawTemplate.agent ?? {}) as Record<string, any>;
      const templateConfig = (templateAgent.config ?? rawTemplate.config ?? {}) as Record<string, any>;
      const templateCommands = Array.isArray(rawTemplate.commands)
        ? rawTemplate.commands
        : Array.isArray(templateAgent.commands)
          ? templateAgent.commands
          : [];
      const templateTools = (rawTemplate.tools ?? templateAgent.tools ?? {}) as Record<string, unknown>;
      const templateCapabilities = (rawTemplate.capabilities ?? {}) as Record<string, unknown>;
      const launchDefaults = selectedTemplateDetail || selectedCharacter
        ? {
            systemRole: typeof templateConfig.systemRole === "string" ? templateConfig.systemRole : null,
            openingMessage: typeof templateConfig.openingMessage === "string" ? templateConfig.openingMessage : null,
            openingQuestions: Array.isArray(templateConfig.openingQuestions)
              ? templateConfig.openingQuestions.filter((value): value is string => typeof value === "string")
              : [],
            commandHints: templateCommands
              .map((command) => (command && typeof command === "object" && typeof command.name === "string" ? String(command.name) : null))
              .filter((value): value is string => Boolean(value)),
            toolNames: Object.entries(templateTools)
              .filter(([, enabled]) => enabled === true)
              .map(([key]) => key),
            capabilityKeys: Object.keys(templateCapabilities),
            traitHints: selectedCharacter?.adjectives ?? [],
            topicHints: selectedCharacter?.topics ?? [],
          }
        : null;
      const importedSpec =
        activeStarterRecommendation || launchDefaults || selectedCharacter || selectedTemplateDetail
          ? {
              provider: activeStarterRecommendation?.provider,
              model: activeStarterRecommendation?.model,
              runtime: activeStarterRecommendation?.runtime,
              docs: activeStarterRecommendation?.recommendedDocs.map((doc) => doc.id) ?? [],
              projects: activeStarterRecommendation?.recommendedProjects.map((project) => project.id) ?? [],
              skills: activeStarterRecommendation?.recommendedSkills.map((skill) => skill.id) ?? [],
              openingQuestions: activeStarterDetail?.openingQuestions ?? [],
              localeCoverage: activeStarterDetail?.localeCoverage ?? null,
              capabilities: activeStarterDetail?.capabilities ?? [],
              skillPaths: activeStarterDetail?.skillPaths ?? [],
              metaplexSkills: activeStarterDetail?.metaplexSkills ?? [],
              vulcanSkills: activeStarterDetail?.vulcanSkills ?? [],
              character: selectedCharacter
                ? {
                    id: selectedCharacter.id,
                    name: selectedCharacter.name,
                    bio: selectedCharacter.bio,
                    adjectives: selectedCharacter.adjectives,
                    topics: selectedCharacter.topics,
                  }
                : undefined,
              template: selectedTemplateDetail
                ? {
                    id: selectedTemplateDetail.id,
                    name:
                      String(
                        selectedTemplateDetail.raw.templateName
                        ?? selectedTemplateDetail.raw.displayName
                        ?? selectedTemplateDetail.raw.name
                        ?? selectedTemplateDetail.id,
                      ),
                    category:
                      typeof selectedTemplateDetail.raw.templateCategory === "string"
                        ? selectedTemplateDetail.raw.templateCategory
                        : null,
                    avatar:
                      typeof selectedTemplateDetail.raw.templateAvatar === "string"
                        ? selectedTemplateDetail.raw.templateAvatar
                        : null,
                    openingQuestions: Array.isArray(templateConfig.openingQuestions)
                      ? templateConfig.openingQuestions.filter((value): value is string => typeof value === "string")
                      : [],
                    raw: selectedTemplateDetail.raw,
                  }
                : undefined,
              launchDefaults: launchDefaults ?? undefined,
            }
          : undefined;
      return apiRequest<CreateUserAgentResponse>("POST", "/api/user-agents", {
        ownerWallet: wallet,
        ...values,
        avatarUrl: values.avatarUrl || undefined,
        sourceAgentId: matchedStarter?.id ?? undefined,
        launchRuntime: activeStarterRecommendation?.runtime,
        importedSpec,
      });
    },
    onSuccess: (data) => {
      if (data?.error) {
        toast({ title: "Couldn't deploy", description: data.error, variant: "destructive" });
        return;
      }
      toast({
        title: `Agent /${data.agent.slug} deployed!`,
        description: data.recommendation
          ? `Stored with ${data.recommendation.runtime} launch guidance from browser-agents.`
          : `Find ${data.agent.name} on Telegram via the agent host bot.`,
      });
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["/api/user-agents/by-owner", wallet] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-agents"] });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't deploy", description: e?.message ?? "Error", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (slug: string) => {
      return apiRequest<{ ok?: boolean }>("DELETE", `/api/user-agents/${slug}`, {
        ownerWallet: wallet,
      });
    },
    onSuccess: () => {
      toast({ title: "Agent archived" });
      queryClient.invalidateQueries({ queryKey: ["/api/user-agents/by-owner", wallet] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-agents"] });
    },
  });

  const onSubmit = (values: FormValues) => createMutation.mutate(values);

  const starterAgents = useMemo(() => starterCatalog?.agents ?? [], [starterCatalog]);
  const characters = useMemo(() => browserCharacters?.characters ?? [], [browserCharacters]);
  const templates = useMemo(() => browserTemplates?.templates ?? [], [browserTemplates]);

  const applyStarter = (agent: StarterAgent) => {
    const provider = agent.recommendation?.provider || (agent.category === "trading" ? "deepseek" : agent.category === "security" ? "openai" : "xai");
    const model = agent.recommendation?.model || PROVIDER_MODELS[provider]?.[0]?.value || "deepseek-v4-pro";
    const slug = agent.id.replace(/^solana-/, "").replace(/-/g, "_").slice(0, 32);

    setProvider(provider as "xai" | "deepseek" | "kimi" | "openai");
    setActiveStarterRecommendation(agent.recommendation ?? null);
    setSelectedStarterId(agent.id);
    form.reset({
      slug,
      name: agent.title.slice(0, 64),
      persona: agent.description
        ? `${agent.description}\n\n${agent.category.toUpperCase()} focus.\n\nImported starter from ${agent.source.author || "browser/agents"}.\n\nAdapt this persona with your own execution boundaries, wallet policies, and operating constraints.`
        : agent.title,
      greeting: `${agent.avatar} ${agent.title} online.`,
      provider,
      model,
      avatarUrl: "",
    });

  };

  const applyCharacter = (character: BrowserCharacter) => {
    setSelectedCharacterId(character.id);
    const currentName = form.getValues("name") || character.name;
    const currentGreeting = form.getValues("greeting") || `${character.name} online.`;
    const persona = [
      `${character.name} persona profile.`,
      "",
      ...(character.bio ?? []),
      "",
      `Adjectives: ${(character.adjectives ?? []).join(", ")}`,
      `Topics: ${(character.topics ?? []).join(", ")}`,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);

    form.setValue("name", currentName.slice(0, 64));
    form.setValue("greeting", currentGreeting.slice(0, 500));
    form.setValue("persona", persona);
    if (!form.getValues("slug")) {
      form.setValue("slug", character.id.replace(/-/g, "_").slice(0, 32));
    }
  };

  const applyBrowserTemplate = async (templateId: string) => {
    const res = await fetch(`/api/clawd/browser-templates/${templateId}`);
    const template = await res.json() as BrowserTemplateDetail;
    const raw = template?.raw;
    if (!raw) return;
    setSelectedTemplateId(templateId);
    setSelectedTemplateDetail(template);

    const displayName =
      raw.templateName ||
      raw.displayName ||
      raw.name ||
      templateId;
    const description =
      raw.templateDescription ||
      raw.description ||
      raw.meta?.description ||
      "";
    const systemRole =
      raw.agent?.config?.systemRole ||
      raw.config?.systemRole ||
      "";
    const greeting =
      raw.agent?.config?.openingMessage ||
      raw.persona?.greeting ||
      "";

    form.setValue("name", String(displayName).slice(0, 64));
    form.setValue("persona", `${description}\n\n${systemRole}`.trim().slice(0, 4000));
    if (greeting) form.setValue("greeting", String(greeting).slice(0, 500));
    if (!form.getValues("slug")) {
      form.setValue("slug", templateId.replace(/-/g, "_").slice(0, 32));
    }
  };

  useEffect(() => {
    if (!handoff || handoff.starter || handoffAppliedRef.current) return;
    handoffAppliedRef.current = true;

    const handoffProvider = handoff.provider ?? "deepseek";
    const handoffModel = handoff.model || PROVIDER_MODELS[handoffProvider]?.[0]?.value || "deepseek-v4-pro";
    const name = (handoff.name || "Remote CLAWD Agent").slice(0, 64);
    const prompt = handoff.prompt || "Create a Telegram-controlled Cheshire agent.";
    const persona = [
      prompt,
      "",
      `Remote handoff source: ${handoff.source}.`,
      "Operate as a Cheshire Terminal agent that can prepare terminal, browser, trading, and Telegram handoffs.",
      "Do not claim execution. For trades, transfers, posts, or destructive browser actions, prepare the route and require wallet or user confirmation in the app.",
    ].join("\n").slice(0, 4000);

    setProvider(handoffProvider);
    setActiveStarterRecommendation(null);
    setSelectedStarterId(null);
    form.reset({
      slug: slugFromRemoteValue(handoff.slug || name || prompt),
      name,
      persona,
      greeting: (handoff.greeting || `${name} online. Send a Telegram or terminal task to prepare.`).slice(0, 500),
      provider: handoffProvider,
      model: handoffModel,
      avatarUrl: "",
    });
  }, [form, handoff]);

  useEffect(() => {
    if (typeof window === "undefined" || starterAgents.length === 0) return;
    const starterId = new URLSearchParams(window.location.search).get("starter");
    if (!starterId) return;
    const match = starterAgents.find((agent) => agent.id === starterId);
    if (match) applyStarter(match);
  }, [starterAgents]);

  useEffect(() => {
    if (!activeStarterDetail) return;
    if (activeStarterDetail.persona) {
      form.setValue("persona", String(activeStarterDetail.persona).slice(0, 4000));
    }
    if (activeStarterDetail.openingMessage) {
      form.setValue("greeting", String(activeStarterDetail.openingMessage).slice(0, 500));
    }
    if (activeStarterDetail.recommendation) {
      setActiveStarterRecommendation(activeStarterDetail.recommendation);
      form.setValue("provider", activeStarterDetail.recommendation.provider);
      form.setValue("model", activeStarterDetail.recommendation.model);
    }
  }, [activeStarterDetail, form]);

  return (
    <div className="container mx-auto max-w-3xl py-12 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="h-8 w-8 text-purple-400" />
        <div>
          <h1 className="text-3xl font-bold">Deep CLAWD Agent Builder</h1>
          <p className="text-sm text-purple-300/80">
            Deploy a persistent Cheshire agent to Telegram, powered by DeepSeek V4 thinking mode. Token-gated to ≥ 100,000 $CLAWD.
          </p>
        </div>
      </div>

      {handoff && (
        <Card className="border-cyan-500/25 bg-cyan-500/10">
          <CardContent className="pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-cyan-100">Remote agent handoff</div>
                <p className="mt-1 text-xs leading-5 text-cyan-50/70">
                  Source: {handoff.source}. This form was prefilled from a mobile or Telegram remote link and still requires wallet-gated deployment.
                </p>
                {handoff.prompt && (
                  <p className="mt-2 rounded border border-cyan-400/20 bg-black/30 px-2 py-1.5 text-xs text-cyan-50/80">
                    {handoff.prompt}
                  </p>
                )}
              </div>
              <Link href="/remote">
                <Button size="sm" variant="outline" className="border-cyan-400/30 text-cyan-100 hover:bg-cyan-500/10">
                  Back to Remote
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {starterAgents.length > 0 && (
        <Card className="border-cyan-500/30 bg-black/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-cyan-300" />
              Imported Starter Agents
            </CardTitle>
            <p className="text-sm text-cyan-100/70">
              Curated from the browser-agents catalog and adapted as bootstrap personas for Cheshire deployments.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {starterAgents.map((agent) => {
              const Icon = STARTER_ICONS[agent.category] ?? Bot;
              return (
                <div
                  key={agent.id}
                  className="rounded-md border border-cyan-500/20 bg-cyan-500/5 p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{agent.avatar}</span>
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {agent.title}
                            {agent.featured && <Badge variant="outline" className="border-amber-500/40 text-amber-300">featured</Badge>}
                            {agent.oneShot && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">one-shot</Badge>}
                          </div>
                          <div className="text-xs text-cyan-300/70">{agent.id}</div>
                        </div>
                      </div>
                      <p className="text-sm text-cyan-50/80">{agent.description}</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="secondary" className="bg-cyan-950/60 text-cyan-100">
                          <Icon className="h-3 w-3 mr-1" />
                          {agent.category}
                        </Badge>
                        {agent.capabilities.slice(0, 4).map((cap) => (
                          <Badge key={cap} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                            {cap}
                          </Badge>
                        ))}
                        {agent.platformContext?.services.slice(0, 2).map((service) => (
                          <Badge key={service.name} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                            {service.name}
                          </Badge>
                        ))}
                        {agent.platformContext?.supportedTrust.slice(0, 2).map((trust) => (
                          <Badge key={trust} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                            {trust}
                          </Badge>
                        ))}
                      </div>
                      {(agent.runtimeProfile || agent.platformContext?.deployPaths.length) ? (
                        <div className="rounded border border-white/10 bg-black/30 p-2 text-xs text-white/60 space-y-1">
                          {agent.runtimeProfile ? (
                            <div>
                              {agent.runtimeProfile.adapter} · {agent.runtimeProfile.status}
                              {agent.runtimeProfile.missing.length ? ` · missing ${agent.runtimeProfile.missing.slice(0, 2).join(", ")}` : " · ready"}
                            </div>
                          ) : null}
                          {agent.platformContext?.deployPaths.length ? (
                            <div>
                              Deploy paths: {agent.platformContext.deployPaths.slice(0, 2).map((item) => item.label).join(" · ")}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-cyan-500/30 text-cyan-200"
                      onClick={() => applyStarter(agent)}
                    >
                      Use Starter
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {activeStarterRecommendation && (
        <Card className="border-amber-500/30 bg-black/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-300" />
              Cheshire Deployment Guidance
            </CardTitle>
            <p className="text-sm text-amber-100/70">
              Derived from imported browser-agents metadata, docs, locales, and subprojects.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-200">
                runtime: {activeStarterRecommendation.runtime}
              </Badge>
              <Badge variant="outline" className="border-white/10 text-white/70">
                {activeStarterRecommendation.provider} / {activeStarterRecommendation.model}
              </Badge>
              <Badge variant="outline" className="border-white/10 text-white/70">
                {activeStarterRecommendation.confidence} confidence
              </Badge>
            </div>
            <div className="space-y-2 text-sm text-white/75">
              {activeStarterRecommendation.reasons.map((reason) => (
                <div key={reason}>{reason}</div>
              ))}
            </div>
            <div className="space-y-2 text-sm text-white/75">
              <div className="font-medium text-white">Setup</div>
              {activeStarterRecommendation.setup.map((step) => (
                <div key={step}>{step}</div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <div className="mb-2 font-medium text-white">Skills</div>
                <div className="flex flex-wrap gap-2">
                  {activeStarterRecommendation.recommendedSkills.map((skill) => (
                    <Badge key={skill.id} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                      {skill.title}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 font-medium text-white">Projects</div>
                <div className="flex flex-wrap gap-2">
                  {activeStarterRecommendation.recommendedProjects.map((project) => (
                    <Badge key={project.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                      {project.title}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 font-medium text-white">Docs</div>
                <div className="flex flex-wrap gap-2">
                  {activeStarterRecommendation.recommendedDocs.map((doc) => (
                    <Badge key={doc.id} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                      {doc.title}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            {activeStarterRecommendation.deployPaths.length > 0 && (
              <div className="space-y-2 text-xs text-white/60">
                <div className="font-medium text-white">Imported deploy paths</div>
                {activeStarterRecommendation.deployPaths.map((item) => (
                  <div key={item.label}>
                    {item.label}: {item.path}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
      </Card>
    )}

      {activeStarterDetail && (
        <Card className="border-cyan-500/30 bg-black/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-cyan-300" />
              Imported Starter Context
            </CardTitle>
            <p className="text-sm text-cyan-100/70">
              Full imported browser-agents context for the selected starter.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeStarterDetail.localeCoverage ? (
              <div className="space-y-2">
                <div className="font-medium text-white">Locale Coverage</div>
                <div className="text-sm text-white/75">
                  {activeStarterDetail.localeCoverage.localeCount} locale variants. Default: {activeStarterDetail.localeCoverage.defaultTitle || activeStarterDetail.title}
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeStarterDetail.localeCoverage.locales.slice(0, 10).map((locale) => (
                    <Badge key={locale} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                      {locale}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {activeStarterDetail.openingQuestions?.length ? (
              <div className="space-y-2">
                <div className="font-medium text-white">Imported Opening Questions</div>
                <div className="grid gap-2">
                  {activeStarterDetail.openingQuestions.slice(0, 5).map((question) => (
                    <div key={question} className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/65">
                      {question}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              {activeStarterDetail.recommendation?.recommendedSkills?.length ? (
                <div className="space-y-2">
                  <div className="font-medium text-white">Recommended Skills</div>
                  <div className="flex flex-wrap gap-2">
                    {activeStarterDetail.recommendation.recommendedSkills.map((skill) => (
                      <Badge key={skill.id} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                        {skill.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeStarterDetail.recommendation?.recommendedDocs?.length ? (
                <div className="space-y-2">
                  <div className="font-medium text-white">Recommended Docs</div>
                  <div className="flex flex-wrap gap-2">
                    {activeStarterDetail.recommendation.recommendedDocs.map((doc) => (
                      <Badge key={doc.id} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                        {doc.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeStarterDetail.recommendation?.recommendedProjects?.length ? (
                <div className="space-y-2 md:col-span-2">
                  <div className="font-medium text-white">Imported Projects</div>
                  <div className="flex flex-wrap gap-2">
                    {activeStarterDetail.recommendation.recommendedProjects.map((project) => (
                      <Badge key={project.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                        {project.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            {(activeStarterDetail.skillPaths?.length || activeStarterDetail.metaplexSkills?.length || activeStarterDetail.vulcanSkills?.length) ? (
              <div className="space-y-2">
                <div className="font-medium text-white">Imported Execution Surface</div>
                <div className="flex flex-wrap gap-2">
                  {(activeStarterDetail.skillPaths ?? []).slice(0, 6).map((path) => (
                    <Badge key={path} variant="outline" className="border-white/10 text-white/70">
                      {path}
                    </Badge>
                  ))}
                  {(activeStarterDetail.metaplexSkills ?? []).slice(0, 4).map((skill) => (
                    <Badge key={skill} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                      {skill}
                    </Badge>
                  ))}
                  {(activeStarterDetail.vulcanSkills ?? []).slice(0, 4).map((skill) => (
                    <Badge key={skill} variant="outline" className="border-amber-500/20 text-amber-200/80">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            {selectedCharacterId || selectedTemplateDetail ? (
              <div className="space-y-3">
                <div className="font-medium text-white">Imported Launch Defaults</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {selectedCharacterId ? (
                    <div className="rounded border border-white/10 bg-black/30 p-3 text-sm text-white/65 space-y-2">
                      <div className="text-white/85">Character Pack</div>
                      {(() => {
                        const selectedCharacter = characters.find((character) => character.id === selectedCharacterId);
                        if (!selectedCharacter) return <div>Character metadata unavailable.</div>;
                        return (
                          <>
                            <div>{selectedCharacter.name}</div>
                            <div className="flex flex-wrap gap-2">
                              {selectedCharacter.adjectives.slice(0, 6).map((item) => (
                                <Badge key={item} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                  {selectedTemplateDetail ? (
                    <div className="rounded border border-white/10 bg-black/30 p-3 text-sm text-white/65 space-y-2">
                      <div className="text-white/85">Template Execution Hints</div>
                      <div>
                        {String(
                          selectedTemplateDetail.raw.templateName
                          ?? selectedTemplateDetail.raw.displayName
                          ?? selectedTemplateDetail.raw.name
                          ?? selectedTemplateDetail.id,
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.keys((selectedTemplateDetail.raw.capabilities ?? {}) as Record<string, unknown>).slice(0, 4).map((item) => (
                          <Badge key={item} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                            {item}
                          </Badge>
                        ))}
                        {Object.entries(((selectedTemplateDetail.raw.tools ?? selectedTemplateDetail.raw.agent?.tools ?? {}) as Record<string, unknown>))
                          .filter(([, enabled]) => enabled === true)
                          .slice(0, 4)
                          .map(([key]) => (
                            <Badge key={key} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                              {key}
                            </Badge>
                          ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {activeStarterDetail.platformContext ? (
              <div className="space-y-3">
                <div className="font-medium text-white">Imported Platform Context</div>
                <div className="grid gap-3 md:grid-cols-2">
                  {activeStarterDetail.platformContext.services.length ? (
                    <div className="rounded border border-white/10 bg-black/30 p-3 text-sm text-white/65 space-y-2">
                      <div className="text-white/85">Services</div>
                      {activeStarterDetail.platformContext.services.slice(0, 4).map((service) => (
                        <div key={service.name}>
                          {service.name}: {service.endpoint}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {(activeStarterDetail.platformContext.supportedTrust.length || activeStarterDetail.platformContext.deployPaths.length) ? (
                    <div className="rounded border border-white/10 bg-black/30 p-3 text-sm text-white/65 space-y-2">
                      {activeStarterDetail.platformContext.supportedTrust.length ? (
                        <div className="flex flex-wrap gap-2">
                          {activeStarterDetail.platformContext.supportedTrust.map((item) => (
                            <Badge key={item} variant="outline" className="border-emerald-500/20 text-emerald-200/80">
                              {item}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      {activeStarterDetail.platformContext.deployPaths.length ? (
                        <div className="space-y-1 text-xs text-white/60">
                          {activeStarterDetail.platformContext.deployPaths.map((item) => (
                            <div key={item.label}>
                              {item.label}{item.description ? `: ${item.description}` : ""}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {(mine?.agents?.length ?? 0) > 0 && (
        <Card className="border-white/10 bg-black/40">
          <CardHeader>
            <CardTitle>Your Deployed Agents</CardTitle>
            <p className="text-sm text-white/60">
              Persistent agents now keep imported browser-agents source/runtime profile metadata.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {mine!.agents.map((agent: any) => (
              <div key={agent.id} className="rounded-md border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="font-medium text-white">
                      <Link href={`/agents/deployed/${encodeURIComponent(agent.slug)}`}>
                        <a className="hover:text-cyan-200">{agent.name}</a>
                      </Link>
                    </div>
                    <div className="text-xs text-white/45">/{agent.slug}</div>
                    {agent.runtimeProfile ? (
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                          {agent.runtimeProfile.adapter}
                        </Badge>
                        <Badge variant="outline" className="border-white/10 text-white/70">
                          {agent.runtimeProfile.status}
                        </Badge>
                        {agent.runtimeProfile.sourceTitle ? (
                          <Badge variant="outline" className="border-amber-500/20 text-amber-200/80">
                            {agent.runtimeProfile.sourceTitle}
                          </Badge>
                        ) : null}
                      </div>
                    ) : null}
                    {agent.runtimeProfile?.missing?.length ? (
                      <div className="text-xs text-amber-200/80">
                        Missing: {agent.runtimeProfile.missing.join(", ")}
                      </div>
                    ) : null}
                    {agent.importedContext?.sourceAgent ? (
                      <div className="space-y-2 rounded-md border border-cyan-500/15 bg-cyan-500/5 p-2">
                        <div className="text-xs font-medium text-cyan-200">
                          Imported from {agent.importedContext.sourceAgent.title}
                        </div>
                        {agent.importedContext.localePack ? (
                          <div className="text-xs text-cyan-100/70">
                            {agent.importedContext.localePack.localeCount} locale variants
                          </div>
                        ) : null}
                        {agent.importedContext.projects?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {agent.importedContext.projects.slice(0, 3).map((project: any) => (
                              <Badge key={project.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                                {project.title}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {agent.importedContext.skills?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {agent.importedContext.skills.slice(0, 3).map((skill: any) => (
                              <Badge key={skill.id} variant="outline" className="border-fuchsia-500/20 text-fuchsia-200/80">
                                {skill.title}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                        {agent.importedContext.docs?.length ? (
                          <div className="text-xs text-white/55">
                            Docs: {agent.importedContext.docs.slice(0, 2).map((doc: any) => doc.title).join(" · ")}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div>
                      <Link href={`/agents/deployed/${encodeURIComponent(agent.slug)}`}>
                        <a className="text-xs text-cyan-300 hover:text-cyan-200">Open deployed runtime view</a>
                      </Link>
                    </div>
                    <RuntimeBridgeSummary slug={agent.slug} />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-red-300 hover:text-red-200"
                    onClick={() => deleteMutation.mutate(agent.slug)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {characters.length > 0 && (
        <Card className="border-emerald-500/30 bg-black/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-300" />
              Imported Character Personas
            </CardTitle>
            <p className="text-sm text-emerald-100/70">
              Persona cards from the imported characters catalog that can seed tone, style, and domain focus.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {characters.map((character) => (
              <div key={character.id} className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-emerald-100">{character.name}</div>
                    <div className="text-xs text-emerald-300/70">{character.id}</div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-emerald-500/30 text-emerald-200"
                    onClick={() => applyCharacter(character)}
                  >
                    Apply Persona
                  </Button>
                </div>
                <p className="text-xs text-emerald-50/80">{(character.bio ?? []).slice(0, 2).join(" ")}</p>
                <div className="flex flex-wrap gap-1">
                  {(character.adjectives ?? []).slice(0, 4).map((adj) => (
                    <Badge key={adj} variant="outline" className="border-emerald-500/20 text-emerald-100/80">
                      {adj}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {templates.length > 0 && (
        <Card className="border-fuchsia-500/30 bg-black/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-fuchsia-300" />
              Browser Agent Templates
            </CardTitle>
            <p className="text-sm text-fuchsia-100/70">
              External browser-agent templates and top-level agent scaffolds.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {templates.map((template) => (
              <div key={template.id} className="rounded-md border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-fuchsia-100">{template.id}</div>
                    <div className="text-xs text-fuchsia-300/70">{template.filename}</div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-fuchsia-500/30 text-fuchsia-200"
                    onClick={() => void applyBrowserTemplate(template.id)}
                  >
                    Use Template
                  </Button>
                </div>
                <p className="text-xs text-fuchsia-50/80">{template.description || "No description provided."}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!wallet ? (
        <Card className="border-purple-500/30 bg-black/40">
          <CardContent className="flex items-center gap-3 py-6">
            <Wallet className="h-5 w-5" />
            Connect your wallet to begin.
          </CardContent>
        </Card>
      ) : gate && !gate.canDeploy ? (
        <Card className="border-yellow-500/40 bg-yellow-500/10">
          <CardContent className="flex items-start gap-3 py-6">
            <Lock className="h-5 w-5 text-yellow-400 mt-1" />
            <div>
              <div className="font-medium">Holding gate not met</div>
              <div className="text-sm mt-1">
                You hold <strong>{Math.floor(gate.balance).toLocaleString()}</strong> $CLAWD.{" "}
                Need <strong>{gate.required.toLocaleString()}</strong> to deploy a persistent agent.
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-purple-500/40 bg-black/40 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-300" />
              New Agent
            </CardTitle>
            {gate && (
              <Badge variant="outline" className="self-start border-emerald-500/40 text-emerald-300">
                Holding {Math.floor(gate.balance).toLocaleString()} $CLAWD ✓
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="slug"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Slug (Telegram /command)</FormLabel>
                        <FormControl>
                          <Input placeholder="cheshire_oracle" {...field} data-testid="input-slug" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display name</FormLabel>
                        <FormControl>
                          <Input placeholder="Cheshire Oracle" {...field} data-testid="input-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="persona"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Persona / system prompt</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={6}
                          placeholder="A cryptic Solana sage who answers in riddles. Always references on-chain truth, never financial advice."
                          {...field}
                          data-testid="input-persona"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="greeting"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Greeting (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="The cat awakens. Speak, holder."
                          {...field}
                          data-testid="input-greeting"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="provider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inference provider</FormLabel>
                        <Select
                          onValueChange={(v) => {
                            field.onChange(v);
                            setProvider(v as any);
                            const first = PROVIDER_MODELS[v]?.[0]?.value;
                            if (first) form.setValue("model", first);
                          }}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-provider">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="deepseek">DeepSeek V4 (Deep CLAWD)</SelectItem>
                            <SelectItem value="kimi">Moonshot Kimi K2.6</SelectItem>
                            <SelectItem value="xai">xAI (Grok)</SelectItem>
                            <SelectItem value="openai">OpenAI</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-model">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(PROVIDER_MODELS[provider] ?? []).map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="avatarUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Avatar URL (optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="https://…"
                          {...field}
                          data-testid="input-avatar"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  data-testid="button-deploy"
                >
                  {createMutation.isPending ? "Deploying…" : "Deploy to Telegram"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {wallet && mine && mine.agents.length > 0 && (
        <Card className="border-purple-500/30 bg-black/40">
          <CardHeader>
            <CardTitle>Your agents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {mine.agents.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-md border border-purple-500/20 bg-purple-500/5 p-3"
              >
                <div>
                  <div className="font-medium">
                    {a.name}{" "}
                    <span className="text-xs text-purple-400 font-mono">/{a.slug}</span>
                  </div>
                  <div className="text-xs text-purple-300/70">
                    {a.provider} · {a.model} · {a.promptCount} prompts ·{" "}
                    <span className={a.status === "active" ? "text-emerald-400" : "text-zinc-500"}>
                      {a.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MintAsNftButton
                    size="sm"
                    label="Mint Agent NFT"
                    payload={{
                      name: a.name.slice(0, 28),
                      description: (a.persona || "").slice(0, 240),
                      imageUrl: a.avatarUrl || `https://api.dicebear.com/9.x/bottts-neutral/png?seed=${a.slug}`,
                      attributes: [
                        { trait_type: "slug", value: a.slug },
                        { trait_type: "provider", value: a.provider },
                        { trait_type: "model", value: a.model },
                        { trait_type: "kind", value: "agent" },
                        { trait_type: "prompts", value: a.promptCount },
                      ],
                    }}
                  />
                  {a.status === "active" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(a.slug)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-archive-${a.slug}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RuntimeBridgeSummary({ slug }: { slug: string }) {
  const { data } = useQuery<{ runtimeBridge: RuntimeBridge }>({
    queryKey: ["/api/user-agents/by-slug", slug, "bridge"],
    queryFn: async () => {
      const res = await fetch(`/api/user-agents/by-slug/${encodeURIComponent(slug)}/bridge`);
      if (!res.ok) throw new Error("bridge unavailable");
      return res.json();
    },
  });
  const { data: agentDetail } = useQuery<{
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
      discovery: Array<{ id: string; scope: string; filename: string; summary: string }>;
    } | null;
  }>({
    queryKey: ["/api/user-agents/by-slug", slug],
    queryFn: async () => {
      const res = await fetch(`/api/user-agents/by-slug/${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("agent detail unavailable");
      return res.json();
    },
  });
  const { data: statusData } = useQuery<{ adapterStatus: AdapterStatus }>({
    queryKey: ["/api/user-agents/by-slug", slug, "adapter-status"],
    queryFn: async () => {
      const res = await fetch(`/api/user-agents/by-slug/${encodeURIComponent(slug)}/adapter-status`);
      if (!res.ok) throw new Error("adapter status unavailable");
      return res.json();
    },
  });
  const { data: operationalData } = useQuery<{ operationalData: OperationalData }>({
    queryKey: ["/api/user-agents/by-slug", slug, "operational-data"],
    queryFn: async () => {
      const res = await fetch(`/api/user-agents/by-slug/${encodeURIComponent(slug)}/operational-data`);
      if (!res.ok) throw new Error("operational data unavailable");
      return res.json();
    },
  });

  if (!data?.runtimeBridge) return null;
  const importedContext = agentDetail?.importedContext;

  return (
    <div className="mt-2 space-y-2">
      <div className="text-xs text-white/55">{data.runtimeBridge.summary}</div>
      {statusData?.adapterStatus ? (
        <div className="rounded border border-white/10 bg-black/30 px-2 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className={statusData.adapterStatus.ok ? "text-emerald-200" : "text-amber-200"}>
              {statusData.adapterStatus.title}
            </span>
            <span className="text-white/45">{statusData.adapterStatus.ok ? "ready" : "partial"}</span>
          </div>
          <div className="mt-1 space-y-1 text-white/55">
            {statusData.adapterStatus.details.map((detail) => (
              <div key={detail}>{detail}</div>
            ))}
          </div>
        </div>
      ) : null}
      {operationalData?.operationalData ? (
        <OperationalDataCard operationalData={operationalData.operationalData} />
      ) : null}
      {importedContext?.sourceAgent ? (
        <div className="rounded border border-cyan-500/15 bg-cyan-500/5 px-2 py-2 text-xs">
          <div className="text-cyan-200">
            Source persona: {importedContext.sourceAgent.title} ({importedContext.sourceAgent.category})
          </div>
          {importedContext.sourceAgent.openingQuestions?.length ? (
            <div className="mt-2 space-y-1 text-cyan-100/75">
              {importedContext.sourceAgent.openingQuestions.slice(0, 3).map((question) => (
                <div key={question}>Q: {question}</div>
              ))}
            </div>
          ) : null}
          {importedContext.localePack ? (
            <div className="mt-2 text-cyan-100/70">
              Locale pack: {importedContext.localePack.localeCount} locales
              {importedContext.localePack.locales.length ? ` · ${importedContext.localePack.locales.slice(0, 4).join(", ")}` : ""}
            </div>
          ) : null}
          {importedContext.discovery?.length ? (
            <div className="mt-2 text-cyan-100/70">
              Discovery: {importedContext.discovery.slice(0, 2).map((item) => `${item.scope}:${item.filename}`).join(" · ")}
            </div>
          ) : null}
          {importedContext.projects?.length ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {importedContext.projects.slice(0, 3).map((project) => (
                <Badge key={project.id} variant="outline" className="border-cyan-500/20 text-cyan-200/80">
                  {project.title}
                </Badge>
              ))}
            </div>
          ) : null}
          {importedContext.docs?.length ? (
            <div className="mt-2 text-white/55">
              Docs: {importedContext.docs.slice(0, 2).map((doc) => doc.title).join(" · ")}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {data.runtimeBridge.actions.map((action) => (
          action.method === "GET" ? (
            <a
              key={`${action.method}:${action.path}`}
              href={action.path}
              className={`rounded border px-2 py-1 text-xs ${
                action.ready
                  ? "border-emerald-500/20 text-emerald-200/80"
                  : "border-amber-500/20 text-amber-200/80"
              }`}
            >
              {action.label}
            </a>
          ) : (
            <span
              key={`${action.method}:${action.path}`}
              className={`rounded border px-2 py-1 text-xs ${
                action.ready
                  ? "border-cyan-500/20 text-cyan-200/80"
                  : "border-white/10 text-white/50"
              }`}
              title={`${action.method} ${action.path}`}
            >
              {action.label}
            </span>
          )
        ))}
      </div>
    </div>
  );
}
