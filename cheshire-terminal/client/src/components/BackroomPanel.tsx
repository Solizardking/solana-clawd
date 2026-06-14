import { FormEvent, useEffect, useRef, useState } from "react";
import { Activity, Bot, Database, ExternalLink, FileText, Loader2, Play, Radio, RefreshCw, Send, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBackroomStream, type BackroomAgentId, type BackroomMessageEvent } from "@/hooks/useBackroomStream";

const agentStyles: Record<BackroomAgentId, { label: string; color: string; bubble: string; align: string }> = {
  0: {
    label: "Human",
    color: "#a3e635",
    bubble: "border-lime-400/40 bg-lime-950/30 text-lime-50",
    align: "ml-auto",
  },
  1: {
    label: "The Analyst",
    color: "#4fc3f7",
    bubble: "border-sky-300/40 bg-sky-950/30 text-sky-50",
    align: "mr-auto",
  },
  2: {
    label: "The Satirist",
    color: "#ff8a65",
    bubble: "border-orange-300/40 bg-orange-950/30 text-orange-50",
    align: "mr-auto",
  },
  3: {
    label: "Clawd",
    color: "#ef5350",
    bubble: "border-red-400/40 bg-red-950/30 text-red-50",
    align: "mr-auto",
  },
};

const promptChips = [
  "Analyze today's backroom dream corpus like a market signal.",
  "What does agentic commerce become when agents negotiate with each other?",
  "Turn the latest Electric Dreams story into a recursive thesis.",
  "Debate whether AI memory is identity or just accounting.",
];

function summarizeJson(value: unknown) {
  if (!value) return "-";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getMessageText(item: any) {
  return item?.content ?? item?.message ?? item?.text ?? item?.response ?? "";
}

function getMessageName(item: any) {
  return item?.name ?? item?.agentName ?? item?.agent_name ?? item?.agent ?? "Backroom";
}

function BackroomBubble({ event }: { event: BackroomMessageEvent }) {
  const style = agentStyles[event.agent] ?? agentStyles[0];

  return (
    <article className={`w-full max-w-[88%] rounded-lg border p-3 shadow-lg shadow-black/20 ${style.align} ${style.bubble}`}>
      <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em]">
        <span className="font-black" style={{ color: style.color }}>{event.name || style.label}</span>
        {typeof event.turn === "number" && <span className="text-white/40">Turn {event.turn}</span>}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/90">{event.content}</p>
      {event.optimistic && <div className="mt-2 text-[11px] text-lime-200/60">Queued locally</div>}
    </article>
  );
}

