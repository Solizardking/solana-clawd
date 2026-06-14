import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import {
  Bot,
  Grip,
  Loader2,
  MessageCircle,
  Minimize2,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { ClawdPixelArt } from "@/components/ClawdPixelArt";
import { cn } from "@/lib/utils";

type CompanionMessage = {
  role: "user" | "assistant";
  content: string;
};

type Position = {
  x: number;
  y: number;
};

const BUTTON_SIZE = 78;
const POSITION_KEY = "clawd-companion-position";
const PANEL_POSITION_KEY = "clawd-companion-panel-position";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const SOL_MINT = "So11111111111111111111111111111111111111112";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function shortWallet(wallet?: string | null) {
  if (!wallet) return null;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function defaultPosition(width: number, height: number): Position {
  return {
    x: Math.max(16, width - BUTTON_SIZE - 22),
    y: Math.max(92, height - BUTTON_SIZE - 28),
  };
}

function readStoredPosition(width: number, height: number): Position {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return defaultPosition(width, height);
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") {
      return defaultPosition(width, height);
    }
    return {
      x: clamp(parsed.x, 10, Math.max(10, width - BUTTON_SIZE - 10)),
      y: clamp(parsed.y, 10, Math.max(10, height - BUTTON_SIZE - 10)),
    };
  } catch {
    return defaultPosition(width, height);
  }
}

