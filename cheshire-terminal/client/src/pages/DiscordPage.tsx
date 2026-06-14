import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Send, Hash, Loader2, AlertTriangle, RefreshCw, Bot, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type DiscordStatus = {
  configured: boolean;
  ready: boolean;
  starting: boolean;
  error: string | null;
  guildId: string | null;
  botUser: { id: string; tag: string; avatar: string } | null;
};

type Channel = {
  id: string;
  name: string;
  topic: string | null;
  parentName: string | null;
  position: number;
};

type Msg = {
  id: string;
  channelId: string;
  channelName: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
  content: string;
  attachments: { url: string; name: string; contentType: string | null }[];
  isBot: boolean;
  isFromBridge: boolean;
  createdAt: string;
};

// Working bot-install URL. The raw oauth2/authorize link with
// `response_type=code` + `redirect_uri` is for user OAuth and breaks bot installs,
// so we use the canonical bot-invite URL with the correct scopes here.
const DISCORD_CLIENT_ID = "1502047486808686674";
// The CLAWD community server / welcome channel — users go here after verifying.
const DISCORD_SERVER_ID = "1307399380109623296";
const DISCORD_CHANNEL_ID = "1445954920938471659";
const DISCORD_INVITE_URL =
  `https://discord.com/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}` +
  `&permissions=8&scope=bot%20applications.commands` +
  `&guild_id=${DISCORD_SERVER_ID}&disable_guild_select=true`;
// Deep-link that opens the Discord app directly at the target channel.
const DISCORD_CHANNEL_URL =
  `https://discord.com/channels/${DISCORD_SERVER_ID}/${DISCORD_CHANNEL_ID}`;

