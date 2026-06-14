/**
 * ClawdVoiceWidget — connects the browser to the Clawd LiveKit agent
 * running as the live production voice agent (agent ID: CA_xk8hpixq4g6K).
 *
 * Stack: AssemblyAI STT · OpenAI GPT-4.1 · Cartesia Sonic-3 TTS
 * 8 Solana trading tools available via voice.
 */
import { useState, useCallback } from "react";
import {
  LiveKitRoom,
  useVoiceAssistant,
  BarVisualizer,
  VoiceAssistantControlBar,
  RoomAudioRenderer,
  useConnectionState,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { ConnectionState } from "livekit-client";
import { Mic, MicOff, Phone, PhoneOff, Loader2, Bot, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

// ── Inner component (must be inside LiveKitRoom) ──────────────────────────────
function AgentView() {
  const { state, audioTrack, agentTranscriptions } = useVoiceAssistant();
  const connectionState = useConnectionState();

  const isConnecting =
    connectionState === ConnectionState.Connecting ||
    state === "connecting" ||
    state === "pre-connect-buffering";

  const isLive =
    connectionState === ConnectionState.Connected &&
    state !== "disconnected" &&
    state !== "failed";

  const stateLabel =
    state === "listening"
      ? "Listening…"
      : state === "thinking"
        ? "Thinking…"
        : state === "speaking"
          ? "Speaking…"
          : state === "pre-connect-buffering"
            ? "Buffering…"
            : isConnecting
              ? "Connecting…"
              : "Ready";

  const last5 = agentTranscriptions?.slice(-5) ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Visualizer */}
      <div className="flex flex-col items-center gap-3 rounded-xl border border-cyan-500/20 bg-black/60 py-6">
        <BarVisualizer
          state={state}
          trackRef={audioTrack}
          className="h-16 w-full max-w-xs"
          style={{ "--lk-bar-color": "#22d3ee" } as React.CSSProperties}
        />
        <div className="flex items-center gap-2 text-sm">
          <div
            className={[
              "h-2 w-2 rounded-full",
              isLive
                ? "animate-pulse bg-emerald-400"
                : isConnecting
                  ? "animate-pulse bg-amber-400"
                  : "bg-zinc-600",
            ].join(" ")}
          />
          <span className="text-zinc-300">{stateLabel}</span>
        </div>
      </div>

      {/* Recent transcript */}
      {last5.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
          {last5.map((t, i) => (
            <p key={i} className="mb-1 text-zinc-300">
              <span className="text-cyan-400 font-semibold">Clawd: </span>
              {t.text}
            </p>
          ))}
        </div>
      )}

      {/* Controls (mic toggle + leave) */}
      <VoiceAssistantControlBar
        controls={{ microphone: true, leave: true }}
        className="justify-center gap-3"
      />

      <RoomAudioRenderer />
    </div>
  );
}

// ── Root component ─────────────────────────────────────────────────────────────
export function ClawdVoiceWidget() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string>(
    "wss://solanaos-zn3w8h4f.livekit.cloud"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  // Not logged in — show lock screen
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/80 p-6">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8 text-zinc-600" />
          <div>
            <p className="text-sm font-semibold text-zinc-400">Clawd Voice Agent</p>
            <p className="text-xs text-zinc-600">AssemblyAI · GPT-4.1 · Cartesia Sonic-3</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-800/40 bg-amber-950/30 px-4 py-3">
          <Lock className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs text-amber-300">
            Sign in with your wallet to access the voice agent.
          </p>
        </div>
        <p className="text-[10px] text-zinc-600">Agent ID: CA_xk8hpixq4g6K · Production voice agent</p>
      </div>
    );
  }

  const join = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Unique room per session so users don't share an agent
    const sessionRoom = `clawd-${Math.random().toString(36).slice(2, 9)}`;
    try {
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: sessionRoom }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any).error ?? `Token request failed: ${res.status}`);
      }
      const data = await res.json();
      setLivekitUrl(data.url);
      setToken(data.token);
      setConnected(true);
    } catch (e: any) {
      setError(e?.message ?? "Failed to connect");
    } finally {
      setLoading(false);
    }
  }, []);

  const leave = useCallback(() => {
    setToken(null);
    setConnected(false);
    setError(null);
  }, []);

  if (!connected || !token) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-cyan-500/20 bg-zinc-950/80 p-6">
        <div className="flex items-center gap-3">
          <Bot className="h-8 w-8 text-cyan-400" />
          <div>
            <p className="text-sm font-semibold text-zinc-100">Clawd Voice Agent</p>
            <p className="text-xs text-zinc-500">
              AssemblyAI · GPT-4.1 · Cartesia Sonic-3
            </p>
          </div>
        </div>

        <p className="max-w-xs text-center text-xs text-zinc-400">
          Talk to Clawd — check prices, wallet balances, get swap quotes, and
          execute trades on Solana via voice.
        </p>

        {error && (
          <p className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <button
          onClick={join}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl bg-cyan-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Phone className="h-4 w-4" />
          )}
          {loading ? "Connecting…" : "Start Voice Session"}
        </button>

        <p className="text-[10px] text-zinc-600">
          Agent ID: CA_xk8hpixq4g6K · Production voice agent
        </p>
      </div>
    );
  }

  return (
    <LiveKitRoom
      serverUrl={livekitUrl}
      token={token}
      connect
      audio
      video={false}
      onDisconnected={leave}
      className="rounded-xl border border-cyan-500/20 bg-zinc-950/80 p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-cyan-400" />
          <span className="text-sm font-semibold text-zinc-100">Clawd</span>
        </div>
        <button
          onClick={leave}
          className="flex items-center gap-1.5 rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/40 transition-colors"
        >
          <PhoneOff className="h-3.5 w-3.5" />
          Leave
        </button>
      </div>
      <AgentView />
    </LiveKitRoom>
  );
}
