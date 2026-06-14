import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Bot,
  Box,
  Play,
  Pause,
  Trash2,
  Terminal,
  Plus,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  GitBranch,
  FileText,
  Code,
  Radio,
  Pin,
} from "lucide-react";

interface AgentTemplate {
  id: string;
  title: string;
  description: string;
  avatar: string;
  category: string;
  tags: string[];
  featured: boolean;
  oneShot: boolean;
  openingMessage: string;
  openingQuestions: string[];
  systemRole: string;
}

interface BoxInfo {
  id: string;
  name?: string;
  status: string;
  size: string;
  runtime: string;
  pinned?: boolean;
}

const RUNTIMES = ["node", "node-alpine", "python", "python-alpine", "golang", "ruby", "rust"];
const SIZES = ["small", "medium", "large"];
const AGENT_HARNESSES = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "OpenAI Codex" },
  { value: "opencode", label: "OpenCode" },
];
const CLAUDE_MODELS = [
  "anthropic/claude-sonnet-4-6",
  "anthropic/claude-opus-4-6",
  "anthropic/claude-haiku-4-5",
];
const OPENAI_MODELS = ["openai/gpt-5.3-codex", "openai/gpt-5.4", "openai/gpt-5.4-mini"];
const CODE_LANGS = ["js", "ts", "python", "go", "ruby", "rust", "bash"];

const STATUS_DOT: Record<string, string> = {
  running: "bg-green-500",
  paused: "bg-yellow-500",
  created: "bg-blue-500",
  deleted: "bg-red-500",
};

