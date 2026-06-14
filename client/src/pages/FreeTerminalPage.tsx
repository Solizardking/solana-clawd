import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Activity,
  ArrowUpRight,
  Bot,
  BookOpen,
  Cpu,
  ExternalLink,
  Layers3,
  Lock,
  Play,
  Sparkles,
  Terminal,
  Waves,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClawdSpinner, TerminalSpinnerLine } from "@/components/ClawdSpinner";
import { type ClawdSpinnerName } from "@/lib/clawd-spinners";
import { cn } from "@/lib/utils";

type FreeModelOption = {
  id: string;
  label: string;
  description: string;
  kind: string;
  docsUrl: string;
  aliases?: string[];
  configured?: boolean;
};

type SpinnerPack = {
  slug: string;
  title: string;
  verbCount: number;
  sampleVerbs: string[];
  verbs: string[];
  attribution: string | null;
  source: string | null;
};

type FreeTerminalStatus = {
  configured: boolean;
  defaultModel: string;
  models: FreeModelOption[];
  allowAutoRouter?: boolean;
  allowBodyBuilder?: boolean;
  configuredFreeModelCount?: number;
  spinnerPackCount: number;
  message?: string;
  sample?: string;
  routedModel?: string;
  baseUrl?: string;
  appUrl?: string;
};

type SpinnerIndexResponse = {
  count: number;
  packs: SpinnerPack[];
};

type ChatResponse = {
  content: string;
  model: string;
  sessionId: string | null;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
};

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type TerminalEntry = {
  id: string;
  kind: "boot" | "command" | "assistant" | "output" | "error";
  content: string;
  title?: string;
  streaming?: boolean;
  code?: boolean;
};

type BuilderRequest = {
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  max_tokens?: number;
};

const FREE_ROUTER_MODEL = "openrouter/free";
const BODY_BUILDER_MODEL = "openrouter/bodybuilder";
const AUTO_ROUTER_MODEL = "openrouter/auto";

const SPINNER_ROTATION: ClawdSpinnerName[] = [
  "solanaPulse",
  "clawdSpin",
  "walletHeartbeat",
  "tokenOrbit",
  "pumpLoader",
  "mevScan",
  "blockFinality",
  "rugDetector",
];

const DOC_LINKS = [
  {
    title: "Free Models Router",
    href: "https://openrouter.ai/docs/guides/routing/routers/free-router",
    note: "`openrouter/free` picks an available free model automatically.",
  },
  {
    title: "Free Variant",
    href: "https://openrouter.ai/docs/guides/routing/model-variants/free",
    note: "Append `:free` to an eligible model slug for explicit free routing.",
  },
  {
    title: "Auto Router",
    href: "https://openrouter.ai/docs/guides/routing/routers/auto-router",
    note: "Sticky multi-turn routing. Documented here, but only public if the backend opts in.",
  },
  {
    title: "Body Builder",
    href: "https://openrouter.ai/docs/guides/routing/routers/body-builder",
    note: "Free natural-language planner that generates parallel OpenRouter request bodies.",
  },
  {
    title: "Thinking / Exacto / Nitro",
    href: "https://openrouter.ai/docs/guides/routing/model-variants/thinking",
    note: "Variant docs are surfaced here as references; this public route stays locked to free-safe models.",
  },
];

const QUICK_COMMANDS = [
  "help",
  "status",
  "models",
  "spinners",
  "spinner vibecoder",
  "model free1",
  "model fable",
  "model riverflow",
  "builder compare SOL and BTC perp narratives using free models",
];

