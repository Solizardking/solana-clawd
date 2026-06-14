import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Send, Brain, ChevronDown, ChevronRight, Activity,
  Trash2, Sparkles, Settings
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { v4 as uuidv4 } from "uuid";

// ─── Types ─────────────────────────────────────────────────────────────────────
type HermesModel = "Hermes-4.3-36B" | "Hermes-4-70B" | "Hermes-4-405B";

interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function HermesPage() {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState<HermesModel>("Hermes-4.3-36B");
  const [reasoning, setReasoning] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Check if Hermes is configured
  useEffect(() => {
    fetch("/api/hermes/status")
      .then(r => r.json())
      .then(d => setConfigured(d.configured))
      .catch(() => setConfigured(false));
  }, []);

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
      const res = await fetch("/api/hermes/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...messages.filter(m => m.role === "user" || m.role === "assistant")
              .map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userText },
          ],
          model,
          reasoning,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`Stream failed: ${res.status}`);

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let accText = "";

      const processEvent = (evType: string, rawData: string) => {
        try {
          const json = JSON.parse(rawData);
          switch (evType) {
            case "text":
              accText += json.content || "";
              setMessages(prev => prev.map(m => m.id === assistantMsgId ? { ...m, content: accText } : m));
              break;
            case "error":
              throw new Error(json.error || "Unknown error");
          }
        } catch (e) {
          if (evType === "error") throw e;
        }
      };

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
          if (evType && dataLine) processEvent(evType, dataLine);
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, isStreaming: false } : m
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
    toast({ title: "Chat cleared" });
  };

  const modelInfo: Record<HermesModel, { label: string; desc: string; color: string }> = {
    "Hermes-4.3-36B": { label: "Hermes 4.3 36B", desc: "Flagship reasoning", color: "text-purple-400" },
    "Hermes-4-70B": { label: "Hermes 4 70B", desc: "Full-size reasoning", color: "text-blue-400" },
    "Hermes-4-405B": { label: "Hermes 4 405B", desc: "Max intelligence MoE", color: "text-amber-400" },
  };

  if (configured === false) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="text-center space-y-4 max-w-md">
          <Brain className="w-16 h-16 mx-auto text-purple-500/40" />
          <h2 className="text-2xl font-bold shimmer-text">Hermes Not Configured</h2>
          <p className="text-sm text-purple-400/60">
            Set the <code className="bg-black/60 px-2 py-0.5 rounded text-red-400">HERMES_API_KEY</code> environment variable
            to use Nous Research Hermes models.
          </p>
          <p className="text-xs text-purple-500/40">
            Get your API key from <a href="https://portal.nousresearch.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-300">portal.nousresearch.com</a>
          </p>
        </div>
      </div>
    );
  }

  const STYLES = `
    @keyframes shimmer {
      0%   { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    .shimmer-text {
      background: linear-gradient(90deg, #a78bfa 0%, #f472b6 25%, #fb923c 50%, #f472b6 75%, #a78bfa 100%);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: shimmer 3s linear infinite;
    }
  `;

  return (
    <div className="flex h-[calc(100vh-160px)] gap-4 min-h-[600px]">
      <style>{STYLES}</style>

      {/* ── Sidebar ── */}
      <div className="w-60 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        {/* Hero */}
        <div className="rounded-2xl border border-purple-500/30 bg-black/60 p-4 text-center space-y-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
              <Brain className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-lg font-black shimmer-text">Hermes</h2>
          <p className="text-[10px] text-purple-400/60 leading-tight">Nous Research · Inference API</p>
        </div>

        {/* Model selector */}
        <div className="rounded-xl border border-purple-500/20 bg-black/40 p-3 space-y-2">
          <p className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest">Model</p>
          {(Object.keys(modelInfo) as HermesModel[]).map(m => (
            <button
              key={m}
              onClick={() => setModel(m)}
              className={`w-full text-xs px-3 py-2 rounded-lg border transition-all font-mono text-left ${
                model === m
                  ? "border-purple-500/60 bg-purple-900/30 text-purple-300"
                  : "border-purple-500/20 bg-black/40 text-purple-400/60 hover:border-purple-500/40"
              }`}
            >
              <span className={modelInfo[m].color}>{modelInfo[m].label}</span>
              <span className="block text-[9px] opacity-50 mt-0.5">{modelInfo[m].desc}</span>
            </button>
          ))}
        </div>

        {/* Settings */}
        <div className="rounded-xl border border-purple-500/20 bg-black/40 p-3 space-y-3">
          <p className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest flex items-center gap-1">
            <Settings className="w-3 h-3" /> Settings
          </p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={reasoning} onChange={e => setReasoning(e.target.checked)} className="accent-purple-500" />
            <span className="text-xs text-purple-300/70 flex items-center gap-1"><Brain className="w-3 h-3" /> Reasoning ({'<think>'})</span>
          </label>
        </div>

        {/* API info */}
        <div className="rounded-xl border border-purple-500/20 bg-black/40 p-3 space-y-1.5">
          <p className="text-[10px] font-bold text-purple-400/60 uppercase tracking-widest">API</p>
          <div className="text-[9px] text-purple-400/40 space-y-1">
            <p>Base: inference-api.nousresearch.com/v1</p>
            <p>Format: OpenAI-compatible</p>
            <p>Pay with: API key or x402/Solana USDC</p>
          </div>
        </div>
      </div>

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black shimmer-text">Hermes Research</h1>
            <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">
              {modelInfo[model].label}
            </Badge>
            {reasoning && (
              <Badge variant="outline" className="text-[10px] border-yellow-500/30 text-yellow-400">
                <Brain className="w-2.5 h-2.5 mr-1" />reasoning
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
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-black shimmer-text mb-1">Hermes Research Terminal</h3>
                <p className="text-sm text-purple-400/50 max-w-sm">
                  Powered by Nous Research Hermes models. OpenAI-compatible chat with optional
                  {'<think>'} reasoning mode.
                </p>
              </div>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center mt-1">
                  <Brain className="w-4 h-4 text-white" />
                </div>
              )}
              <div className={`max-w-[80%] ${msg.role === "assistant" ? "" : "items-end"} flex flex-col`}>
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-purple-900/40 border border-purple-500/30 text-white rounded-tr-sm"
                    : "bg-black/60 border border-blue-500/20 text-blue-50 rounded-tl-sm"
                }`}>
                  {msg.isStreaming && !msg.content ? (
                    <div className="flex items-center gap-1.5 text-purple-400/60">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-pre:bg-black/60 prose-pre:border prose-pre:border-purple-500/20 prose-code:text-purple-300">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-900/50 border border-purple-500/30 flex items-center justify-center text-xs font-bold text-purple-300 mt-1">
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
              placeholder="Ask Hermes anything…"
              className="flex-1 min-h-[52px] max-h-32 resize-none bg-black/60 border-purple-500/30 text-white placeholder:text-purple-400/30 focus:border-purple-500/50 text-sm rounded-xl"
              rows={2}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isGenerating}
              className="self-end h-[52px] w-[52px] rounded-xl bg-purple-600 hover:bg-purple-500 border border-purple-400/30 flex-shrink-0 disabled:opacity-40"
            >
              {isGenerating
                ? <Activity className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
            </Button>
          </div>
          <p className="text-[10px] text-purple-500/30 text-center mt-2">
            Nous Research Hermes · {modelInfo[model].label} · {reasoning ? "reasoning on" : "reasoning off"} · Enter to send
          </p>
        </div>
      </div>
    </div>
  );
}
