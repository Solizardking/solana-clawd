import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Monitor, Globe, Terminal, Copy, ExternalLink, Send, Play, Square,
  RefreshCw, Zap, Bot, AlertTriangle, Loader2, Wifi, HardDrive,
  Radio, Video, Shield, Folder, UserRound, Cpu, DollarSign, Eye,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type StatusData = {
  configured: boolean;
  cloudflareConfigured?: boolean;
  openaiConfigured?: boolean;
  defaultModel?: string;
  clawdBrowserModel?: string;
  defaultProfileId?: string;
  defaultWorkspaceId?: string;
};

type SessionState = {
  id: string;
  liveUrl?: string;
  status: string;
  model?: string;
  profileId?: string;
  workspaceId?: string;
  totalCostUsd?: string;
  agentmailEmail?: string;
};

type BrowserState = {
  id: string;
  status: string;
  liveUrl?: string;
  cdpUrl?: string;
  recordingUrl?: string;
};

type AgentMessage = {
  id?: string;
  type?: string;
  role?: string;
  summary?: string;
  data?: string | Record<string, any>;
  content?: string;
  text?: string;
  message?: string;
  screenshotUrl?: string;
};

type LogEntry = {
  id: string;
  kind: "user" | "agent" | "status" | "error" | "system";
  text: string;
  ts: Date;
  screenshotUrl?: string;
};

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

type Profile = { id: string; name?: string; userId?: string; cookieDomains?: string[] };
type Workspace = { id: string; name?: string; updatedAt?: string };

const MODELS = [
  { id: "claude-sonnet-4.6", label: "Sonnet 4.6", note: "Browser Use optimized" },
  { id: "claude-opus-4.6", label: "Opus 4.6", note: "Max capability" },
  { id: "gpt-5.4-mini", label: "GPT-5.4 mini", note: "OpenAI BYOK-capable" },
];

const COUNTRIES = [
  { id: "us", label: "US" },
  { id: "de", label: "DE" },
  { id: "jp", label: "JP" },
  { id: "uk", label: "UK" },
  { id: "sg", label: "SG" },
  { id: "none", label: "No proxy" },
];

const QUICK_PROMPTS = [
  "Find the top story on Hacker News and summarize the discussion.",
  "Open github.com/browser-use/browser-use and report stars, latest release, and open issues.",
  "Search for Solana token launchpad news and return the three most relevant links.",
  "Go to docs.browser-use.com and save a concise implementation checklist.",
  "Check whether cloud.browser-use.com is reachable and describe the login state.",
];

const SOLANA_CLAWD_CDP_PROFILE = `{
  browser: {
    enabled: true,
    defaultProfile: "browser-use",
    remoteCdpTimeoutMs: 3000,
    remoteCdpHandshakeTimeoutMs: 5000,
    profiles: {
      "browser-use": {
        cdpUrl: "wss://connect.browser-use.com?apiKey=<BROWSER_USE_API_KEY>&proxyCountryCode=us",
        color: "#8b5cf6"
      }
    }
  }
}`;

function uid() {
  return Math.random().toString(36).slice(2);
}

