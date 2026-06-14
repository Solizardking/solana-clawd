import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Brain, Zap, Send, ChevronDown, ChevronRight, Wrench, Bot,
  Trash2, Sparkles, Activity, Database, TrendingUp, Newspaper,
  Image, Wallet, Search, BarChart2, Users, Globe, Code, Terminal
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { v4 as uuidv4 } from "uuid";
import { Input } from "@/components/ui/input";


// ─── Types ─────────────────────────────────────────────────────────────────────
type Model = "gpt-5.5" | "gpt-5" | "deepseek-v4-pro" | "deepseek-v4-flash" | "kimi-k2.6";
type ReasoningEffort = "low" | "medium" | "high" | "max";
type MsgRole = "user" | "assistant" | "tool_call" | "tool_result";

interface Msg {
  id: string;
  role: MsgRole;
  content: string;
  reasoning?: string;
  toolName?: string;
  toolArgs?: any;
  toolId?: string;
  isStreaming?: boolean;
  imageUrl?: string;
}

interface HealthData {
  openaiConfigured?: boolean;
  deepseekConfigured: boolean;
  moonshotConfigured?: boolean;
  honchoConfigured: boolean;
  honchoConnected: boolean;
  models: string[];
}

interface AgentRow {
  assetAddress: string;
  name: string;
  agentType: string;
  isRegistered: boolean;
  createdAt: string;
  network: string;
}

interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  cacheHitRate: number;
  toolCalls: number;
}

const MODEL_OPTIONS: Array<{ value: Model; label: string; description: string; provider: "OpenAI" | "DeepSeek" | "Kimi" }> = [
  { value: "gpt-5.5", label: "GPT-5.5", description: "Default trading intelligence", provider: "OpenAI" },
  { value: "gpt-5", label: "GPT-5", description: "OpenAI reasoning", provider: "OpenAI" },
  { value: "deepseek-v4-pro", label: "V4 Pro", description: "Max intelligence", provider: "DeepSeek" },
  { value: "deepseek-v4-flash", label: "V4 Flash", description: "Fast and cheaper", provider: "DeepSeek" },
  { value: "kimi-k2.6", label: "Kimi K2.6", description: "Moonshot agent model", provider: "Kimi" },
];

function modelShortLabel(model: Model) {
  return MODEL_OPTIONS.find((option) => option.value === model)?.label ?? model;
}

function modelProvider(model: Model) {
  return MODEL_OPTIONS.find((option) => option.value === model)?.provider ?? "OpenAI";
}

// ─── Animations ────────────────────────────────────────────────────────────────
const STYLES = `
  @keyframes clawL {
    0%,100% { transform: rotate(-15deg) translateX(-2px); }
    50%      { transform: rotate(10deg)  translateX(2px);  }
  }
  @keyframes clawR {
    0%,100% { transform: rotate(15deg)  translateX(2px);  }
    50%      { transform: rotate(-10deg) translateX(-2px); }
  }
  @keyframes bodyBob {
    0%,100% { transform: translateY(0px) rotate(-1deg); }
    50%      { transform: translateY(-6px) rotate(1deg); }
  }
  @keyframes glow {
    0%,100% { filter: drop-shadow(0 0 8px #ef4444aa) drop-shadow(0 0 20px #dc262666); }
    50%      { filter: drop-shadow(0 0 16px #ef4444ff) drop-shadow(0 0 40px #dc2626cc); }
  }
  @keyframes pulse-ring {
    0%   { transform: scale(0.9); opacity: 0.8; }
    70%  { transform: scale(1.6); opacity: 0; }
    100% { transform: scale(1.6); opacity: 0; }
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  .claw-l  { animation: clawL  1.4s ease-in-out infinite; transform-origin: bottom right; }
  .claw-r  { animation: clawR  1.4s ease-in-out infinite; transform-origin: bottom left; }
  .lobster-body { animation: bodyBob 2.2s ease-in-out infinite, glow 2.2s ease-in-out infinite; }
  .think-pulse { animation: pulse-ring 1.5s cubic-bezier(0.215,0.61,0.355,1) infinite; }
  .shimmer-text {
    background: linear-gradient(90deg, #a78bfa 0%, #f472b6 25%, #fb923c 50%, #f472b6 75%, #a78bfa 100%);
    background-size: 200% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: shimmer 3s linear infinite;
  }
`;