function post<T = unknown>(url: string, body?: unknown): Promise<T> {
  return apiRequest<T>(url, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function del<T = unknown>(url: string): Promise<T> {
  return apiRequest<T>(url, { method: "DELETE" });
}

function get<T = unknown>(url: string): Promise<T> {
  return apiRequest<T>(url);
}

// ── Per-box panel ─────────────────────────────────────────────────────────────

function BoxPanel({ box, harness, model }: { box: BoxInfo; harness: string; model: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [runPrompt, setRunPrompt] = useState("");
  const [streamPrompt, setStreamPrompt] = useState("");
  const [execCmd, setExecCmd] = useState("");
  const [codeLang, setCodeLang] = useState("js");
  const [codeSnippet, setCodeSnippet] = useState("");
  const [gitRepo, setGitRepo] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [prTitle, setPrTitle] = useState("");
  const [prBase, setPrBase] = useState("main");
  const [filePath, setFilePath] = useState("/work");
  const [fileWritePath, setFileWritePath] = useState("config.json");
  const [fileContent, setFileContent] = useState("");
  const [output, setOutput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const streamText = useRef("");

  const id = box.id;

  const runMut = useMutation({
    mutationFn: (p: string) =>
      post<{ result: unknown; cost?: unknown }>(`/api/boxes/${id}/run`, {
        prompt: p,
        agentHarness: harness,
        agentModel: model,
      }),
    onSuccess: (d: any) => setOutput(typeof d.result === "string" ? d.result : JSON.stringify(d.result, null, 2)),
    onError: (e: any) => setOutput(`Error: ${e.message}`),
  });

  const execMut = useMutation({
    mutationFn: (cmd: string) => post<{ result: string }>(`/api/boxes/${id}/exec`, { command: cmd }),
    onSuccess: (d: any) => setOutput(d.result ?? d.error ?? "(empty)"),
    onError: (e: any) => setOutput(`Error: ${e.message}`),
  });

  const codeMut = useMutation({
    mutationFn: ({ code, lang }: { code: string; lang: string }) =>
      post<{ result: string; exitCode?: number }>(`/api/boxes/${id}/exec-code`, { code, lang }),
    onSuccess: (d: any) => setOutput(d.result ?? d.error ?? "(empty)"),
    onError: (e: any) => setOutput(`Error: ${e.message}`),
  });

  const cloneMut = useMutation({
    mutationFn: ({ repo, token }: { repo: string; token?: string }) =>
      post(`/api/boxes/${id}/git/clone`, { repo, token }),
    onSuccess: () => { setOutput("Repo cloned."); toast({ title: "Cloned" }); },
    onError: (e: any) => setOutput(`Error: ${e.message}`),
  });

  const prMut = useMutation({
    mutationFn: ({ title, base, token }: { title: string; base: string; token?: string }) =>
      post<{ url: string; number: number }>(`/api/boxes/${id}/git/pr`, { title, base, token }),
    onSuccess: (d: any) => { setOutput(`PR ready: ${d.url}`); toast({ title: "PR created", description: d.url }); },
    onError: (e: any) => setOutput(`Error: ${e.message}`),
  });

  const diffMut = useMutation({
    mutationFn: () => get<{ diff: string }>(`/api/boxes/${id}/git/diff`),
    onSuccess: (d: any) => setOutput(d.diff || "(no diff)"),
    onError: (e: any) => setOutput(`Error: ${e.message}`),
  });

  const listFilesMut = useMutation({
    mutationFn: (p: string) => get<{ files: unknown[] }>(`/api/boxes/${id}/files?path=${encodeURIComponent(p)}`),
    onSuccess: (d: any) => setOutput(JSON.stringify(d.files, null, 2)),
    onError: (e: any) => setOutput(`Error: ${e.message}`),
  });

  const readFileMut = useMutation({
    mutationFn: (p: string) => get<{ content: string }>(`/api/boxes/${id}/files/read?path=${encodeURIComponent(p)}`),
    onSuccess: (d: any) => setOutput(d.content),
    onError: (e: any) => setOutput(`Error: ${e.message}`),
  });

  const writeFileMut = useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      post(`/api/boxes/${id}/files/write`, { path, content }),
    onSuccess: () => { setOutput("File written."); toast({ title: "File written" }); },
    onError: (e: any) => setOutput(`Error: ${e.message}`),
  });

  const pauseMut = useMutation({
    mutationFn: () => post(`/api/boxes/${id}/pause`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/boxes"] }),
  });

  const resumeMut = useMutation({
    mutationFn: () => post(`/api/boxes/${id}/resume`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/boxes"] }),
  });

  const deleteMut = useMutation({
    mutationFn: () => del(`/api/boxes/${id}`),
    onSuccess: () => { toast({ title: "Box deleted" }); qc.invalidateQueries({ queryKey: ["/api/boxes"] }); },
  });

  function startStream() {
    if (!streamPrompt.trim()) return;
    setStreaming(true);
    streamText.current = "";
    setOutput("");

    const ctrl = new AbortController();
    fetch(`/api/boxes/${id}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: streamPrompt, agentHarness: harness, agentModel: model }),
      signal: ctrl.signal,
    }).then(async (res) => {
      const reader = res.body?.getReader();
      const dec = new TextDecoder();
      if (!reader) return;
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "text") {
              streamText.current += ev.text;
              setOutput(streamText.current);
            } else if (ev.type === "done" || ev.type === "error") {
              setStreaming(false);
            }
          } catch {}
        }
      }
      setStreaming(false);
    }).catch(() => setStreaming(false));
  }

  const busy = runMut.isPending || execMut.isPending || codeMut.isPending ||
    cloneMut.isPending || prMut.isPending || diffMut.isPending ||
    listFilesMut.isPending || readFileMut.isPending || writeFileMut.isPending || streaming;

  return (
    <div className="space-y-3 pt-1">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${STATUS_DOT[box.status] || "bg-gray-400"}`} />
          <span className="text-xs text-muted-foreground capitalize">{box.status} · {box.runtime} · {box.size}</span>
          {box.pinned && <Badge variant="outline" className="text-[10px] px-1 py-0 gap-1"><Pin className="w-2.5 h-2.5" />openclawd</Badge>}
        </div>
        <div className="flex gap-1">
          {box.status === "running"
            ? <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => pauseMut.mutate()}><Pause className="w-3 h-3" /></Button>
            : <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => resumeMut.mutate()}><Play className="w-3 h-3" /></Button>}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-destructive hover:text-destructive" onClick={() => deleteMut.mutate()}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </div>

      <Tabs defaultValue="agent">
        <TabsList className="h-7 text-xs">
          <TabsTrigger value="agent" className="h-6 text-xs gap-1"><Bot className="w-3 h-3" />Agent</TabsTrigger>
          <TabsTrigger value="stream" className="h-6 text-xs gap-1"><Radio className="w-3 h-3" />Stream</TabsTrigger>
          <TabsTrigger value="shell" className="h-6 text-xs gap-1"><Terminal className="w-3 h-3" />Shell</TabsTrigger>
          <TabsTrigger value="code" className="h-6 text-xs gap-1"><Code className="w-3 h-3" />Code</TabsTrigger>
          <TabsTrigger value="git" className="h-6 text-xs gap-1"><GitBranch className="w-3 h-3" />Git</TabsTrigger>
          <TabsTrigger value="files" className="h-6 text-xs gap-1"><FileText className="w-3 h-3" />Files</TabsTrigger>
        </TabsList>

        {/* Agent run */}
        <TabsContent value="agent" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <Input
              id={`run-${id}`}
              placeholder="Prompt the agent..."
              value={runPrompt}
              onChange={(e) => setRunPrompt(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runMut.mutate(runPrompt); }}}
            />
            <Button size="sm" className="h-8 shrink-0" disabled={busy} onClick={() => runMut.mutate(runPrompt)}>
              {runMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </TabsContent>

        {/* Agent stream */}
        <TabsContent value="stream" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <Input
              id={`stream-${id}`}
              placeholder="Stream agent output..."
              value={streamPrompt}
              onChange={(e) => setStreamPrompt(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); startStream(); }}}
            />
            <Button size="sm" className="h-8 shrink-0" disabled={busy} onClick={startStream}>
              {streaming ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5" />}
            </Button>
          </div>
          {streaming && <p className="text-[11px] text-muted-foreground animate-pulse">Streaming…</p>}
        </TabsContent>

        {/* Shell */}
        <TabsContent value="shell" className="space-y-2 mt-2">
          <div className="flex gap-2">
            <Input
              id={`exec-${id}`}
              placeholder="node --version"
              value={execCmd}
              onChange={(e) => setExecCmd(e.target.value)}
              className="h-8 text-sm font-mono"
              onKeyDown={(e) => { if (e.key === "Enter") execMut.mutate(execCmd); }}
            />
            <Button size="sm" variant="outline" className="h-8 shrink-0" disabled={busy} onClick={() => execMut.mutate(execCmd)}>
              {execMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Terminal className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </TabsContent>

        {/* Code execution */}
        <TabsContent value="code" className="space-y-2 mt-2">
          <div className="flex gap-2 items-center">
            <label htmlFor={`codelang-${id}`} className="text-xs text-muted-foreground shrink-0">Lang</label>
            <Select value={codeLang} onValueChange={setCodeLang}>
              <SelectTrigger id={`codelang-${id}`} className="w-24 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CODE_LANGS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            id={`code-${id}`}
            placeholder={`console.log('Hello from box ${id}');`}
            value={codeSnippet}
            onChange={(e) => setCodeSnippet(e.target.value)}
            rows={4}
            className="text-xs font-mono resize-none"
          />
          <Button size="sm" disabled={busy} onClick={() => codeMut.mutate({ code: codeSnippet, lang: codeLang })}>
            {codeMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Run
          </Button>
        </TabsContent>

        {/* Git */}
        <TabsContent value="git" className="space-y-3 mt-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Clone repo</p>
            <Input
              id={`gitrepo-${id}`}
              placeholder="https://github.com/clawdsolana/openclawd"
              value={gitRepo}
              onChange={(e) => setGitRepo(e.target.value)}
              className="h-8 text-sm"
            />
            <Input
              id={`gittoken-${id}`}
              placeholder="GitHub token (optional)"
              type="password"
              value={gitToken}
              onChange={(e) => setGitToken(e.target.value)}
              className="h-8 text-sm"
            />
            <Button size="sm" disabled={busy} onClick={() => cloneMut.mutate({ repo: gitRepo, token: gitToken || undefined })}>
              {cloneMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <GitBranch className="w-3.5 h-3.5 mr-1" />}
              Clone
            </Button>
          </div>

          <div className="space-y-2 border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground">Create PR</p>
            <Input
              id={`prtitle-${id}`}
              placeholder="Fix password reset flow"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              className="h-8 text-sm"
            />
            <Input
              id={`prbase-${id}`}
              placeholder="main"
              value={prBase}
              onChange={(e) => setPrBase(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => prMut.mutate({ title: prTitle, base: prBase, token: gitToken || undefined })}>
                {prMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <GitBranch className="w-3.5 h-3.5 mr-1" />}
                Open PR
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => diffMut.mutate()}>
                {diffMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
                View diff
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Files */}
        <TabsContent value="files" className="space-y-3 mt-2">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">List / Read</p>
            <div className="flex gap-2">
              <Input
                id={`filepath-${id}`}
                placeholder="/work"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                className="h-8 text-sm font-mono"
              />
              <Button size="sm" variant="outline" disabled={busy} onClick={() => listFilesMut.mutate(filePath)}>
                {listFilesMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "ls"}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => readFileMut.mutate(filePath)}>
                {readFileMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "cat"}
              </Button>
            </div>
          </div>

          <div className="space-y-2 border-t pt-2">
            <p className="text-xs font-medium text-muted-foreground">Write file</p>
            <Input
              id={`fwpath-${id}`}
              placeholder="config.json"
              value={fileWritePath}
              onChange={(e) => setFileWritePath(e.target.value)}
              className="h-8 text-sm font-mono"
            />
            <Textarea
              id={`fwcontent-${id}`}
              placeholder='{"key": "value"}'
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              rows={3}
              className="text-xs font-mono resize-none"
            />
            <Button size="sm" disabled={busy} onClick={() => writeFileMut.mutate({ path: fileWritePath, content: fileContent })}>
              {writeFileMut.isPending ? <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" /> : <FileText className="w-3.5 h-3.5 mr-1" />}
              Write
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Output terminal */}
      {output && (
        <pre className="bg-black/80 rounded-md p-3 font-mono text-xs text-green-400 max-h-52 overflow-y-auto whitespace-pre-wrap">
          {output}
        </pre>
      )}

      <p className="text-[10px] text-muted-foreground font-mono">ID: {id}</p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BoxesPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedAgent, setSelectedAgent] = useState<AgentTemplate | null>(null);
  const [runtime, setRuntime] = useState("node");
  const [size, setSize] = useState("small");
  const [boxName, setBoxName] = useState("");
  const [harness, setHarness] = useState("claude-code");
  const [model, setModel] = useState("anthropic/claude-sonnet-4-6");
  const [initPrompt, setInitPrompt] = useState("");
  const [gitRepo, setGitRepo] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedBoxes, setExpandedBoxes] = useState<Set<string>>(new Set());

  const { data: agentsData, isLoading: agentsLoading } = useQuery<{ agents: AgentTemplate[] }>({
    queryKey: ["/api/boxes/agents"],
  });

  const { data: boxesData, isLoading: boxesLoading, refetch: refetchBoxes } = useQuery<{
    boxes: BoxInfo[];
    openclawdBoxId: string;
  }>({
    queryKey: ["/api/boxes"],
    refetchInterval: 20000,
  });

  const createMut = useMutation({
    mutationFn: (body: unknown) => post<{ box: BoxInfo; runResult?: unknown }>("/api/boxes/create", body),
    onSuccess: (data: any) => {
      if (data.error) {
        toast({ title: "Deploy failed", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Box deployed!", description: `ID: ${data.box.id}` });
        qc.invalidateQueries({ queryKey: ["/api/boxes"] });
        setInitPrompt("");
        setBoxName("");
      }
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const agents = agentsData?.agents ?? [];
  const rawBoxes = boxesData?.boxes ?? [];
  const openclawdId = boxesData?.openclawdBoxId ?? "capital-sole-06685";

  // Always show openclawd box first, pinned
  const boxes: BoxInfo[] = [
    ...(rawBoxes.find((b) => b.id === openclawdId)
      ? []
      : [{ id: openclawdId, name: "openclawd", status: "unknown", size: "small", runtime: "node", pinned: true }]),
    ...rawBoxes.map((b) => ({ ...b, pinned: b.id === openclawdId })),
  ];

  const categories = ["all", ...Array.from(new Set(agents.map((a) => a.category)))];
  const filteredAgents = agents.filter((a) => {
    const matchCat = categoryFilter === "all" || a.category === categoryFilter;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q || a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q));
    return matchCat && matchSearch;
  });

  function toggleExpand(id: string) {
    setExpandedBoxes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function deployBox(agentTemplate?: AgentTemplate) {
    const agent = agentTemplate ?? selectedAgent;
    createMut.mutate({
      runtime,
      size,
      name: boxName || undefined,
      agentId: agent?.id,
      agentHarness: harness,
      agentModel: model,
      prompt: initPrompt || undefined,
      gitRepo: gitRepo || undefined,
      gitToken: gitToken || undefined,
    });
  }

  return (
    <div className="container py-8 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <Box className="w-8 h-8" /> Upstash Box — Agent Cloud
        </h1>
        <p className="text-muted-foreground">
          Deploy isolated containers with Claude Code, stream output, exec code, clone repos, and manage files — all from here.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent catalog */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Bot className="w-5 h-5" /> Agent Catalog
                <Badge variant="secondary">{agents.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Input
                  id="catalog-search"
                  placeholder="Search agents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 min-w-[160px] h-8 text-sm"
                />
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[130px] h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {agentsLoading ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading agents…</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[440px] overflow-y-auto pr-1">
                  {filteredAgents.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedAgent(selectedAgent?.id === a.id ? null : a)}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors text-left w-full ${
                        selectedAgent?.id === a.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xl">{a.avatar}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{a.title}</p>
                            <p className="text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          {a.featured && <Badge variant="secondary" className="text-[10px] px-1 py-0">featured</Badge>}
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{a.category}</Badge>
                        </div>
                      </div>
                      {selectedAgent?.id === a.id && (
                        <Button
                          size="sm"
                          className="mt-2 w-full h-7 text-xs"
                          onClick={(e) => { e.stopPropagation(); deployBox(a); }}
                          disabled={createMut.isPending}
                        >
                          <Zap className="w-3 h-3 mr-1" /> Deploy this agent
                        </Button>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Deploy form */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-5 h-5" /> Deploy New Box
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="box-name" className="text-xs text-muted-foreground">Box name (optional)</label>
                <Input id="box-name" placeholder="my-agent-box" value={boxName} onChange={(e) => setBoxName(e.target.value)} className="h-8 text-sm" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="box-runtime" className="text-xs text-muted-foreground">Runtime</label>
                  <Select value={runtime} onValueChange={setRuntime}>
                    <SelectTrigger id="box-runtime" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{RUNTIMES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="box-size" className="text-xs text-muted-foreground">Size</label>
                  <Select value={size} onValueChange={setSize}>
                    <SelectTrigger id="box-size" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="box-harness" className="text-xs text-muted-foreground">Agent harness</label>
                <Select value={harness} onValueChange={(v) => { setHarness(v); setModel(v === "codex" ? OPENAI_MODELS[0] : CLAUDE_MODELS[0]); }}>
                  <SelectTrigger id="box-harness" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{AGENT_HARNESSES.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="box-model" className="text-xs text-muted-foreground">Model</label>
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger id="box-model" className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{(harness === "codex" ? OPENAI_MODELS : CLAUDE_MODELS).map((m) => <SelectItem key={m} value={m}>{m.split("/")[1]}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label htmlFor="box-git-repo" className="text-xs text-muted-foreground">Clone repo on start (optional)</label>
                <Input id="box-git-repo" placeholder="https://github.com/clawdsolana/openclawd" value={gitRepo} onChange={(e) => setGitRepo(e.target.value)} className="h-8 text-sm" />
              </div>

              <div className="space-y-1">
                <label htmlFor="box-git-token" className="text-xs text-muted-foreground">GitHub token (optional)</label>
                <Input id="box-git-token" type="password" placeholder="ghp_..." value={gitToken} onChange={(e) => setGitToken(e.target.value)} className="h-8 text-sm" />
              </div>

              {selectedAgent && (
                <div className="p-2 rounded-md bg-primary/10 border border-primary/20 text-xs">
                  <span className="font-medium">{selectedAgent.avatar} {selectedAgent.title}</span>
                  <p className="text-muted-foreground mt-0.5">System role will be injected</p>
                </div>
              )}

              <div className="space-y-1">
                <label htmlFor="box-init-prompt" className="text-xs text-muted-foreground">Initial prompt (optional)</label>
                <Textarea id="box-init-prompt" placeholder="Run after deploy…" value={initPrompt} onChange={(e) => setInitPrompt(e.target.value)} rows={2} className="text-sm resize-none" />
              </div>

              <Button className="w-full" onClick={() => deployBox()} disabled={createMut.isPending}>
                {createMut.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                Deploy Box
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Active boxes */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Terminal className="w-5 h-5" /> Active Boxes
            <Badge variant="secondary">{boxes.length}</Badge>
          </h2>
          <Button variant="outline" size="sm" onClick={() => refetchBoxes()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>

        {boxesLoading ? (
          <p className="text-sm text-muted-foreground">Loading boxes…</p>
        ) : boxes.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg">
            <Box className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No boxes deployed yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {boxes.map((box) => {
              const expanded = expandedBoxes.has(box.id);
              return (
                <Card key={box.id} className={box.pinned ? "border-primary/40" : ""}>
                  <CardHeader className="py-3 px-4">
                    <button
                      type="button"
                      className="flex items-center justify-between gap-2 w-full text-left"
                      onClick={() => toggleExpand(box.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[box.status] || "bg-gray-400"}`} />
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-medium truncate flex items-center gap-1.5">
                            {box.pinned && <Pin className="w-3 h-3 text-primary shrink-0" />}
                            {box.name || box.id}
                          </p>
                          <p className="text-xs text-muted-foreground">{box.runtime} · {box.size}</p>
                        </div>
                      </div>
                      {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>
                  </CardHeader>

                  {expanded && (
                    <CardContent className="pt-0 pb-4 px-4">
                      <BoxPanel box={box} harness={harness} model={model} />
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
