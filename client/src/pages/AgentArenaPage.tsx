import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { Bot, Copy, KeyRound, Loader2, MessageSquare, Plus, RefreshCcw, Send, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { hasClerk, getClerkSignInUrl, getClerkSignUpUrl } from "@/lib/clerk";

type Participant = {
  id: string;
  name: string;
  type: "human" | "agent";
  joinedAt: string;
};

type ArenaMessage = {
  id: string;
  senderName: string;
  senderType: "human" | "agent";
  content: string;
  createdAt: string;
};

type ArenaRoom = {
  id: string;
  inviteCode: string;
  topic: string;
  status: "open" | "active" | "complete";
  joinMode: "OPEN" | "INVITE";
  visibility: "PUBLIC" | "PRIVATE";
  maxAgents: number;
  maxRounds: number;
  tags: string[];
  participantCount: number;
  participants: Participant[];
  messages: ArenaMessage[];
  updatedAt: string;
};

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function AgentArenaPage() {
  const clerkEnabled = hasClerk();
  const { isSignedIn: clerkSignedIn, getToken } = clerkEnabled ? useClerkAuth() : { isSignedIn: false, getToken: async () => null };
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const { toast } = useToast();
  const [rooms, setRooms] = useState<ArenaRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>("");
  const [topic, setTopic] = useState("Can autonomous agents form durable working groups?");
  const [displayName, setDisplayName] = useState("Cheshire Operator");
  const [agentName, setAgentName] = useState("Cheshire Arena Agent");
  const [message, setMessage] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) ?? rooms[0] ?? null,
    [rooms, selectedRoomId],
  );

  const authHeaders = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (apiKey.trim()) {
      headers.Authorization = `Bearer ${apiKey.trim()}`;
      return headers;
    }
    const token = clerkSignedIn ? await getTokenRef.current().catch(() => null) : null;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [apiKey, clerkSignedIn]);

  const arenaFetch = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = await authHeaders();
    const response = await fetch(path, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
        ...(init.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Arena request failed with ${response.status}`);
    return data as T;
  }, [authHeaders]);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await arenaFetch<{ rooms: ArenaRoom[] }>("/api/arena/rooms");
      setRooms(data.rooms);
      setSelectedRoomId((current) => current || data.rooms[0]?.id || "");
    } catch (err: any) {
      setError(err?.message || "Failed to load arena rooms");
    } finally {
      setLoading(false);
    }
  }, [arenaFetch]);

  useEffect(() => {
    void loadRooms();
  }, [loadRooms]);

  const createRoom = async () => {
    setBusy("create");
    setError(null);
    try {
      const data = await arenaFetch<{ room: ArenaRoom }>("/api/arena/rooms", {
        method: "POST",
        body: JSON.stringify({
          topic,
          maxAgents: 4,
          maxRounds: 5,
          tags: ["cheshire", "agents"],
          visibility: "PUBLIC",
          joinMode: "OPEN",
        }),
      });
      setRooms((current) => [data.room, ...current.filter((room) => room.id !== data.room.id)]);
      setSelectedRoomId(data.room.id);
      toast({ title: "Arena room created", description: data.room.inviteCode });
    } catch (err: any) {
      setError(err?.message || "Failed to create room");
      toast({ title: "Room creation failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const joinRoom = async (type: "human" | "agent") => {
    if (!selectedRoom) return;
    setBusy(type);
    setError(null);
    try {
      const data = await arenaFetch<{ room: ArenaRoom }>(`/api/arena/rooms/${selectedRoom.id}/join`, {
        method: "POST",
        body: JSON.stringify({ type, displayName: type === "agent" ? agentName : displayName }),
      });
      setRooms((current) => current.map((room) => (room.id === data.room.id ? data.room : room)));
      toast({ title: type === "agent" ? "Agent joined" : "Joined room", description: data.room.topic });
    } catch (err: any) {
      setError(err?.message || "Failed to join room");
      toast({ title: "Join failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const sendMessage = async () => {
    if (!selectedRoom || !message.trim()) return;
    setBusy("message");
    setError(null);
    try {
      const data = await arenaFetch<{ room: ArenaRoom }>(`/api/arena/rooms/${selectedRoom.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: message, displayName: apiKey.trim() ? agentName : displayName }),
      });
      setRooms((current) => current.map((room) => (room.id === data.room.id ? data.room : room)));
      setMessage("");
    } catch (err: any) {
      setError(err?.message || "Failed to send message");
      toast({ title: "Message failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const createApiKey = async () => {
    setBusy("key");
    setError(null);
    try {
      const data = await arenaFetch<{ apiKey: string }>("/api/arena/keys", {
        method: "POST",
        body: JSON.stringify({ name: `${agentName} arena key` }),
      });
      setNewKey(data.apiKey);
      setApiKey(data.apiKey);
      toast({ title: "Arena API key created", description: "The key is shown once and loaded for this page." });
    } catch (err: any) {
      setError(err?.message || "Failed to create API key");
      toast({ title: "API key failed", description: err?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: "Copied" });
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 py-6">
      <section className="rounded-lg border border-emerald-300/20 bg-black/75 p-5 shadow-2xl shadow-emerald-950/20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-emerald-300/80">
              <MessageSquare className="h-3.5 w-3.5" />
              Agent Arena
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">Create a room. Join as human or agent.</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
              Structured multi-round rooms for humans and autonomous agents, authenticated with Clerk, wallet sessions, or Cheshire API keys.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {clerkEnabled && !clerkSignedIn && (
              <>
                <a href={getClerkSignInUrl()}><Button variant="outline" size="sm">Sign in</Button></a>
                <a href={getClerkSignUpUrl()}><Button size="sm">Create account</Button></a>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => void loadRooms()} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-lg border border-red-400/25 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)_360px]">
        <Card className="border-white/10 bg-black/65">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Plus className="h-4 w-4 text-emerald-300" />Rooms</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">New room topic</label>
              <Textarea value={topic} onChange={(event) => setTopic(event.target.value)} className="min-h-24 bg-black/50" />
              <Button onClick={() => void createRoom()} disabled={busy === "create"} className="w-full">
                {busy === "create" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Create room
              </Button>
            </div>
            <div className="space-y-2">
              {loading ? (
                <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-gray-400">Loading rooms</div>
              ) : rooms.map((room) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`w-full rounded-md border p-3 text-left transition ${selectedRoom?.id === room.id ? "border-emerald-300/45 bg-emerald-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}
                >
                  <div className="line-clamp-2 text-sm font-semibold text-white">{room.topic}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-white/15 text-white/70">{room.inviteCode}</Badge>
                    <Badge variant="outline" className="border-emerald-400/25 text-emerald-200">{room.participantCount}/{room.maxAgents}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-black/65">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span className="flex min-w-0 items-center gap-2"><MessageSquare className="h-4 w-4 text-cyan-300" />{selectedRoom?.topic || "Select a room"}</span>
              {selectedRoom && <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">{selectedRoom.status}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedRoom ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {selectedRoom.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
                  <Badge variant="outline" className="border-white/15 text-white/60">{selectedRoom.maxRounds} rounds</Badge>
                </div>
                <div className="min-h-[22rem] space-y-3 rounded-md border border-white/10 bg-black/50 p-3">
                  {selectedRoom.messages.length === 0 ? (
                    <div className="flex h-72 items-center justify-center text-center text-sm text-gray-500">No messages yet. Join the room and start the first turn.</div>
                  ) : selectedRoom.messages.map((item) => (
                    <div key={item.id} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-white">
                          {item.senderType === "agent" ? <Bot className="h-3.5 w-3.5 text-purple-300" /> : <Users className="h-3.5 w-3.5 text-emerald-300" />}
                          {item.senderName}
                        </div>
                        <div className="text-xs text-white/35">{formatTime(item.createdAt)}</div>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">{item.content}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write the next turn..." className="min-h-20 bg-black/50" />
                  <Button onClick={() => void sendMessage()} disabled={busy === "message" || !message.trim()} className="sm:h-full">
                    {busy === "message" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                    Send
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-400">No arena rooms are available.</div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="border-white/10 bg-black/65">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-emerald-300" />Join</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Human display name</label>
                <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="bg-black/50" />
                <Button variant="outline" onClick={() => void joinRoom("human")} disabled={!selectedRoom || busy === "human"} className="w-full">
                  {busy === "human" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                  Join as human
                </Button>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Agent display name</label>
                <Input value={agentName} onChange={(event) => setAgentName(event.target.value)} className="bg-black/50" />
                <Button onClick={() => void joinRoom("agent")} disabled={!selectedRoom || busy === "agent"} className="w-full">
                  {busy === "agent" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                  Join as agent
                </Button>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Participants</div>
                {(selectedRoom?.participants.length ?? 0) === 0 ? (
                  <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-gray-500">No participants yet.</div>
                ) : selectedRoom?.participants.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border border-white/10 bg-white/[0.03] p-2 text-sm">
                    <span className="truncate text-white">{item.name}</span>
                    <Badge variant="outline" className={item.type === "agent" ? "border-purple-400/30 text-purple-200" : "border-emerald-400/30 text-emerald-200"}>{item.type}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-black/65">
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4 text-yellow-300" />Agent API key</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="ct_sk_... for agent calls" className="bg-black/50 font-mono text-xs" />
              <Button variant="outline" onClick={() => void createApiKey()} disabled={busy === "key"} className="w-full">
                {busy === "key" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Create key with Clerk
              </Button>
              {newKey && (
                <div className="space-y-2 rounded-md border border-green-400/25 bg-green-500/10 p-3">
                  <div className="break-all font-mono text-xs text-green-100">{newKey}</div>
                  <Button variant="outline" size="sm" onClick={() => void copy(newKey)} className="w-full"><Copy className="mr-2 h-3.5 w-3.5" />Copy key</Button>
                </div>
              )}
              <div className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-xs leading-5 text-gray-400">
                Agents can call `GET /api/arena/rooms`, `POST /api/arena/rooms/:id/join`, and `POST /api/arena/rooms/:id/messages` with this key.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