function AnimatedLobster({ size = 1, thinking = false }: { size?: number; thinking?: boolean }) {
  const s = 120 * size;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: s, height: s }}>
      {thinking && <div className="think-pulse absolute inset-0 rounded-full border-2 border-red-500/60" />}
      <svg viewBox="0 0 120 120" width={s} height={s} className="lobster-body" fill="none">
        <g className="claw-l">
          <ellipse cx="22" cy="52" rx="14" ry="9" fill="#dc2626" />
          <ellipse cx="12" cy="48" rx="8" ry="6" fill="#ef4444" />
          <ellipse cx="10" cy="57" rx="6" ry="5" fill="#ef4444" />
        </g>
        <g className="claw-r">
          <ellipse cx="98" cy="52" rx="14" ry="9" fill="#dc2626" />
          <ellipse cx="108" cy="48" rx="8" ry="6" fill="#ef4444" />
          <ellipse cx="110" cy="57" rx="6" ry="5" fill="#ef4444" />
        </g>
        <ellipse cx="60" cy="72" rx="26" ry="34" fill="#b91c1c" />
        <ellipse cx="60" cy="60" rx="22" ry="20" fill="#dc2626" />
        <ellipse cx="60" cy="42" rx="20" ry="16" fill="#dc2626" />
        <circle cx="51" cy="36" r="5" fill="#1a1a1a" />
        <circle cx="69" cy="36" r="5" fill="#1a1a1a" />
        <circle cx="52" cy="35" r="2" fill="white" />
        <circle cx="70" cy="35" r="2" fill="white" />
        {thinking && <>
          <circle cx="51" cy="36" r="5" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.8" />
          <circle cx="69" cy="36" r="5" fill="none" stroke="#fbbf24" strokeWidth="1.5" opacity="0.8" />
        </>}
        <line x1="50" y1="27" x2="38" y2="12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <line x1="70" y1="27" x2="82" y2="12" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="60" cy="94" rx="18" ry="10" fill="#b91c1c" />
        <ellipse cx="60" cy="106" rx="13" ry="7" fill="#991b1b" />
        <ellipse cx="44" cy="112" rx="8" ry="5" fill="#b91c1c" transform="rotate(-20 44 112)" />
        <ellipse cx="60" cy="115" rx="8" ry="5" fill="#991b1b" />
        <ellipse cx="76" cy="112" rx="8" ry="5" fill="#b91c1c" transform="rotate(20 76 112)" />
        {[30, 38, 46, 54, 62, 70].map((y, i) => (
          <g key={i}>
            <line x1="35" y1={y} x2="22" y2={y + 8} stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="85" y1={y} x2="98" y2={y + 8} stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function ThinkingBlock({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-yellow-400/70 hover:text-yellow-300 transition-colors"
      >
        <Brain className="w-3 h-3" />
        <span className="font-semibold tracking-wide">Reasoning chain</span>
        <span className="ml-auto text-yellow-500/40">{content.length.toLocaleString()} chars</span>
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="px-4 pb-3 text-xs text-yellow-300/60 font-mono whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed border-t border-yellow-500/10">
          {content}
        </div>
      )}
    </div>
  );
}

function ToolCallCard({ name, args, result }: { name: string; args?: any; result?: string }) {
  const [open, setOpen] = useState(false);
  const running = result === undefined;
  const toolIcons: Record<string, string> = {
    search_web: "🔍", get_token_price: "💰", get_trending_tokens: "🔥",
    get_market_movers: "📈", get_token_holders: "👥", scan_wallet_portfolio: "💼",
    get_wallet_balance: "👛", get_crypto_news: "📰", generate_meme_image: "🎨",
    mint_solana_agent: "🤖", register_solana_agent: "📋",
    list_deployed_agents: "📊", get_rpc_status: "🌐",
    helius_pasted_input_context: "🛰️",
  };
  const icon = toolIcons[name] || "🔧";
  return (
    <div className="my-1 rounded-lg border border-blue-500/30 bg-blue-500/5 overflow-hidden text-xs">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-blue-400/80 hover:text-blue-300 transition-colors"
      >
        <span>{icon}</span>
        <span className="font-bold font-mono">{name}</span>
        {running
          ? <span className="ml-auto flex items-center gap-1 text-yellow-400/60"><Activity className="w-3 h-3 animate-pulse" />running</span>
          : <Badge variant="outline" className="ml-auto text-[9px] border-green-500/30 text-green-400 py-0">done</Badge>
        }
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-blue-500/10">
          {args && (
            <div>
              <p className="text-blue-400/40 text-[10px] uppercase tracking-widest mb-1">Input</p>
              <pre className="text-blue-300/70 bg-black/40 rounded p-2 overflow-x-auto text-[10px]">{JSON.stringify(args, null, 2)}</pre>
            </div>
          )}
          {result && (
            <div>
              <p className="text-green-400/40 text-[10px] uppercase tracking-widest mb-1">Result</p>
              <pre className="text-green-300/70 bg-black/40 rounded p-2 overflow-x-auto text-[10px] max-h-48 overflow-y-auto whitespace-pre-wrap">{result}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  if (msg.role === "tool_call") {
    return <ToolCallCard name={msg.toolName || "tool"} args={msg.toolArgs} result={msg.content || undefined} />;
  }
  if (msg.role === "tool_result") {
    return null;
  }

  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="flex-shrink-0 mt-1">
          <AnimatedLobster size={0.3} thinking={msg.isStreaming} />
        </div>
      )}
      <div className={`max-w-[80%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {msg.reasoning && <ThinkingBlock content={msg.reasoning} />}
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-red-900/40 border border-red-500/30 text-white rounded-tr-sm"
            : "bg-black/60 border border-purple-500/20 text-purple-50 rounded-tl-sm"
        }`}>
          {msg.isStreaming && !msg.content ? (
            <div className="flex items-center gap-1.5 text-purple-400/60">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:bg-black/60 prose-pre:border prose-pre:border-purple-500/20 prose-code:text-red-300 prose-headings:text-purple-200">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {msg.imageUrl && (
          <img src={msg.imageUrl} alt="Generated" className="rounded-xl max-w-xs border border-purple-500/30 mt-1" />
        )}
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-900/50 border border-red-500/30 flex items-center justify-center text-xs font-bold text-red-300 mt-1">
          U
        </div>
      )}
    </div>
  );
}

