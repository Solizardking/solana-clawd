import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import ReactMarkdown from "react-markdown";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { VoiceToPrompt } from "@/components/VoiceToPrompt";
import { xaiVoice } from "@/lib/xaiVoice";
import {
  ArrowLeft,
  Bot,
  Brain,
  Briefcase,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Database,
  FileImage,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Pin,
  Radio,
  RefreshCw,
  Search,
  Send,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Volume2,
  Wand2,
  Wrench,
  Zap,
} from "lucide-react";

type Mode = "chat" | "search" | "files" | "code" | "image" | "edit" | "video" | "voice" | "trade" | "multi";
type Effort = "none" | "low" | "medium" | "high" | "xhigh";

type Turn = {
  id: string;
  role: "user" | "assistant";
  mode: Mode;
  content: string;
  media?: MediaItem[];
  tools?: ToolEvent[];
};

type UploadRef = {
  id: string;
  name: string;
  type: "image" | "video";
  url?: string;
  fileId?: string;
};

type DocumentRef = {
  id: string;
  name: string;
  contentType: string;
  fileId?: string;
  status: "uploading" | "ready" | "error";
  error?: string;
};

type XaiRef = {
  url?: string;
  file_id?: string;
};

type MediaItem = {
  type: "image" | "video";
  url?: string;
  b64_json?: string;
  publicUrl?: string;
  fileId?: string;
  filename?: string;
};

type ToolEvent = {
  id: string;
  name: string;
  args?: unknown;
  result?: string;
};

type CodeBlock = {
  language: string;
  code: string;
};

const MODELS = [
  { id: "grok-4.3", label: "Grok 4.3" },
  { id: "grok-4.20-multi-agent", label: "Multi-agent" },
  { id: "grok-4", label: "Grok 4 Vision" },
  { id: "grok-3-fast-latest", label: "Grok 3 Fast" },
  { id: "grok-3-mini-fast-beta", label: "Mini Fast" },
];

const MODES: Array<{ id: Mode; label: string; icon: typeof Sparkles }> = [
  { id: "chat", label: "Chat", icon: Sparkles },
  { id: "search", label: "Search", icon: Search },
  { id: "files", label: "Files", icon: FileText },
  { id: "code", label: "Code", icon: Code2 },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "edit", label: "Edit", icon: Wand2 },
  { id: "video", label: "Video", icon: Video },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "trade", label: "Trade", icon: Briefcase },
  { id: "multi", label: "Agents", icon: Bot },
];

const PINNABLE_AGENTS = [
  { id: "market", label: "Market Scout", detail: "trends, news, movers" },
  { id: "risk", label: "Risk Sentinel", detail: "liquidity, holders, slippage" },
  { id: "route", label: "Route Builder", detail: "Jupiter and DFlow quotes" },
  { id: "media", label: "Imagine Director", detail: "images, edits, video refs" },
  { id: "onchain", label: "On-chain Analyst", detail: "wallets, mints, Helius" },
];

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "auto"];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function mediaSrc(item: MediaItem) {
  return item.publicUrl || item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : "");
}

function cleanFilename(prefix: string, ext: "png" | "mp4") {
  return `${prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}.${ext}`;
}

function fileIdsFromText(value: string) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.startsWith("file_"));
}

function collectionIdsFromText(value: string) {
  return value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.startsWith("collection_"));
}