function createId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `free-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBootEntries(): TerminalEntry[] {
  return [
    {
      id: createId(),
      kind: "boot",
      title: "cheshire/free",
      content: "Public terminal online. Free-safe OpenRouter routing only. Type `help` to inspect commands.",
    },
    {
      id: createId(),
      kind: "boot",
      title: "quickstart",
      content: "Try `spinner vibecoder`, `models`, `builder compare SOL and BTC`, or just ask a question.",
    },
  ];
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase();
}

function normalizePackSlug(value: string) {
  return normalizeToken(value).replace(/\s+/g, "-");
}

function isPublicSafeModelClient(model: string, models: FreeModelOption[]) {
  const normalized = model.trim();
  const knownModels = new Set(models.map((option) => option.id.toLowerCase()));
  return (
    normalized === FREE_ROUTER_MODEL ||
    knownModels.has(normalized.toLowerCase()) ||
    normalized.endsWith(":free")
  );
}

function resolveModelAlias(input: string, models: FreeModelOption[]) {
  const normalized = normalizeToken(input);
  const aliases: Record<string, string> = {
    free: FREE_ROUTER_MODEL,
    router: FREE_ROUTER_MODEL,
    builder: BODY_BUILDER_MODEL,
    bodybuilder: BODY_BUILDER_MODEL,
    auto: AUTO_ROUTER_MODEL,
  };
  for (const model of models) {
    aliases[normalizeToken(model.id)] = model.id;
    aliases[normalizeToken(model.label)] = model.id;
    for (const alias of model.aliases || []) {
      aliases[normalizeToken(alias)] = model.id;
    }
  }
  return aliases[normalized] || input.trim();
}

function hashIndex(text: string, length: number) {
  let acc = 0;
  for (let i = 0; i < text.length; i += 1) {
    acc = (acc + text.charCodeAt(i) * (i + 1)) % length;
  }
  return acc;
}

function cleanJsonEnvelope(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");
  const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0] : withoutFence;
}

function parseBuilderRequests(content: string) {
  const parsed = JSON.parse(cleanJsonEnvelope(content)) as { requests?: BuilderRequest[] };
  return Array.isArray(parsed.requests) ? parsed.requests : [];
}

function formatDocsOutput() {
  return [
    "OpenRouter references",
    ...DOC_LINKS.map((doc) => `- ${doc.title}: ${doc.href}`),
    "",
    "Notes",
    "- `openrouter/free` is the default public route.",
    "- Configured `OPENROUTER_FREE_MODEL*` IDs are exposed as first-class model commands.",
    "- `openrouter/bodybuilder` is documented here, but execution depends on server-side opt-in.",
    "- `openrouter/auto` is documented, but public usage depends on server-side opt-in to avoid anonymous paid-model spend.",
    "- `:online` is deprecated in favor of server-side web search tooling.",
  ].join("\n");
}

function formatHelpOutput() {
  return [
    "Available commands",
    "- `help` show this command index",
    "- `status` inspect OpenRouter + session state",
    "- `models` list public-safe models exposed by this route",
    "- `model <slug|alias>` switch models. aliases include `free`, `free1` through `free7`, `fable`, `nex`, `riverflow`, `safety`, and `ultra`",
    "- `spinners` list imported spinner packs",
    "- `spinner <pack>` activate a pack like `spinner vibecoder`",
    "- `random` shuffle model + spinner pack",
    "- `builder <task>` generate parallel OpenRouter request bodies with Body Builder",
    "- `compare <task>` plan and execute a few free-safe parallel requests",
    "- `docs` show the OpenRouter docs surfaced in this page",
    "- `clear` wipe terminal output",
    "- `reset` reset model, session, spinner, and conversation state",
    "- `stop` abort an in-flight streamed reply",
    "- `ask <prompt>` force a normal chat turn",
    "",
    "Any non-command input is sent to the active model.",
  ].join("\n");
}

function formatModelList(models: FreeModelOption[], allowAutoRouter: boolean) {
  return [
    `Public-safe models (${models.length})`,
    ...models.map((model) => {
      const aliases = model.aliases?.length ? ` aliases: ${model.aliases.join(", ")}` : "";
      const configured = model.configured ? " configured" : "";
      return `- ${model.id} — ${model.description}${aliases}${configured}`;
    }),
    "",
    models.some((model) => model.id === BODY_BUILDER_MODEL)
      ? "Body Builder is enabled on this backend."
      : "Body Builder docs are visible, but the public backend keeps it behind an explicit opt-in.",
    allowAutoRouter
      ? "Auto Router is enabled on this backend."
      : "Auto Router docs are visible, but the public backend is currently locked to free-safe routing only.",
  ].join("\n");
}

function formatSpinnerList(packs: SpinnerPack[]) {
  return [
    `Spinner packs imported (${packs.length})`,
    packs.map((pack) => pack.slug).join(" · "),
    "",
    "Use `spinner <pack>` to load one into the live preview.",
  ].join("\n");
}

function formatStatusOutput(args: {
  status: FreeTerminalStatus | null;
  selectedModel: string;
  selectedPack: SpinnerPack | null;
  sessionId: string;
  packCount: number;
}) {
  const { status, selectedModel, selectedPack, sessionId, packCount } = args;
  if (!status) {
    return "Status is still loading.";
  }
  return [
    "Runtime status",
    `- configured: ${status.configured ? "yes" : "no"}`,
    `- default model: ${status.defaultModel}`,
    `- active model: ${selectedModel}`,
    `- spinner packs: ${packCount}`,
    `- selected pack: ${selectedPack?.slug || "none"}`,
    `- session: ${sessionId.slice(0, 12)}...`,
    status.routedModel ? `- last sampled route: ${status.routedModel}` : null,
    status.message ? `- note: ${status.message}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatBuilderPreview(requests: BuilderRequest[]) {
  return [
    `Body Builder generated ${requests.length} request bodies.`,
    ...requests.map((request, index) => {
      const userTurns = request.messages.filter((message) => message.role === "user").length;
      return `${index + 1}. ${request.model} · ${request.messages.length} messages · ${userTurns} user turns`;
    }),
  ].join("\n");
}

