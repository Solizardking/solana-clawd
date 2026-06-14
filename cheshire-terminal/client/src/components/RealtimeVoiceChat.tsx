import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * RealtimeVoiceChat — WebRTC connection to OpenAI Realtime API (gpt-realtime-2).
 *
 * Usage:
 *   <RealtimeVoiceChat />
 *
 * The component fetches an ephemeral token from /api/realtime/voice/token,
 * then establishes an RTCPeerConnection to api.openai.com/v1/realtime.
 * Audio is captured from the mic and played back via a <video> element's
 * audio track (or an <audio> element), with full-duplex conversation.
 */
export function RealtimeVoiceChat({ className }: { className?: string }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [volume, setVolume] = useState(0);
  const { toast } = useToast();

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const meterRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => disconnect();
  }, []);

  const stopMeter = () => {
    if (meterRef.current) {
      cancelAnimationFrame(meterRef.current);
      meterRef.current = null;
    }
    setVolume(0);
  };

  const disconnect = useCallback(() => {
    stopMeter();
    dcRef.current?.close();
    dcRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }
    setConnected(false);
    setConnecting(false);
  }, []);

  const connect = async () => {
    setConnecting(true);
    try {
      // 1. Fetch ephemeral token from our server
      const tokenRes = await fetch("/api/realtime/voice/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-realtime-2" }),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || `Token fetch failed: ${tokenRes.status}`);
      }
      const { client_secret } = await tokenRes.json() as {
        client_secret: { value: string; expires_at: number };
      };

      // 2. Get user mic
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // 3. Create RTCPeerConnection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Add mic track
      stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));

      // Create audio element for remote audio
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = (event) => {
        if (event.track.kind === "audio") {
          audioEl.srcObject = event.streams[0];
        }
      };

      // 4. Create data channel for Realtime events
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.onopen = () => {
        console.log("[RealtimeVoice] data channel open");
        // Send session update to configure the AI
        const sessionUpdate = {
          type: "session.update",
          session: {
            instructions: `You are the Cheshire Terminal voice assistant — helpful, witty, and knowledgeable about Solana, crypto, NFTs, and trading. You talk naturally and conversationally. Keep responses concise.`,
            voice: "alloy",
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600,
            },
            input_audio_transcription: {
              enabled: true,
            },
          },
        };
        dc.send(JSON.stringify(sessionUpdate));
      };

      dc.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "error") {
            console.error("[RealtimeVoice] API error:", msg.error);
            toast({
              title: "Voice Error",
              description: msg.error?.message || "API error",
              variant: "destructive",
            });
          } else if (msg.type === "conversation.item.input_audio_transcription.completed") {
            // Just log transcriptions for now
            if (msg.transcript) {
              console.log("[RealtimeVoice] You said:", msg.transcript);
            }
          }
        } catch {}
      };

      dc.onerror = (err) => {
        console.error("[RealtimeVoice] data channel error:", err);
      };

      // 5. Create and set local SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 6. Send offer to OpenAI Realtime API
      const sdpRes = await fetch(
        `https://api.openai.com/v1/realtime?model=gpt-realtime-2`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${client_secret.value}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        }
      );

      if (!sdpRes.ok) {
        const errText = await sdpRes.text();
        throw new Error(`OpenAI SDP error: ${sdpRes.status} — ${errText}`);
      }

      const answerSdp = await sdpRes.text();

      // 7. Set remote SDP answer
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // 8. Start VU meter for visual feedback
      startMeter(stream);

      setConnected(true);
      toast({
        title: "🎙️ Voice Connected",
        description: "You can now talk to Cheshire AI. Speak naturally!",
      });
    } catch (err: any) {
      console.error("[RealtimeVoice] connection failed:", err);
      toast({
        title: "Voice Connection Failed",
        description: err.message || "Could not connect to voice chat",
        variant: "destructive",
      });
      disconnect();
    } finally {
      setConnecting(false);
    }
  };

  const startMeter = (stream: MediaStream) => {
    try {
      const audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setVolume(Math.min(1, (sum / data.length) / 100));
        meterRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Cleanup audio context on disconnect
      const origDisconnect = disconnect;
      const _origStopMeter = stopMeter;
      const cleanup = () => {
        audioCtx.close().catch(() => {});
      };
      // We'll just close context when component unmounts via the useEffect cleanup
      // Store ref to close later
      (window as any).__realtimeAudioCtx = audioCtx;
    } catch {}
  };

  const toggle = () => {
    if (connected || connecting) {
      disconnect();
    } else {
      connect();
    }
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        onClick={toggle}
        disabled={connecting}
        variant={connected ? "destructive" : "default"}
        size="sm"
        className={cn(
          "relative gap-2 transition-all",
          connected && "animate-pulse bg-red-600 hover:bg-red-700"
        )}
      >
        {connecting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Connecting...
          </>
        ) : connected ? (
          <>
            <PhoneOff className="h-4 w-4" />
            Hang Up
            {volume > 0.05 && (
              <span
                className="absolute -top-1 -right-1 flex h-3 w-3"
              >
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
              </span>
            )}
          </>
        ) : (
          <>
            <Phone className="h-4 w-4" />
            Voice Chat
          </>
        )}
      </Button>
      {connected && (
        <div className="flex items-center gap-1">
          <div
            className="h-2 w-16 rounded-full bg-gray-700 overflow-hidden"
            title={`Volume: ${Math.round(volume * 100)}%`}
          >
            <div
              className="h-full rounded-full transition-all duration-75"
              style={{
                width: `${Math.min(100, volume * 100)}%`,
                background:
                  volume > 0.6
                    ? "linear-gradient(90deg, #22c55e, #ef4444)"
                    : volume > 0.3
                    ? "linear-gradient(90deg, #22c55e, #eab308)"
                    : "#22c55e",
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
