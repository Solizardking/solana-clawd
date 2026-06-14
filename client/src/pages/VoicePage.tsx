import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Bot, Loader2, Mic, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AssemblyVoiceAgent } from "@/components/AssemblyVoiceAgent";
import { VoiceToPrompt } from "@/components/VoiceToPrompt";
import { chatWithAssemblyGateway, getAssemblyVoiceStatus, type AssemblyVoiceStatus } from "@/lib/assemblyVoice";

const LiveKitVoiceWidget = lazy(() =>
  import("@/components/ClawdVoiceWidget").then((module) => ({
    default: module.ClawdVoiceWidget,
  })),
);

const LIVEKIT_VOICE_ENABLED =
  import.meta.env.VITE_ENABLE_LIVEKIT_VOICE_WIDGET === "true";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export default function VoicePage() {
  const [status, setStatus] = useState<AssemblyVoiceStatus | null>(null);
  const [input, setInput] = useState("");
  const [showLiveAgent, setShowLiveAgent] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "AssemblyAI voice is ready for chat prompts, trading research, token launch planning, and market questions.",
    },
  ]);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    getAssemblyVoiceStatus()
      .then(setStatus)
      .catch((error) => {
        toast({
          title: "Voice status failed",
          description: error?.message || "Could not load AssemblyAI status.",
          variant: "destructive",
        });
      });
  }, [toast]);

  const send = async () => {
    const prompt = input.trim();
    if (!prompt || busy) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: prompt },
    ];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const response = await chatWithAssemblyGateway([
        {
          role: "system",
          content: "You are Cheshire Terminal's AssemblyAI LLM Gateway assistant. Help with voice-driven chat, Solana trading research, token workflows, and app navigation. Do not execute transactions. Keep answers concise.",
        },
        ...nextMessages.filter((message) => message.role !== "system"),
      ]);
      const content = response?.choices?.[0]?.message?.content || "No response returned.";
      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch (error: any) {
      toast({
        title: "Assembly chat failed",
        description: error?.message || "Could not complete the prompt.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-black bg-gradient-to-br from-cyan-950/20 via-black to-purple-950/20 px-3 py-4 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <Link href="/clawd">
            <Button variant="outline" size="sm" className="border-cyan-500/30 bg-black/50 text-cyan-100">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Terminal
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Badge variant={status?.configured ? "default" : "destructive"} className="rounded">
              {status?.configured ? "AssemblyAI configured" : "Missing ASSEMBLY_API_KEY"}
            </Badge>
            <AssemblyVoiceAgent />
          </div>
        </div>

        <Card className="rounded-lg border-cyan-500/20 bg-zinc-950/80">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-cyan-100">
                <Bot className="h-4 w-4" />
                Clawd Live Agent
              </CardTitle>
              <p className="mt-1 text-sm text-zinc-400">
                LiveKit voice sessions stay off the main app path unless this feature is explicitly enabled and loaded here.
              </p>
            </div>
            <Badge variant={LIVEKIT_VOICE_ENABLED ? "default" : "secondary"} className="rounded">
              {LIVEKIT_VOICE_ENABLED ? "Feature enabled" : "Feature disabled"}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {!LIVEKIT_VOICE_ENABLED ? (
              <div className="rounded-md border border-white/10 bg-black/40 p-3 text-sm text-zinc-400">
                Set `VITE_ENABLE_LIVEKIT_VOICE_WIDGET=true` to allow LiveKit voice sessions on this route.
              </div>
            ) : showLiveAgent ? (
              <Suspense
                fallback={
                  <div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/40 p-3 text-sm text-zinc-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading LiveKit voice client...
                  </div>
                }
              >
                <LiveKitVoiceWidget />
              </Suspense>
            ) : (
              <div className="flex flex-col gap-3 rounded-md border border-white/10 bg-black/40 p-3">
                <p className="text-sm text-zinc-400">
                  Load the LiveKit client only when you want a real-time voice session. Regular voice prompts stay on the lighter AssemblyAI path.
                </p>
                <div>
                  <Button
                    onClick={() => setShowLiveAgent(true)}
                    className="bg-cyan-700 hover:bg-cyan-600"
                  >
                    Load Live Agent
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card className="rounded-lg border-cyan-500/20 bg-zinc-950/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-cyan-100">
                <Mic className="h-4 w-4" />
                Voice Control
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-zinc-300">
              <div className="rounded-md border border-white/10 bg-black/40 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Gateway</div>
                <div className="mt-1 font-mono text-xs text-cyan-200">{status?.defaultModel || "loading..."}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-black/40 p-3">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">Voice Agent</div>
                <div className="mt-1 text-xs text-zinc-300">
                  Uses one-time AssemblyAI tokens from `/api/voice/agent-token`; the permanent API key stays on the server.
                </div>
              </div>
              <VoiceToPrompt
                onTranscript={(text) => setInput((prev) => prev ? `${prev}\n${text}` : text)}
                disabled={busy || !status?.configured}
                mode="trading"
                usePromptIntent
                className="w-full justify-center bg-cyan-950/60 text-cyan-100 hover:bg-cyan-900/70"
              />
            </CardContent>
          </Card>

          <Card className="rounded-lg border-purple-500/20 bg-zinc-950/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-purple-100">
                <Bot className="h-4 w-4" />
                Voice Prompt Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-[420px] overflow-y-auto rounded-md border border-white/10 bg-black/60 p-3 font-mono text-sm">
                {messages.map((message, index) => (
                  <div key={index} className="mb-3">
                    <div className={message.role === "assistant" ? "text-cyan-400" : "text-purple-300"}>
                      {message.role === "assistant" ? "assembly@voice" : "user@voice"}:~$
                    </div>
                    <div className="whitespace-pre-wrap break-words text-zinc-200">{message.content}</div>
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-cyan-300">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Speak or type a chat, token, trading, or market prompt..."
                  className="min-h-[76px] resize-none border-purple-500/30 bg-black/70 text-zinc-100"
                  disabled={busy || !status?.configured}
                />
                <Button
                  onClick={send}
                  disabled={busy || !input.trim() || !status?.configured}
                  className="self-stretch bg-purple-700 hover:bg-purple-600"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
