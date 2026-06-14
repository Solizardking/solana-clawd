import { useState, useRef, useEffect } from "react";
import { useTreasuryGate } from "@/contexts/TreasuryGateContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Play, Download, Sparkles, Clock, AlertCircle, RefreshCw,
  Image as ImageIcon, Film, Layers, FastForward, Wand2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RealtimeArtFeed } from "@/components/RealtimeArtFeed";

type Mode = "t2v" | "i2v" | "ref" | "edit" | "extend";
type VideoStatus = "idle" | "pending" | "done" | "failed";

interface VideoResult {
  requestId: string;
  status: VideoStatus;
  videoUrl?: string;
  duration?: number;
  model?: string;
}

const T2V_PROMPTS = [
  "$CLAWD lobster dancing on Solana blockchain, neon purple wonderland, cinematic 8K",
  "Meme token rocket launching to the moon, psychedelic Web3 landscape, particle effects",
  "Cheshire cat grinning over crypto charts going parabolic, neon green rain, Matrix vibes",
];

export default function VideoGenPage() {
  const [mode, setMode] = useState<Mode>("t2v");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [refImages, setRefImages] = useState<string>(""); // comma-separated
  const [videoUrl, setVideoUrl] = useState("");
  const [duration, setDuration] = useState("8");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState("720p");
  const [status, setStatus] = useState<VideoStatus>("idle");
  const [result, setResult] = useState<VideoResult | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const { requirePayment } = useTreasuryGate();

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const poll = (requestId: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/xai/video-status/${requestId}`);
        const d = await r.json();
        setPollCount(c => c + 1);
        if (d.status === "done") {
          setStatus("done");
          setResult({ requestId, status: "done", videoUrl: d.videoUrl, duration: d.duration, model: d.model });
          toast({ title: "Video ready!", description: "Grok Imagine finished rendering." });
        } else if (d.status === "failed" || d.status === "expired") {
          setStatus("failed");
          toast({ title: `Generation ${d.status}`, variant: "destructive" });
        } else {
          poll(requestId);
        }
      } catch {
        poll(requestId);
      }
    }, 5000);
  };

  const generate = async () => {
    if (!prompt.trim()) { toast({ title: "Prompt required", variant: "destructive" }); return; }
    if (mode === "i2v" && !imageUrl.trim()) { toast({ title: "Image URL required", variant: "destructive" }); return; }
    if (mode === "ref" && !refImages.trim()) { toast({ title: "Reference image URLs required", variant: "destructive" }); return; }
    if ((mode === "edit" || mode === "extend") && !videoUrl.trim()) { toast({ title: "Source video URL required", variant: "destructive" }); return; }

    const paid = await requirePayment("video", `Video Generation (${mode})`);
    if (!paid) return;

    setStatus("pending");
    setResult(null);
    setPollCount(0);

    const body: any = { prompt: prompt.trim() };
    if (mode === "t2v" || mode === "i2v" || mode === "ref") {
      body.duration = Number(duration);
      body.aspect_ratio = aspectRatio;
      body.resolution = resolution;
    }
    if (mode === "i2v") body.image_url = imageUrl.trim();
    if (mode === "ref") {
      body.mode = "reference";
      body.reference_image_urls = refImages.split(",").map(s => s.trim()).filter(Boolean).slice(0, 7);
    }
    if (mode === "edit") { body.mode = "edit"; body.video_url = videoUrl.trim(); }
    if (mode === "extend") { body.mode = "extend"; body.video_url = videoUrl.trim(); body.duration = Number(duration); }

    try {
      const r = await fetch("/api/xai/video-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || !d.requestId) throw new Error(d.error || "Failed to start");
      setResult({ requestId: d.requestId, status: "pending" });
      poll(d.requestId);
      toast({ title: "Grok Imagine started", description: "Streaming to the live feed when ready." });
    } catch (e: any) {
      setStatus("failed");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const reset = () => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setStatus("idle"); setResult(null); setPollCount(0);
  };

  return (
    <div className="max-w-7xl mx-auto py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <Film className="h-8 w-8 text-purple-400" />
            <h1 className="text-3xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 text-transparent bg-clip-text">
              Grok Imagine Video Studio
            </h1>
          </div>
          <p className="text-purple-300/60 text-sm">
            Powered by <span className="text-orange-400 font-bold">grok-imagine-video</span> · xAI default · streams to realtime feed
          </p>
          <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400">text-to-video</Badge>
            <Badge variant="outline" className="text-[10px] border-pink-500/30 text-pink-400">image-to-video</Badge>
            <Badge variant="outline" className="text-[10px] border-orange-500/30 text-orange-400">reference-to-video</Badge>
            <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">edit · extend</Badge>
          </div>
        </div>

        <Tabs value={mode} onValueChange={v => setMode(v as Mode)} className="space-y-4">
          <TabsList className="bg-black/60 border border-purple-500/20 w-full grid grid-cols-5">
            <TabsTrigger value="t2v" data-testid="tab-t2v"><Sparkles className="w-4 h-4 mr-1" />T2V</TabsTrigger>
            <TabsTrigger value="i2v" data-testid="tab-i2v"><ImageIcon className="w-4 h-4 mr-1" />I2V</TabsTrigger>
            <TabsTrigger value="ref" data-testid="tab-ref"><Layers className="w-4 h-4 mr-1" />Ref</TabsTrigger>
            <TabsTrigger value="edit" data-testid="tab-edit"><Wand2 className="w-4 h-4 mr-1" />Edit</TabsTrigger>
            <TabsTrigger value="extend" data-testid="tab-extend"><FastForward className="w-4 h-4 mr-1" />Extend</TabsTrigger>
          </TabsList>

          <div className="bg-black/60 border border-purple-500/30 rounded-xl p-5 space-y-4">
            {(mode === "i2v") && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-pink-300">Source Image URL or data:URI</Label>
                <Input
                  value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://… or data:image/png;base64,…"
                  className="bg-black/40 border-pink-500/30 text-white"
                  disabled={status === "pending"} data-testid="input-image-url"
                />
                {imageUrl && (
                  <img src={imageUrl} alt="ref" className="w-full max-h-40 object-cover rounded-lg border border-pink-500/20"
                    onError={e => (e.target as HTMLImageElement).style.display = "none"} />
                )}
              </div>
            )}

            {mode === "ref" && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-orange-300">Reference Image URLs (comma-separated, max 7)</Label>
                <Textarea
                  value={refImages} onChange={e => setRefImages(e.target.value)}
                  placeholder="https://image1.png, https://image2.png, https://image3.png"
                  className="bg-black/40 border-orange-500/30 text-white h-20"
                  disabled={status === "pending"} data-testid="input-ref-images"
                />
                <div className="flex gap-2 flex-wrap">
                  {refImages.split(",").map(s => s.trim()).filter(Boolean).slice(0, 7).map((u, i) => (
                    <img key={i} src={u} alt="" className="h-16 w-16 object-cover rounded border border-orange-500/30"
                      onError={e => (e.target as HTMLImageElement).style.display = "none"} />
                  ))}
                </div>
              </div>
            )}

            {(mode === "edit" || mode === "extend") && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-blue-300">Source Video URL (.mp4)</Label>
                <Input
                  value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                  placeholder="https://… mp4 (≤ 8.7s for edit, 2-15s for extend)"
                  className="bg-black/40 border-blue-500/30 text-white"
                  disabled={status === "pending"} data-testid="input-video-url"
                />
                {videoUrl && (
                  <video src={videoUrl} className="w-full max-h-40 rounded-lg border border-blue-500/20" controls preload="metadata" />
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-purple-300">
                {mode === "edit" ? "Edit Instructions" : mode === "extend" ? "Continuation Prompt" : "Prompt"}
              </Label>
              <Textarea
                value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder={
                  mode === "edit" ? "What should change? e.g. 'give the woman a silver necklace'" :
                  mode === "extend" ? "What happens next? e.g. 'the cat leaps off, chasing a butterfly'" :
                  "Describe the scene in cinematic detail…"
                }
                className="bg-black/40 border-purple-500/30 text-white h-28"
                disabled={status === "pending"} data-testid="input-prompt"
              />
              {mode === "t2v" && (
                <div className="flex flex-wrap gap-2">
                  {T2V_PROMPTS.map((p, i) => (
                    <button key={i} onClick={() => setPrompt(p)} disabled={status === "pending"}
                      className="text-xs px-2.5 py-1 rounded-lg bg-purple-900/30 border border-purple-500/20 text-purple-300/70 hover:text-purple-200 transition-all disabled:opacity-40 text-left">
                      {p.slice(0, 55)}…
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(mode === "t2v" || mode === "i2v" || mode === "ref" || mode === "extend") && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-purple-400/60 font-semibold uppercase tracking-wide">
                    {mode === "extend" ? "Extend by" : "Duration"}
                  </Label>
                  <Select value={duration} onValueChange={setDuration} disabled={status === "pending"}>
                    <SelectTrigger className="bg-black/40 border-purple-500/30 text-white h-9"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-black/95 border-purple-500/30">
                      {(mode === "extend" ? ["2","4","6","8","10"] : ["3","5","8","10","12","15"]).map(v =>
                        <SelectItem key={v} value={v}>{v}s</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {mode !== "extend" && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs text-purple-400/60 font-semibold uppercase tracking-wide">Aspect Ratio</Label>
                      <Select value={aspectRatio} onValueChange={setAspectRatio} disabled={status === "pending"}>
                        <SelectTrigger className="bg-black/40 border-purple-500/30 text-white h-9"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-black/95 border-purple-500/30">
                          {["16:9","9:16","1:1","4:3","3:4","3:2","2:3"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-purple-400/60 font-semibold uppercase tracking-wide">Resolution</Label>
                      <Select value={resolution} onValueChange={setResolution} disabled={status === "pending"}>
                        <SelectTrigger className="bg-black/40 border-purple-500/30 text-white h-9"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-black/95 border-purple-500/30">
                          {["480p","720p"].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>
            )}

            <Button
              onClick={generate}
              disabled={!prompt.trim() || status === "pending"}
              className="w-full bg-gradient-to-r from-purple-600 to-orange-600 hover:from-purple-500 hover:to-orange-500 text-white font-bold py-2.5 disabled:opacity-40"
              data-testid="button-generate"
            >
              {status === "pending"
                ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Rendering… ({pollCount})</>
                : <><Sparkles className="h-4 w-4 mr-2" />Generate with Grok Imagine</>}
            </Button>
          </div>
        </Tabs>

        {status === "pending" && (
          <div className="bg-black/40 border border-purple-500/20 rounded-xl p-6 text-center space-y-3">
            <div className="flex items-center justify-center gap-2 text-purple-300">
              <Clock className="h-5 w-5 animate-spin" />
              <span className="font-semibold">grok-imagine-video is rendering…</span>
            </div>
            <p className="text-sm text-purple-400/60">2–5 minutes typical. Result will land in the realtime feed too.</p>
          </div>
        )}

        {status === "done" && result?.videoUrl && (
          <div className="bg-black/60 border border-green-500/30 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-green-400 font-semibold">
              <Play className="h-5 w-5" /> Video Ready!
              <Badge variant="outline" className="ml-auto text-[10px] border-orange-500/30 text-orange-400">{result.model || "grok-imagine-video"}</Badge>
            </div>
            <video src={result.videoUrl} controls autoPlay loop className="w-full rounded-lg border border-purple-500/20" style={{ maxHeight: "480px" }} />
            <div className="flex gap-3">
              <a href={result.videoUrl} download="grok-video.mp4" target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" className="w-full border-purple-500/30 text-purple-300 hover:bg-purple-900/20">
                  <Download className="h-4 w-4 mr-2" />Download
                </Button>
              </a>
              <Button onClick={() => { setVideoUrl(result.videoUrl!); setMode("edit"); reset(); }} variant="outline" className="flex-1 border-blue-500/30 text-blue-300 hover:bg-blue-900/20">
                <Wand2 className="h-4 w-4 mr-2" />Edit this
              </Button>
              <Button onClick={() => { setVideoUrl(result.videoUrl!); setMode("extend"); reset(); }} variant="outline" className="flex-1 border-orange-500/30 text-orange-300 hover:bg-orange-900/20">
                <FastForward className="h-4 w-4 mr-2" />Extend
              </Button>
              <Button onClick={reset} variant="outline" className="flex-1 border-purple-500/30 text-purple-300 hover:bg-purple-900/20">
                <RefreshCw className="h-4 w-4 mr-2" />New
              </Button>
            </div>
          </div>
        )}

        {status === "failed" && (
          <div className="bg-black/40 border border-red-500/30 rounded-xl p-5 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-400 font-semibold">Generation failed</p>
              <p className="text-sm text-red-400/60">Try a different prompt or shorter duration.</p>
            </div>
            <Button onClick={reset} size="sm" variant="outline" className="border-red-500/30 text-red-400">Retry</Button>
          </div>
        )}

        <div className="text-center text-xs text-purple-500/40 space-y-1">
          <p>Powered by <span className="text-orange-400">xAI Grok Imagine</span> · Cheshire Terminal</p>
          <p>$CLAWD token · Solana</p>
        </div>
      </div>

      <div className="lg:col-span-1">
        <RealtimeArtFeed variant="compact" />
      </div>
    </div>
  );
}
