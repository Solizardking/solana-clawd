import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getAssemblyVoiceAgentToken } from "@/lib/assemblyVoice";

const INPUT_SAMPLE_RATE = 24000;

function pcm16ToBase64(buffer: Int16Array) {
  const bytes = new Uint8Array(buffer.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToPcm16(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

function floatToPcm16(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function pcm16ToFloat32(input: Int16Array) {
  const output = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    output[i] = input[i] / (input[i] < 0 ? 0x8000 : 0x7fff);
  }
  return output;
}

export function AssemblyVoiceAgent({ className }: { className?: string }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const { toast } = useToast();

  const wsRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextPlaybackTimeRef = useRef(0);
  const pendingToolCallsRef = useRef<Array<{ call_id: string; name: string; arguments: unknown }>>([]);

  const stopMic = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    inputCtxRef.current?.close().catch(() => {});
    inputCtxRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    stopMic();
    outputCtxRef.current?.close().catch(() => {});
    outputCtxRef.current = null;
    nextPlaybackTimeRef.current = 0;
    pendingToolCallsRef.current = [];
    setConnected(false);
    setConnecting(false);
    setSpeaking(false);
  }, [stopMic]);

  useEffect(() => disconnect, [disconnect]);

  const playPcmAudio = useCallback((base64: string) => {
    const outputCtx = outputCtxRef.current || new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    outputCtxRef.current = outputCtx;

    const pcm = base64ToPcm16(base64);
    const floats = pcm16ToFloat32(pcm);
    const audioBuffer = outputCtx.createBuffer(1, floats.length, INPUT_SAMPLE_RATE);
    audioBuffer.copyToChannel(floats, 0);

    const source = outputCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outputCtx.destination);

    const startAt = Math.max(outputCtx.currentTime, nextPlaybackTimeRef.current);
    source.start(startAt);
    nextPlaybackTimeRef.current = startAt + audioBuffer.duration;
  }, []);

  const sendToolResults = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const pending = pendingToolCallsRef.current.splice(0);
    for (const call of pending) {
      ws.send(JSON.stringify({
        type: "tool.result",
        call_id: call.call_id,
        result: JSON.stringify({
          ok: true,
          message: "Voice command captured. Use the visible terminal controls to review and confirm any transaction before execution.",
          tool: call.name,
        }),
      }));
    }
  }, []);

  const startMic = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micStreamRef.current = stream;

    const inputCtx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    inputCtxRef.current = inputCtx;
    const source = inputCtx.createMediaStreamSource(stream);
    const processor = inputCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (event) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const channel = event.inputBuffer.getChannelData(0);
      const pcm = floatToPcm16(channel);
      ws.send(JSON.stringify({
        type: "input.audio",
        audio: pcm16ToBase64(pcm),
      }));
    };

    source.connect(processor);
    processor.connect(inputCtx.destination);
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const token = await getAssemblyVoiceAgentToken();
      const ws = new WebSocket(`wss://agents.assemblyai.com/v1/ws?token=${encodeURIComponent(token.token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            system_prompt: `You are the Cheshire Terminal AssemblyAI voice agent for chat, Solana token workflows, DFlow prediction markets, Jupiter swaps, Meteora pools, and CLAWD trading research.
Keep replies short and spoken-friendly.
Never say a trade, swap, launch, transfer, burn, or wallet action has been executed.
For financial actions, summarize the requested action, mention key risks, and ask the user to confirm in the visible app UI.`,
            greeting: "Assembly voice is online. What should we work on?",
            input: {
              format: { encoding: "audio/pcm" },
              keyterms: ["CLAWD", "Solana", "Jupiter", "DFlow", "Meteora", "Pump Fun", "Raydium", "Birdeye", "Helius"],
              turn_detection: {
                min_silence: 700,
                max_silence: 2400,
                interrupt_response: true,
              },
            },
            output: {
              voice: "ivy",
              format: { encoding: "audio/pcm" },
            },
            tools: [
              {
                type: "function",
                name: "capture_trading_intent",
                description: "Capture a user's requested trading, swap, prediction market, or token action for confirmation in the app UI.",
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    action: { type: "string" },
                    asset: { type: "string" },
                    amount: { type: "string" },
                    venue: { type: "string" },
                    notes: { type: "string" },
                  },
                  required: ["action", "asset", "amount", "venue", "notes"],
                },
              },
            ],
          },
        }));
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "session.ready") {
          setConnected(true);
          setConnecting(false);
          await startMic();
          return;
        }
        if (message.type === "reply.started") {
          setSpeaking(true);
          return;
        }
        if (message.type === "reply.audio" && message.data) {
          playPcmAudio(message.data);
          return;
        }
        if (message.type === "reply.done") {
          setSpeaking(false);
          sendToolResults();
          return;
        }
        if (message.type === "tool.call") {
          pendingToolCallsRef.current.push(message);
          return;
        }
        if (message.type === "transcript.user" && message.text) {
          console.log("[AssemblyVoice] user:", message.text);
          return;
        }
        if (message.type === "transcript.agent" && message.text) {
          console.log("[AssemblyVoice] agent:", message.text);
          return;
        }
        if (message.type === "session.error" || message.type === "error") {
          throw new Error(message.message || message.code || "AssemblyAI voice session error");
        }
      };

      ws.onerror = () => {
        toast({
          title: "Assembly voice error",
          description: "The voice session connection failed.",
          variant: "destructive",
        });
        disconnect();
      };

      ws.onclose = () => {
        stopMic();
        setConnected(false);
        setConnecting(false);
        setSpeaking(false);
      };
    } catch (error: any) {
      toast({
        title: "Assembly voice unavailable",
        description: error?.message || "Could not start voice agent.",
        variant: "destructive",
      });
      disconnect();
    }
  }, [disconnect, playPcmAudio, sendToolResults, startMic, stopMic, toast]);

  const toggle = () => {
    if (connected || connecting) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <Button
      type="button"
      onClick={toggle}
      disabled={connecting}
      variant={connected ? "destructive" : "outline"}
      size="sm"
      className={cn(
        "relative gap-2 border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10",
        connected && "border-red-500/50 bg-red-600/20 text-red-100",
        className,
      )}
      title={connected ? "Stop AssemblyAI voice agent" : "Start AssemblyAI voice agent"}
    >
      {connecting ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : connected ? (
        <MicOff className="h-4 w-4" />
      ) : (
        <Mic className="h-4 w-4" />
      )}
      <span className="hidden lg:inline">{connecting ? "Voice..." : connected ? "Stop" : "Voice"}</span>
      {speaking && (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-green-400 shadow shadow-green-400" />
      )}
    </Button>
  );
}