function AgentsPanel() {
  const { data } = useQuery<{ agents: AgentRow[] }>({
    queryKey: ["/api/deepseek/agents"],
    refetchInterval: 15000,
  });
  const agents = data?.agents || [];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-purple-400/60 font-bold uppercase tracking-widest">
        <Database className="w-3 h-3" />
        Deployed Agents ({agents.length})
      </div>
      {agents.length === 0 ? (
        <p className="text-xs text-purple-500/40 italic">No agents yet. Ask CLAWD to mint one!</p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {agents.map(a => (
            <div key={a.assetAddress} className="rounded-lg border border-purple-500/20 bg-black/40 p-2 text-xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white truncate max-w-[110px]">{a.name}</span>
                <Badge variant="outline" className={`text-[9px] py-0 ${a.isRegistered ? "border-green-500/40 text-green-400" : "border-yellow-500/40 text-yellow-400"}`}>
                  {a.isRegistered ? "Registered" : "Minted"}
                </Badge>
              </div>
              <div className="text-purple-400/50 truncate font-mono text-[9px]">{a.assetAddress?.slice(0, 22)}...</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Quick actions ──────────────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  { icon: <TrendingUp className="w-3 h-3" />, label: "Trending tokens", prompt: "What are the top trending Solana tokens by volume right now? Show me gainers too." },
  { icon: <BarChart2 className="w-3 h-3" />, label: "Market movers", prompt: "Show me today's biggest gainers and losers on Solana DEXes." },
  { icon: <Newspaper className="w-3 h-3" />, label: "Latest news", prompt: "Get the latest Solana and crypto news for me." },
  { icon: <Bot className="w-3 h-3" />, label: "Analyze CLAWD", prompt: "Do a deep analysis of the CLAWD token (8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump): price, holders, and latest news." },
  { icon: <Image className="w-3 h-3" />, label: "Generate meme", prompt: "Generate a cartoon meme image of a glowing red lobster wearing a pirate hat, holding Solana coins." },
  { icon: <Sparkles className="w-3 h-3" />, label: "Mint agent", prompt: "Mint a new AI agent called 'CODEX Oracle' — an on-chain data analyst with capabilities: price analysis, trend detection, and alpha generation." },
];

// ─── FIM Panel (Fill-In-the-Middle Code Completion) ──────────────────────────
function FIMPanel() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [suffix, setSuffix] = useState("");
  const [maxTokens, setMaxTokens] = useState(256);
  const [temperature, setTemperature] = useState(0.2);
  const [topP, setTopP] = useState(0.9);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState("");
  const [streamingResult, setStreamingResult] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamingResult, result]);

  const runFIM = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isGenerating) return;
    setIsGenerating(true);
    setResult("");
    setStreamingResult("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/deepseek/fim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-v4-pro",
          prompt: trimmedPrompt,
          suffix: suffix.trim() || undefined,
          max_tokens: maxTokens,
          temperature,
          top_p: topP,
          stream: true,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`FIM failed: ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let accText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";

        for (const block of blocks) {
          if (!block.trim()) continue;
          const lines = block.split("\n");
          let evType = "";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) evType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataLine = line.slice(6).trim();
          }
          if (!evType || !dataLine) continue;
          try {
            const json = JSON.parse(dataLine);
            if (evType === "text") {
              accText += json.content || "";
              setStreamingResult(accText);
            } else if (evType === "error") {
              throw new Error(json.error || "FIM error");
            }
          } catch (e) {
            if (evType === "error") throw e;
          }
        }
      }

      setResult(accText);
      setStreamingResult("");
    } catch (err: any) {
      toast({ title: "FIM Error", description: err.message, variant: "destructive" });
      setResult(`❌ Error: ${err.message}`);
    } finally {
      setIsGenerating(false);
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 gap-4">
      <div className="flex items-center gap-2">
        <Code className="w-5 h-5 text-blue-400" />
        <h2 className="text-lg font-black shimmer-text">FIM Completion</h2>
        <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">Beta</Badge>
        <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">deepseek-v4-pro</Badge>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-3 space-y-3">
          {/* Prompt (prefix) input */}
          <div>
            <label className="text-[10px] font-bold text-blue-400/60 uppercase tracking-widest mb-1.5 block">
              Prefix (code before cursor)
            </label>
            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="function fibonacci(n) {"
              className="min-h-[120px] font-mono text-xs bg-black/60 border-blue-500/30 text-white placeholder:text-blue-400/20 focus:border-blue-500/50 rounded-xl resize-y"
              rows={5}
            />
          </div>

          {/* Suffix input */}
          <div>
            <label className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest mb-1.5 block">
              Suffix (code after cursor) <span className="text-purple-500/40 normal-case">— optional</span>
            </label>
            <Textarea
              value={suffix}
              onChange={e => setSuffix(e.target.value)}
              placeholder="return result;"
              className="min-h-[80px] font-mono text-xs bg-black/60 border-purple-500/30 text-white placeholder:text-purple-400/20 focus:border-purple-500/50 rounded-xl resize-y"
              rows={4}
            />
          </div>
        </div>

        {/* Parameters */}
        <div className="col-span-2 space-y-3">
          <div className="rounded-xl border border-blue-500/20 bg-black/40 p-3 space-y-3">
            <p className="text-[10px] font-bold text-blue-400/60 uppercase tracking-widest">Parameters</p>

            <div>
              <label className="text-[10px] text-blue-400/50 block mb-1">Max Tokens: <span className="text-white font-mono">{maxTokens}</span></label>
              <input
                type="range" min={16} max={4096} step={16}
                value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] text-blue-400/50 block mb-1">Temperature: <span className="text-white font-mono">{temperature.toFixed(2)}</span></label>
              <input
                type="range" min={0} max={2} step={0.05}
                value={temperature}
                onChange={e => setTemperature(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div>
              <label className="text-[10px] text-blue-400/50 block mb-1">Top P: <span className="text-white font-mono">{topP.toFixed(2)}</span></label>
              <input
                type="range" min={0} max={1} step={0.05}
                value={topP}
                onChange={e => setTopP(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <Button
              onClick={runFIM}
              disabled={!prompt.trim() || isGenerating}
              className="w-full h-9 rounded-xl bg-blue-600 hover:bg-blue-500 border border-blue-400/30 text-xs disabled:opacity-40"
            >
              {isGenerating ? (
                <><Activity className="w-3.5 h-3.5 animate-spin mr-1.5" /> Generating...</>
              ) : (
                <><Code className="w-3.5 h-3.5 mr-1.5" /> Complete</>
              )}
            </Button>
          </div>

          {/* Quick templates */}
          <div className="rounded-xl border border-purple-500/20 bg-black/40 p-3 space-y-2">
            <p className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest">Templates</p>
            <div className="space-y-1.5">
              {[
                { label: "JavaScript function", prefix: "function mergeSort(arr) {\n  if (arr.length <= 1) return arr;\n  ", suffix: "}" },
                { label: "Python function", prefix: "def quicksort(arr):\n    ", suffix: "    return arr" },
                { label: "React component", prefix: "const MyComponent = () => {\n  ", suffix: "};\n\nexport default MyComponent;" },
                { label: "Rust function", prefix: "fn process_data(data: &[u8]) -> Result<String, Error> {\n    ", suffix: "}" },
              ].map((t, i) => (
                <button
                  key={i}
                  onClick={() => { setPrompt(t.prefix); setSuffix(t.suffix); setResult(""); setStreamingResult(""); }}
                  className="w-full text-[10px] text-left px-2.5 py-1.5 rounded-lg border border-purple-500/20 bg-black/40 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all"
                >
                  <span className="text-purple-300/70 font-medium">{t.label}</span>
                  <span className="block text-[8px] text-purple-500/40 mt-0.5 font-mono truncate">{t.prefix.slice(0, 40)}...</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Result */}
      {(streamingResult || result) && (
        <div ref={resultRef} className="rounded-xl border border-blue-500/30 bg-black/60 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-blue-500/10">
            <div className="flex items-center gap-2">
              <Code className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-bold text-blue-400/80">Completion</span>
            </div>
            {(streamingResult || result) && !result.includes("❌") && (
              <Badge variant="outline" className="text-[9px] border-green-500/30 text-green-400 py-0">
                {result ? `${result.length} chars` : `${streamingResult.length} chars`}
              </Badge>
            )}
          </div>
          <pre className="p-4 text-xs font-mono text-blue-100 whitespace-pre-wrap overflow-x-auto max-h-64 overflow-y-auto leading-relaxed">
            {isStreaming && streamingResult ? (
              <>
                {streamingResult}
                <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-0.5 align-text-bottom" />
              </>
            ) : result || ""}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function DeepSeekPage() {
  const { publicKey } = useWallet();
  const { toast } = useToast();
  const [sessionId] = useState(() => uuidv4());
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<Model>("deepseek-v4-pro");
  const [thinking, setThinking] = useState(true);
  const [useTools, setUseTools] = useState(true);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("high");
  const [isGenerating, setIsGenerating] = useState(false);
  const [usage, setUsage] = useState<UsageStats>({ promptTokens: 0, completionTokens: 0, cacheHitRate: 0, toolCalls: 0 });
  const [tab, setTab] = useState<"chat" | "fim">("chat");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: health } = useQuery<HealthData>({ queryKey: ["/api/deepseek/health"], retry: false });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const buildApiMessages = useCallback(() => {
    return messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content, reasoning_content: m.reasoning }));
  }, [messages]);


  const sendMessage = async (overrideInput?: string) => {
    const userText = (overrideInput ?? input).trim();
    if (!userText || isGenerating) return;
    setInput("");
    setIsGenerating(true);

    const userMsg: Msg = { id: uuidv4(), role: "user", content: userText };
    const assistantMsgId = uuidv4();
    const assistantMsg: Msg = { id: assistantMsgId, role: "assistant", content: "", isStreaming: true };
    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      const res = await fetch("/api/deepseek/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...buildApiMessages(), { role: "user", content: userText }],
          sessionId,
          walletAddress: publicKey?.toBase58(),
          model,
          thinkingEnabled: thinking,
          useTools,
          reasoningEffort,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let accText = "";
      let accReason = "";
      let toolCallCount = 0;

      // Track open tool calls: toolId -> msgId
      const openToolCalls = new Map<string, string>();

      const processEvent = (evType: string, rawData: string) => {
        try {
          const json = JSON.parse(rawData);
          switch (evType) {
            case "thinking":
              accReason += json.content || "";
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, reasoning: accReason } : m));
              break;
            case "text":
              accText += json.content || "";
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: accText } : m));
              break;
            case "tool_call": {
              toolCallCount++;
              const tcMsgId = uuidv4();
              openToolCalls.set(json.id || json.name, tcMsgId);
              setMessages(prev => [...prev, {
                id: tcMsgId, role: "tool_call", content: "",
                toolName: json.name, toolArgs: json.args, toolId: json.id,
              }]);
              break;
            }
            case "tool_result": {
              const tcKey = json.id || json.name;
              const tcMsgId = openToolCalls.get(tcKey);
              if (tcMsgId) {
                // Extract image URL if present
                const imgMatch = json.result?.match(/URL:\s*(https?:\/\/[^\s]+)/);
                setMessages(prev => prev.map(m =>
                  m.id === tcMsgId
                    ? { ...m, content: json.result, imageUrl: imgMatch?.[1] }
                    : m
                ));
              } else {
                // fallback: find last tool_call with same name
                setMessages(prev => {
                  const idx = [...prev].reverse().findIndex(m => m.role === "tool_call" && m.toolName === json.name && !m.content);
                  if (idx === -1) return prev;
                  const ri = prev.length - 1 - idx;
                  const np = [...prev];
                  np[ri] = { ...np[ri], content: json.result };
                  return np;
                });
              }
              break;
            }
            case "done":
              setUsage({
                promptTokens: json.usage?.prompt_tokens || 0,
                completionTokens: json.usage?.completion_tokens || 0,
                cacheHitRate: json.cacheHitRate || 0,
                toolCalls: toolCallCount,
              });
              break;
            case "error":
              throw new Error(json.error || "Unknown error from server");
          }
        } catch (e) {
          if (evType === "error") throw e;
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        // SSE events are delimited by double newlines
        const blocks = buf.split("\n\n");
        buf = blocks.pop() ?? "";

        for (const block of blocks) {
          if (!block.trim()) continue;
          const lines = block.split("\n");
          let evType = "";
          let dataLine = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) evType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataLine = line.slice(6).trim();
          }
          if (evType && dataLine) processEvent(evType, dataLine);
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, isStreaming: false, content: accText || m.content } : m
      ));
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, isStreaming: false, content: `❌ Error: ${err.message}` }
          : m
      ));
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages([]);
    setUsage({ promptTokens: 0, completionTokens: 0, cacheHitRate: 0, toolCalls: 0 });
    toast({ title: "Chat cleared" });
  };

  const effortOptions: { value: ReasoningEffort; label: string; color: string }[] = [
    { value: "low", label: "Low", color: "text-green-400" },
    { value: "medium", label: "Med", color: "text-yellow-400" },
    { value: "high", label: "High", color: "text-orange-400" },
    { value: "max", label: "Max", color: "text-red-400" },
  ];

  return (
    <div className="flex h-[calc(100vh-160px)] gap-4 min-h-[600px]">
      <style>{STYLES}</style>

      {/* ── Sidebar ── */}
      <div className="w-60 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        {/* Hero */}
        <div className="rounded-2xl border border-red-500/30 bg-black/60 p-4 text-center space-y-2">
          <AnimatedLobster size={0.7} thinking={isGenerating} />
          <h2 className="text-lg font-black shimmer-text">CLAWD</h2>
          <p className="text-[10px] text-purple-400/60 leading-tight">OpenAI default · Agentic · Solana</p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${health?.openaiConfigured ? "bg-green-400" : "bg-red-500"}`} />
              <span className="text-[10px] text-purple-400/50">OpenAI</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${health?.deepseekConfigured ? "bg-green-400" : "bg-red-500"}`} />
              <span className="text-[10px] text-purple-400/50">DeepSeek</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${health?.moonshotConfigured ? "bg-green-400" : "bg-red-500"}`} />
              <span className="text-[10px] text-purple-400/50">Kimi</span>
            </div>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${health?.honchoConnected ? "bg-green-400" : "bg-yellow-500"}`} />
              <span className="text-[10px] text-purple-400/50">Honcho</span>
            </div>
          </div>
        </div>

        {/* Model */}
        <div className="rounded-xl border border-purple-500/20 bg-black/40 p-3 space-y-2">
          <p className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest">Model</p>
          {MODEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setModel(option.value)}
              className={`w-full text-xs px-3 py-2 rounded-lg border transition-all font-mono text-left ${
                model === option.value
                  ? "border-red-500/60 bg-red-900/30 text-red-300"
                  : "border-purple-500/20 bg-black/40 text-purple-400/60 hover:border-purple-500/40"
              }`}
            >
              {option.label}
              <span className="block text-[9px] opacity-50 mt-0.5">{option.provider} · {option.description}</span>
            </button>
          ))}
        </div>

        {/* Settings */}
        <div className="rounded-xl border border-purple-500/20 bg-black/40 p-3 space-y-3">
          <p className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest">Settings</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={thinking} onChange={e => setThinking(e.target.checked)} className="accent-red-500" />
            <span className="text-xs text-purple-300/70 flex items-center gap-1"><Brain className="w-3 h-3" /> Thinking mode</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={useTools} onChange={e => setUseTools(e.target.checked)} className="accent-red-500" />
            <span className="text-xs text-purple-300/70 flex items-center gap-1"><Wrench className="w-3 h-3" /> Agentic tools</span>
          </label>
          {thinking && (
            <div>
              <p className="text-[9px] text-purple-400/40 uppercase tracking-widest mb-1.5">Reasoning depth</p>
              <div className="grid grid-cols-4 gap-1">
                {effortOptions.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setReasoningEffort(opt.value)}
                    className={`text-[10px] py-1 rounded border transition-all font-mono ${
                      reasoningEffort === opt.value
                        ? `border-current ${opt.color} bg-white/5`
                        : "border-purple-500/20 text-purple-400/40 hover:border-purple-500/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Usage stats */}
        {(usage.promptTokens > 0 || usage.toolCalls > 0) && (
          <div className="rounded-xl border border-purple-500/20 bg-black/40 p-3 space-y-1.5">
            <p className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest flex items-center gap-1">
              <Activity className="w-3 h-3" /> Session stats
            </p>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div className="rounded bg-black/40 px-2 py-1">
                <div className="text-purple-500/50">Prompt</div>
                <div className="text-white font-mono">{usage.promptTokens.toLocaleString()}</div>
              </div>
              <div className="rounded bg-black/40 px-2 py-1">
                <div className="text-purple-500/50">Output</div>
                <div className="text-white font-mono">{usage.completionTokens.toLocaleString()}</div>
              </div>
              <div className="rounded bg-black/40 px-2 py-1">
                <div className="text-purple-500/50">Cache hit</div>
                <div className="text-green-400 font-mono">{usage.cacheHitRate}%</div>
              </div>
              <div className="rounded bg-black/40 px-2 py-1">
                <div className="text-purple-500/50">Tool calls</div>
                <div className="text-blue-400 font-mono">{usage.toolCalls}</div>
              </div>
            </div>
          </div>
        )}

        {/* Tools list */}
        <div className="rounded-xl border border-purple-500/20 bg-black/40 p-3">
          <p className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest mb-2">
            <Globe className="w-3 h-3 inline mr-1" />Tools ({useTools ? "13" : "off"})
          </p>
          <div className="space-y-1">
            {[
              { icon: <Search className="w-2.5 h-2.5" />, name: "search_web" },
              { icon: <BarChart2 className="w-2.5 h-2.5" />, name: "get_token_price" },
              { icon: <TrendingUp className="w-2.5 h-2.5" />, name: "get_trending_tokens" },
              { icon: <Activity className="w-2.5 h-2.5" />, name: "get_market_movers" },
              { icon: <Users className="w-2.5 h-2.5" />, name: "get_token_holders" },
              { icon: <Wallet className="w-2.5 h-2.5" />, name: "scan_wallet_portfolio" },
              { icon: <Wallet className="w-2.5 h-2.5" />, name: "get_wallet_balance" },
              { icon: <Newspaper className="w-2.5 h-2.5" />, name: "get_crypto_news" },
              { icon: <Image className="w-2.5 h-2.5" />, name: "generate_meme_image" },
              { icon: <Bot className="w-2.5 h-2.5" />, name: "mint_solana_agent" },
              { icon: <Sparkles className="w-2.5 h-2.5" />, name: "register_solana_agent" },
              { icon: <Database className="w-2.5 h-2.5" />, name: "list_deployed_agents" },
              { icon: <Zap className="w-2.5 h-2.5" />, name: "get_rpc_status" },
            ].map(t => (
              <div key={t.name} className={`flex items-center gap-1.5 text-[9px] ${useTools ? "text-blue-400/60" : "text-purple-500/30"}`}>
                {t.icon}
                <code className="font-mono truncate">{t.name}</code>
              </div>
            ))}
          </div>
        </div>

        {/* Agents panel */}
        <div className="rounded-xl border border-purple-500/20 bg-black/40 p-3">
          <AgentsPanel />
        </div>
      </div>

      {/* ── Tab Switcher ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-1 mb-3 flex-shrink-0 border-b border-purple-500/10 pb-2">
          <button
            onClick={() => setTab("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-bold transition-all ${
              tab === "chat"
                ? "bg-red-900/30 text-red-300 border-b-2 border-red-500"
                : "text-purple-400/50 hover:text-purple-300 hover:bg-purple-500/5"
            }`}
          >
            <Brain className="w-3.5 h-3.5" />
            Chat
          </button>
          <button
            onClick={() => setTab("fim")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-bold transition-all ${
              tab === "fim"
                ? "bg-blue-900/30 text-blue-300 border-b-2 border-blue-500"
                : "text-purple-400/50 hover:text-purple-300 hover:bg-purple-500/5"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            FIM <span className="text-[9px] opacity-60">(Beta)</span>
          </button>
        </div>

        {tab === "chat" ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black shimmer-text">CLAWD Terminal</h1>
                <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                  {modelShortLabel(model)}
                </Badge>
                <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400">
                  {modelProvider(model)}
                </Badge>
                {thinking && (
                  <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-400">
                    <Brain className="w-2.5 h-2.5 mr-1" />{reasoningEffort}
                  </Badge>
                )}
                {useTools && (
                  <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                    <Wrench className="w-2.5 h-2.5 mr-1" />tools
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={clearChat} className="text-purple-400/50 hover:text-red-400 h-7 px-2">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center gap-6 text-center py-8">
                  <AnimatedLobster size={0.9} />
                  <div>
                    <h3 className="text-xl font-black shimmer-text mb-1">Open CLAWD Terminal</h3>
                    <p className="text-sm text-purple-400/50 max-w-sm">
                      Pick DeepSeek or Moonshot Kimi, then use thinking mode, 13 agentic tools, and persistent memory.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-w-lg w-full">
                    {QUICK_ACTIONS.map((qa, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(qa.prompt)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-purple-500/20 bg-black/40 hover:border-purple-500/40 hover:bg-purple-500/5 transition-all text-left group"
                      >
                        <span className="text-purple-400/60 group-hover:text-purple-300 transition-colors">{qa.icon}</span>
                        <span className="text-xs text-purple-300/70 group-hover:text-purple-200 transition-colors">{qa.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map(msg => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex-shrink-0 mt-3 space-y-2">
              {messages.length > 0 && (
                <div className="flex gap-1.5 flex-wrap">
                  {QUICK_ACTIONS.slice(0, 4).map((qa, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(qa.prompt)}
                      disabled={isGenerating}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full border border-purple-500/20 bg-black/40 hover:border-purple-500/40 text-[10px] text-purple-400/60 hover:text-purple-300 transition-all disabled:opacity-40"
                    >
                      {qa.icon}
                      {qa.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Ask CLAWD anything… prices, trends, news, mint agents, generate art…"
                  className="flex-1 min-h-[52px] max-h-32 resize-none bg-black/60 border-purple-500/30 text-white placeholder:text-purple-400/30 focus:border-red-500/50 text-sm rounded-xl"
                  rows={2}
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || isGenerating}
                  className="self-end h-[52px] w-[52px] rounded-xl bg-red-600 hover:bg-red-500 border border-red-400/30 flex-shrink-0 disabled:opacity-40"
                >
                  {isGenerating
                    ? <Activity className="w-4 h-4 animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                </Button>
              </div>
              <p className="text-[10px] text-purple-500/30 text-center">
                {modelProvider(model)} {modelShortLabel(model)} · {thinking ? `thinking:${reasoningEffort}` : "no-think"} · Enter to send · Shift+Enter for newline
              </p>
            </div>
          </>
        ) : (
          <FIMPanel />
        )}
      </div>
    </div>

  );
}
