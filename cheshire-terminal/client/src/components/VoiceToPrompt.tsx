import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { promptWithAssemblyAI, transcribeWithAssemblyAI } from "@/lib/assemblyVoice";

interface Props {
  onTranscript: (text: string) => void;
  className?: string;
  disabled?: boolean;
  mode?: "chat" | "trading" | "token" | "image";
  usePromptIntent?: boolean;
}

export function VoiceToPrompt({
  onTranscript,
  className,
  disabled = false,
  mode = "chat",
  usePromptIntent = false,
}: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => () => stopMeter(), []);

  function stopMeter() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  }

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // VU meter
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setLevel(Math.min(1, (sum / data.length) / 100));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        stopMeter();
        const blob = new Blob(chunksRef.current, { type: mime });
        if (blob.size < 800) {
          toast({ title: "Too short", description: "Hold the mic and speak.", variant: "destructive" });
          return;
        }
        setBusy(true);
        try {
          const result = usePromptIntent
            ? await promptWithAssemblyAI(blob, { language: "en", mode })
            : await transcribeWithAssemblyAI(blob, { language: "en" });
          const text = (
            usePromptIntent && "intent" in result
              ? result.intent?.prompt || result.text
              : result.text
          ).trim();
          if (text) {
            onTranscript(text);
            toast({ title: "Transcribed", description: text.length > 80 ? text.slice(0, 80) + "…" : text });
          } else {
            toast({ title: "No speech detected", variant: "destructive" });
          }
        } catch (e: any) {
          toast({ title: "Voice error", description: e?.message, variant: "destructive" });
        } finally {
          setBusy(false);
        }
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (e: any) {
      toast({ title: "Mic blocked", description: e?.message || "Allow microphone access", variant: "destructive" });
    }
  };

  const stop = () => {
    recRef.current?.stop();
    setRecording(false);
  };

  return (
    <Button
      type="button"
      onClick={recording ? stop : start}
      disabled={busy || disabled}
      aria-disabled={disabled}
      variant={recording ? "destructive" : "secondary"}
      size="sm"
      className={cn("relative gap-2", className)}
      data-testid="button-voice-to-prompt"
    >
      {busy ? (
        <><Loader2 className="h-4 w-4 animate-spin" /> Transcribing…</>
      ) : recording ? (
        <>
          <span
            aria-hidden
            className="absolute inset-0 rounded-md bg-red-500/30"
            style={{ transform: `scale(${1 + level * 0.4})`, transition: "transform 60ms" }}
          />
          <Square className="h-4 w-4 relative z-10" />
          <span className="relative z-10">Stop ({Math.round(level * 100)}%)</span>
        </>
      ) : (
        <><Mic className="h-4 w-4" /> Voice prompt</>
      )}
    </Button>
  );
}