export default function DiscordPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [authorTag, setAuthorTag] = useState(() => localStorage.getItem("discord_author_tag") || "Site");
  const scrollEnd = useRef<HTMLDivElement>(null);
  const sseRef = useRef<AbortController | null>(null);

  // Status + channels
  const refreshStatus = async () => {
    const s = await fetch("/api/discord/status").then((r) => r.json()).catch(() => null);
    setStatus(s);
    if (s?.ready) {
      const r = await fetch("/api/discord/channels").then((r) => r.json()).catch(() => ({ channels: [] }));
      setChannels(r.channels ?? []);
      setActiveChannel((prev) => prev ?? r.channels?.[0] ?? null);
    }
  };

  useEffect(() => {
    refreshStatus();
    const t = setInterval(() => {
      if (!status?.ready) refreshStatus();
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.ready]);

  // Load messages + open SSE when active channel changes
  useEffect(() => {
    if (!activeChannel) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);

    fetch(`/api/discord/messages/${activeChannel.id}?limit=50`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setMessages(d.messages ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    sseRef.current?.abort();
    const ctrl = new AbortController();
    sseRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch(`/api/discord/stream?channelId=${activeChannel.id}`, { signal: ctrl.signal });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let event = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          while (true) {
            const nl = buffer.indexOf("\n");
            if (nl === -1) break;
            const line = buffer.slice(0, nl);
            buffer = buffer.slice(nl + 1);
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            else if (line.startsWith("data: ")) {
              try {
                const payload = JSON.parse(line.slice(6));
                if (event === "message") {
                  setMessages((prev) => prev.some((m) => m.id === payload.id) ? prev : [...prev, payload]);
                }
              } catch {}
              event = "";
            }
          }
        }
      } catch { /* aborted or net error */ }
    })();

    return () => { cancelled = true; ctrl.abort(); };
  }, [activeChannel?.id]);

  useEffect(() => {
    scrollEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const grouped = useMemo(() => {
    const g = new Map<string, Channel[]>();
    for (const c of channels) {
      const key = c.parentName ?? "—";
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(c);
    }
    return Array.from(g.entries());
  }, [channels]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannel || !draft.trim() || sending) return;
    const content = draft.trim();
    setDraft("");
    setSending(true);
    localStorage.setItem("discord_author_tag", authorTag);
    try {
      const r = await fetch("/api/discord/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: activeChannel.id, content, authorTag }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send");
      }
    } catch (err: any) {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
      setDraft(content);
    } finally {
      setSending(false);
    }
  };

  // ── Not configured ─────────────────────────────────────────────────────────
  if (status && !status.configured) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-12 w-12 text-yellow-400 mx-auto" />
          <h2 className="text-xl font-bold text-white font-mono">Discord bot not configured</h2>
          <p className="text-gray-400 text-sm font-mono leading-relaxed">
            Add <code className="text-purple-300">DISCORD_BOT_TOKEN</code> to your environment secrets.
          </p>
          <div className="flex flex-col gap-2 items-center">
            <a
              href={DISCORD_CHANNEL_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono"
            >
              <Hash className="h-3.5 w-3.5" /> Join the CLAWD Discord
            </a>
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 text-[11px] font-mono"
            >
              <ExternalLink className="h-3 w-3" /> Invite bot to your own server
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Bot starting / failed ─────────────────────────────────────────────────
  const notReady = status && !status.ready;

  return (
    <div className="h-screen bg-[#0a0a14] text-gray-200 flex flex-col overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-indigo-500/20 bg-[#0d0d1f] shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="outline" size="sm" className="border-indigo-500/30 text-indigo-300 h-7 gap-1.5 font-mono text-xs">
              <ArrowLeft className="h-3 w-3" /> Back
            </Button>
          </Link>
          <div className="h-5 w-5 rounded bg-indigo-500/20 flex items-center justify-center">
            <Bot className="h-3.5 w-3.5 text-indigo-300" />
          </div>
          <span className="font-mono font-bold text-white text-sm">Discord Bridge</span>
          {status?.botUser && (
            <Badge className="bg-indigo-500/15 text-indigo-300 border-indigo-500/30 text-[10px] font-mono">
              {status.botUser.tag}
            </Badge>
          )}
          {status?.ready && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" /> connected
            </span>
          )}
          {notReady && (
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-yellow-400">
              <Loader2 className="h-3 w-3 animate-spin" /> {status?.error ? `error: ${status.error}` : "starting…"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={authorTag}
            onChange={(e) => setAuthorTag(e.target.value.slice(0, 24))}
            placeholder="Your tag"
            className="h-7 w-32 bg-black/40 border-indigo-500/25 text-white placeholder-gray-600 font-mono text-xs"
          />
          <a
            href={DISCORD_CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-mono font-semibold"
            title="Open the CLAWD Discord community"
          >
            <Hash className="h-3 w-3" /> Join Community
          </a>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-7 px-2 rounded border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 text-[11px] font-mono"
            title="Invite CLAWD Discord bot to your own server"
          >
            <ExternalLink className="h-3 w-3" /> Invite Bot
          </a>
          <Button onClick={refreshStatus} size="sm" variant="outline" className="border-indigo-500/30 text-indigo-300 h-7 px-2">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex flex-1 overflow-hidden">

        {/* Channels sidebar */}
        <div className="w-60 flex-shrink-0 border-r border-indigo-500/15 bg-[#0c0c1a] flex flex-col">
          <div className="px-3 py-2 border-b border-white/5 text-[10px] font-mono text-gray-500 uppercase tracking-wider">
            {channels.length} channels
          </div>
          <ScrollArea className="flex-1 px-2 py-2">
            {grouped.length === 0 && (
              <div className="text-center py-8 text-[11px] text-gray-600 font-mono">
                {notReady ? "Waiting for bot…" : "No channels found"}
              </div>
            )}
            {grouped.map(([category, list]) => (
              <div key={category} className="mb-3">
                <div className="px-2 py-1 text-[9px] font-mono text-gray-600 uppercase tracking-widest">
                  {category}
                </div>
                {list.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => setActiveChannel(ch)}
                    className={`w-full text-left flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono transition-colors ${
                      activeChannel?.id === ch.id
                        ? "bg-indigo-500/20 text-indigo-200"
                        : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                    }`}
                  >
                    <Hash className="h-3 w-3 opacity-60" />
                    {ch.name}
                  </button>
                ))}
              </div>
            ))}
          </ScrollArea>
        </div>

        {/* Messages + input */}
        <div className="flex-1 flex flex-col bg-[#0a0a14]">
          {/* Channel header */}
          <div className="px-4 py-2 border-b border-white/5 flex items-center gap-2">
            <Hash className="h-4 w-4 text-indigo-400" />
            <span className="font-mono font-bold text-white text-sm">{activeChannel?.name ?? "—"}</span>
            {activeChannel?.topic && (
              <>
                <span className="text-gray-700">·</span>
                <span className="text-[11px] font-mono text-gray-500 truncate">{activeChannel.topic}</span>
              </>
            )}
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 px-4 py-3">
            {loading && (
              <div className="flex items-center justify-center py-8 text-[11px] text-gray-500 font-mono">
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> Loading messages…
              </div>
            )}
            {!loading && messages.length === 0 && activeChannel && (
              <div className="text-center py-12 text-[11px] text-gray-600 font-mono">
                No messages yet. Be the first to say hello.
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className="mb-3 flex items-start gap-2">
                {m.authorAvatar ? (
                  <img src={m.authorAvatar} alt="" className="h-7 w-7 rounded-full shrink-0" />
                ) : (
                  <div className="h-7 w-7 rounded-full bg-indigo-500/20 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-[12px] font-mono font-bold ${m.isBot ? "text-purple-300" : "text-indigo-300"}`}>
                      {m.authorName}
                    </span>
                    {m.isBot && <span className="text-[9px] font-mono text-purple-400/60 bg-purple-500/10 px-1 rounded">BOT</span>}
                    <span className="text-[10px] font-mono text-gray-600">
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="text-[12px] font-mono text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                    {m.content || <span className="text-gray-600 italic">(no content)</span>}
                  </p>
                  {m.attachments.map((a) => (
                    <a key={a.url} href={a.url} target="_blank" rel="noreferrer"
                      className="inline-block mt-1 text-[11px] font-mono text-indigo-400 hover:underline">
                      📎 {a.name}
                    </a>
                  ))}
                </div>
              </div>
            ))}
            <div ref={scrollEnd} />
          </ScrollArea>

          {/* Composer */}
          <form onSubmit={send} className="p-3 border-t border-white/5 flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={activeChannel ? `Message #${activeChannel.name}` : "Select a channel"}
              disabled={!activeChannel || sending || !status?.ready}
              className="bg-black/40 border-indigo-500/25 text-white placeholder-gray-600 font-mono text-xs h-9 focus-visible:ring-indigo-500/40"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!activeChannel || !draft.trim() || sending || !status?.ready}
              className="bg-indigo-600 hover:bg-indigo-500 text-white h-9 w-9 p-0 shrink-0"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
