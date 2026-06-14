import { useState, useRef, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import {
  Brain, ChevronDown, ChevronRight, Loader2, Send,
  Wrench, CheckCircle2, AlertTriangle, Zap, MessageSquare,
  Sparkles, RotateCcw, Copy,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

// ─── Types ────────────────────────────────────────────────────────────────────

type StepType = "thinking" | "tool_call" | "tool_result" | "response" | "error";

type Step = {
  id: string;
  type: StepType;
  label: string;
  content: string;
  toolName?: string;
  toolArgs?: any;
  toolId?: string;
  done: boolean;
};

type Turn = {
  id: string;
  role: "user" | "assistant";
  content: string;
  steps: Step[];
  sessionId?: string;
  cacheHitRate?: number;
};

type ApiMessage = {
  role: "user" | "assistant" | "tool";
  content: string;
  reasoning_content?: string;
  tool_call_id?: string;
  tool_calls?: any[];
};

const MODELS = [
  { id: "gpt-5.5", label: "GPT-5.5", badge: "openai" },
  { id: "gpt-5", label: "GPT-5", badge: "openai" },
  { id: "MiniMax-M2.7", label: "M2.7", badge: "minimax" },
  { id: "MiniMax-M2.7-highspeed", label: "M2.7 Fast", badge: "minimax" },
  { id: "deepseek-v4-pro", label: "V4 Pro", badge: "default" },
  { id: "deepseek-v4-flash", label: "V4 Flash", badge: "fast" },
  { id: "kimi-k2.6", label: "Kimi K2.6", badge: "moonshot" },
];

function modelProviderLabel(model: string) {
  if (model.startsWith("gpt-") || model.startsWith("o")) return "OpenAI";
  if (model.startsWith("MiniMax-")) return "MiniMax";
  if (model.startsWith("kimi-")) return "Kimi";
  return "DeepSeek";
}

function modelDisplayName(model: string) {
  if (model === "gpt-5.5") return "OpenAI GPT-5.5";
  if (model === "gpt-5") return "OpenAI GPT-5";
  if (model === "MiniMax-M2.7") return "MiniMax M2.7";
  if (model === "MiniMax-M2.7-highspeed") return "MiniMax M2.7 Highspeed";
  if (model === "deepseek-v4-pro") return "DeepSeek V4 Pro";
  if (model === "deepseek-v4-flash") return "DeepSeek V4 Flash";
  if (model === "kimi-k2.6") return "Kimi K2.6";
  return model;
}

const STEP_COLORS: Record<StepType, string> = {
  thinking: "border-purple-500/40 bg-purple-500/5",
  tool_call: "border-cyan-500/40 bg-cyan-500/5",
  tool_result: "border-emerald-500/40 bg-emerald-500/5",
  response: "border-zinc-600/40 bg-zinc-900/40",
  error: "border-red-500/40 bg-red-500/5",
};

const STEP_ICONS: Record<StepType, any> = {
  thinking: Brain,
  tool_call: Wrench,
  tool_result: CheckCircle2,
  response: MessageSquare,
  error: AlertTriangle,
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepCard({ step }: { step: Step }) {
  const [open, setOpen] = useState(step.type === "response" || step.type === "tool_call");
  const Icon = STEP_ICONS[step.type];

  const labelColor: Record<StepType, string> = {
    thinking: "text-purple-300",
    tool_call: "text-cyan-300",
    tool_result: "text-emerald-300",
    response: "text-zinc-200",
    error: "text-red-300",
  };

  return (
    <div className={`rounded-lg border ${STEP_COLORS[step.type]} overflow-hidden text-xs font-mono`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
      >
        {!step.done && step.type !== "response" ? (
          <Loader2 className="h-3 w-3 animate-spin flex-shrink-0 text-zinc-400" />
        ) : (
          <Icon className={`h-3 w-3 flex-shrink-0 ${labelColor[step.type]}`} />
        )}
        <span className={`flex-1 truncate ${labelColor[step.type]}`}>{step.label}</span>
        {open ? (
          <ChevronDown className="h-3 w-3 text-zinc-600" />
        ) : (
          <ChevronRight className="h-3 w-3 text-zinc-600" />
        )}
      </button>

      {open && step.content && (
        <div className="px-3 pb-3 pt-1 border-t border-white/5">
          {step.type === "response" ? (
            <div className="prose prose-invert prose-xs max-w-none text-zinc-200 text-xs leading-relaxed
              prose-p:my-1 prose-headings:my-1 prose-pre:bg-black/60 prose-pre:border prose-pre:border-zinc-700
              prose-code:text-cyan-300 prose-code:bg-black/40 prose-code:px-1 prose-code:rounded">
              <ReactMarkdown>{step.content}</ReactMarkdown>
            </div>
          ) : step.type === "tool_call" && step.toolArgs ? (
            <div className="space-y-1">
              <div className="text-zinc-500">args:</div>
              <pre className="text-[10px] text-cyan-200 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(step.toolArgs, null, 2)}
              </pre>
            </div>
          ) : step.type === "thinking" ? (
            <div className="text-purple-200/70 leading-relaxed whitespace-pre-wrap text-[10px] max-h-48 overflow-y-auto">
              {step.content}
            </div>
          ) : (
            <pre className="text-[10px] text-zinc-300 whitespace-pre-wrap break-all overflow-x-auto max-h-40 overflow-y-auto">
              {step.content}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function TurnDisplay({ turn }: { turn: Turn }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] bg-purple-600/20 border border-purple-500/30 rounded-xl rounded-br-sm px-3 py-2 text-xs font-mono text-purple-100">
          {turn.content}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {turn.steps.map((step) => (
        <StepCard key={step.id} step={step} />
      ))}
      {turn.cacheHitRate !== undefined && turn.cacheHitRate > 0 && (
        <div className="text-[9px] text-zinc-600 font-mono px-1">
          cache hit {turn.cacheHitRate}% · session {turn.sessionId?.slice(0, 8)}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const STARTER_PROMPTS = [
  "What are the top trending Solana tokens right now?",
  "Get a DFlow swap quote for 1 SOL → USDC",
  "Analyze the CLAWD token — price, holders, sentiment",
  "Show me the top DFlow prediction markets",
  "Get current Solana priority fees",
  "Who are the top gainers on Solana today?",
];

export function DeepSeekTerminalPanel({ initialPrompt = "" }: { initialPrompt?: string }) {
  const { publicKey } = useWallet();
  const { isAuthenticated, signIn, signInStatus } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("deepseek-v4-pro");
  const [thinking, setThinking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [apiHistory, setApiHistory] = useState<ApiMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const initialPromptAppliedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  useEffect(() => {
    if (!initialPrompt || initialPromptAppliedRef.current) return;
    initialPromptAppliedRef.current = true;
    setInput(initialPrompt);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [initialPrompt]);

  const appendToCurrentTurn = useCallback((turnId: string, updater: (t: Turn) => Turn) => {
    setTurns((prev) => prev.map((t) => t.id === turnId ? updater(t) : t));
  }, []);

  const addStep = useCallback((turnId: string, step: Step) => {
    setTurns((prev) => prev.map((t) =>
      t.id === turnId ? { ...t, steps: [...t.steps, step] } : t
    ));
  }, []);

  const updateStep = useCallback((turnId: string, stepId: string, patch: Partial<Step>) => {
    setTurns((prev) => prev.map((t) =>
      t.id === turnId
        ? { ...t, steps: t.steps.map((s) => s.id === stepId ? { ...s, ...patch } : s) }
        : t
    ));
  }, []);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    setInput("");
    setLoading(true);

    const userTurnId = uid();
    const asstTurnId = uid();

    // User turn
    setTurns((prev) => [...prev, {
      id: userTurnId,
      role: "user",
      content: text,
      steps: [],
    }]);

    // Assistant turn placeholder
    setTurns((prev) => [...prev, {
      id: asstTurnId,
      role: "assistant",
      content: "",
      steps: [],
    }]);

    const newHistory: ApiMessage[] = [...apiHistory, { role: "user", content: text }];

    const thinkingStepId = uid();
    const responseStepId = uid();

    // Pre-add thinking step (if enabled)
    if (thinking) {
      addStep(asstTurnId, {
        id: thinkingStepId,
        type: "thinking",
        label: "Reasoning…",
        content: "",
        done: false,
      });
    }

    abortRef.current = new AbortController();

    try {
      const resp = await fetch("/api/deepseek/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newHistory,
          model,
          thinkingEnabled: thinking,
          useTools: true,
          reasoningEffort: "high",
          walletAddress: publicKey?.toBase58(),
          sessionId: sessionId || undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Accumulated state for re-building API history
      let fullThinking = "";
      let fullResponse = "";
      const toolCallMap: Map<string, { name: string; args: any; stepId: string; result?: string }> = new Map();

      let responseStepAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;

          let evt: any;
          try { evt = JSON.parse(raw); } catch { continue; }

          // The SSE uses event: prefix separate from data:, but the server
          // writes `event: X\ndata: {...}\n\n`. We need to track which event
          // the preceding `event:` line declared. The server sends them in pairs.
          // We re-parse from the buffer — instead, use the event type embedded
          // in the data object itself by matching the line before.
        }

        // Re-parse using proper SSE event handling
        buffer = decoder.decode(value, { stream: true });
      }

      // Reset buffer and re-stream properly
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const errStepId = uid();
        addStep(asstTurnId, {
          id: errStepId,
          type: "error",
          label: "Error",
          content: err.message || "Unexpected error",
          done: true,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [loading, model, thinking, publicKey, sessionId, apiHistory, addStep]);

  // Proper SSE implementation
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    if (!isAuthenticated) {
      try {
        await signIn();
      } catch {
        return;
      }
    }
    setInput("");
    setLoading(true);

    const userTurnId = uid();
    const asstTurnId = uid();

    setTurns((prev) => [
      ...prev,
      { id: userTurnId, role: "user", content: text, steps: [] },
      { id: asstTurnId, role: "assistant", content: "", steps: [] },
    ]);

    const newHistory: ApiMessage[] = [...apiHistory, { role: "user", content: text }];

    abortRef.current = new AbortController();

    // Mutable state for this request
    let thinkingStepId: string | null = null;
    let responseStepId: string | null = null;
    let fullThinking = "";
    let fullResponse = "";
    const toolSteps = new Map<string, string>(); // toolCallId → stepId

    try {
      const resp = await fetch("/api/deepseek/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newHistory,
          model,
          thinkingEnabled: thinking,
          useTools: true,
          reasoningEffort: "high",
          walletAddress: publicKey?.toBase58(),
          sessionId: sessionId || undefined,
        }),
        signal: abortRef.current.signal,
      });

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let currentEvent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let evtType = currentEvent;
          let dataStr = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              evtType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataStr += line.slice(5).trim();
            }
          }

          if (!dataStr) continue;
          let data: any;
          try { data = JSON.parse(dataStr); } catch { continue; }

          switch (evtType) {
            case "thinking": {
              fullThinking += data.content || "";
              if (!thinkingStepId) {
                thinkingStepId = uid();
                addStep(asstTurnId, {
                  id: thinkingStepId,
                  type: "thinking",
                  label: "Thinking…",
                  content: fullThinking,
                  done: false,
                });
              } else {
                updateStep(asstTurnId, thinkingStepId, { content: fullThinking });
              }
              break;
            }

            case "text": {
              fullResponse += data.content || "";
              if (!responseStepId) {
                responseStepId = uid();
                // Close thinking step
                if (thinkingStepId) {
                  updateStep(asstTurnId, thinkingStepId, {
                    label: `Thought (${fullThinking.split(" ").length} words)`,
                    done: true,
                  });
                }
                addStep(asstTurnId, {
                  id: responseStepId,
                  type: "response",
                  label: "Response",
                  content: fullResponse,
                  done: false,
                });
              } else {
                updateStep(asstTurnId, responseStepId, { content: fullResponse });
              }
              break;
            }

            case "tool_call": {
              const stepId = uid();
              toolSteps.set(data.id, stepId);
              const toolLabel = `${data.name}(${Object.keys(data.args || {}).slice(0, 2).map((k) => `${k}=${JSON.stringify(data.args[k]).slice(0, 20)}`).join(", ")})`;
              // Close thinking step when first tool call appears
              if (thinkingStepId) {
                updateStep(asstTurnId, thinkingStepId, {
                  label: `Thought (${fullThinking.split(" ").length} words)`,
                  done: true,
                });
                thinkingStepId = null;
              }
              addStep(asstTurnId, {
                id: stepId,
                type: "tool_call",
                label: `Tool: ${toolLabel}`,
                content: "",
                toolName: data.name,
                toolArgs: data.args,
                toolId: data.id,
                done: false,
              });
              break;
            }

            case "tool_result": {
              const stepId = toolSteps.get(data.id) ?? uid();
              const resultStepId = uid();
              // Mark tool_call step done
              updateStep(asstTurnId, stepId, { done: true });
              // Add result step
              addStep(asstTurnId, {
                id: resultStepId,
                type: "tool_result",
                label: `Result: ${data.name}`,
                content: String(data.result || ""),
                toolId: data.id,
                done: true,
              });
              // Reset thinking for next loop
              thinkingStepId = null;
              break;
            }

            case "done": {
              if (responseStepId) {
                updateStep(asstTurnId, responseStepId, { done: true, label: "Response" });
              }
              if (thinkingStepId) {
                updateStep(asstTurnId, thinkingStepId, { done: true, label: `Thought (${fullThinking.split(" ").length} words)` });
              }
              const sid = data.sessionId;
              const rate = data.cacheHitRate;
              setSessionId(sid || null);
              appendToCurrentTurn(asstTurnId, (t) => ({
                ...t,
                content: fullResponse,
                sessionId: sid,
                cacheHitRate: rate,
              }));
              // Build updated API history
              const updated: ApiMessage[] = [
                ...newHistory,
                { role: "assistant", content: fullResponse, reasoning_content: fullThinking || undefined },
              ];
              setApiHistory(updated);
              break;
            }

            case "error": {
              const errStepId = uid();
              addStep(asstTurnId, {
                id: errStepId,
                type: "error",
                label: "Error",
                content: data.error || `Unexpected error from ${modelProviderLabel(model)}`,
                done: true,
              });
              break;
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        const errStepId = uid();
        setTurns((prev) => prev.map((t) =>
          t.id === asstTurnId
            ? { ...t, steps: [...t.steps, { id: errStepId, type: "error" as const, label: "Connection error", content: err.message, done: true }] }
            : t
        ));
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading, isAuthenticated, signIn, model, thinking, publicKey, sessionId, apiHistory, addStep, updateStep, appendToCurrentTurn]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    abortRef.current?.abort();
    setTurns([]);
    setApiHistory([]);
    setSessionId(null);
    setLoading(false);
  };

  const copyLast = () => {
    const last = [...turns].reverse().find((t) => t.role === "assistant");
    if (last?.content) navigator.clipboard.writeText(last.content);
  };

  return (
    <div className="h-full flex flex-col gap-0 font-mono">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-purple-500/20 flex-shrink-0 bg-black/20">
        <Brain className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-xs font-semibold text-purple-200">CLAWD AI</span>
        <span className="text-zinc-600 text-[10px]">powered by {modelProviderLabel(model)}</span>

        <div className="flex gap-1 ml-auto">
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                model === m.id
                  ? "border-purple-500/60 text-purple-200 bg-purple-500/15"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setThinking((t) => !t)}
          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
            thinking
              ? "border-violet-500/60 text-violet-300 bg-violet-500/10"
              : "border-zinc-700 text-zinc-500"
          }`}
        >
          <Brain className="h-2.5 w-2.5 inline mr-1" />
          think
        </button>

        <button onClick={copyLast} className="text-zinc-600 hover:text-zinc-300 transition-colors p-1">
          <Copy className="h-3 w-3" />
        </button>
        <button onClick={clearChat} className="text-zinc-600 hover:text-zinc-300 transition-colors p-1">
          <RotateCcw className="h-3 w-3" />
        </button>

        {sessionId && (
          <Badge variant="outline" className="text-[9px] border-zinc-700 text-zinc-600 px-1 py-0">
            sess {sessionId.slice(0, 6)}
          </Badge>
        )}
      </div>

      {/* Conversation area */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-4">
        {turns.length === 0 && (
          <div className="space-y-4">
            <div className="text-center py-6">
              <Sparkles className="h-8 w-8 text-purple-400/40 mx-auto mb-3" />
              <div className="text-xs text-zinc-500 font-mono">
                CLAWD AI — {modelDisplayName(model)} with tools
              </div>
              <div className="text-[10px] text-zinc-700 mt-1">
                Web search · Token prices · DFlow swaps · Trending markets · Agent minting
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => sendMessage(p)}
                  className="text-left text-[10px] text-zinc-400 border border-zinc-800 rounded-lg px-3 py-2 hover:border-purple-500/40 hover:text-purple-300 hover:bg-purple-500/5 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn) => (
          <TurnDisplay key={turn.id} turn={turn} />
        ))}

        {loading && turns[turns.length - 1]?.role === "assistant" && turns[turns.length - 1]?.steps.length === 0 && (
          <div className="flex items-center gap-2 text-[10px] text-zinc-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            Connecting to {modelProviderLabel(model)}…
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-purple-500/20 px-3 py-2 bg-black/20">
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask CLAWD anything — markets, swaps, tokens, agents…"
              className="bg-black/60 border-purple-500/20 text-xs font-mono text-white placeholder:text-zinc-600 pr-8 focus:border-purple-500/40"
              disabled={loading}
            />
            {loading && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
              </div>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="h-8 w-8 p-0 bg-purple-600 hover:bg-purple-500 flex-shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex gap-3 mt-1.5 text-[9px] text-zinc-700">
          {!isAuthenticated && (
            <span className="text-yellow-400">
              {signInStatus || "sign in required"}
            </span>
          )}
          <span className="flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> DFlow swaps</span>
          <span className="flex items-center gap-1"><Wrench className="h-2.5 w-2.5" /> 14 tools</span>
          <span className="flex items-center gap-1"><Brain className="h-2.5 w-2.5" /> {thinking ? "thinking on" : "thinking off"}</span>
          {publicKey && (
            <span className="ml-auto text-zinc-600">
              {publicKey.toBase58().slice(0, 6)}…
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
