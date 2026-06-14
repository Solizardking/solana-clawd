import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Bot, Send, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

type BrowserAgent = {
  id: string;
  title: string;
  description: string;
  category: string;
  avatar: string;
  tags: string[];
  openingMessage: string;
  openingQuestions: string[];
  persona: string;
  capabilities: string[];
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function getAgentId(location: string) {
  const query = location.split("?")[1] ?? "";
  return new URLSearchParams(query).get("agent") ?? "solana-openclawd-orchestrator";
}

export default function AgentChatPage() {
  const [location] = useLocation();
  const agentId = useMemo(() => getAgentId(location), [location]);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: agent, isLoading } = useQuery<BrowserAgent>({
    queryKey: [`/api/clawd/browser-agents/${agentId}`],
    enabled: Boolean(agentId),
  });

  const visibleMessages = messages.length > 0
    ? messages
    : [{ role: "assistant" as const, content: agent?.openingMessage || "Ask this agent what it can do." }];

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const content = input.trim();
    if (!content || !agent || busy) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setBusy(true);

    try {
      const system = [
        `You are ${agent.title}, a public Cheshire Terminal agent.`,
        agent.persona || agent.description,
        "Stay in character, be concise, and give concrete next steps.",
        "Do not claim that you executed trades, payments, wallet actions, or on-chain writes unless the user provides a confirmed transaction signature.",
      ].join("\n\n");
      const response = await fetch("/api/free-terminal/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: system },
            ...nextMessages.slice(-12),
          ],
          max_tokens: 900,
          temperature: 0.55,
          sessionId: `agent-chat:${agent.id}`,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.details || json?.error || `HTTP ${response.status}`);
      setMessages([...nextMessages, { role: "assistant", content: json.content || "No response returned." }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Agent chat failed");
      setMessages(nextMessages);
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-white/60">Loading agent chat...</div>;
  }

  if (!agent) {
    return <div className="mx-auto max-w-5xl px-4 py-10 text-sm text-white/60">Agent not found.</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Link href={`/agents/${agent.id}`}>
            <Button variant="outline" className="border-white/10 text-white/75 hover:bg-white/5">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Agent Profile
            </Button>
          </Link>
          <Card className="border-cyan-500/20 bg-white/[0.03] p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded bg-cyan-500/10 text-2xl">
                {agent.avatar || <Bot className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-black text-cyan-100">{agent.title}</h1>
                <p className="mt-1 text-xs text-white/55">{agent.description}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className="border-cyan-400/30 bg-cyan-500/10 text-cyan-200">{agent.category}</Badge>
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-200">
                <ShieldCheck className="mr-1 h-3 w-3" />
                Public chat
              </Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {agent.tags.slice(0, 10).map((tag) => (
                <span key={tag} className="rounded border border-white/10 px-2 py-1 text-[11px] text-white/55">
                  {tag}
                </span>
              ))}
            </div>
          </Card>
        </aside>

        <main className="flex min-h-[70vh] flex-col rounded-lg border border-white/10 bg-zinc-950">
          <div className="border-b border-white/10 px-4 py-3">
            <div className="text-sm font-semibold text-white">Talk With {agent.title}</div>
            <div className="text-xs text-white/45">Public, rate-limited, free-model backed agent conversation.</div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {visibleMessages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={message.role === "user" ? "ml-auto max-w-[84%] rounded bg-cyan-500/15 p-3 text-sm text-cyan-50" : "max-w-[88%] rounded bg-white/[0.04] p-3 text-sm text-white/80"}
              >
                <div className="mb-1 text-[10px] uppercase tracking-wide text-white/35">
                  {message.role === "user" ? "You" : agent.title}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
              </div>
            ))}
            {busy && <div className="text-xs text-cyan-200">Agent is thinking...</div>}
            {error && <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{error}</div>}
          </div>
          <form onSubmit={send} className="border-t border-white/10 p-3">
            {agent.openingQuestions?.length > 0 && messages.length === 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {agent.openingQuestions.slice(0, 3).map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => setInput(question)}
                    className="rounded border border-white/10 px-2 py-1 text-xs text-white/60 hover:bg-white/5"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Message this agent..."
                className="min-h-12 flex-1 resize-none border-white/10 bg-black text-white placeholder:text-white/35"
              />
              <Button type="submit" disabled={busy || !input.trim()} className="h-auto bg-cyan-500 text-black hover:bg-cyan-400">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
