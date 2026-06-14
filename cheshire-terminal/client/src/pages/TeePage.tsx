import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Send, Shield, Trash2, Sparkles, Activity, Lock,
  Cpu, ExternalLink, ChevronRight, Zap, Eye, EyeOff,
  MessageSquare, GitBranch, Terminal, Database,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { v4 as uuidv4 } from "uuid";
import { useWallet } from "@solana/wallet-adapter-react";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface TeeModel {
  id: string;
  name: string;
  provider: string;
  tee: boolean;
}

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

const DEFAULT_TEE_MODEL = "deepseek/deepseek-v4-flash";
const SECONDARY_TEE_MODEL = "google/gemma-4-31b-it";

const DEFAULT_MODELS: TeeModel[] = [
  { id: DEFAULT_TEE_MODEL,    name: "DeepSeek V4 Flash", provider: "RedPill GPU TEE", tee: true },
  { id: SECONDARY_TEE_MODEL,  name: "Gemma 4 31B IT",    provider: "RedPill GPU TEE", tee: true },
  { id: "z-ai/glm-5.1",      name: "GLM 5.1",           provider: "Chutes GPU TEE",  tee: true },
  { id: "z-ai/glm-5",        name: "GLM 5",             provider: "Near AI GPU TEE", tee: true },
  { id: "phala/qwen3.5-27b", name: "Qwen 3.5 27B",      provider: "Phala GPU TEE",   tee: true },
  { id: "anthropic/claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "RedPill Gateway", tee: false },
];

const STYLES = `
  @keyframes tee-glow {
    0%, 100% { box-shadow: 0 0 8px 1px rgba(34,197,94,0.25); }
    50%       { box-shadow: 0 0 16px 3px rgba(34,197,94,0.45); }
  }
  .tee-badge { animation: tee-glow 2.5s ease-in-out infinite; }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .shimmer-text {
    background: linear-gradient(90deg, #4ade80 0%, #22d3ee 35%, #818cf8 70%, #4ade80 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 3s linear infinite;
  }
`;

const EPHEMERAL_CHAT_FLOW = [
  {
    lane: "Base RPC",
    tone: "text-amber-300 border-amber-500/20 bg-amber-500/5",
    items: [
      ["createProfile", "derive profile PDA from handle"],
      ["topUpProfile", "fund rent and ER writes"],
      ["delegateProfile", "transfer ownership to MagicBlock delegation program"],
      ["closeProfile", "refund after commit and cleanup"],
    ],
  },
  {
    lane: "ER RPC",
    tone: "text-indigo-300 border-indigo-500/20 bg-indigo-500/5",
    items: [
      ["createConversation", "open the delegated chat account"],
      ["extendConversation", "pre-allocate message capacity"],
      ["appendMessage", "write messages with skipPreflight"],
      ["undelegateProfile", "commit and return ownership to base"],
    ],
  },
];

const TS_HARNESS_NOTES = [
  "strict TypeScript",
  "mocha/chai test types",
  "commonjs + es6 target",
  "esModuleInterop enabled",
];

// ─── MagicBlock info panel ──────────────────────────────────────────────────────
function EphemeralChatInfo() {
  return (
    <div className="rounded-xl border border-indigo-500/20 bg-black/40 p-3 space-y-3">
      <div className="flex items-center gap-1.5">
        <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
        <p className="text-[10px] font-bold text-indigo-400/80 uppercase tracking-widest">
          MagicBlock Chat Accounts
        </p>
      </div>
      <p className="text-[10px] text-indigo-300/60 leading-relaxed">
        TEE inference can draft privately while delegated Anchor accounts make the chat feel live.
        The local <span className="font-mono text-indigo-200/80">ephemeral-account-chats</span> example
        uses profile PDAs, conversation PDAs, ER account subscriptions, and commit proofs back to Solana.
      </p>

      <div className="grid gap-2">
        {EPHEMERAL_CHAT_FLOW.map((lane) => (
          <div key={lane.lane} className={`rounded-lg border p-2 ${lane.tone}`}>
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em]">
              {lane.lane === "Base RPC" ? <Database className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
              {lane.lane}
            </div>
            <div className="space-y-1.5">
              {lane.items.map(([label, desc]) => (
                <div key={label} className="flex items-start gap-2">
                  <ChevronRight className="w-2.5 h-2.5 mt-0.5 flex-shrink-0 opacity-60" />
                  <div>
                    <span className="text-[9px] font-mono">{label}</span>
                    <span className="text-[9px] opacity-55 ml-1">— {desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2">
        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-cyan-300/80">
          <GitBranch className="h-3 w-3" /> Commit proof
        </div>
        <p className="mt-1 text-[9px] leading-relaxed text-cyan-200/55">
          After <span className="font-mono text-cyan-100/80">undelegateProfile</span>, the test resolves
          <span className="font-mono text-cyan-100/80"> GetCommitmentSignature</span> and checks the base-chain
          transaction before treating ownership as returned.
        </p>
      </div>

      <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-2">
        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-green-300/80">
          <Terminal className="h-3 w-3" /> TS harness
        </div>
        <p className="mt-1 break-words font-mono text-[8px] leading-relaxed text-green-200/45">
          magicblock-engine-examples-main/ephemeral-account-chats/tsconfig.json
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {TS_HARNESS_NOTES.map((note) => (
            <span key={note} className="rounded border border-green-500/20 px-1.5 py-0.5 text-[8px] text-green-200/55">
              {note}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        {[
          { label: "profile PDA", desc: "seeds: profile + handle" },
          { label: "conversation PDA", desc: "seeds: conversation + user handles" },
          { label: "account stream", desc: "ER onAccountChange drives live UI" },
        ].map(({ label, desc }) => (
          <div key={label} className="flex items-start gap-2">
            <ChevronRight className="w-2.5 h-2.5 text-indigo-500/60 mt-0.5 flex-shrink-0" />
            <div>
              <span className="text-[9px] font-mono text-indigo-300/80">{label}</span>
              <span className="text-[9px] text-indigo-400/40 ml-1">— {desc}</span>
            </div>
          </div>
        ))}
      </div>
      <a
        href="https://docs.magicblock.gg"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[9px] text-indigo-400/50 hover:text-indigo-300/80 transition-colors"
      >
        MagicBlock docs <ExternalLink className="w-2.5 h-2.5" />
      </a>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export default function TeePage() {
  const { toast } = useToast();
  const { publicKey } = useWallet();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<string>(DEFAULT_TEE_MODEL);
  const [models, setModels] = useState<TeeModel[]>(DEFAULT_MODELS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(
    "You are a privacy-first AI assistant running inside a Trusted Execution Environment (TEE). Be helpful, concise, and accurate."
  );
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    fetch("/api/tee/status")
      .then(r => r.json())
      .then(d => setConfigured(d.configured))
      .catch(() => setConfigured(false));
    fetch("/api/tee/models")
      .then(r => r.json())
      .then(d => {
        if (d.models?.length) {
          setModels(d.models);
          setModel(d.defaultModel || d.models[0].id || DEFAULT_TEE_MODEL);
        }
      })
      .catch(() => {});
  }, []);

  const selectedModel = models.find(m => m.id === model) ?? models[0];

  const sendMessage = async () => {
    const userText = input.trim();
    if (!userText || isGenerating) return;
    setInput("");
    setIsGenerating(true);

    const userMsg: Msg = { id: uuidv4(), role: "user", content: userText };
    const asstId = uuidv4();
    const asstMsg: Msg = { id: asstId, role: "assistant", content: "", isStreaming: true };
    setMessages(prev => [...prev, userMsg, asstMsg]);

    try {
      const res = await fetch("/api/tee/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userText },
          ],
          model,
          system: systemPrompt || undefined,
          walletAddress: publicKey?.toBase58(),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";
        for (const block of blocks) {
          if (!block.trim()) continue;
          let evType = "";
          let dataLine = "";
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) evType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataLine = line.slice(6).trim();
          }
          if (evType === "text" && dataLine) {
            try {
              const { content } = JSON.parse(dataLine);
              acc += content || "";
              setMessages(prev => prev.map(m => m.id === asstId ? { ...m, content: acc } : m));
            } catch {}
          } else if (evType === "error" && dataLine) {
            const { error } = JSON.parse(dataLine);
            throw new Error(error || "Stream error");
          }
        }
      }

      setMessages(prev => prev.map(m => m.id === asstId ? { ...m, isStreaming: false } : m));
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === asstId ? { ...m, isStreaming: false, content: `❌ ${err.message}` } : m
      ));
      toast({ title: "TEE Error", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (configured === false) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-center space-y-4 max-w-md">
          <Shield className="w-16 h-16 mx-auto text-green-500/40" />
          <h2 className="text-2xl font-bold text-green-400">TEE Not Configured</h2>
          <p className="text-sm text-green-400/60">
            Set the <code className="bg-black/60 px-2 py-0.5 rounded text-red-400">REDPILL_API_KEY</code> environment variable
            to enable privacy-first GPU TEE inference.
          </p>
          <a
            href="https://www.redpill.ai/register"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-green-400 hover:text-green-300 underline"
          >
            Get a key at redpill.ai <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-160px)] gap-4 min-h-[600px]">
      <style>{STYLES}</style>

      {/* ── Sidebar ── */}
      <div className="w-60 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        {/* Hero */}
        <div className="rounded-2xl border border-green-500/30 bg-black/60 p-4 text-center space-y-2 tee-badge">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-600 to-cyan-600 flex items-center justify-center">
              <Shield className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-lg font-black shimmer-text">TEE Terminal</h2>
          <p className="text-[10px] text-green-400/60 leading-tight">RedPill AI · GPU Trusted Execution</p>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-900/40 border border-green-500/30">
            <Lock className="w-2.5 h-2.5 text-green-400" />
            <span className="text-[9px] font-bold text-green-300 uppercase tracking-wider">E2EE Protected</span>
          </div>
        </div>

        {/* Model selector */}
        <div className="rounded-xl border border-green-500/20 bg-black/40 p-3 space-y-2">
          <p className="text-[10px] font-bold text-green-400/60 uppercase tracking-widest">Model</p>
          {models.map(m => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              className={`w-full text-xs px-3 py-2 rounded-lg border transition-all font-mono text-left ${
                model === m.id
                  ? "border-green-500/60 bg-green-900/30 text-green-300"
                  : "border-green-500/20 bg-black/40 text-green-400/60 hover:border-green-500/40"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={m.tee ? "text-green-300" : "text-cyan-300"}>{m.name}</span>
                {m.tee && (
                  <span className="text-[8px] bg-green-900/60 border border-green-500/30 text-green-400 px-1 rounded">TEE</span>
                )}
              </div>
              <span className="block text-[9px] opacity-50 mt-0.5">{m.provider}</span>
            </button>
          ))}
        </div>

        {/* System prompt */}
        <div className="rounded-xl border border-green-500/20 bg-black/40 p-3 space-y-2">
          <button
            onClick={() => setShowSystem(v => !v)}
            className="flex items-center justify-between w-full"
          >
            <p className="text-[10px] font-bold text-green-400/60 uppercase tracking-widest">System Prompt</p>
            {showSystem ? <EyeOff className="w-3 h-3 text-green-500/40" /> : <Eye className="w-3 h-3 text-green-500/40" />}
          </button>
          {showSystem && (
            <Textarea
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="text-[10px] min-h-[80px] bg-black/60 border-green-500/20 text-green-300/80 resize-none"
            />
          )}
        </div>

        {/* TEE info */}
        <div className="rounded-xl border border-green-500/20 bg-black/40 p-3 space-y-1.5">
          <p className="text-[10px] font-bold text-green-400/60 uppercase tracking-widest flex items-center gap-1">
            <Cpu className="w-3 h-3" /> TEE Attestation
          </p>
          <div className="text-[9px] text-green-400/40 space-y-1">
            <p>• Inference runs inside GPU enclave</p>
            <p>• Cryptographic attestation per request</p>
            <p>• Zero plaintext exposure to provider</p>
            <p>• OpenAI-compatible API surface</p>
          </div>
          <a
            href="https://docs.redpill.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[9px] text-green-400/40 hover:text-green-300/70 transition-colors"
          >
            docs.redpill.ai <ExternalLink className="w-2 h-2" />
          </a>
        </div>

        {/* MagicBlock panel */}
        <EphemeralChatInfo />
      </div>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-black shimmer-text">TEE Chat</h1>
            <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">
              {selectedModel?.name ?? model}
            </Badge>
            {selectedModel?.tee && (
              <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-400">
                <Lock className="w-2.5 h-2.5 mr-1" />GPU TEE
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setMessages([]); toast({ title: "Chat cleared" }); }}
            className="text-green-400/50 hover:text-red-400 h-7 px-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center gap-6 text-center py-8">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-600 to-cyan-600 flex items-center justify-center tee-badge">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black shimmer-text mb-1">Privacy-First AI Terminal</h3>
                <p className="text-sm text-green-400/50 max-w-sm">
                  Your prompts and responses never leave the GPU enclave in plaintext.
                  Cryptographic attestation proves execution in a Trusted Execution Environment.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-sm w-full">
                {[
                  "Explain TEE attestation in simple terms",
                  "What makes GPU TEE inference private?",
                  "How does ephemeral rollup chat work on Solana?",
                  "Compare DeepSeek V4 Flash vs Gemma 4 for coding tasks",
                ].map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => { setInput(prompt); }}
                    className="text-left p-2.5 rounded-xl border border-green-500/15 bg-green-900/10 text-[10px] text-green-300/60 hover:border-green-500/30 hover:text-green-300/80 hover:bg-green-900/20 transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-green-600 to-cyan-600 flex items-center justify-center mt-1">
                  <Shield className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`max-w-[80%] flex flex-col ${msg.role === "user" ? "items-end" : ""}`}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-green-900/40 border border-green-500/30 text-white rounded-tr-sm"
                    : "bg-black/60 border border-cyan-500/20 text-cyan-50 rounded-tl-sm"
                }`}>
                  {msg.isStreaming && !msg.content ? (
                    <div className="flex items-center gap-1.5 text-green-400/60">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:bg-black/60 prose-pre:border prose-pre:border-green-500/20 prose-code:text-green-300">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-900/50 border border-green-500/30 flex items-center justify-center text-xs font-bold text-green-300 mt-1">
                  U
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 mt-3">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Message TEE Terminal… (Enter to send)"
              className="flex-1 min-h-[52px] max-h-32 resize-none bg-black/60 border-green-500/30 text-white placeholder:text-green-400/30 focus:border-green-500/50 text-sm rounded-xl"
              rows={2}
            />
            <Button
              onClick={sendMessage}
              disabled={!input.trim() || isGenerating}
              className="self-end h-[52px] w-[52px] rounded-xl bg-green-700 hover:bg-green-600 border border-green-400/30 flex-shrink-0 disabled:opacity-40"
            >
              {isGenerating
                ? <Activity className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
            </Button>
          </div>
          <p className="text-[10px] text-green-500/30 text-center mt-2">
            RedPill AI · {selectedModel?.provider ?? model} · TEE-encrypted · Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