function msgText(m: AgentMessage): string {
  if (typeof m.summary === "string" && m.summary.trim()) return m.summary;
  if (m.data) {
    let parsed: any = m.data;
    if (typeof m.data === "string") {
      try { parsed = JSON.parse(m.data); } catch { return m.data; }
    }
    return parsed?.content ?? parsed?.text ?? parsed?.message ?? parsed?.action ?? parsed?.thought ?? JSON.stringify(parsed);
  }
  return m.content ?? m.text ?? m.message ?? "";
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "running" ? "bg-green-400 animate-pulse" :
    status === "idle" || status === "created" || status === "active" ? "bg-emerald-500" :
    status === "stopped" ? "bg-gray-400" :
    status === "error" || status === "timed_out" ? "bg-red-400" :
    "bg-yellow-400 animate-pulse";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function formatMoney(v?: string) {
  const n = Number(v || 0);
  return n ? `$${n.toFixed(4)}` : "$0.0000";
}

function liveUrlWithOptions(url: string, hideChrome: boolean) {
  const params = `${url.includes("?") ? "&" : "?"}theme=dark${hideChrome ? "&ui=false" : ""}`;
  return `${url}${params}`;
}

function readInitialBrowserTask() {
  if (typeof window === "undefined") return "";
  const params = new URLSearchParams(window.location.search);
  return params.get("task") || params.get("q") || "";
}

export default function BrowserUsePage() {
  const { toast } = useToast();
  const initialTask = useRef(readInitialBrowserTask()).current;
  const [status, setStatus] = useState<StatusData | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [browser, setBrowser] = useState<BrowserState | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatTurn[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [task, setTask] = useState(initialTask);
  const [model, setModel] = useState("claude-sonnet-4.6");
  const [profileId, setProfileId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [proxyCountryCode, setProxyCountryCode] = useState("us");
  const [maxCostUsd, setMaxCostUsd] = useState("1");
  const [keepAlive, setKeepAlive] = useState(true);
  const [useOwnKey, setUseOwnKey] = useState(true);
  const [enableRecording, setEnableRecording] = useState(true);
  const [cacheScript, setCacheScript] = useState<"auto" | "on" | "off">("auto");
  const [autoHeal, setAutoHeal] = useState(true);
  const [agentmail, setAgentmail] = useState(false);
  const [skills, setSkills] = useState(true);
  const [codeMode, setCodeMode] = useState(false);
  const [hideChrome, setHideChrome] = useState(false);
  const [schemaText, setSchemaText] = useState("");
  const [agentMode, setAgentMode] = useState<"cloudflare" | "clawd" | "browser-use">("cloudflare");
  const [cloudflareAction, setCloudflareAction] = useState<"screenshot" | "text" | "html">("screenshot");
  const [cloudflarePreviewUrl, setCloudflarePreviewUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const abortRef = useRef<{ close: () => void } | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((kind: LogEntry["kind"], text: string, screenshotUrl?: string) => {
    setLogs((prev) => [...prev, { id: uid(), kind, text, ts: new Date(), screenshotUrl }]);
  }, []);

  const sessionOptions = useCallback(() => {
    let outputSchema: any;
    if (schemaText.trim()) {
      try { outputSchema = JSON.parse(schemaText); } catch {}
    }
    return {
      model,
      profileId: profileId || undefined,
      workspaceId: workspaceId || undefined,
      keepAlive,
      enableRecording,
      proxyCountryCode: proxyCountryCode === "none" ? null : proxyCountryCode,
      maxCostUsd,
      useOwnKey,
      cacheScript: cacheScript === "auto" ? undefined : cacheScript === "on",
      autoHeal,
      agentmail,
      skills,
      codeMode,
      outputSchema,
    };
  }, [agentmail, autoHeal, cacheScript, codeMode, enableRecording, keepAlive, maxCostUsd, model, profileId, proxyCountryCode, schemaText, skills, useOwnKey, workspaceId]);

  const loadMetadata = useCallback(async () => {
    try {
      const [profileRes, workspaceRes] = await Promise.all([
        fetch("/api/browser-use/profiles"),
        fetch("/api/browser-use/workspaces"),
      ]);
      if (profileRes.ok) {
        const d = await profileRes.json();
        setProfiles(d.items ?? d.profiles ?? []);
      }
      if (workspaceRes.ok) {
        const d = await workspaceRes.json();
        setWorkspaces(d.items ?? d.workspaces ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetch("/api/browser-use/status")
      .then((r) => r.json())
      .then((d: StatusData) => {
        setStatus(d);
        if (d.defaultModel) setModel(d.defaultModel);
        if (d.defaultProfileId) setProfileId(d.defaultProfileId);
        if (d.defaultWorkspaceId) setWorkspaceId(d.defaultWorkspaceId);
        if (d.configured) loadMetadata();
      })
      .catch(() => setStatus({ configured: false }));
  }, [loadMetadata]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const createWorkspace = async () => {
    const name = `cheshire-${new Date().toISOString().slice(0, 10)}`;
    const r = await fetch("/api/browser-use/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || d.detail || "workspace create failed");
    setWorkspaceId(d.id);
    await loadMetadata();
    addLog("system", `Workspace ready · ${d.id.slice(0, 12)}...`);
  };

  const createProfile = async () => {
    const name = `cheshire-profile-${Date.now().toString(36)}`;
    const r = await fetch("/api/browser-use/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, userId: "cheshire-terminal" }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || d.detail || "profile create failed");
    setProfileId(d.id);
    await loadMetadata();
    addLog("system", `Profile ready · ${d.id.slice(0, 12)}...`);
  };

  const createSession = async () => {
    setCreating(true);
    addLog("system", "Creating Browser Use agent session...");
    try {
      const r = await fetch("/api/browser-use/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sessionOptions()),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || data.detail || "Failed to create session");
      setSession(data);
      setIframeKey((k) => k + 1);
      addLog("system", `Agent session ready · ${data.id.slice(0, 14)}...`);
      toast({ title: "Browser session created", description: data.liveUrl ? "Live preview is ready" : "Session is ready" });
    } catch (err: any) {
      addLog("error", err.message);
      toast({ title: "Session failed", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const createRawBrowser = async () => {
    setCreating(true);
    addLog("system", "Creating standalone stealth browser...");
    try {
      const r = await fetch("/api/browser-use/browsers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profileId || undefined,
          proxyCountryCode: proxyCountryCode === "none" ? null : proxyCountryCode,
          timeout: 60,
          browserScreenWidth: 1440,
          browserScreenHeight: 900,
          enableRecording,
        }),
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || data.detail || "Failed to create browser");
      setBrowser(data);
      setIframeKey((k) => k + 1);
      addLog("system", `Raw browser ready · ${data.id.slice(0, 14)}...`);
    } catch (err: any) {
      addLog("error", err.message);
    } finally {
      setCreating(false);
    }
  };

  const stopTask = async () => {
    if (!session) return;
    abortRef.current?.close();
    setBusy(false);
    await fetch(`/api/browser-use/sessions/${session.id}/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy: "task" }),
    }).catch(() => {});
    setSession((s) => s ? { ...s, status: "idle" } : null);
    addLog("status", "Task stopped.");
  };

  const closeSession = async () => {
    if (!session) return;
    abortRef.current?.close();
    await fetch(`/api/browser-use/sessions/${session.id}`, { method: "DELETE" }).catch(() => {});
    addLog("status", "Agent session closed.");
    setSession(null);
    setBusy(false);
  };

  const closeBrowser = async () => {
    if (!browser) return;
    const r = await fetch(`/api/browser-use/browsers/${browser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop" }),
    });
    const data = await r.json().catch(() => ({}));
    if (data.recordingUrl) addLog("system", `Recording ready: ${data.recordingUrl}`);
    setBrowser(null);
  };

  const runCloudflareCapture = useCallback(async (url: string) => {
    addLog("status", `Cloudflare Browser Run ${cloudflareAction} started.`);
    if (cloudflarePreviewUrl) URL.revokeObjectURL(cloudflarePreviewUrl);
    setCloudflarePreviewUrl("");

    if (cloudflareAction === "screenshot") {
      const res = await fetch("/api/browser-use/cloudflare/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, fullPage: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Cloudflare screenshot failed");
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      setCloudflarePreviewUrl(objectUrl);
      addLog("agent", `Screenshot captured from ${url}`, objectUrl);
      return "Screenshot captured.";
    }

    const res = await fetch("/api/browser-use/cloudflare/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, format: cloudflareAction === "html" ? "html" : "text" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || data.message || "Cloudflare extract failed");
    const content = String(data.content || "");
    addLog("agent", `${data.title ? `${data.title}\n\n` : ""}${content.slice(0, 3000)}${content.length > 3000 ? "\n\n[truncated]" : ""}`);
    return content.slice(0, 1000) || "Extract complete.";
  }, [addLog, cloudflareAction, cloudflarePreviewUrl]);

  const runTask = useCallback(() => {
    if (!task.trim() || busy) return;
    if (agentMode === "browser-use" && !session) return;
    if (agentMode === "cloudflare" && !status?.cloudflareConfigured) return;
    const text = task.trim();
    setTask("");
    addLog("user", text);
    setBusy(true);
    setSession((s) => s ? { ...s, status: "running" } : null);

    const controller = new AbortController();
    abortRef.current = { close: () => controller.abort() };

    (async () => {
      try {
        if (agentMode === "cloudflare") {
          const finalText = await runCloudflareCapture(text);
          setChatHistory((prev) => [
            ...prev,
            { role: "user" as const, content: text },
            { role: "assistant" as const, content: finalText || "Done." },
          ].slice(-12));
          addLog("status", "Cloudflare Browser Run done.");
          setBusy(false);
          return;
        }

        const endpoint = agentMode === "clawd"
          ? "/api/browser-use/clawd/run"
          : `/api/browser-use/sessions/${session!.id}/run`;
        const body = agentMode === "clawd"
          ? { task: text, sessionId: session?.id, messages: chatHistory, ...sessionOptions() }
          : { task: text, ...sessionOptions() };

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || "Run failed");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventName = "";
        let finalText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            let dataLine = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              if (line.startsWith("data:")) dataLine += line.slice(5).trim();
            }
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine);

            if (eventName === "message" || eventName === "browser_message") {
              const text = msgText(payload);
              if (text) addLog("agent", text, payload.screenshotUrl);
            } else if (eventName === "text") {
              if (payload.content) {
                finalText = payload.content;
                addLog("agent", payload.content);
              }
            } else if (eventName === "tool_call") {
              addLog("status", `Solana Clawd opened Browser Use · ${payload.task || payload.name}`);
            } else if (eventName === "browser_session") {
              setSession({
                id: payload.id,
                status: payload.status || "running",
                liveUrl: payload.liveUrl,
                model: payload.model,
                profileId: payload.profileId,
                workspaceId: payload.workspaceId,
              });
              setIframeKey((k) => k + 1);
              addLog("system", `Live browser attached · ${payload.id.slice(0, 14)}...`);
            } else if (eventName === "browser_result") {
              setSession((s) => s ? {
                ...s,
                status: payload.status || s.status,
                liveUrl: payload.liveUrl || s.liveUrl,
                totalCostUsd: payload.totalCostUsd || s.totalCostUsd,
              } : s);
              if (payload.output) addLog("status", "Browser task returned output.");
            } else if (eventName === "status") {
              setSession((s) => s ? {
                ...s,
                status: payload.status || s.status,
                liveUrl: payload.liveUrl || s.liveUrl,
                model: payload.model || s.model,
                totalCostUsd: payload.totalCostUsd || s.totalCostUsd,
                agentmailEmail: payload.agentmailEmail || s.agentmailEmail,
              } : null);
              if (payload.lastStepSummary) addLog("status", payload.lastStepSummary, payload.screenshotUrl);
              else if (payload.message) addLog("status", payload.message);
            } else if (eventName === "done") {
              if (payload.sessionId || payload.liveUrl) {
                setSession((s) => ({
                  id: payload.sessionId || s?.id || "",
                  status: payload.status ?? s?.status ?? "idle",
                  liveUrl: payload.liveUrl || s?.liveUrl,
                  model: payload.model || s?.model,
                  totalCostUsd: payload.totalCostUsd || s?.totalCostUsd,
                }));
              } else {
                setSession((s) => s ? {
                  ...s,
                  status: payload.status ?? "idle",
                  liveUrl: payload.liveUrl || s.liveUrl,
                  totalCostUsd: payload.totalCostUsd || s.totalCostUsd,
                } : null);
              }
              if (payload.output && payload.output !== finalText) {
                const outputText = typeof payload.output === "string" ? payload.output : JSON.stringify(payload.output, null, 2);
                finalText = outputText;
                addLog("agent", outputText, payload.screenshotUrl);
              }
              if (payload.recordingUrls?.length) addLog("system", `Recording ready: ${payload.recordingUrls[0]}`);
              addLog("status", agentMode === "clawd"
                ? `Solana Clawd done · ${formatMoney(payload.totalCostUsd)}`
                : `Done · ${payload.isTaskSuccessful === false ? "not successful" : "successful"} · ${formatMoney(payload.totalCostUsd)}`);
              setChatHistory((prev) => [
                ...prev,
                { role: "user" as const, content: text },
                { role: "assistant" as const, content: finalText || "Done." },
              ].slice(-12));
              setBusy(false);
            } else if (eventName === "error") {
              throw new Error(payload.message || "Unknown Browser Use error");
            }
            eventName = "";
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") addLog("error", err.message);
        setBusy(false);
      }
    })();
  }, [addLog, agentMode, busy, chatHistory, runCloudflareCapture, session, sessionOptions, status?.cloudflareConfigured, task]);

  const copyText = (value: string, title = "Copied") => {
    navigator.clipboard.writeText(value);
    toast({ title });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    runTask();
  };

  if (status?.configured === false && status?.cloudflareConfigured !== true) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-yellow-400 mx-auto" />
          <h2 className="text-xl font-bold text-white font-mono">BROWSER_USE_API_KEY not set</h2>
          <p className="text-gray-400 text-sm font-mono leading-relaxed">
            Add a Browser Use API key or configure the first-party Cloudflare Browser Run worker.
          </p>
          <div className="bg-black/40 border border-yellow-500/20 rounded-lg p-4 font-mono text-xs text-yellow-300 text-left">
            <div className="text-gray-500 mb-1"># Add to env:</div>
            BROWSER_USE_API_KEY=bu-xxxxxxx...
            {"\n"}CLOUDFLARE_BROWSER_WORKER_URL=https://cheshire-browser-run.example.workers.dev
          </div>
          <Button onClick={() => window.location.reload()} variant="outline" className="border-purple-500/40 text-purple-300 font-mono">
            <RefreshCw className="h-3.5 w-3.5 mr-2" /> Refresh
          </Button>
        </div>
      </div>
    );
  }

  const activeLiveUrl = cloudflarePreviewUrl || session?.liveUrl || browser?.liveUrl;

  return (
    <div className="h-screen bg-[#0a0a14] text-gray-200 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-purple-500/20 bg-[#0d0d1f] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Monitor className="h-5 w-5 text-purple-400" />
          <span className="font-mono font-bold text-white text-sm">Solana Clawd Computer Use</span>
          {session && (
            <div className="flex items-center gap-1.5">
              <StatusDot status={session.status} />
              <span className="text-[11px] font-mono text-gray-400">{session.status}</span>
              <span className="text-[10px] font-mono text-gray-600">{session.id.slice(0, 12)}...</span>
            </div>
          )}
          {session?.totalCostUsd && (
            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-[10px] font-mono">
              {formatMoney(session.totalCostUsd)}
            </Badge>
          )}
          {status?.cloudflareConfigured && !session && !browser && (
            <Badge className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-[10px] font-mono">cloudflare ready</Badge>
          )}
          {!status?.cloudflareConfigured && !session && !browser && <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30 text-[10px] font-mono">no session</Badge>}
        </div>

        <div className="flex items-center gap-2">
          {activeLiveUrl && !cloudflarePreviewUrl && (
            <Button size="sm" variant="outline" className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10 font-mono text-xs h-7 gap-1.5" onClick={() => window.open(activeLiveUrl, "_blank")}>
              <ExternalLink className="h-3 w-3" /> Live
            </Button>
          )}
          {browser?.cdpUrl && (
            <Button size="sm" variant="outline" className="border-sky-500/30 text-sky-300 hover:bg-sky-500/10 font-mono text-xs h-7 gap-1.5" onClick={() => copyText(browser.cdpUrl!, "CDP URL copied")}>
              <Copy className="h-3 w-3" /> CDP
            </Button>
          )}
          {session ? (
            <>
              <Button size="sm" variant="outline" className="border-red-500/30 text-red-400 hover:bg-red-500/10 font-mono text-xs h-7 gap-1.5" onClick={stopTask} disabled={!busy}>
                <Square className="h-3 w-3" /> Stop Task
              </Button>
              <Button size="sm" variant="outline" className="border-zinc-600 text-zinc-300 hover:bg-white/5 font-mono text-xs h-7" onClick={closeSession}>
                Close
              </Button>
            </>
          ) : (
            <Button size="sm" className="bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs h-7 gap-1.5" onClick={createSession} disabled={creating || status?.configured !== true}>
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Agent Session
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[390px] shrink-0 flex flex-col border-r border-purple-500/15 bg-[#0c0c1a]">
          <Tabs defaultValue="run" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="m-3 mb-0 grid grid-cols-3 bg-black/40 border border-white/5 h-9">
              <TabsTrigger value="run" className="text-xs font-mono">Run</TabsTrigger>
              <TabsTrigger value="settings" className="text-xs font-mono">Settings</TabsTrigger>
              <TabsTrigger value="assets" className="text-xs font-mono">Assets</TabsTrigger>
            </TabsList>

            <TabsContent value="run" className="m-0 flex min-h-0 flex-1 flex-col">
              <div className="px-3 py-2 border-b border-white/5 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-white/5 bg-black/30 p-2">
                  <Cpu className="h-3.5 w-3.5 text-purple-300 mb-1" />
                  <div className="text-[10px] text-zinc-500 font-mono">Model</div>
                  <div className="text-[11px] text-white font-mono truncate">{model}</div>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/30 p-2">
                  <Wifi className="h-3.5 w-3.5 text-sky-300 mb-1" />
                  <div className="text-[10px] text-zinc-500 font-mono">Proxy</div>
                  <div className="text-[11px] text-white font-mono">{proxyCountryCode === "none" ? "off" : proxyCountryCode.toUpperCase()}</div>
                </div>
                <div className="rounded-lg border border-white/5 bg-black/30 p-2">
                  <DollarSign className="h-3.5 w-3.5 text-emerald-300 mb-1" />
                  <div className="text-[10px] text-zinc-500 font-mono">Cap</div>
                  <div className="text-[11px] text-white font-mono">${maxCostUsd || "auto"}</div>
                </div>
              </div>

              <ScrollArea className="flex-1 px-3 py-2">
                {logs.length === 0 && (
                  <div className="text-center py-8 space-y-2">
                    <Globe className="h-8 w-8 text-purple-400/30 mx-auto" />
                    <p className="text-[11px] text-gray-600 font-mono">
                      {agentMode === "cloudflare" ? "Enter a URL for our Cloudflare browser worker" : agentMode === "clawd" ? "Ask Solana Clawd to browse or research" : session ? "Type a task below to start" : "Start an agent session to begin"}
                    </p>
                  </div>
                )}
                {logs.map((l) => (
                  <div key={l.id} className="mb-2">
                    {l.kind === "user" && (
                      <div className="flex justify-end">
                        <div className="bg-purple-600/25 border border-purple-500/30 rounded-lg px-3 py-1.5 max-w-[90%]">
                          <p className="text-[12px] font-mono text-purple-200 whitespace-pre-wrap">{l.text}</p>
                        </div>
                      </div>
                    )}
                    {l.kind === "agent" && (
                      <div className="flex items-start gap-2">
                        <div className="h-5 w-5 rounded bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Bot className="h-3 w-3 text-orange-400" />
                        </div>
                        <div className="bg-white/5 rounded-lg px-3 py-1.5 max-w-[90%]">
                          <p className="text-[12px] font-mono text-gray-300 whitespace-pre-wrap">{l.text}</p>
                          {l.screenshotUrl && (
                            <button onClick={() => window.open(l.screenshotUrl, "_blank")} className="mt-1 inline-flex items-center gap-1 text-[10px] text-sky-300 hover:text-sky-200">
                              <Eye className="h-3 w-3" /> screenshot
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    {(l.kind === "status" || l.kind === "system") && (
                      <div className="flex items-center gap-2 py-0.5">
                        <div className="h-px flex-1 bg-white/5" />
                        <span className="text-[10px] font-mono text-gray-600 text-center max-w-[78%] truncate">{l.text}</span>
                        <div className="h-px flex-1 bg-white/5" />
                      </div>
                    )}
                    {l.kind === "error" && (
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                        <p className="text-[12px] font-mono text-red-400 whitespace-pre-wrap">{l.text}</p>
                      </div>
                    )}
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 py-1">
                    <Loader2 className="h-3.5 w-3.5 text-purple-400 animate-spin" />
                    <span className="text-[11px] font-mono text-purple-400">Agent working...</span>
                  </div>
                )}
                <div ref={logsEndRef} />
              </ScrollArea>

              <div className="p-3 border-t border-white/5">
                <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg border border-white/5 bg-black/40 p-1">
                  <button
                    type="button"
                    onClick={() => setAgentMode("cloudflare")}
                    className={`h-8 rounded-md text-[11px] font-mono transition-colors ${agentMode === "cloudflare" ? "bg-emerald-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Cloudflare
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentMode("clawd")}
                    className={`h-8 rounded-md text-[11px] font-mono transition-colors ${agentMode === "clawd" ? "bg-purple-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Solana Clawd
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgentMode("browser-use")}
                    className={`h-8 rounded-md text-[11px] font-mono transition-colors ${agentMode === "browser-use" ? "bg-sky-600 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
                  >
                    Direct Browser
                  </button>
                </div>
                {agentMode === "cloudflare" && (
                  <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg border border-white/5 bg-black/30 p-1">
                    {[
                      ["screenshot", "Screenshot"],
                      ["text", "Text"],
                      ["html", "HTML"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setCloudflareAction(value as "screenshot" | "text" | "html")}
                        className={`h-7 rounded-md text-[10px] font-mono transition-colors ${cloudflareAction === value ? "bg-emerald-500/20 text-emerald-200" : "text-zinc-500 hover:text-zinc-300"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-2">
                  <Textarea
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                    placeholder={agentMode === "cloudflare" ? "https://example.com" : agentMode === "clawd" ? "Ask Solana Clawd to search, browse, compare, or inspect a page..." : session ? "Give Browser Use a direct task..." : "Start a session first"}
                    disabled={(agentMode === "cloudflare" && !status?.cloudflareConfigured) || (agentMode === "browser-use" && !session) || busy}
                    className="min-h-[72px] bg-black/40 border-purple-500/25 text-white placeholder-gray-600 font-mono text-xs focus-visible:ring-purple-500/40 resize-none"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={(agentMode === "cloudflare" && !status?.cloudflareConfigured) || (agentMode === "browser-use" && !session) || !task.trim() || busy} className="flex-1 bg-purple-600 hover:bg-purple-500 text-white h-8 font-mono text-xs">
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Send className="h-3.5 w-3.5 mr-2" />}
                      Run
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={agentMode === "cloudflare" || (agentMode === "browser-use" && !session) || busy} onClick={() => setTask("wait")} className="h-8 border-zinc-700 text-zinc-300 font-mono text-xs">
                      Wait
                    </Button>
                  </div>
                </form>
                {!busy && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {QUICK_PROMPTS.map((p) => (
                      <button key={p} onClick={() => setTask(p)} className="text-[10px] font-mono text-gray-500 hover:text-purple-300 border border-white/5 hover:border-purple-500/30 rounded px-2 py-0.5 transition-colors">
                        {p.slice(0, 34)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="settings" className="m-0 flex-1 overflow-y-auto p-3 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase">Model</span>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger className="h-8 bg-black/40 border-white/10 text-xs font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MODELS.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase">Proxy</span>
                  <Select value={proxyCountryCode} onValueChange={setProxyCountryCode}>
                    <SelectTrigger className="h-8 bg-black/40 border-white/10 text-xs font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase">Max cost USD</span>
                  <Input value={maxCostUsd} onChange={(e) => setMaxCostUsd(e.target.value)} className="h-8 bg-black/40 border-white/10 text-xs font-mono" />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-zinc-500 font-mono uppercase">Cache script</span>
                  <Select value={cacheScript} onValueChange={(v: "auto" | "on" | "off") => setCacheScript(v)}>
                    <SelectTrigger className="h-8 bg-black/40 border-white/10 text-xs font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="on">Force on</SelectItem>
                      <SelectItem value="off">Force off</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              {[
                ["Use own key", useOwnKey, setUseOwnKey, Shield],
                ["Keep alive", keepAlive, setKeepAlive, Radio],
                ["Recording", enableRecording, setEnableRecording, Video],
                ["Auto-heal scripts", autoHeal, setAutoHeal, Zap],
                ["AgentMail", agentmail, setAgentmail, Send],
                ["Skills", skills, setSkills, HardDrive],
                ["Code mode", codeMode, setCodeMode, Terminal],
                ["Hide live chrome", hideChrome, setHideChrome, Monitor],
              ].map(([label, checked, setter, Icon]: any) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-3 py-2">
                  <span className="flex items-center gap-2 text-xs font-mono text-zinc-300"><Icon className="h-3.5 w-3.5 text-purple-300" />{label}</span>
                  <Switch checked={checked} onCheckedChange={setter} />
                </div>
              ))}

              <label className="space-y-1 block">
                <span className="text-[10px] text-zinc-500 font-mono uppercase">Output schema JSON</span>
                <Textarea value={schemaText} onChange={(e) => setSchemaText(e.target.value)} placeholder='{"type":"object","properties":{"price":{"type":"number"}}}' className="min-h-[100px] bg-black/40 border-white/10 text-xs font-mono" />
              </label>
            </TabsContent>

            <TabsContent value="assets" className="m-0 flex-1 overflow-y-auto p-3 space-y-3">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300 font-mono flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-purple-300" />Profiles</span>
                  <Button size="sm" variant="outline" onClick={createProfile} className="h-7 text-[10px] border-zinc-700">New</Button>
                </div>
                <Select value={profileId || "none"} onValueChange={(v) => setProfileId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 bg-black/40 border-white/10 text-xs font-mono"><SelectValue placeholder="No profile" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No profile</SelectItem>
                    {profiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.name || p.id.slice(0, 8)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {profileId && <p className="text-[10px] text-zinc-600 font-mono break-all">{profileId}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300 font-mono flex items-center gap-2"><Folder className="h-3.5 w-3.5 text-purple-300" />Workspaces</span>
                  <Button size="sm" variant="outline" onClick={createWorkspace} className="h-7 text-[10px] border-zinc-700">New</Button>
                </div>
                <Select value={workspaceId || "none"} onValueChange={(v) => setWorkspaceId(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 bg-black/40 border-white/10 text-xs font-mono"><SelectValue placeholder="No workspace" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No workspace</SelectItem>
                    {workspaces.map((w) => <SelectItem key={w.id} value={w.id}>{w.name || w.id.slice(0, 8)}</SelectItem>)}
                  </SelectContent>
                </Select>
                {workspaceId && <p className="text-[10px] text-zinc-600 font-mono break-all">{workspaceId}</p>}
              </div>

              <div className="rounded-lg border border-white/5 bg-black/30 p-3 space-y-2">
                <div className="text-xs text-zinc-300 font-mono">Standalone Browser</div>
                <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">Create a raw stealth browser for Playwright/Puppeteer via CDP, separate from the agent session.</p>
                <div className="flex gap-2">
                  {!browser ? (
                    <Button size="sm" onClick={createRawBrowser} disabled={creating} className="h-8 bg-sky-600 hover:bg-sky-500 text-xs font-mono flex-1">
                      {creating ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Globe className="h-3 w-3 mr-2" />} Start Browser
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={closeBrowser} className="h-8 border-red-500/30 text-red-300 text-xs font-mono flex-1">Stop Browser</Button>
                  )}
                </div>
                {browser?.cdpUrl && <p className="text-[10px] text-sky-300 font-mono break-all">{browser.cdpUrl}</p>}
              </div>

              <div className="rounded-lg border border-purple-500/15 bg-purple-500/5 p-3 space-y-2">
                <div className="text-xs text-zinc-300 font-mono">Cloudflare Browser Run</div>
                <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">
                  First-party screenshot and extraction worker. Configure `CLOUDFLARE_BROWSER_WORKER_URL` and `CLOUDFLARE_BROWSER_WORKER_TOKEN` on the server.
                </p>
                <div className="flex items-center gap-2">
                  <Badge className={`${status?.cloudflareConfigured ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-yellow-500/10 text-yellow-300 border-yellow-500/30"} text-[10px] font-mono`}>
                    {status?.cloudflareConfigured ? "configured" : "not configured"}
                  </Badge>
                </div>
              </div>

              <div className="rounded-lg border border-purple-500/15 bg-purple-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-zinc-300 font-mono">Solana Clawd CDP Profile</div>
                  <Button size="sm" variant="outline" onClick={() => copyText(SOLANA_CLAWD_CDP_PROFILE, "Solana Clawd CDP profile copied")} className="h-7 text-[10px] border-purple-500/30 text-purple-300">
                    <Copy className="h-3 w-3 mr-1" /> Copy
                  </Button>
                </div>
                <p className="text-[10px] text-zinc-600 font-mono leading-relaxed">
                  Use this Solana Clawd profile when wiring a private operator to Browser Use CDP. Keep the expanded API key out of public repos.
                </p>
                <pre className="max-h-44 overflow-auto rounded-md border border-white/5 bg-black/40 p-2 text-[10px] leading-relaxed text-zinc-400 font-mono whitespace-pre-wrap">{SOLANA_CLAWD_CDP_PROFILE}</pre>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex-1 flex flex-col bg-black overflow-hidden">
          {activeLiveUrl ? (
            <iframe
              key={iframeKey}
              src={liveUrlWithOptions(activeLiveUrl, hideChrome)}
              className="w-full flex-1 border-0"
              allow="autoplay; clipboard-read; clipboard-write"
              title="Live Browser"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
              <div className="text-center space-y-3 max-w-sm">
                <div className="h-20 w-20 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mx-auto">
                  <Globe className="h-10 w-10 text-purple-400/60" />
                </div>
                <h3 className="text-lg font-bold text-white font-mono">No Active Browser</h3>
                <p className="text-sm text-gray-500 font-mono leading-relaxed">
                  Start an agent session for natural-language web automation, or start a raw browser for CDP automation and human-in-the-loop flows.
                </p>
              </div>
              <div className="grid grid-cols-4 gap-3 text-center w-full max-w-md">
                {[
                  { icon: Zap, label: "Stealth", desc: "Anti-detect" },
                  { icon: Wifi, label: "Proxies", desc: "195+ countries" },
                  { icon: Video, label: "Recording", desc: "MP4 output" },
                  { icon: HardDrive, label: "Profiles", desc: "Saved auth" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="bg-white/3 border border-white/5 rounded-xl p-3">
                    <Icon className="h-4 w-4 text-purple-400 mx-auto mb-1" />
                    <div className="text-[11px] font-mono text-white">{label}</div>
                    <div className="text-[10px] font-mono text-gray-600">{desc}</div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button onClick={createSession} disabled={creating || status?.configured !== true} className="bg-purple-600 hover:bg-purple-500 text-white font-mono flex items-center gap-2">
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Agent Session
                </Button>
                <Button onClick={createRawBrowser} disabled={creating || status?.configured !== true} variant="outline" className="border-sky-500/30 text-sky-300 hover:bg-sky-500/10 font-mono flex items-center gap-2">
                  <Globe className="h-4 w-4" /> Raw Browser
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