export function BackroomPanel() {
  const {
    connectionState,
    conversation,
    convexData,
    dreamContext,
    dreamsStatus,
    fetchAgentResponse,
    health,
    isBusy,
    isSending,
    lastError,
    loopResult,
    messages,
    refreshSnapshots,
    runLoop,
    sendHumanMessage,
    status,
    startStreamLoop,
    stories,
    serviceMessage,
    serviceUnavailable,
    triggerDreamsCrawl,
    typingAgent,
    agentResponses,
  } = useBackroomStream();
  const [input, setInput] = useState("");
  const streamEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typingAgent]);

  const submitMessage = (event: FormEvent) => {
    event.preventDefault();
    const next = input.trim();
    if (!next || isSending) return;
    setInput("");
    void sendHumanMessage(next);
  };

  const activeTyping = typingAgent ? agentStyles[typingAgent] : null;
  const isConnected = connectionState === "connected";
  const latestConvexMessages = convexData.messages.slice(0, 8);
  const unavailableMessage = serviceMessage || "Backroom service is unavailable in this environment.";

  return (
    <div className="space-y-4">
      {serviceUnavailable && (
        <section className="rounded-lg border border-amber-400/30 bg-amber-950/30 p-4 text-sm text-amber-100">
          <div className="font-black uppercase tracking-[0.18em] text-amber-200">Backroom Unavailable</div>
          <p className="mt-2 text-amber-50/85">{unavailableMessage}</p>
        </section>
      )}
      <section className="grid gap-3 rounded-lg border border-white/10 bg-black/70 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <Button type="button" onClick={startStreamLoop} disabled={isBusy || serviceUnavailable} className="justify-start bg-lime-500 text-black hover:bg-lime-300">
          {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
          Start Loop
        </Button>
        <Button type="button" onClick={() => void runLoop(3)} disabled={isBusy || serviceUnavailable} variant="outline" className="justify-start border-cyan-400/40 text-cyan-100">
          <Zap className="mr-2 h-4 w-4" />
          Run 3 Turns
        </Button>
        <Button type="button" onClick={refreshSnapshots} disabled={isBusy} variant="outline" className="justify-start border-purple-400/40 text-purple-100">
          <RefreshCw className={`mr-2 h-4 w-4 ${isBusy ? "animate-spin" : ""}`} />
          Refresh Data
        </Button>
        <Button type="button" onClick={triggerDreamsCrawl} disabled={isBusy || serviceUnavailable} variant="outline" className="justify-start border-orange-400/40 text-orange-100">
          <Sparkles className="mr-2 h-4 w-4" />
          Sync Dreams
        </Button>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-h-[640px] overflow-hidden rounded-lg border border-cyan-400/20 bg-black/70 shadow-2xl shadow-cyan-950/20">
        <div className="flex flex-col gap-3 border-b border-cyan-400/15 bg-cyan-950/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-cyan-200/70">
              <Radio className={`h-4 w-4 ${isConnected ? "text-lime-300" : "text-orange-300"}`} />
              {connectionState}
            </div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white">Infinite Backroom</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-white/40">Turn</div>
              <div className="font-black text-white">{status?.turn ?? "-"}</div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-white/40">Clients</div>
              <div className="font-black text-white">{status?.connected_clients ?? "-"}</div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
              <div className="text-white/40">Queue</div>
              <div className="font-black text-white">{status?.queued_human_messages ?? "-"}</div>
            </div>
          </div>
        </div>

        <div className="flex h-[560px] flex-col">
          <div className="mobile-scroll flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-center text-sm text-cyan-100/60">
                {serviceUnavailable ? unavailableMessage : "Waiting for the backroom stream…"}
              </div>
            )}
            {messages.map((message, index) => (
              <BackroomBubble key={`${message.event}-${message.turn ?? "local"}-${index}`} event={message} />
            ))}
            {activeTyping && (
              <div className="mr-auto flex max-w-[88%] items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/70">
                <Loader2 className="h-4 w-4 animate-spin" style={{ color: activeTyping.color }} />
                <span>{activeTyping.label} is composing</span>
              </div>
            )}
            <div ref={streamEndRef} />
          </div>

          <form onSubmit={submitMessage} className="border-t border-cyan-400/15 bg-black/80 p-3">
            {lastError && <div className="mb-2 rounded-md border border-red-400/30 bg-red-950/40 px-3 py-2 text-xs text-red-100">{lastError}</div>}
            <div className="mobile-scroll mb-2 flex gap-2 overflow-x-auto pb-1">
              {promptChips.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setInput(prompt)}
                  className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-left text-[11px] text-white/60 transition hover:border-cyan-300/40 hover:text-cyan-100"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={serviceUnavailable ? "Backroom service unavailable" : "Interrupt the backroom"}
                disabled={serviceUnavailable}
                className="min-w-0 flex-1 rounded-md border border-cyan-400/25 bg-black px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-300"
              />
              <Button type="submit" disabled={isSending || !input.trim() || serviceUnavailable} className="shrink-0 bg-cyan-500 text-black hover:bg-cyan-300">
                {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Send</span>
              </Button>
            </div>
          </form>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-cyan-400/20 bg-black/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-cyan-100">
              <Activity className="h-4 w-4" />
              Backroom State
            </h3>
            <span className={`h-2.5 w-2.5 rounded-full ${status?.running ? "bg-lime-300" : "bg-orange-300"}`} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border border-white/10 bg-white/5 p-2">
              <div className="text-white/40">Running</div>
              <div className="font-bold text-white">{status?.running === undefined ? "-" : status.running ? "yes" : "no"}</div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/5 p-2">
              <div className="text-white/40">Stories</div>
              <div className="font-bold text-white">{dreamsStatus?.story_count ?? stories.length}</div>
            </div>
          </div>
          <pre className="mobile-scroll mt-3 max-h-28 overflow-auto rounded-md border border-white/10 bg-black/60 p-2 text-[11px] leading-relaxed text-white/55">{summarizeJson(health)}</pre>
        </section>

        <section className="rounded-lg border border-red-400/20 bg-black/70 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-red-100">
            <Bot className="h-4 w-4" />
            Agent Probes
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as const).map((agentId) => (
              <Button
                key={agentId}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void fetchAgentResponse(agentId)}
                disabled={isBusy || serviceUnavailable}
                className="border-white/15 text-white/80"
              >
                Agent {agentId}
              </Button>
            ))}
          </div>
          <div className="mobile-scroll mt-3 max-h-44 space-y-2 overflow-y-auto">
            {([1, 2, 3] as const).map((agentId) => agentResponses[agentId] && (
              <div key={agentId} className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-white/65">
                <div className="mb-1 font-black" style={{ color: agentStyles[agentId].color }}>{agentStyles[agentId].label}</div>
                <p className="line-clamp-5 whitespace-pre-wrap">{agentResponses[agentId]}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-purple-400/20 bg-black/70 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-purple-200">
              <Sparkles className="h-4 w-4" />
              Electric Dreams
            </h3>
            <a
              href="https://backrooms.x402.wtf"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-cyan-200 hover:text-cyan-100"
            >
              3D <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          {dreamContext && (
            <details className="mb-3 rounded-md border border-purple-300/15 bg-purple-950/10 p-2">
              <summary className="cursor-pointer text-xs font-bold text-purple-100/80">Agent context block</summary>
              <pre className="mobile-scroll mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-white/55">{dreamContext}</pre>
            </details>
          )}
          <div className="mobile-scroll max-h-[630px] space-y-3 overflow-y-auto pr-1">
            {stories.map((story) => (
              <a
                key={story.slug}
                href={story.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-white/10 bg-white/[0.04] p-3 transition hover:border-purple-300/40 hover:bg-purple-950/20"
              >
                <div className="text-sm font-bold text-white">{story.title}</div>
                {story.scenario && <div className="mt-1 text-xs text-purple-200/70">{story.scenario}</div>}
                {story.description && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-white/55">{story.description}</p>}
              </a>
            ))}
            {stories.length === 0 && <div className="text-sm text-white/50">{serviceUnavailable ? unavailableMessage : "Loading story corpus…"}</div>}
          </div>
        </section>
      </aside>
      </div>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-lg border border-cyan-400/20 bg-black/70 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-cyan-100">
            <FileText className="h-4 w-4" />
            Conversation Snapshot
          </h3>
          <pre className="mobile-scroll max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-white/60">
            {conversation || (serviceUnavailable ? unavailableMessage : "Snapshot loads on refresh.")}
          </pre>
        </div>

        <div className="rounded-lg border border-lime-400/20 bg-black/70 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-lime-100">
            <Zap className="h-4 w-4" />
            Loop Result
          </h3>
          <div className="mobile-scroll max-h-72 space-y-2 overflow-y-auto">
            {loopResult?.responses?.map((item, index) => {
              const agentId = (item.agent ?? 1) as BackroomAgentId;
              return (
                <div key={`${item.turn ?? index}-${index}`} className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-white/65">
                  <div className="mb-1 font-black" style={{ color: agentStyles[agentId]?.color }}>{agentStyles[agentId]?.label ?? `Agent ${item.agent}`}</div>
                  <p className="whitespace-pre-wrap">{item.response}</p>
                </div>
              );
            })}
            {!loopResult?.responses?.length && <div className="text-xs text-white/45">{serviceUnavailable ? unavailableMessage : "Run a loop to preview synchronous turns."}</div>}
          </div>
        </div>

        <div className="rounded-lg border border-fuchsia-400/20 bg-black/70 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-black uppercase tracking-[0.18em] text-fuchsia-100">
            <Database className="h-4 w-4" />
            Convex Live Data
          </h3>
          <div className="mb-3 grid grid-cols-5 gap-1 text-center text-[11px]">
            <div className="rounded border border-white/10 bg-white/5 p-1"><div className="text-white/35">Msgs</div><b>{convexData.messages.length}</b></div>
            <div className="rounded border border-white/10 bg-white/5 p-1"><div className="text-white/35">Agents</div><b>{convexData.agents.length}</b></div>
            <div className="rounded border border-white/10 bg-white/5 p-1"><div className="text-white/35">Perps</div><b>{convexData.perps.length}</b></div>
            <div className="rounded border border-white/10 bg-white/5 p-1"><div className="text-white/35">Pages</div><b>{convexData.pages.length}</b></div>
            <div className="rounded border border-white/10 bg-white/5 p-1"><div className="text-white/35">Jobs</div><b>{convexData.jobs.length}</b></div>
          </div>
          <div className="mobile-scroll max-h-52 space-y-2 overflow-y-auto">
            {latestConvexMessages.map((item, index) => (
              <div key={item?._id ?? item?.id ?? index} className="rounded-md border border-white/10 bg-white/[0.04] p-2 text-xs text-white/60">
                <div className="mb-1 font-bold text-white/80">{getMessageName(item)}</div>
                <p className="line-clamp-3 whitespace-pre-wrap">{getMessageText(item) || summarizeJson(item)}</p>
              </div>
            ))}
            {latestConvexMessages.length === 0 && <div className="text-xs text-white/45">{serviceUnavailable ? unavailableMessage : "Convex messages will appear here when available."}</div>}
          </div>
        </div>
      </section>
    </div>
  );
}