function summarizeComparison(results: Array<{ model: string; routedModel: string; content: string }>) {
  return results
    .map((result, index) => {
      const excerpt = result.content.trim().replace(/\s+/g, " ").slice(0, 260);
      return [
        `${index + 1}. requested=${result.model}`,
        `   routed=${result.routedModel}`,
        `   ${excerpt || "(empty response)"}`,
      ].join("\n");
    })
    .join("\n\n");
}

function SpinnerPackPreview({ pack }: { pack: SpinnerPack | null }) {
  const [verbIndex, setVerbIndex] = useState(0);

  useEffect(() => {
    setVerbIndex(0);
  }, [pack?.slug]);

  useEffect(() => {
    if (!pack?.verbs.length) return;
    const timer = window.setInterval(() => {
      setVerbIndex((current) => (current + 1) % pack.verbs.length);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [pack]);

  if (!pack) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-zinc-500">
        Spinner preview unavailable.
      </div>
    );
  }

  const spinnerName = SPINNER_ROTATION[hashIndex(pack.slug, SPINNER_ROTATION.length)];
  const currentVerb = pack.verbs[verbIndex] || pack.sampleVerbs[0] || "warming up";

  return (
    <div className="rounded-2xl border border-cyan-500/20 bg-black/40 p-4 shadow-[0_0_60px_rgba(34,211,238,0.08)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-300/70">
            Spinner Pack
          </p>
          <h3 className="text-lg font-black text-white">{pack.title}</h3>
        </div>
        <Badge variant="outline" className="border-cyan-500/30 text-cyan-200">
          {pack.verbCount} verbs
        </Badge>
      </div>

      <TerminalSpinnerLine
        name={spinnerName}
        label={currentVerb}
        prefix="free"
        className="rounded-xl border border-white/10 bg-black/50 px-3 py-2"
      />

      <div className="mt-4 space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Samples
        </p>
        <div className="flex flex-wrap gap-2">
          {pack.sampleVerbs.slice(0, 6).map((verb) => (
            <Badge key={verb} variant="outline" className="border-white/10 text-zinc-300">
              {verb}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

function TerminalEntryView({ entry }: { entry: TerminalEntry }) {
  if (entry.kind === "command") {
    return (
      <div className="font-mono text-sm text-emerald-300">
        <span className="mr-2 text-emerald-500">cheshire@free</span>
        <span className="mr-2 text-zinc-500">~ %</span>
        <span>{entry.content}</span>
      </div>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-sm text-zinc-100">
        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-cyan-300/70">
          <Bot className="h-3.5 w-3.5" />
          <span>{entry.title || "assistant"}</span>
          {entry.streaming && <span className="animate-pulse text-cyan-300">streaming</span>}
        </div>
        <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-pre:rounded-xl prose-pre:border prose-pre:border-white/10 prose-pre:bg-black/50">
          <ReactMarkdown>{entry.content || (entry.streaming ? "…" : "")}</ReactMarkdown>
        </div>
      </div>
    );
  }

  const tone =
    entry.kind === "error"
      ? "border-red-500/20 bg-red-500/5 text-red-200"
      : "border-white/10 bg-black/30 text-zinc-300";

  return (
    <div className={cn("rounded-2xl border px-4 py-3", tone)}>
      {entry.title && (
        <div className="mb-2 text-[10px] uppercase tracking-[0.25em] text-zinc-500">
          {entry.title}
        </div>
      )}
      {entry.code ? (
        <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-6">
          {entry.content}
        </pre>
      ) : (
        <div className="whitespace-pre-wrap font-mono text-sm leading-6">{entry.content}</div>
      )}
    </div>
  );
}

export default function FreeTerminalPage() {
  const [status, setStatus] = useState<FreeTerminalStatus | null>(null);
  const [availableModels, setAvailableModels] = useState<FreeModelOption[]>([]);
  const [spinnerPacks, setSpinnerPacks] = useState<SpinnerPack[]>([]);
  const [selectedModel, setSelectedModel] = useState(FREE_ROUTER_MODEL);
  const [selectedPackSlug, setSelectedPackSlug] = useState("developer");
  const [history, setHistory] = useState<TerminalEntry[]>(() => createBootEntries());
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("help");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(() => createId());
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [commandCursor, setCommandCursor] = useState<number | null>(null);
  const bootedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedPack = useMemo(
    () => spinnerPacks.find((pack) => pack.slug === selectedPackSlug) || spinnerPacks[0] || null,
    [selectedPackSlug, spinnerPacks],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, busy]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [statusRes, spinnerRes] = await Promise.all([
        fetch("/api/free-terminal/status", { credentials: "include" }),
        fetch("/api/free-terminal/spinners", { credentials: "include" }),
      ]);
      const statusJson = (await statusRes.json()) as FreeTerminalStatus;
      const spinnerJson = (await spinnerRes.json()) as SpinnerIndexResponse;
      if (cancelled) return;

      setStatus(statusJson);
      setAvailableModels(statusJson.models || []);
      setSpinnerPacks(spinnerJson.packs || []);
      setSelectedModel(statusJson.defaultModel || FREE_ROUTER_MODEL);
      if (spinnerJson.packs?.length) {
        setSelectedPackSlug((current) =>
          spinnerJson.packs.some((pack) => pack.slug === current) ? current : spinnerJson.packs[0].slug,
        );
      }

      if (!bootedRef.current) {
        bootedRef.current = true;
        setHistory((current) => [
          ...current,
          {
            id: createId(),
            kind: statusJson.configured ? "output" : "error",
            title: "runtime",
            content: statusJson.configured
              ? `OpenRouter ready. Default model: ${statusJson.defaultModel}. Imported ${spinnerJson.count} spinner packs.`
              : statusJson.message || "OpenRouter is not configured for /free.",
          },
        ]);
      }
    };

    load().catch((error) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      setHistory((current) => [
        ...current,
        {
          id: createId(),
          kind: "error",
          title: "boot error",
          content: message,
        },
      ]);
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, []);

  const appendEntry = (entry: Omit<TerminalEntry, "id">) => {
    setHistory((current) => [...current, { id: createId(), ...entry }]);
  };

  const postChat = async (payload: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    model: string;
    sessionId?: string;
    temperature?: number;
    max_tokens?: number;
  }) => {
    const response = await fetch("/api/free-terminal/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const json = (await response.json()) as ChatResponse & { error?: string; details?: string };
    if (!response.ok) {
      throw new Error(json.details || json.error || `HTTP ${response.status}`);
    }
    return json;
  };

  const setModelWithOutput = (nextModel: string) => {
    setSelectedModel(nextModel);
    appendEntry({
      kind: "output",
      title: "model",
      content: `Active model switched to ${nextModel}`,
    });
  };

  const setSpinnerWithOutput = (slug: string) => {
    setSelectedPackSlug(slug);
    const pack = spinnerPacks.find((item) => item.slug === slug);
    appendEntry({
      kind: "output",
      title: "spinner",
      content: pack
        ? `Loaded ${pack.slug} · ${pack.verbCount} verbs${pack.attribution ? ` · ${pack.attribution}` : ""}`
        : `Loaded ${slug}`,
    });
  };

  const stopStreaming = () => {
    if (!abortRef.current) {
      appendEntry({
        kind: "output",
        title: "stream",
        content: "No active stream to stop.",
      });
      return;
    }
    abortRef.current.abort();
    abortRef.current = null;
  };

  const runBuilder = async (task: string, execute: boolean) => {
    if (!task.trim()) {
      appendEntry({
        kind: "error",
        title: "builder",
        content: execute
          ? "Usage: compare <task>"
          : "Usage: builder <task>",
      });
      return;
    }
    if (!status?.configured) {
      appendEntry({
        kind: "error",
        title: "builder",
        content: "OpenRouter is not configured on this backend.",
      });
      return;
    }
    if (!status.allowBodyBuilder) {
      appendEntry({
        kind: "error",
        title: execute ? "compare locked" : "builder locked",
        content:
          "Body Builder is implemented but disabled on this public backend. Set FREE_TERMINAL_ALLOW_BODY_BUILDER=true if you want anonymous access to that route.",
      });
      return;
    }

    setBusy(true);
    appendEntry({
      kind: "output",
      title: execute ? "compare" : "builder",
      content: execute
        ? "Generating a free-safe request plan and executing it in parallel..."
        : "Generating OpenRouter request bodies with Body Builder...",
    });

    try {
      const builderPrompt = execute
        ? [
            "Generate 3 OpenRouter-compatible request bodies for the same task.",
            "Use only public free-safe routes: `openrouter/free` or explicit `:free` variants.",
            "Keep the payloads minimal and valid JSON only.",
            `Task: ${task.trim()}`,
          ].join("\n")
        : [
            "Generate OpenRouter-compatible request bodies for this task.",
            "Prefer `openrouter/free`, explicit `:free` variants, and free-safe routes unless the user explicitly asks for something else.",
            "Return valid JSON only.",
            `Task: ${task.trim()}`,
          ].join("\n");

      const plan = await postChat({
        model: BODY_BUILDER_MODEL,
        sessionId,
        max_tokens: 900,
        messages: [{ role: "user", content: builderPrompt }],
      });

      const requests = parseBuilderRequests(plan.content);
      if (!requests.length) {
        throw new Error("Body Builder returned no request bodies.");
      }

      appendEntry({
        kind: "output",
        title: "builder summary",
        content: formatBuilderPreview(requests),
      });
      appendEntry({
        kind: "output",
        title: "builder json",
        content: JSON.stringify({ requests }, null, 2),
        code: true,
      });

      if (!execute) return;

      const executableRequests = requests
        .filter((request) => isPublicSafeModelClient(request.model, availableModels))
        .slice(0, 3);

      if (!executableRequests.length) {
        throw new Error("Body Builder did not return any public-safe models to execute.");
      }

      const results = await Promise.all(
        executableRequests.map(async (request) => {
          const chat = await postChat({
            model: request.model,
            sessionId,
            temperature: typeof request.temperature === "number" ? request.temperature : 0.65,
            max_tokens: typeof request.max_tokens === "number" ? request.max_tokens : 500,
            messages: request.messages
              .filter((message) => message.role === "user" || message.role === "assistant")
              .map((message) => ({
                role: message.role as "user" | "assistant",
                content: message.content,
              })),
          });
          return {
            model: request.model,
            routedModel: chat.model,
            content: chat.content,
          };
        }),
      );

      appendEntry({
        kind: "output",
        title: "parallel results",
        content: summarizeComparison(results),
      });
    } catch (error) {
      appendEntry({
        kind: "error",
        title: execute ? "compare error" : "builder error",
        content: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const runChatPrompt = async (prompt: string) => {
    if (!status?.configured) {
      appendEntry({
        kind: "error",
        title: "chat",
        content: status?.message || "OpenRouter is not configured on this backend.",
      });
      return;
    }

    setBusy(true);
    const nextConversation = [...conversation, { role: "user" as const, content: prompt }];
    const assistantId = createId();
    setHistory((current) => [
      ...current,
      {
        id: assistantId,
        kind: "assistant",
        title: selectedModel,
        content: "",
        streaming: true,
      },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/free-terminal/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel,
          sessionId,
          messages: nextConversation,
          max_tokens: 700,
          temperature: 0.65,
        }),
      });

      if (!response.ok || !response.body) {
        const detail = await response.text();
        throw new Error(detail || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let finalModel = selectedModel;
      const applyStreamPayload = (
        payload:
          | { type: "meta"; requestedModel: string; sessionId: string | null }
          | { type: "token"; content: string; model: string }
          | { type: "done"; model: string; sessionId: string | null }
          | { type: "error"; message: string },
      ) => {
        if (payload.type === "token") {
          acc += payload.content;
          finalModel = payload.model || finalModel;
          setHistory((current) =>
            current.map((entry) =>
              entry.id === assistantId
                ? {
                    ...entry,
                    title: finalModel,
                    content: acc,
                  }
                : entry,
            ),
          );
        } else if (payload.type === "done") {
          finalModel = payload.model || finalModel;
        } else if (payload.type === "error") {
          throw new Error(payload.message);
        }
      };
      const processSseBlock = (block: string) => {
        if (!block.trim()) return;
        const dataLines = block
          .split("\n")
          .filter((line) => line.startsWith("data: "))
          .map((line) => line.slice(6));

        for (const line of dataLines) {
          if (!line.trim()) continue;
          applyStreamPayload(
            JSON.parse(line) as
              | { type: "meta"; requestedModel: string; sessionId: string | null }
              | { type: "token"; content: string; model: string }
              | { type: "done"; model: string; sessionId: string | null }
              | { type: "error"; message: string },
          );
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          processSseBlock(block);
        }
      }
      buffer += decoder.decode();
      processSseBlock(buffer);

      if (!acc.trim()) {
        const fallback = await postChat({
          model: selectedModel,
          sessionId,
          messages: nextConversation,
          max_tokens: 700,
          temperature: 0.65,
        });
        acc = fallback.content || "";
        finalModel = fallback.model || finalModel;
      }

      if (!acc.trim()) {
        throw new Error("No response returned from the terminal model.");
      }

      setHistory((current) =>
        current.map((entry) =>
          entry.id === assistantId
            ? {
                ...entry,
                title: finalModel,
                content: acc,
                streaming: false,
              }
            : entry,
        ),
      );
      setConversation([...nextConversation, { role: "assistant", content: acc }]);
    } catch (error) {
      const wasAborted = controller.signal.aborted;
      setHistory((current) =>
        current.filter((entry) => entry.id !== assistantId),
      );
      appendEntry({
        kind: wasAborted ? "output" : "error",
        title: wasAborted ? "stream stopped" : "chat error",
        content: wasAborted
          ? "Streaming reply aborted."
          : error instanceof Error
            ? error.message
            : String(error),
      });
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  const handleCommand = async (rawValue: string) => {
    const value = rawValue.trim();
    if (!value) return;

    setCommandHistory((current) => [value, ...current.filter((item) => item !== value)].slice(0, 50));
    setCommandCursor(null);
    setInput("");
    appendEntry({ kind: "command", content: value });

    const [head, ...tail] = value.split(" ");
    const command = normalizeToken(head);
    const argText = tail.join(" ").trim();

    switch (command) {
      case "help":
        appendEntry({ kind: "output", title: "help", content: formatHelpOutput() });
        return;
      case "clear":
        setHistory([]);
        return;
      case "docs":
      case "variants":
        appendEntry({ kind: "output", title: "docs", content: formatDocsOutput() });
        return;
      case "status":
        appendEntry({
          kind: "output",
          title: "status",
          content: formatStatusOutput({
            status,
            selectedModel,
            selectedPack,
            sessionId,
            packCount: spinnerPacks.length,
          }),
        });
        return;
      case "models":
        appendEntry({
          kind: "output",
          title: "models",
          content: formatModelList(availableModels, Boolean(status?.allowAutoRouter)),
        });
        return;
      case "spinners":
        appendEntry({
          kind: "output",
          title: "spinners",
          content: formatSpinnerList(spinnerPacks),
        });
        return;
      case "spinner": {
        if (!argText) {
          appendEntry({
            kind: "error",
            title: "spinner",
            content: "Usage: spinner <pack>",
          });
          return;
        }
        const slug = normalizePackSlug(argText);
        const pack = spinnerPacks.find((item) => item.slug === slug);
        if (!pack) {
          appendEntry({
            kind: "error",
            title: "spinner",
            content: `Unknown spinner pack: ${slug}`,
          });
          return;
        }
        setSpinnerWithOutput(pack.slug);
        return;
      }
      case "model": {
        if (!argText) {
          appendEntry({
            kind: "output",
            title: "model",
            content: formatModelList(availableModels, Boolean(status?.allowAutoRouter)),
          });
          return;
        }
        const resolved = resolveModelAlias(argText, availableModels);
        if (!isPublicSafeModelClient(resolved, availableModels)) {
          appendEntry({
            kind: "error",
            title: "model",
            content:
              resolved === BODY_BUILDER_MODEL
                ? "Body Builder is implemented but disabled on this public backend. Set FREE_TERMINAL_ALLOW_BODY_BUILDER=true to expose it."
                : resolved === AUTO_ROUTER_MODEL
                  ? "Auto Router is documented here, but this public backend has not opted into anonymous paid-model routing."
                  : `Model is not allowed on public /free: ${resolved}`,
          });
          return;
        }
        setModelWithOutput(resolved);
        return;
      }
      case "random": {
        const safeModels = availableModels
          .map((model) => model.id)
          .filter((model) => model !== BODY_BUILDER_MODEL);
        const randomModel = safeModels.length
          ? safeModels[Math.floor(Math.random() * safeModels.length)]
          : selectedModel;
        const randomPack = spinnerPacks.length
          ? spinnerPacks[Math.floor(Math.random() * spinnerPacks.length)]
          : selectedPack;
        if (safeModels.length) {
          setSelectedModel(randomModel);
        }
        if (randomPack) {
          setSelectedPackSlug(randomPack.slug);
        }
        appendEntry({
          kind: "output",
          title: "random",
          content: `Model => ${randomModel}\nSpinner => ${randomPack?.slug || "unchanged"}`,
        });
        return;
      }
      case "reset":
        abortRef.current?.abort();
        abortRef.current = null;
        setBusy(false);
        setSelectedModel(status?.defaultModel || FREE_ROUTER_MODEL);
        setSelectedPackSlug(spinnerPacks[0]?.slug || "developer");
        setConversation([]);
        setSessionId(createId());
        setHistory(createBootEntries());
        return;
      case "stop":
        stopStreaming();
        return;
      case "builder":
        await runBuilder(argText, false);
        return;
      case "compare":
        await runBuilder(argText, true);
        return;
      case "ask":
        await runChatPrompt(argText);
        return;
      default:
        await runChatPrompt(value);
    }
  };

  const handleSubmit = async () => {
    if (busy) return;
    await handleCommand(input);
  };

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await handleSubmit();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!commandHistory.length) return;
      const nextCursor = commandCursor === null ? 0 : Math.min(commandCursor + 1, commandHistory.length - 1);
      setCommandCursor(nextCursor);
      setInput(commandHistory[nextCursor] || "");
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (commandCursor === null) return;
      const nextCursor = commandCursor - 1;
      if (nextCursor < 0) {
        setCommandCursor(null);
        setInput("");
        return;
      }
      setCommandCursor(nextCursor);
      setInput(commandHistory[nextCursor] || "");
    }
  };

  return (
    <div className="min-h-[calc(100vh-8rem)] overflow-hidden rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(236,72,153,0.12),transparent_26%),radial-gradient(circle_at_bottom,rgba(124,58,237,0.14),transparent_30%),linear-gradient(180deg,rgba(4,6,10,0.98),rgba(5,8,16,0.98))] shadow-[0_30px_100px_rgba(0,0,0,0.45)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(180deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:36px_36px] opacity-25" />

      <div className="relative flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-200">
                Public route
              </Badge>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                OpenRouter free-safe
              </Badge>
              <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-200">
                Spinner packs imported
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-2xl border border-cyan-500/20 bg-black/40 p-3">
                <ClawdSpinner name="clawdSpin" label="cheshire/free" />
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-cyan-200 via-white to-fuchsia-200 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
                  Cheshire Free Terminal
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-zinc-400 sm:text-base">
                  Public command-line playground for OpenRouter free routing, free variants, Body Builder,
                  and the imported Cheshire spinner pack library.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="border-white/10 bg-black/40 text-zinc-200 hover:bg-white/5"
              onClick={() => setInput("help")}
            >
              <Terminal className="h-4 w-4" />
              Seed Help
            </Button>
            <a
              href="https://openrouter.ai/docs/guides/routing/routers/free-router"
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20">
                <BookOpen className="h-4 w-4" />
                Docs
              </Button>
            </a>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_380px]">
          <section className="overflow-hidden rounded-[24px] border border-white/10 bg-black/35 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">terminal session</p>
                  <p className="font-mono text-sm text-zinc-200">{sessionId.slice(0, 18)}…</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="outline" className="border-white/10 text-zinc-300">
                  model: {selectedModel}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    "border-white/10",
                    status?.configured ? "text-emerald-200" : "text-red-200",
                  )}
                >
                  {status?.configured ? "ready" : "offline"}
                </Badge>
                <Badge variant="outline" className="border-white/10 text-zinc-300">
                  packs: {spinnerPacks.length}
                </Badge>
              </div>
            </div>

            <div ref={scrollRef} className="h-[620px] space-y-3 overflow-y-auto px-4 py-4">
              {history.map((entry) => (
                <TerminalEntryView key={entry.id} entry={entry} />
              ))}
            </div>

            <div className="border-t border-white/10 px-4 py-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {["help", "status", "models", "spinners", "docs"].map((command) => (
                  <button
                    key={command}
                    type="button"
                    onClick={() => {
                      setInput(command);
                      inputRef.current?.focus();
                    }}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-mono text-zinc-400 transition-colors hover:border-cyan-500/30 hover:text-cyan-200"
                  >
                    {command}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-2xl border border-cyan-500/20 bg-black/60 px-3 py-3">
                <span className="font-mono text-xs text-emerald-400">cheshire@free</span>
                <span className="font-mono text-xs text-zinc-500">~ %</span>
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    setCommandCursor(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="type a command or ask a question"
                  className="h-auto border-0 bg-transparent px-0 py-0 font-mono text-sm text-zinc-100 shadow-none focus-visible:ring-0"
                  disabled={busy}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSubmit}
                  disabled={busy || !input.trim()}
                  className="rounded-full bg-cyan-500 text-black hover:bg-cyan-400"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded-[24px] border border-white/10 bg-black/35 p-4 backdrop-blur">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">runtime</p>
                  <h2 className="mt-1 text-xl font-black text-white">Public AI Surface</h2>
                </div>
                <Activity className="h-5 w-5 text-cyan-300" />
              </div>

              <div className="space-y-3 text-sm text-zinc-300">
                <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-zinc-500">default route</span>
                    <Badge variant="outline" className="border-cyan-500/30 text-cyan-200">
                      {status?.defaultModel || FREE_ROUTER_MODEL}
                    </Badge>
                  </div>
                  <p className="text-xs leading-6 text-zinc-400">
                    Anonymous users are limited to `openrouter/free` and explicit `:free` variants by default.
                    Body Builder and Auto Router stay behind explicit backend opt-ins so the public endpoint cannot
                    silently burn paid-model credits.
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/40 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
                    <Cpu className="h-3.5 w-3.5" />
                    Quick commands
                  </div>
                  <div className="space-y-2">
                    {QUICK_COMMANDS.map((command) => (
                      <button
                        key={command}
                        type="button"
                        onClick={() => {
                          setInput(command);
                          inputRef.current?.focus();
                        }}
                        className="block w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left font-mono text-[11px] text-zinc-300 transition-colors hover:border-cyan-500/30 hover:text-cyan-100"
                      >
                        {command}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <SpinnerPackPreview pack={selectedPack} />

            <div className="rounded-[24px] border border-white/10 bg-black/35 p-4 backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">OpenRouter docs</p>
                  <h2 className="mt-1 text-xl font-black text-white">Routers & Variants</h2>
                </div>
                <Layers3 className="h-5 w-5 text-fuchsia-300" />
              </div>

              <div className="space-y-3">
                {DOC_LINKS.map((doc) => (
                  <a
                    key={doc.href}
                    href={doc.href}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-white/10 bg-black/40 p-3 transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{doc.title}</div>
                        <p className="mt-1 text-xs leading-5 text-zinc-400">{doc.note}</p>
                      </div>
                      <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
                    </div>
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-black/35 p-4 backdrop-blur">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">spinner library</p>
                  <h2 className="mt-1 text-xl font-black text-white">Imported Packs</h2>
                </div>
                <Waves className="h-5 w-5 text-cyan-300" />
              </div>

              <div className="grid max-h-[420px] grid-cols-1 gap-2 overflow-y-auto pr-1">
                {spinnerPacks.map((pack) => (
                  <button
                    key={pack.slug}
                    type="button"
                    onClick={() => setSpinnerWithOutput(pack.slug)}
                    className={cn(
                      "rounded-2xl border px-3 py-3 text-left transition-colors",
                      selectedPack?.slug === pack.slug
                        ? "border-cyan-500/40 bg-cyan-500/10"
                        : "border-white/10 bg-black/40 hover:border-cyan-500/20 hover:bg-cyan-500/5",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-mono text-sm text-zinc-100">{pack.slug}</div>
                        <div className="mt-1 text-[11px] text-zinc-500">{pack.verbCount} verbs</div>
                      </div>
                      <Sparkles className="h-4 w-4 text-zinc-500" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[24px] border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
                <Lock className="h-4 w-4" />
                Cost guardrails
              </div>
              <p className="text-xs leading-6 text-amber-100/80">
                The public API is intentionally locked down. Auto Router, Exacto, Nitro, Thinking, and other non-free
                variants are documented here, but the anonymous endpoint only executes free-safe models unless the
                backend explicitly opts in.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href="https://openrouter.ai/docs/guides/routing/model-variants/free"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-200 hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  free variants
                </a>
                <a
                  href="https://openrouter.ai/docs/guides/routing/routers/body-builder"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-amber-200 hover:text-white"
                >
                  <Zap className="h-3.5 w-3.5" />
                  body builder
                </a>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