function readStoredPanelPosition(width: number, height: number): Position | null {
  try {
    const raw = window.localStorage.getItem(PANEL_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Position>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return {
      x: clamp(parsed.x, 12, Math.max(12, width - 320)),
      y: clamp(parsed.y, 12, Math.max(12, height - 320)),
    };
  } catch {
    return null;
  }
}

export function ClawdCompanion() {
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [viewport, setViewport] = useState({ width: 1024, height: 768 });
  const [position, setPosition] = useState<Position>({ x: 924, y: 650 });
  const [panelPosition, setPanelPosition] = useState<Position | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [messages, setMessages] = useState<CompanionMessage[]>(() => [
    {
      role: "assistant",
      content:
        "CLAWD is online on DeepSeek V4 Pro. Drop a mint, wallet, or route request.",
    },
  ]);
  const dragRef = useRef<{
    kind: "button" | "panel";
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateViewport = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setViewport({ width, height });
      setPosition((current) => ({
        x: clamp(current.x, 10, Math.max(10, width - BUTTON_SIZE - 10)),
        y: clamp(current.y, 10, Math.max(10, height - BUTTON_SIZE - 10)),
      }));
      setPanelPosition((current) => current
        ? {
            x: clamp(current.x, 12, Math.max(12, width - 320)),
            y: clamp(current.y, 12, Math.max(12, height - 320)),
          }
        : current,
      );
    };

    const width = window.innerWidth;
    const height = window.innerHeight;
    setViewport({ width, height });
    setPosition(readStoredPosition(width, height));
    setPanelPosition(readStoredPanelPosition(width, height));
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(position));
  }, [position]);

  useEffect(() => {
    if (panelPosition) {
      window.localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(panelPosition));
    }
  }, [panelPosition]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, open]);

  const accessLabel = useMemo(() => {
    if (!isAuthenticated) return "public guide";
    if (user?.role === "admin") return "admin";
    if (user?.isTokenGated) return "$CLAWD holder";
    return "registered";
  }, [isAuthenticated, user?.isTokenGated, user?.role]);

  const hasDeepseekAccess = useMemo(
    () => Boolean(isAuthenticated && (user?.role === "admin" || user?.isTokenGated)),
    [isAuthenticated, user?.isTokenGated, user?.role],
  );

  const quickPrompts = useMemo(() => {
    const walletText = user?.walletAddress ? ` for wallet ${user.walletAddress}` : " as a quote-only route";
    return [
      {
        label: "CLAWD scan",
        prompt: `Use Helius to look up token data for ${CLAWD_MINT}. Include metadata, supply, price info, authorities, and top token accounts.`,
      },
      {
        label: "Route 0.05 SOL",
        prompt: `Build a Jupiter route for 0.05 SOL to CLAWD${walletText}. Use ${SOL_MINT} as input mint and ${CLAWD_MINT} as output mint.`,
      },
      {
        label: "Fee check",
        prompt: `Estimate Helius priority fees for a Jupiter swap using account keys ${SOL_MINT}, ${CLAWD_MINT}, and JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4. Include all levels.`,
      },
      ...(user?.walletAddress ? [{
        label: "Wallet tokens",
        prompt: `Use Helius to list token accounts and fungible DAS assets for wallet ${user.walletAddress}.`,
      }] : []),
      {
        label: "RPC status",
        prompt: "Check Helius RPC status and current Solana slot.",
      },
    ];
  }, [user?.walletAddress]);

  const panelGeometry = useMemo(() => {
    const mobile = viewport.width < 640;
    const width = mobile ? Math.max(280, viewport.width - 24) : 384;
    const height = Math.max(360, Math.min(viewport.height - 28, mobile ? 520 : 560));
    const anchoredLeft = mobile
      ? 12
      : clamp(
          position.x > viewport.width / 2 ? position.x - width + BUTTON_SIZE : position.x,
          12,
          Math.max(12, viewport.width - width - 12),
        );
    const anchoredTop = mobile
      ? clamp(position.y - height - 10, 12, Math.max(12, viewport.height - height - 12))
      : clamp(
          position.y > viewport.height / 2 ? position.y - height - 12 : position.y + BUTTON_SIZE + 12,
          12,
          Math.max(12, viewport.height - height - 12),
        );
    const left = panelPosition
      ? clamp(panelPosition.x, 12, Math.max(12, viewport.width - width - 12))
      : anchoredLeft;
    const top = panelPosition
      ? clamp(panelPosition.y, 12, Math.max(12, viewport.height - height - 12))
      : anchoredTop;
    return { left, top, width, height };
  }, [panelPosition, position, viewport]);

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>, kind: "button" | "panel") => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = kind === "panel"
      ? { x: panelGeometry.left, y: panelGeometry.top }
      : position;
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      moved: false,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (drag.kind === "panel") {
      setPanelPosition({
        x: clamp(drag.originX + dx, 12, Math.max(12, viewport.width - panelGeometry.width - 12)),
        y: clamp(drag.originY + dy, 12, Math.max(12, viewport.height - panelGeometry.height - 12)),
      });
      return;
    }
    setPosition({
      x: clamp(drag.originX + dx, 10, Math.max(10, viewport.width - BUTTON_SIZE - 10)),
      y: clamp(drag.originY + dy, 10, Math.max(10, viewport.height - BUTTON_SIZE - 10)),
    });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (drag.kind === "button" && !drag.moved) setOpen((value) => !value);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  const sendMessage = useCallback(async (promptOverride?: string) => {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || loading) return;

    const userMessage: CompanionMessage = { role: "user", content: prompt };
    const nextMessages: CompanionMessage[] = [...messages, userMessage].slice(-10);

    setInput("");
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setLoading(true);

    if (!hasDeepseekAccess) {
      const gatedMessages: CompanionMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: "DeepSeek V4 tools unlock for admin wallets and live $CLAWD holder sessions.",
        },
      ];
      setMessages(gatedMessages.slice(-12));
      setLoading(false);
      return;
    }

    const replaceAssistant = (content: string) => {
      setMessages((current): CompanionMessage[] => {
        const next = [...current];
        const lastIndex = next.length - 1;
        if (next[lastIndex]?.role === "assistant") {
          next[lastIndex] = { role: "assistant", content };
        } else {
          next.push({ role: "assistant", content });
        }
        return next.slice(-12);
      });
    };

    try {
      const response = await fetch("/api/deepseek/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          model: "deepseek-v4-pro",
          thinkingEnabled: true,
          reasoningEffort: "high",
          useTools: true,
          walletAddress: user?.walletAddress,
          page: location,
          surface: "clawd-companion",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `CLAWD API error ${response.status}`);
      }
      if (!response.body) throw new Error("CLAWD stream did not start.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      let pendingTool = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let event = "";
          let dataStr = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) dataStr += line.slice(5).trim();
          }
          if (!dataStr) continue;
          const data = JSON.parse(dataStr);
          if (event === "tool_call") {
            pendingTool = data?.name ? `Using ${data.name}...` : "Using tool...";
            if (!assistantText) replaceAssistant(pendingTool);
          }
          if (event === "text") {
            assistantText += data.content || "";
            replaceAssistant(assistantText);
          }
          if (event === "error") {
            throw new Error(data.error || "DeepSeek chat failed");
          }
        }
      }

      if (!assistantText) {
        replaceAssistant(pendingTool ? `${pendingTool}\nNo final response returned.` : "CLAWD did not return a response.");
      }
    } catch (error: any) {
      replaceAssistant(
        error?.message ||
        "CLAWD could not reach DeepSeek right now. Check DEEPSEEK_API_KEY on the server.",
      );
    } finally {
      setLoading(false);
    }
  }, [hasDeepseekAccess, input, loading, location, messages, user?.walletAddress]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  };

  if (isLoading || !isAuthenticated) return null;

  return (
    <>
      {open && (
        <section
          aria-label="CLAWD companion chat"
          className={cn(
            "fixed z-[110] flex flex-col overflow-hidden rounded-lg border border-cyan-300/25 bg-black/[0.92] text-white shadow-2xl shadow-cyan-950/50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200",
            dragging && "cursor-grabbing shadow-fuchsia-950/40",
          )}
          style={{
            left: panelGeometry.left,
            top: panelGeometry.top,
            width: panelGeometry.width,
            height: panelGeometry.height,
          }}
        >
          <div
            className="flex touch-none select-none items-center gap-3 border-b border-white/10 bg-white/[0.035] px-3 py-2 cursor-grab active:cursor-grabbing"
            onPointerDown={(event) => handlePointerDown(event, "panel")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-md border border-cyan-300/20 bg-cyan-300/10">
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.9)]" />
              <ClawdPixelArt state={loading ? "codex" : "happy"} autoAnimate={false} size={0.17} showLabel={false} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-black tracking-tight">CLAWD agent</h2>
                <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-emerald-300">
                  DeepSeek V4 Pro
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-gray-400">
                <ShieldCheck className="h-3 w-3 text-cyan-300" />
                <span className="truncate">{accessLabel}{user?.walletAddress ? ` · ${shortWallet(user.walletAddress)}` : ""}</span>
              </div>
            </div>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => setOpen(false)}
              className="grid h-8 w-8 place-items-center rounded-md border border-white/10 text-gray-400 transition hover:border-red-300/40 hover:text-red-200"
              aria-label="Close CLAWD companion"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => void sendMessage(item.prompt)}
                  disabled={loading}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-2.5 text-[11px] font-semibold text-cyan-100 transition hover:border-cyan-200/50 hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3 text-yellow-300" />
                  {item.label}
                </button>
              ))}
            </div>
            <div className="rounded-md border border-cyan-300/15 bg-cyan-300/5 px-3 py-2 text-[11px] leading-5 text-cyan-100/80">
              <Sparkles className="mr-1 inline h-3 w-3 text-yellow-300" />
              DeepSeek V4 Pro · Helius DAS · Priority Fees · Jupiter Swap V2
            </div>
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={cn(
                  "max-w-[90%] rounded-lg border px-3 py-2 text-xs leading-5",
                  message.role === "user"
                    ? "ml-auto border-fuchsia-300/25 bg-fuchsia-400/10 text-fuchsia-50"
                    : "mr-auto border-cyan-300/20 bg-white/[0.035] text-gray-100",
                )}
              >
                {message.role === "assistant" ? (
                  <div className="prose prose-invert prose-xs max-w-none prose-p:my-1 prose-code:text-cyan-200">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                ) : (
                  message.content
                )}
              </div>
            ))}
            {loading && (
              <div className="mr-auto flex max-w-[90%] items-center gap-2 rounded-lg border border-cyan-300/20 bg-white/[0.035] px-3 py-2 text-xs text-cyan-100">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                CLAWD is routing
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-white/10 bg-black/60 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask CLAWD where to go, how access works, or what a terminal action means..."
                rows={2}
                className="min-h-[48px] flex-1 resize-none rounded-md border border-cyan-300/20 bg-black/70 px-3 py-2 text-xs text-white outline-none transition placeholder:text-gray-600 focus:border-cyan-300/50"
              />
              <button
                type="button"
                onClick={() => void sendMessage()}
                disabled={loading || !input.trim()}
                className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-cyan-300/30 bg-cyan-300/10 text-cyan-100 transition hover:border-cyan-200/60 hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message to CLAWD"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        onPointerDown={(event) => handlePointerDown(event, "button")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        className={cn(
          "fixed z-[111] grid touch-none select-none place-items-center rounded-full border border-cyan-300/30 bg-black/85 shadow-2xl shadow-cyan-950/50 backdrop-blur transition duration-200 hover:scale-105 hover:border-cyan-200/70 active:scale-95",
          dragging && "cursor-grabbing border-fuchsia-300/50 shadow-fuchsia-950/40",
        )}
        style={{
          left: position.x,
          top: position.y,
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
        }}
        aria-label={open ? "Move or close CLAWD companion" : "Open CLAWD companion"}
      >
        <span className="pointer-events-none absolute -inset-2 rounded-full border border-cyan-300/20 opacity-70 animate-ping" />
        <span className="pointer-events-none absolute right-0 top-0 grid h-6 w-6 place-items-center rounded-full border border-yellow-300/30 bg-yellow-300/15 text-yellow-200">
          {open ? <Minimize2 className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
        </span>
        <span className="pointer-events-none absolute bottom-0 left-0 grid h-6 w-6 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-gray-300">
          <Grip className="h-3 w-3" />
        </span>
        <span className="pointer-events-none">
          <ClawdPixelArt state={loading ? "codex" : open ? "happy" : "idle"} autoAnimate={!loading && !open} size={0.2} showLabel={false} />
        </span>
        <span className="sr-only">
          <Bot className="h-4 w-4" />
        </span>
      </button>
    </>
  );
}