function extractCodeBlocks(markdown: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const re = /```([\w.+-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    blocks.push({ language: match[1] || "text", code: match[2].replace(/\n$/, "") });
  }
  return blocks;
}

function highlightCode(code: string, language: string) {
  const keywords = new Set([
    "async", "await", "break", "case", "catch", "class", "const", "continue", "def", "else",
    "export", "finally", "for", "from", "function", "if", "import", "in", "let", "return",
    "try", "type", "while", "interface", "public", "private", "new", "throw", "true", "false",
  ]);
  const parts = code.split(/(\b[A-Za-z_][A-Za-z0-9_]*\b|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|`(?:\\.|[^`])*`|\/\/.*|#.*|\/\*[\s\S]*?\*\/|\d+(?:\.\d+)?)/g);
  return parts.map((part, index) => {
    if (!part) return null;
    const key = `${index}-${part}`;
    if (/^["'`]/.test(part)) return <span key={key} className="text-emerald-300">{part}</span>;
    if (/^(\/\/|#|\/\*)/.test(part)) return <span key={key} className="text-zinc-500">{part}</span>;
    if (/^\d/.test(part)) return <span key={key} className="text-amber-300">{part}</span>;
    if (keywords.has(part) || (language === "python" && ["None", "True", "False"].includes(part))) {
      return <span key={key} className="text-cyan-300">{part}</span>;
    }
    return <span key={key}>{part}</span>;
  });
}

function SyntaxBlock({ language, code }: CodeBlock) {
  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-zinc-800 bg-black/70 p-3 text-[11px] leading-relaxed text-zinc-200">
      <code>{highlightCode(code, language)}</code>
    </pre>
  );
}

function CodePreview({ blocks }: { blocks: CodeBlock[] }) {
  const block = blocks[0];
  if (!block) return null;
  const canPreview = ["html", "htm"].includes(block.language.toLowerCase());
  return (
    <div className="mt-3 rounded-md border border-cyan-500/20 bg-black/40 p-2">
      <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-cyan-200">
        <Code2 className="h-3.5 w-3.5" />
        Live Code Preview
      </div>
      {canPreview ? (
        <iframe
          title="Grok code preview"
          sandbox="allow-scripts"
          srcDoc={block.code}
          className="h-64 w-full rounded border border-zinc-800 bg-white"
        />
      ) : (
        <SyntaxBlock {...block} />
      )}
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        code({ inline, className, children, ...props }: any) {
          const language = /language-(\w+)/.exec(className || "")?.[1] || "text";
          const code = String(children).replace(/\n$/, "");
          if (inline) return <code className={className} {...props}>{children}</code>;
          return <SyntaxBlock language={language} code={code} />;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

async function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function readSse(
  response: Response,
  onEvent: (event: string, data: any) => void,
) {
  if (!response.body) throw new Error("Response body unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n");
      let event = "message";
      let dataText = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataText += line.slice(5).trim();
      }
      if (!dataText || dataText === "[DONE]") continue;
      try {
        onEvent(event, JSON.parse(dataText));
      } catch {
        onEvent(event, dataText);
      }
    }
  }
}

export default function ClawdGrokPage() {
  const { toast } = useToast();
  const { publicKey } = useWallet();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const collectionDocInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<{ configured: boolean; managementConfigured?: boolean; model?: string; message?: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("chat");
  const [model, setModel] = useState("grok-4.3");
  const [effort, setEffort] = useState<Effort>("low");
  const [aspect, setAspect] = useState("1:1");
  const [resolution, setResolution] = useState<"1k" | "2k">("1k");
  const [videoResolution, setVideoResolution] = useState<"480p" | "720p">("720p");
  const [duration, setDuration] = useState(6);
  const [variants, setVariants] = useState(1);
  const [persistOutputs, setPersistOutputs] = useState(true);
  const [publicUrls, setPublicUrls] = useState(true);
  const [uploads, setUploads] = useState<UploadRef[]>([]);
  const [documents, setDocuments] = useState<DocumentRef[]>([]);
  const [fileRefText, setFileRefText] = useState("");
  const [collectionIdText, setCollectionIdText] = useState("");
  const [collectionName, setCollectionName] = useState("clawd-grok-notes");
  const [collectionFieldsText, setCollectionFieldsText] = useState('[{"key":"title","inject_into_chunk":true},{"key":"kind"},{"key":"year"}]');
  const [collectionDocFieldsText, setCollectionDocFieldsText] = useState('{"title":"Clawd note","kind":"research"}');
  const [pinnedAgents, setPinnedAgents] = useState<string[]>(["market", "risk", "route"]);
  const [usePromptCache, setUsePromptCache] = useState(true);
  const [promptCacheKey, setPromptCacheKey] = useState("");
  const [compactionItems, setCompactionItems] = useState<any[]>([]);
  const [compactionStatus, setCompactionStatus] = useState("");
  const [lastResponseId, setLastResponseId] = useState("");
  const [voiceId, setVoiceId] = useState("eve");
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveListening, setLiveListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [videoJobs, setVideoJobs] = useState<Record<string, { status: string; turnId: string }>>({});

  const fileIds = useMemo(() => fileIdsFromText(fileRefText), [fileRefText]);
  const collectionIds = useMemo(() => collectionIdsFromText(collectionIdText), [collectionIdText]);
  const documentFileIds = useMemo(() => documents.map((document) => document.fileId).filter(Boolean) as string[], [documents]);
  const selectedAgentLabels = useMemo(
    () => PINNABLE_AGENTS.filter((agent) => pinnedAgents.includes(agent.id)).map((agent) => agent.label),
    [pinnedAgents],
  );
  const activePromptCacheKey = useMemo(() => {
    if (!usePromptCache) return undefined;
    const explicit = promptCacheKey.trim();
    if (explicit) return explicit;
    const wallet = publicKey?.toBase58() || "local";
    return `clawd-grok-${wallet.slice(0, 16)}-${mode}`;
  }, [mode, promptCacheKey, publicKey, usePromptCache]);

  useEffect(() => {
    fetch("/api/xai/status", { credentials: "include" })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false, message: "Status unavailable" }));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  useEffect(() => () => {
    recognitionRef.current?.stop?.();
    xaiVoice.stop();
  }, []);

  const appendAssistant = (turn: Turn) => {
    setTurns((prev) => [...prev, turn]);
  };

  const patchTurn = (id: string, patch: Partial<Turn> | ((turn: Turn) => Turn)) => {
    setTurns((prev) =>
      prev.map((turn) => {
        if (turn.id !== id) return turn;
        return typeof patch === "function" ? patch(turn) : { ...turn, ...patch };
      }),
    );
  };

  const referencePayload = (): XaiRef[] => {
    const refs = [
      ...uploads.map((upload): XaiRef => upload.fileId ? { file_id: upload.fileId } : { url: upload.url }),
      ...fileIds.map((file_id): XaiRef => ({ file_id })),
    ].filter((item) => item.url || item.file_id);
    return refs;
  };

  const uploadToXaiFile = async (file: File) => {
    const form = new FormData();
    form.append("purpose", "assistants");
    form.append("file", file);
    const response = await fetch("/api/xai/files/upload", {
      method: "POST",
      credentials: "include",
      body: form,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.success) {
      throw new Error(data?.error?.text || data?.error || `Upload failed (${response.status})`);
    }
    return data.file?.id || data.file?.file_id;
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const next: UploadRef[] = [];
    for (const file of Array.from(files).slice(0, 6)) {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isImage && !isVideo) continue;
      const url = await readFileAsDataUrl(file);
      let fileId: string | undefined;
      try {
        fileId = await uploadToXaiFile(file);
      } catch (error: any) {
        toast({ title: "Private file upload failed", description: error?.message, variant: "destructive" });
      }
      next.push({ id: uid(), name: file.name, type: isVideo ? "video" : "image", url, fileId });
    }
    setUploads((prev) => [...prev, ...next].slice(-8));
    if (next.length && mode === "image") setMode("edit");
  };

  const uploadDocuments = async (files: FileList | null) => {
    if (!files?.length) return;
    const selected = Array.from(files).slice(0, 8);
    const placeholders = selected.map((file) => ({
      id: uid(),
      name: file.name,
      contentType: file.type || "application/octet-stream",
      status: "uploading" as const,
    }));
    setDocuments((prev) => [...placeholders, ...prev].slice(0, 12));
    setMode("files");

    for (let index = 0; index < selected.length; index++) {
      const file = selected[index];
      const id = placeholders[index].id;
      try {
        const fileId = await uploadToXaiFile(file);
        setDocuments((prev) => prev.map((item) => item.id === id ? { ...item, fileId, status: "ready" } : item));
        if (fileId) {
          setFileRefText((prev) => {
            const ids = new Set(fileIdsFromText(prev));
            ids.add(fileId);
            return Array.from(ids).join(", ");
          });
        }
      } catch (error: any) {
        setDocuments((prev) => prev.map((item) => item.id === id ? { ...item, status: "error", error: error?.message } : item));
      }
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: "Copied" });
  };

  const useFileAsReference = (fileId: string) => {
    setFileRefText((prev) => {
      const ids = new Set(fileIdsFromText(prev));
      ids.add(fileId);
      return Array.from(ids).join(", ");
    });
    setMode("edit");
  };

  const createCollection = async () => {
    try {
      const field_definitions = collectionFieldsText.trim() ? JSON.parse(collectionFieldsText) : undefined;
      const response = await apiRequest<any>("/api/xai/collections", {
        method: "POST",
        body: JSON.stringify({ collection_name: collectionName, field_definitions }),
      });
      const collectionId = response.collection_id || response.id || response.collection?.id;
      if (collectionId) {
        setCollectionIdText((prev) => {
          const ids = new Set(collectionIdsFromText(prev));
          ids.add(collectionId);
          return Array.from(ids).join(", ");
        });
        toast({ title: "Collection created", description: collectionId });
      } else {
        toast({ title: "Collection response received", description: "Copy the collection ID from the response if needed." });
      }
    } catch (error: any) {
      toast({ title: "Collection creation failed", description: error?.message, variant: "destructive" });
    }
  };

  const uploadCollectionDocument = async (files: FileList | null) => {
    const collectionId = collectionIds[0];
    const file = files?.[0];
    if (!collectionId || !file) return;
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", file.name);
      form.append("content_type", file.type || "application/octet-stream");
      if (collectionDocFieldsText.trim()) form.append("fields", collectionDocFieldsText);
      const response = await fetch(`/api/xai/collections/${encodeURIComponent(collectionId)}/documents`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      toast({ title: "Document added", description: collectionId });
    } catch (error: any) {
      toast({ title: "Collection upload failed", description: error?.message, variant: "destructive" });
    }
  };

  const transcribeAudioFile = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append("language", "en");
      form.append("file", file);
      const response = await fetch("/api/xai/stt", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || `HTTP ${response.status}`);
      const text = String(data.text || data.transcript || data.output_text || "").trim();
      if (text) {
        setInput((prev) => prev ? `${prev} ${text}` : text);
        setLiveTranscript(text);
        setMode("voice");
      }
    } catch (error: any) {
      toast({ title: "Transcription failed", description: error?.message, variant: "destructive" });
    }
  };

  const toggleLiveTranscript = () => {
    if (liveListening) {
      recognitionRef.current?.stop?.();
      setLiveListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: "Live transcription unavailable", description: "This browser does not expose SpeechRecognition.", variant: "destructive" });
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0]?.transcript || "";
      }
      setLiveTranscript(text.trim());
      setInput(text.trim());
    };
    recognition.onend = () => setLiveListening(false);
    recognition.onerror = () => setLiveListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setLiveListening(true);
    setMode("voice");
  };

  const compactContext = async () => {
    const inputItems = turns
      .filter((turn) => turn.content && (turn.role === "user" || turn.role === "assistant"))
      .map((turn) => ({ role: turn.role, content: turn.content }));
    if (!inputItems.length) {
      toast({ title: "Nothing to compact" });
      return;
    }
    try {
      const response = await apiRequest<any>("/api/xai/responses/compact", {
        method: "POST",
        body: JSON.stringify({
          model,
          input: inputItems,
          prompt_cache_key: activePromptCacheKey,
        }),
      });
      const output = response.compaction?.output || [];
      setCompactionItems(output);
      const usage = response.compaction?.usage;
      setCompactionStatus(
        usage
          ? `Compacted ${usage.dropped_message_count ?? inputItems.length} turns, ${usage.total_tokens ?? "unknown"} tokens.`
          : "Context compacted.",
      );
      toast({ title: "Context compacted" });
    } catch (error: any) {
      toast({ title: "Compaction failed", description: error?.message, variant: "destructive" });
    }
  };

  const runResponses = async (
    assistantId: string,
    prompt: string,
    options: { code?: boolean; files?: boolean; collections?: boolean; web?: boolean; xSearch?: boolean } = {},
  ) => {
    const allFileIds = Array.from(new Set([...fileIds, ...documentFileIds]));
    const content: any[] = [{ type: "input_text", text: prompt }];
    if (options.files) {
      content.push(...allFileIds.map((file_id) => ({ type: "input_file", file_id })));
    }
    const tools: any[] = [];
    if (options.collections && collectionIds.length) {
      tools.push({ type: "file_search", vector_store_ids: collectionIds, max_num_results: 10 });
    }
    if (options.code) tools.push({ type: "code_interpreter" });
    if (options.web) tools.push({ type: "web_search" });
    if (options.xSearch) tools.push({ type: "x_search" });

    const response = await fetch("/api/xai/responses/stream", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          ...compactionItems,
          { role: "user", content },
        ],
        tools: tools.length ? tools : undefined,
        previous_response_id: lastResponseId || undefined,
        prompt_cache_key: activePromptCacheKey,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let text = "";
    await readSse(response, (event, data) => {
      const eventType = data?.type || event;
      if (eventType === "response.output_text.delta" && data?.delta) {
        text += data.delta;
        patchTurn(assistantId, { content: text });
      }
      if (eventType === "response.completed" && data?.response?.id) {
        setLastResponseId(data.response.id);
      }
      if (String(eventType).includes("tool") || String(eventType).includes("file_search")) {
        patchTurn(assistantId, (turn) => ({
          ...turn,
          tools: [
            ...(turn.tools || []),
            { id: `${eventType}-${uid()}`, name: String(eventType), result: JSON.stringify(data, null, 2) },
          ].slice(-8),
        }));
      }
    });
    return text;
  };

  const sendChatLike = async (assistantId: string, prompt: string, activeMode: Mode) => {
    const refs = referencePayload();
    const history = turns
      .filter((turn) => turn.content && (turn.role === "user" || turn.role === "assistant"))
      .slice(-8)
      .map((turn) => ({ role: turn.role, content: turn.content }));
    const system = [
      "You are Clawd Grok inside Cheshire Terminal.",
      "Be direct, precise, and useful for Solana builders, traders, and creators.",
      activeMode === "search" ? "Use web search for current facts and include useful source context." : "",
      activeMode === "multi"
        ? `Coordinate these pinned agents: ${selectedAgentLabels.join(", ") || "Market Scout"}. Give a combined answer with clear agent notes.`
        : "",
      activeMode === "voice"
        ? "You are being used as a voice agent. Keep answers spoken, concise, and action-oriented."
        : "",
    ].filter(Boolean).join("\n");

    const userContent = refs.length && activeMode !== "search"
      ? [
          { type: "text", text: prompt },
          ...refs.filter((ref) => ref.url).slice(0, 4).map((ref) => ({
            type: "image_url",
            image_url: { url: ref.url, detail: "high" },
          })),
        ]
      : prompt;

    const tools = activeMode === "search"
      ? [{ type: "web_search", enable_image_search: true, enable_image_understanding: true }]
      : undefined;

    const response = await fetch("/api/xai/chat/stream", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: activeMode === "multi" ? "grok-4.20-multi-agent" : model,
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: userContent },
        ],
        tools,
        reasoning_effort: effort,
        sessionId: `grok-${activeMode}`,
        walletAddress: publicKey?.toBase58(),
        prompt_cache_key: activePromptCacheKey,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let text = "";
    await readSse(response, (_event, data) => {
      if (data?.type === "text" && data.text) {
        text += data.text;
        patchTurn(assistantId, { content: text });
      } else if (data?.chunk) {
        text += data.chunk;
        patchTurn(assistantId, { content: text });
      }
    });
    return text;
  };

  const runImage = async (assistantId: string, prompt: string, activeMode: "image" | "edit") => {
    const refs = referencePayload();
    const response = await apiRequest<{ success: boolean; images: any[]; error?: string }>(
      "/api/xai/image-gen",
      {
        method: "POST",
        body: JSON.stringify({
          prompt,
          n: activeMode === "image" ? variants : 1,
          aspect_ratio: aspect,
          resolution,
          images: activeMode === "edit" ? refs : undefined,
          storage_options: persistOutputs
            ? { filename: cleanFilename(activeMode === "edit" ? "grok-edit" : "grok-image", "png"), public_url: publicUrls }
            : undefined,
          creator: publicKey?.toBase58(),
          save_to_feed: true,
        }),
      },
    );
    if (!response.success) throw new Error(response.error || "Image generation failed");
    const media = (response.images || []).map((image) => ({
      type: "image" as const,
      url: image.url,
      b64_json: image.b64_json,
      publicUrl: image.public_url || image.file_output?.public_url,
      fileId: image.file_output?.file_id,
      filename: image.file_output?.filename,
    }));
    patchTurn(assistantId, {
      content: activeMode === "edit" ? "Image edit complete." : "Image generation complete.",
      media,
    });
  };

  const runVideo = async (assistantId: string, prompt: string) => {
    const refs = referencePayload();
    const videoRef = uploads.find((upload) => upload.type === "video");
    const firstImageRef = refs.find((ref) => ref.url || ref.file_id);
    const body: Record<string, unknown> = {
      prompt,
      duration,
      aspect_ratio: aspect === "auto" ? "16:9" : aspect,
      resolution: videoResolution,
      creator: publicKey?.toBase58(),
      storage_options: persistOutputs
        ? { filename: cleanFilename("grok-video", "mp4"), public_url: publicUrls }
        : undefined,
    };
    if (videoRef?.url) {
      body.mode = "edit";
      body.video_url = videoRef.url;
    } else if (refs.length > 1) {
      body.mode = "reference";
      body.reference_images = refs;
    } else if (firstImageRef?.file_id) {
      body.image_file_id = firstImageRef.file_id;
    } else if (firstImageRef?.url) {
      body.image_url = firstImageRef.url;
    }

    const response = await apiRequest<{ requestId: string; status: string; error?: string }>("/api/xai/video-gen", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (response.error) throw new Error(response.error);
    setVideoJobs((prev) => ({ ...prev, [response.requestId]: { status: "pending", turnId: assistantId } }));
    patchTurn(assistantId, { content: `Video request started: ${response.requestId}` });
  };

  const runTrading = async (assistantId: string, prompt: string) => {
    const history = turns
      .filter((turn) => turn.content && (turn.role === "user" || turn.role === "assistant"))
      .slice(-8)
      .map((turn) => ({ role: turn.role, content: turn.content }));
    const response = await fetch("/api/xai/trading-chat", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [...history, { role: "user", content: prompt }],
        walletAddress: publicKey?.toBase58(),
        sessionId: "grok-trading",
        prompt_cache_key: activePromptCacheKey,
      }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    let text = "";
    await readSse(response, (event, data) => {
      if (event === "text" && data?.content) {
        text += data.content;
        patchTurn(assistantId, { content: text });
      }
      if (event === "tool_call") {
        patchTurn(assistantId, (turn) => ({
          ...turn,
          tools: [...(turn.tools || []), { id: data.id, name: data.name, args: data.args }],
        }));
      }
      if (event === "tool_result") {
        patchTurn(assistantId, (turn) => ({
          ...turn,
          tools: (turn.tools || []).map((tool) =>
            tool.id === data.id ? { ...tool, result: String(data.result || "") } : tool,
          ),
        }));
      }
      if (event === "error") throw new Error(data?.error || "Trading chat failed");
    });
  };

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;
    const activeMode = mode;
    const userTurn: Turn = { id: uid(), role: "user", mode: activeMode, content: prompt };
    const assistantId = uid();
    const assistantTurn: Turn = { id: assistantId, role: "assistant", mode: activeMode, content: "" };
    setTurns((prev) => [...prev, userTurn, assistantTurn]);
    setInput("");
    setBusy(true);

    try {
      if (activeMode === "image" || activeMode === "edit") await runImage(assistantId, prompt, activeMode);
      else if (activeMode === "video") await runVideo(assistantId, prompt);
      else if (activeMode === "files") {
        await runResponses(assistantId, prompt, {
          files: true,
          collections: true,
          code: true,
          web: true,
        });
      }
      else if (activeMode === "code") {
        await runResponses(assistantId, prompt, {
          files: documentFileIds.length > 0 || fileIds.length > 0,
          collections: collectionIds.length > 0,
          code: true,
        });
      }
      else if (activeMode === "voice") {
        const reply = await sendChatLike(assistantId, prompt, activeMode);
        if (autoSpeak && reply) await xaiVoice.speak(reply, voiceId, voiceSpeed);
      }
      else if (activeMode === "trade") await runTrading(assistantId, prompt);
      else await sendChatLike(assistantId, prompt, activeMode);
    } catch (error: any) {
      patchTurn(assistantId, { content: `Error: ${error?.message || "Request failed"}` });
      toast({ title: "Grok request failed", description: error?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const entries = Object.entries(videoJobs).filter(([, job]) => job.status === "pending");
    if (!entries.length) return;
    const interval = window.setInterval(async () => {
      for (const [requestId, job] of entries) {
        try {
          const response = await fetch(`/api/xai/video-status/${requestId}`, { credentials: "include" });
          const data = await response.json();
          setVideoJobs((prev) => ({
            ...prev,
            [requestId]: { ...prev[requestId], status: data.status || "pending" },
          }));
          if (data.status === "done" && data.videoUrl) {
            patchTurn(job.turnId, {
              content: "Video generation complete.",
              media: [{
                type: "video",
                url: data.videoUrl,
                publicUrl: data.publicUrl,
                fileId: data.file_output?.file_id,
                filename: data.file_output?.filename,
              }],
            });
          }
          if (data.status === "failed" || data.status === "expired") {
            patchTurn(job.turnId, { content: `Video ${data.status}.` });
          }
        } catch {
          // Keep polling until xAI returns a terminal state.
        }
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [videoJobs]);

  const activeModeMeta = MODES.find((item) => item.id === mode) || MODES[0];
  const ActiveIcon = activeModeMeta.icon;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 py-4 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-400/15 pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/terminal">
            <Button variant="outline" size="sm" className="h-8 border-cyan-400/25 bg-black/30 px-2 text-cyan-100 hover:bg-cyan-500/10">
              <ArrowLeft className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Terminal</span>
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-black tracking-wide text-white sm:text-2xl">
              Clawd Grok
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
              <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-100">
                <Zap className="mr-1 h-3 w-3" />
                {status?.configured ? status.model || "ready" : "offline"}
              </Badge>
              <span>{publicKey ? `${publicKey.toBase58().slice(0, 6)}...${publicKey.toBase58().slice(-4)}` : "wallet session"}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger className="h-8 w-full border-zinc-800 bg-black/40 text-xs sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODELS.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={effort} onValueChange={(value) => setEffort(value as Effort)}>
            <SelectTrigger className="h-8 w-full border-zinc-800 bg-black/40 text-xs sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["none", "low", "medium", "high", "xhigh"] as Effort[]).map((item) => (
                <SelectItem key={item} value={item}>{item}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid min-h-[calc(100vh-13rem)] gap-4 lg:grid-cols-[1fr_22rem]">
        <main className="flex min-h-[32rem] flex-col overflow-hidden rounded-lg border border-zinc-800 bg-black/35">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <ActiveIcon className="h-4 w-4 text-cyan-300" />
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{activeModeMeta.label}</span>
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 px-2 text-zinc-500 hover:text-white"
              onClick={() => setTurns([])}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            {turns.length === 0 ? (
              <div className="mx-auto grid max-w-3xl gap-3 py-10 sm:grid-cols-2">
                {[
                  "Search current Solana market structure and summarize the risk.",
                  "Upload my notes and answer with citations from the files.",
                  "Write a small HTML widget that previews a SOL risk dashboard.",
                  "Use voice mode to brief me on what changed in this session.",
                  "Generate a 16:9 product image for a CLAWD trading agent.",
                  "Edit the uploaded image into a darker trading dashboard scene.",
                  "Get a DFlow quote for 1 SOL to USDC and explain slippage.",
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setInput(prompt)}
                    className="rounded-lg border border-zinc-800 bg-zinc-950/70 p-3 text-left text-xs text-zinc-400 transition hover:border-cyan-500/40 hover:text-cyan-100"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {turns.map((turn) => (
                  <div key={turn.id} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[92%] rounded-lg border px-3 py-2 text-sm ${
                      turn.role === "user"
                        ? "border-cyan-500/35 bg-cyan-500/10 text-cyan-50"
                        : "border-zinc-800 bg-zinc-950/80 text-zinc-100"
                    }`}>
                      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-zinc-500">
                        <span>{turn.role === "user" ? "You" : "Grok"}</span>
                        <Badge variant="outline" className="h-4 border-zinc-700 px-1 text-[9px] text-zinc-500">
                          {turn.mode}
                        </Badge>
                      </div>
                      {turn.content ? (
                        <div className="prose prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-pre:border prose-pre:border-zinc-800 prose-pre:bg-black/60">
                          <MarkdownContent content={turn.content} />
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-zinc-500">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Working
                        </div>
                      )}
                      {turn.tools?.length ? (
                        <div className="mt-3 space-y-2 border-t border-zinc-800 pt-2">
                          {turn.tools.map((tool) => (
                            <details key={tool.id} className="rounded-md border border-zinc-800 bg-black/30 px-2 py-1 text-xs">
                              <summary className="flex cursor-pointer items-center gap-2 text-cyan-200">
                                <Wrench className="h-3 w-3" />
                                {tool.name}
                                <ChevronDown className="ml-auto h-3 w-3 text-zinc-600" />
                              </summary>
                              <pre className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-[10px] text-zinc-400">
                                {tool.result || JSON.stringify(tool.args, null, 2)}
                              </pre>
                            </details>
                          ))}
                        </div>
                      ) : null}
                      {turn.role === "assistant" && extractCodeBlocks(turn.content).length ? (
                        <CodePreview blocks={extractCodeBlocks(turn.content)} />
                      ) : null}
                      {turn.media?.length ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {turn.media.map((item, index) => {
                            const src = mediaSrc(item);
                            return (
                              <div key={`${src}-${index}`} className="overflow-hidden rounded-md border border-zinc-800 bg-black/40">
                                {item.type === "video" ? (
                                  <video src={src} controls className="aspect-video w-full bg-black" />
                                ) : (
                                  <img src={src} alt="" className="w-full object-cover" />
                                )}
                                <div className="flex items-center gap-2 px-2 py-2 text-[10px] text-zinc-500">
                                  {item.fileId && (
                                    <button type="button" className="truncate hover:text-cyan-200" onClick={() => useFileAsReference(item.fileId!)}>
                                      {item.fileId}
                                    </button>
                                  )}
                                  <div className="ml-auto flex gap-1">
                                    {src && (
                                      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copy(src)}>
                                        <Copy className="h-3 w-3" />
                                      </Button>
                                    )}
                                    {item.fileId && (
                                      <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => useFileAsReference(item.fileId!)}>
                                        <Paperclip className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800 bg-black/50 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {MODES.map((item) => {
                const Icon = item.icon;
                const selected = mode === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMode(item.id)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs transition ${
                      selected
                        ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-100"
                        : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <VoiceToPrompt
                onTranscript={(text) => setInput((prev) => prev ? `${prev} ${text}` : text)}
                disabled={busy}
                mode="chat"
                className="self-stretch"
              />
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask, search, trade, generate, edit, or animate..."
                rows={2}
                className="min-h-[4.25rem] resize-none border-zinc-800 bg-zinc-950/80"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <Button onClick={send} disabled={busy || !input.trim()} className="h-auto w-12 bg-cyan-600 text-white hover:bg-cyan-500">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </main>

        <aside className="space-y-3">
          <section className="rounded-lg border border-zinc-800 bg-black/35 p-3">
            <div className="mb-3 flex items-center gap-2">
              <Upload className="h-4 w-4 text-cyan-300" />
              <h2 className="text-sm font-semibold text-zinc-200">References</h2>
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => documentInputRef.current?.click()}>
                <FileText className="h-3.5 w-3.5" />
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,video/mp4"
                multiple
                className="hidden"
                onChange={(event) => uploadFiles(event.target.files)}
              />
              <input
                ref={documentInputRef}
                type="file"
                accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/*,application/pdf,application/json"
                multiple
                className="hidden"
                onChange={(event) => uploadDocuments(event.target.files)}
              />
            </div>
            <Input
              value={fileRefText}
              onChange={(event) => setFileRefText(event.target.value)}
              placeholder="file_id references for files, images, videos"
              className="mb-2 h-8 border-zinc-800 bg-zinc-950 text-xs"
            />
            <div className="space-y-2">
              {uploads.length === 0 && documents.length === 0 && fileIds.length === 0 ? (
                <div className="rounded-md border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">
                  Upload images, videos, docs, or paste xAI file IDs.
                </div>
              ) : null}
              {uploads.map((upload) => (
                <div key={upload.id} className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                  {upload.type === "image" ? <FileImage className="h-4 w-4 text-emerald-300" /> : <Video className="h-4 w-4 text-amber-300" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-zinc-400">{upload.name}</div>
                    {upload.fileId && <div className="truncate text-[10px] text-cyan-400">{upload.fileId}</div>}
                  </div>
                  <button type="button" onClick={() => setUploads((prev) => prev.filter((item) => item.id !== upload.id))}>
                    <Trash2 className="h-3.5 w-3.5 text-zinc-600 hover:text-red-300" />
                  </button>
                </div>
              ))}
              {documents.map((document) => (
                <div key={document.id} className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                  <FileText className="h-4 w-4 text-blue-300" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs text-zinc-400">{document.name}</div>
                    <div className={`truncate text-[10px] ${document.status === "error" ? "text-red-300" : "text-cyan-400"}`}>
                      {document.fileId || document.error || document.status}
                    </div>
                  </div>
                  {document.status === "uploading" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" /> : (
                    <button type="button" onClick={() => setDocuments((prev) => prev.filter((item) => item.id !== document.id))}>
                      <Trash2 className="h-3.5 w-3.5 text-zinc-600 hover:text-red-300" />
                    </button>
                  )}
                </div>
              ))}
              {fileIds.map((fileId) => (
                <div key={fileId} className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                  <Paperclip className="h-4 w-4 text-cyan-300" />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">{fileId}</span>
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-black/35 p-3">
            <div className="mb-3 flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-300" />
              <h2 className="text-sm font-semibold text-zinc-200">Files & Collections</h2>
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={() => collectionDocInputRef.current?.click()} disabled={!collectionIds.length}>
                <Upload className="h-3.5 w-3.5" />
              </Button>
              <input
                ref={collectionDocInputRef}
                type="file"
                accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/*,application/pdf,application/json"
                className="hidden"
                onChange={(event) => uploadCollectionDocument(event.target.files)}
              />
            </div>
            <div className="space-y-2">
              <Input
                value={collectionIdText}
                onChange={(event) => setCollectionIdText(event.target.value)}
                placeholder="collection_id references"
                className="h-8 border-zinc-800 bg-zinc-950 text-xs"
              />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Input
                  value={collectionName}
                  onChange={(event) => setCollectionName(event.target.value)}
                  placeholder="new collection name"
                  className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                />
                <Button type="button" size="sm" className="h-8 bg-blue-600 hover:bg-blue-500" onClick={createCollection}>
                  <Database className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Textarea
                value={collectionFieldsText}
                onChange={(event) => setCollectionFieldsText(event.target.value)}
                rows={3}
                className="resize-none border-zinc-800 bg-zinc-950 text-[11px]"
                placeholder="field_definitions JSON"
              />
              <Textarea
                value={collectionDocFieldsText}
                onChange={(event) => setCollectionDocFieldsText(event.target.value)}
                rows={2}
                className="resize-none border-zinc-800 bg-zinc-950 text-[11px]"
                placeholder="document fields JSON"
              />
              <div className="flex flex-wrap gap-1">
                {collectionIds.map((collectionId) => (
                  <Badge key={collectionId} variant="outline" className="max-w-full truncate border-blue-400/30 text-blue-200">
                    {collectionId}
                  </Badge>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-black/35 p-3">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-300" />
              <h2 className="text-sm font-semibold text-zinc-200">Cache & Context</h2>
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={compactContext}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                Prompt cache
                <Switch checked={usePromptCache} onCheckedChange={setUsePromptCache} />
              </label>
              <Input
                value={promptCacheKey}
                onChange={(event) => setPromptCacheKey(event.target.value)}
                placeholder={activePromptCacheKey || "x-grok-conv-id"}
                disabled={!usePromptCache}
                className="h-8 border-zinc-800 bg-zinc-950 text-xs"
              />
              {compactionStatus && (
                <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-2 text-[11px] text-emerald-200">
                  {compactionStatus}
                </div>
              )}
              <div className="text-[10px] text-zinc-600">
                {compactionItems.length ? `${compactionItems.length} compaction item active for Responses mode.` : "Compaction output will be reused for files/code turns."}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-black/35 p-3">
            <div className="mb-3 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-emerald-300" />
              <h2 className="text-sm font-semibold text-zinc-200">Media</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-zinc-500">Aspect</Label>
                <Select value={aspect} onValueChange={setAspect}>
                  <SelectTrigger className="h-8 border-zinc-800 bg-zinc-950 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASPECT_RATIOS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-zinc-500">Images</Label>
                <Select value={String(variants)} onValueChange={(value) => setVariants(Number(value))}>
                  <SelectTrigger className="h-8 border-zinc-800 bg-zinc-950 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((item) => <SelectItem key={item} value={String(item)}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-zinc-500">Image res</Label>
                <Select value={resolution} onValueChange={(value) => setResolution(value as "1k" | "2k")}>
                  <SelectTrigger className="h-8 border-zinc-800 bg-zinc-950 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1k">1k</SelectItem>
                    <SelectItem value="2k">2k</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-zinc-500">Video res</Label>
                <Select value={videoResolution} onValueChange={(value) => setVideoResolution(value as "480p" | "720p")}>
                  <SelectTrigger className="h-8 border-zinc-800 bg-zinc-950 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="480p">480p</SelectItem>
                    <SelectItem value="720p">720p</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Label className="text-[10px] text-zinc-500">Duration</Label>
              <Input
                type="number"
                min={1}
                max={15}
                value={duration}
                onChange={(event) => setDuration(Math.max(1, Math.min(15, Number(event.target.value) || 1)))}
                className="h-8 border-zinc-800 bg-zinc-950 text-xs"
              />
            </div>
            <div className="mt-3 space-y-2">
              <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                Persist files
                <Switch checked={persistOutputs} onCheckedChange={setPersistOutputs} />
              </label>
              <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                Public URLs
                <Switch checked={publicUrls} onCheckedChange={setPublicUrls} disabled={!persistOutputs} />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-black/35 p-3">
            <div className="mb-3 flex items-center gap-2">
              <Radio className="h-4 w-4 text-fuchsia-300" />
              <h2 className="text-sm font-semibold text-zinc-200">Voice Agent</h2>
              <Button variant="ghost" size="sm" className="ml-auto h-7 px-2" onClick={() => audioInputRef.current?.click()}>
                <Mic className="h-3.5 w-3.5" />
              </Button>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,video/mp4"
                className="hidden"
                onChange={(event) => transcribeAudioFile(event.target.files)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-zinc-500">Voice</Label>
                <Select value={voiceId} onValueChange={setVoiceId}>
                  <SelectTrigger className="h-8 border-zinc-800 bg-zinc-950 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["eve", "ara", "rex", "sal", "leo"].map((voice) => (
                      <SelectItem key={voice} value={voice}>{voice}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] text-zinc-500">Speed</Label>
                <Input
                  type="number"
                  min={0.7}
                  max={1.5}
                  step={0.05}
                  value={voiceSpeed}
                  onChange={(event) => setVoiceSpeed(Math.max(0.7, Math.min(1.5, Number(event.target.value) || 1)))}
                  className="h-8 border-zinc-800 bg-zinc-950 text-xs"
                />
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                Speak replies
                <Switch checked={autoSpeak} onCheckedChange={setAutoSpeak} />
              </label>
              <Button type="button" variant={liveListening ? "destructive" : "secondary"} size="sm" className="w-full justify-start gap-2" onClick={toggleLiveTranscript}>
                {liveListening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                {liveListening ? "Listening live" : "Live transcription"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 border-zinc-800"
                onClick={() => xaiVoice.speak(input || turns.filter((turn) => turn.role === "assistant").slice(-1)[0]?.content || "Clawd Grok voice is ready.", voiceId, voiceSpeed)}
              >
                <Volume2 className="h-3.5 w-3.5" />
                Speak current text
              </Button>
              {liveTranscript && (
                <div className="max-h-20 overflow-auto rounded-md border border-fuchsia-500/20 bg-fuchsia-500/10 p-2 text-[11px] text-fuchsia-100">
                  {liveTranscript}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-black/35 p-3">
            <div className="mb-3 flex items-center gap-2">
              <Pin className="h-4 w-4 text-amber-300" />
              <h2 className="text-sm font-semibold text-zinc-200">Pinned Agents</h2>
            </div>
            <div className="space-y-2">
              {PINNABLE_AGENTS.map((agent) => {
                const selected = pinnedAgents.includes(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => setPinnedAgents((prev) =>
                      selected ? prev.filter((id) => id !== agent.id) : [...prev, agent.id],
                    )}
                    className={`w-full rounded-md border p-2 text-left transition ${
                      selected
                        ? "border-amber-400/40 bg-amber-400/10"
                        : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs text-zinc-200">
                      <Brain className="h-3.5 w-3.5 text-amber-300" />
                      {agent.label}
                      {selected && <Check className="ml-auto h-3.5 w-3.5 text-emerald-300" />}
                    </div>
                    <div className="mt-1 text-[10px] text-zinc-600">{agent.detail}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-800 bg-black/35 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Globe className="h-4 w-4 text-cyan-300" />
              Access
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-cyan-400/30 bg-cyan-400/10 text-cyan-100">Grok Search</Badge>
              <Badge className="border-blue-400/30 bg-blue-400/10 text-blue-100">Files</Badge>
              <Badge className="border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-100">Voice</Badge>
              <Badge className="border-purple-400/30 bg-purple-400/10 text-purple-100">Code Exec</Badge>
              <Badge className="border-lime-400/30 bg-lime-400/10 text-lime-100">Prompt Cache</Badge>
              <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-100">Protected API</Badge>
              <Badge className="border-amber-400/30 bg-amber-400/10 text-amber-100">$CLAWD</Badge>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
