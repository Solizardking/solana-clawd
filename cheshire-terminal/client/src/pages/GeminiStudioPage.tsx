import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Sparkles, Image as ImageIcon, Database, Download, Trash2, RefreshCw,
  Link2, Search, Brain, Film, MessageSquare, Send, User, Bot,
  Play, Clock, AlertCircle, StopCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { FloppyDiskSave } from "@/components/FloppyDiskSave";
import { MintAsNftButton } from "@/components/MintAsNftButton";

type StudioImage = {
  b64: string;
  mimeType: string;
  thoughtSignature?: string;
};

type CacheItem = {
  name: string;
  model?: string;
  displayName?: string;
  createTime?: string;
  updateTime?: string;
  expireTime?: string;
  usageMetadata?: {
    totalTokenCount?: number;
  };
};

type ChatMessage = {
  role: "user" | "model";
  text: string;
};

type VideoStatus = "idle" | "pending" | "done" | "failed";

const SAMPLE_PROMPTS = [
  "A photo of a glossy magazine cover. Minimal blue cover with huge serif text reading Nano Banana 2 and a model holding a bold number 2 in a designer store.",
  "Present a clear 45 degree top-down isometric miniature London scene with today's weather, centered title, date, icon, and temperature.",
  "Make a perfectly isometric photoreal modern garden with a large 2-shaped pool and the words Nano Banana 2.",
];

const VEO_PROMPTS = [
  "$CLAWD cat appearing from a glowing Solana portal, neon cyberpunk city, 8K cinematic",
  "Cheshire Terminal logo materializing in 3D space, purple particles swirling, dark background",
  "Abstract crypto chart going parabolic, rainbow light trails, Matrix rain overlay",
];

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || response.statusText);
  return data;
}

export default function GeminiStudioPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const qc = useQueryClient();
  const { toast } = useToast();

  // ── Image Studio state ──────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [model, setModel] = useState("gemini-3.1-flash-image-preview");
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [imageSize, setImageSize] = useState("2K");
  const [thinkingLevel, setThinkingLevel] = useState<"minimal" | "high">("minimal");
  const [includeThoughts, setIncludeThoughts] = useState(false);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useImageSearch, setUseImageSearch] = useState(false);
  const [sourceImageUrls, setSourceImageUrls] = useState("");
  const [generatedText, setGeneratedText] = useState("");
  const [generatedImages, setGeneratedImages] = useState<StudioImage[]>([]);
  const [groundingSources, setGroundingSources] = useState<Array<{ uri: string; title: string; imageUri?: string }>>([]);

  // ── Cache state ─────────────────────────────────────────────────────────────
  const [cacheModel, setCacheModel] = useState("models/gemini-3-flash-preview");
  const [cacheDisplayName, setCacheDisplayName] = useState("");
  const [cacheSystemInstruction, setCacheSystemInstruction] = useState("You are an expert analyst. Use the cached context before answering.");
  const [cacheContents, setCacheContents] = useState("");
  const [cacheTtl, setCacheTtl] = useState("3600s");
  const [cachePrompt, setCachePrompt] = useState("Summarize the cached material in five bullets.");
  const [selectedCache, setSelectedCache] = useState("");
  const [cacheResponse, setCacheResponse] = useState("");
  const [cacheUsage, setCacheUsage] = useState<any>(null);

  // ── Veo Video state ─────────────────────────────────────────────────────────
  const [videoPrompt, setVideoPrompt] = useState(VEO_PROMPTS[0]);
  const [veoModel, setVeoModel] = useState("veo-3.1-generate-preview");
  const [veoAspect, setVeoAspect] = useState<"16:9" | "9:16">("16:9");
  const [veoResolution, setVeoResolution] = useState<"720p" | "1080p">("720p");
  const [videoStatus, setVideoStatus] = useState<VideoStatus>("idle");
  const [videoB64, setVideoB64] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [chatModel, setChatModel] = useState("gemini-2.5-flash");
  const [chatSystem, setChatSystem] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, []);

  // ── Queries ─────────────────────────────────────────────────────────────────
  const vault = useQuery<{ items: any[] }>({
    queryKey: ["/api/imagine/library", wallet],
    queryFn: () => jsonFetch(`/api/imagine/library?wallet=${wallet}&savedOnly=true`),
    enabled: Boolean(wallet),
  });

  const caches = useQuery<{ caches: CacheItem[] }>({
    queryKey: ["/api/gemini-studio/caches"],
    queryFn: () => jsonFetch("/api/gemini-studio/caches"),
  });

  // ── Image mutation ──────────────────────────────────────────────────────────
  const createImage = useMutation({
    mutationFn: async () =>
      jsonFetch<{ text: string; images: StudioImage[]; groundingSources: Array<{ uri: string; title: string; imageUri?: string }> }>(
        "/api/gemini-studio/generate-image",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt, model, aspectRatio, imageSize,
            sourceImageUrls: sourceImageUrls.split(/\s|,/).map((s) => s.trim()).filter(Boolean),
            useWebSearch, useImageSearch, thinkingLevel, includeThoughts,
          }),
        }
      ),
    onSuccess: (data) => {
      setGeneratedText(data.text || "");
      setGeneratedImages(data.images || []);
      setGroundingSources(data.groundingSources || []);
      toast({ title: "Nano Banana render complete" });
    },
    onError: (error: any) => {
      toast({ title: "Gemini generation failed", description: error.message, variant: "destructive" });
    },
  });

  // ── Cache mutations ─────────────────────────────────────────────────────────
  const createCache = useMutation({
    mutationFn: () =>
      jsonFetch<{ cache: CacheItem }>("/api/gemini-studio/caches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cacheModel, displayName: cacheDisplayName || undefined, systemInstruction: cacheSystemInstruction || undefined, contents: cacheContents, ttl: cacheTtl || undefined }),
      }),
    onSuccess: (data) => {
      setSelectedCache(data.cache.name);
      qc.invalidateQueries({ queryKey: ["/api/gemini-studio/caches"] });
      toast({ title: "Cache created", description: data.cache.name });
    },
    onError: (error: any) => {
      toast({ title: "Cache create failed", description: error.message, variant: "destructive" });
    },
  });

  const runCachePrompt = useMutation({
    mutationFn: () =>
      jsonFetch<{ text: string; usageMetadata: any }>("/api/gemini-studio/caches/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cacheModel, cacheName: selectedCache, prompt: cachePrompt }),
      }),
    onSuccess: (data) => {
      setCacheResponse(data.text || "");
      setCacheUsage(data.usageMetadata || null);
    },
    onError: (error: any) => {
      toast({ title: "Cache prompt failed", description: error.message, variant: "destructive" });
    },
  });

  const deleteCache = useMutation({
    mutationFn: (name: string) => jsonFetch(`/api/gemini-studio/caches/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/gemini-studio/caches"] });
      if (selectedCache) setSelectedCache("");
      toast({ title: "Cache deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    },
  });

  const selectedCacheMeta = useMemo(
    () => caches.data?.caches?.find((c) => c.name === selectedCache),
    [caches.data?.caches, selectedCache],
  );

  // ── Veo polling ─────────────────────────────────────────────────────────────
  const pollVideo = useCallback((operationName: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(operationName);
        const r = await fetch(`/api/gemini-studio/video-status/${encoded}`, { credentials: "include" });
        const d = await r.json();
        setPollCount((c) => c + 1);
        if (d.done && d.videoB64) {
          setVideoStatus("done");
          setVideoB64(d.videoB64);
          toast({ title: "Veo video ready!" });
        } else if (d.done && d.error) {
          setVideoStatus("failed");
          toast({ title: "Veo failed", description: d.error, variant: "destructive" });
        } else {
          pollVideo(operationName);
        }
      } catch {
        pollVideo(operationName);
      }
    }, 8000);
  }, [toast]);

  const startVideo = useCallback(async () => {
    if (!videoPrompt.trim()) return;
    setVideoStatus("pending");
    setVideoB64(null);
    setPollCount(0);
    try {
      const data = await jsonFetch<{ operationName: string }>("/api/gemini-studio/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: videoPrompt, model: veoModel, aspectRatio: veoAspect, resolution: veoResolution }),
      });
      pollVideo(data.operationName);
      toast({ title: "Veo 3.1 started", description: "Polling every 8 s — usually 2–5 min." });
    } catch (e: unknown) {
      setVideoStatus("failed");
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Video generation failed", description: msg, variant: "destructive" });
    }
  }, [videoPrompt, veoModel, veoAspect, veoResolution, pollVideo, toast]);

  const cancelVideo = useCallback(() => {
    if (pollRef.current) clearTimeout(pollRef.current);
    setVideoStatus("idle");
    setPollCount(0);
  }, []);

  // ── Chat send ───────────────────────────────────────────────────────────────
  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");
    setChatLoading(true);
    // Capture history via functional update so chatHistory isn't a dep
    let messagesToSend: ChatMessage[] = [];
    setChatHistory((prev) => {
      messagesToSend = [...prev, { role: "user", text }];
      return messagesToSend;
    });
    try {
      const data = await jsonFetch<{ text: string }>("/api/gemini-studio/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: chatModel,
          systemInstruction: chatSystem || undefined,
          messages: messagesToSend,
        }),
      });
      setChatHistory((h) => [...h, { role: "model", text: data.text }]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "Chat failed", description: msg, variant: "destructive" });
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, chatModel, chatSystem, toast]);

  const videoSrc = videoB64 ? `data:video/mp4;base64,${videoB64}` : null;

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            Gemini Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            Nano Banana · Veo 3.1 video · multi-turn chat · context caching
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1"><ImageIcon className="h-3 w-3" /> Nano Banana 2</Badge>
          <Badge variant="outline" className="gap-1"><Film className="h-3 w-3" /> Veo 3.1</Badge>
          <Badge variant="outline" className="gap-1"><Database className="h-3 w-3" /> Cached Content</Badge>
          {wallet ? (
            <Badge variant="secondary">Vault: {wallet.slice(0, 4)}…{wallet.slice(-4)}</Badge>
          ) : (
            <Badge variant="destructive">Connect wallet to save renders</Badge>
          )}
        </div>
      </header>

      <Tabs defaultValue="image" className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full lg:w-[700px]">
          <TabsTrigger value="image">Image</TabsTrigger>
          <TabsTrigger value="video">Video</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="cache">Cache</TabsTrigger>
          <TabsTrigger value="vault">Vault</TabsTrigger>
        </TabsList>

        {/* ── Image Studio ─────────────────────────────────────────────────── */}
        <TabsContent value="image" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Compose</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {SAMPLE_PROMPTS.map((sample, i) => (
                  <Button key={sample} type="button" variant="outline" size="sm" onClick={() => setPrompt(sample)}>
                    Sample {i + 1}
                  </Button>
                ))}
              </div>

              <div>
                <Label>Prompt</Label>
                <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={4}
                  placeholder="Describe the scene, layout, text treatment, lighting, and mood." />
              </div>

              <div>
                <Label>Reference image URLs for edit/composition</Label>
                <Textarea value={sourceImageUrls} onChange={(e) => setSourceImageUrls(e.target.value)} rows={2}
                  placeholder="https://.../image1.png, https://.../image2.jpg" />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <Label>Model</Label>
                  <Select value={model} onValueChange={setModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-3.1-flash-image-preview">gemini-3.1-flash-image-preview</SelectItem>
                      <SelectItem value="gemini-3-pro-image-preview">gemini-3-pro-image-preview</SelectItem>
                      <SelectItem value="gemini-2.5-flash-image">gemini-2.5-flash-image</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Aspect ratio</Label>
                  <Select value={aspectRatio} onValueChange={setAspectRatio}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["1:1", "16:9", "9:16", "4:3", "3:4", "5:4", "21:9"].map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Image size</Label>
                  <Select value={imageSize} onValueChange={setImageSize}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["512", "1K", "2K", "4K"].map((v) => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Thinking level</Label>
                  <Select value={thinkingLevel} onValueChange={(v) => setThinkingLevel(v as "minimal" | "high")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minimal">minimal</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2"><Search className="h-4 w-4" /> Web Search</div>
                    <div className="text-xs text-muted-foreground">Ground prompts against current web results.</div>
                  </div>
                  <Switch checked={useWebSearch} onCheckedChange={setUseWebSearch} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2"><Link2 className="h-4 w-4" /> Image Search</div>
                    <div className="text-xs text-muted-foreground">Use Google Image Search as visual context.</div>
                  </div>
                  <Switch checked={useImageSearch} onCheckedChange={setUseImageSearch} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2"><Brain className="h-4 w-4" /> Include thoughts</div>
                    <div className="text-xs text-muted-foreground">Return thought summaries when available.</div>
                  </div>
                  <Switch checked={includeThoughts} onCheckedChange={setIncludeThoughts} />
                </div>
              </div>

              <Button onClick={() => createImage.mutate()} disabled={createImage.isPending || !prompt.trim()} className="w-full sm:w-auto">
                {createImage.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                Generate with Nano Banana
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Results</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {createImage.isPending ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="aspect-square w-full" />
                </div>
              ) : generatedImages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No renders yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {generatedImages.map((image, index) => {
                    const src = `data:${image.mimeType};base64,${image.b64}`;
                    return (
                      <div key={`${index}-${image.thoughtSignature || "img"}`} className="relative group rounded-xl overflow-hidden border">
                        <img src={src} alt={`Gemini render ${index + 1}`} className="w-full h-auto block" />
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                          <FloppyDiskSave payload={{
                            kind: "image", prompt,
                            mode: sourceImageUrls.trim() ? "i2i" : "t2i",
                            model, sourceUrl: src,
                            metadata: { aspectRatio, imageSize, useWebSearch, useImageSearch, thinkingLevel },
                          }} />
                          <MintAsNftButton payload={{
                            name: prompt.slice(0, 28) || "Gemini render",
                            description: generatedText || prompt, imageUrl: src,
                            attributes: [
                              { trait_type: "model", value: model },
                              { trait_type: "aspectRatio", value: aspectRatio },
                              { trait_type: "imageSize", value: imageSize },
                            ],
                          }} />
                          <Button size="icon" variant="secondary" asChild>
                            <a href={src} download={`gemini-studio-${index + 1}.png`}><Download className="h-4 w-4" /></a>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {generatedText && (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Model Text</div>
                  <p className="text-sm whitespace-pre-wrap">{generatedText}</p>
                </div>
              )}

              {groundingSources.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Grounding sources</div>
                  {groundingSources.map((source) => (
                    <a key={source.uri} href={source.uri} target="_blank" rel="noreferrer"
                      className="block rounded-lg border p-3 hover:bg-muted/20">
                      <div className="text-sm font-medium">{source.title}</div>
                      <div className="text-xs text-muted-foreground break-all">{source.uri}</div>
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Veo 3.1 Video ────────────────────────────────────────────────── */}
        <TabsContent value="video" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Film className="h-5 w-5 text-purple-400" /> Veo 3.1 Video Generation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {VEO_PROMPTS.map((p, i) => (
                  <Button key={p} type="button" variant="outline" size="sm" onClick={() => setVideoPrompt(p)}>
                    Sample {i + 1}
                  </Button>
                ))}
              </div>

              <div>
                <Label>Prompt</Label>
                <Textarea value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} rows={4}
                  placeholder="Describe the scene in cinematic detail — camera movement, lighting, mood, subjects." />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label>Model</Label>
                  <Select value={veoModel} onValueChange={setVeoModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="veo-3.1-generate-preview">veo-3.1-generate-preview</SelectItem>
                      <SelectItem value="veo-3.1-generate-fast-preview">veo-3.1-generate-fast-preview</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Aspect ratio</Label>
                  <Select value={veoAspect} onValueChange={(v) => setVeoAspect(v as "16:9" | "9:16")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="16:9">16:9 landscape</SelectItem>
                      <SelectItem value="9:16">9:16 portrait</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Resolution</Label>
                  <Select value={veoResolution} onValueChange={(v) => setVeoResolution(v as "720p" | "1080p")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="720p">720p</SelectItem>
                      <SelectItem value="1080p">1080p</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={startVideo}
                  disabled={videoStatus === "pending" || !videoPrompt.trim()}
                  className="flex-1 sm:flex-none"
                >
                  {videoStatus === "pending"
                    ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Rendering… ({pollCount})</>
                    : <><Film className="h-4 w-4 mr-2" />Generate with Veo 3.1</>}
                </Button>
                {videoStatus === "pending" && (
                  <Button variant="outline" onClick={cancelVideo}>
                    <StopCircle className="h-4 w-4 mr-2" /> Cancel
                  </Button>
                )}
                {(videoStatus === "done" || videoStatus === "failed") && (
                  <Button variant="outline" onClick={() => { setVideoStatus("idle"); setVideoB64(null); }}>
                    <RefreshCw className="h-4 w-4 mr-2" /> New
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {videoStatus === "pending" && (
            <Card className="border-purple-500/30">
              <CardContent className="pt-6 text-center space-y-3">
                <div className="flex items-center justify-center gap-2 text-purple-400">
                  <Clock className="h-5 w-5 animate-spin" />
                  <span className="font-semibold">Veo 3.1 is rendering…</span>
                </div>
                <p className="text-sm text-muted-foreground">Typically 2–5 minutes. Polling every 8 seconds ({pollCount} polls so far).</p>
              </CardContent>
            </Card>
          )}

          {videoStatus === "failed" && (
            <Card className="border-red-500/30">
              <CardContent className="pt-6 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
                <div>
                  <p className="text-red-400 font-semibold">Generation failed</p>
                  <p className="text-sm text-muted-foreground">Try refining the prompt or a different resolution.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {videoStatus === "done" && videoSrc && (
            <Card className="border-green-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-green-400">
                  <Play className="h-5 w-5" /> Video Ready
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <video src={videoSrc} controls autoPlay loop className="w-full rounded-lg border" style={{ maxHeight: 520 }}>
                  <track kind="captions" />
                </video>
                <Button asChild variant="outline">
                  <a href={videoSrc} download="veo-generated.mp4">
                    <Download className="h-4 w-4 mr-2" /> Download MP4
                  </a>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Chat ─────────────────────────────────────────────────────────── */}
        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" /> Gemini Chat
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Model</Label>
                  <Select value={chatModel} onValueChange={setChatModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-2.5-flash">gemini-2.5-flash</SelectItem>
                      <SelectItem value="gemini-2.5-pro">gemini-2.5-pro</SelectItem>
                      <SelectItem value="gemini-3.5-flash">gemini-3.5-flash</SelectItem>
                      <SelectItem value="gemini-3-flash-preview">gemini-3-flash-preview</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>System instruction (optional)</Label>
                  <Input value={chatSystem} onChange={(e) => setChatSystem(e.target.value)}
                    placeholder="You are a helpful Solana DeFi analyst…" />
                </div>
              </div>

              {chatHistory.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setChatHistory([])} className="text-muted-foreground">
                  Clear conversation
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-3">
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {chatHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">Start a conversation below.</p>
                )}
                {chatHistory.map((msg, i) => (
                  <div key={`${msg.role}-${i}`} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "model" && (
                      <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-sm"
                        : "bg-muted rounded-bl-sm"
                    }`}>
                      {msg.text}
                    </div>
                    {msg.role === "user" && (
                      <div className="w-7 h-7 rounded-full bg-muted border flex items-center justify-center shrink-0 mt-0.5">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
                      <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="flex gap-2 pt-1">
                <Textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                  placeholder="Ask anything… (Enter to send, Shift+Enter for newline)"
                  rows={2}
                  className="resize-none"
                  disabled={chatLoading}
                />
                <Button onClick={sendChat} disabled={chatLoading || !chatInput.trim()} size="icon" className="h-full aspect-square">
                  {chatLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Context Cache ─────────────────────────────────────────────────── */}
        <TabsContent value="cache" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Create Explicit Cache</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label>Model</Label>
                  <Select value={cacheModel} onValueChange={setCacheModel}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="models/gemini-3-flash-preview">models/gemini-3-flash-preview</SelectItem>
                      <SelectItem value="models/gemini-3.1-pro-preview">models/gemini-3.1-pro-preview</SelectItem>
                      <SelectItem value="models/gemini-2.5-flash">models/gemini-2.5-flash</SelectItem>
                      <SelectItem value="models/gemini-2.5-pro">models/gemini-2.5-pro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>TTL</Label>
                  <Input value={cacheTtl} onChange={(e) => setCacheTtl(e.target.value)} placeholder="3600s" />
                </div>
              </div>
              <div>
                <Label>Display name</Label>
                <Input value={cacheDisplayName} onChange={(e) => setCacheDisplayName(e.target.value)} placeholder="Repo context cache" />
              </div>
              <div>
                <Label>System instruction</Label>
                <Textarea value={cacheSystemInstruction} onChange={(e) => setCacheSystemInstruction(e.target.value)} rows={2} />
              </div>
              <div>
                <Label>Cached content</Label>
                <Textarea value={cacheContents} onChange={(e) => setCacheContents(e.target.value)} rows={8}
                  placeholder="Paste the long context you want to reuse across shorter follow-up prompts." />
              </div>
              <Button onClick={() => createCache.mutate()} disabled={createCache.isPending || !cacheContents.trim()}>
                {createCache.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
                Create Cache
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Use Cache</CardTitle>
              <Button variant="outline" size="sm" onClick={() => caches.refetch()} disabled={caches.isFetching}>
                <RefreshCw className={`h-4 w-4 mr-2 ${caches.isFetching ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Choose cache</Label>
                <Select value={selectedCache} onValueChange={setSelectedCache}>
                  <SelectTrigger><SelectValue placeholder="Select a cache" /></SelectTrigger>
                  <SelectContent>
                    {(caches.data?.caches || []).map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.displayName || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedCacheMeta && (
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <div><span className="font-medium">Name:</span> {selectedCacheMeta.name}</div>
                  <div><span className="font-medium">Model:</span> {selectedCacheMeta.model || "—"}</div>
                  <div><span className="font-medium">Expires:</span> {selectedCacheMeta.expireTime || "—"}</div>
                  <div><span className="font-medium">Cached tokens:</span> {selectedCacheMeta.usageMetadata?.totalTokenCount ?? "—"}</div>
                </div>
              )}

              <div>
                <Label>Prompt against cached content</Label>
                <Textarea value={cachePrompt} onChange={(e) => setCachePrompt(e.target.value)} rows={3} />
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => runCachePrompt.mutate()} disabled={runCachePrompt.isPending || !selectedCache || !cachePrompt.trim()}>
                  {runCachePrompt.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  Run Prompt
                </Button>
                {selectedCache && (
                  <Button variant="destructive" onClick={() => deleteCache.mutate(selectedCache)} disabled={deleteCache.isPending}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete Cache
                  </Button>
                )}
              </div>

              {cacheResponse && (
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Response</div>
                  <p className="text-sm whitespace-pre-wrap">{cacheResponse}</p>
                </div>
              )}

              {cacheUsage && (
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <div><span className="font-medium">Prompt tokens:</span> {cacheUsage.promptTokenCount ?? "—"}</div>
                  <div><span className="font-medium">Cached tokens:</span> {cacheUsage.cachedContentTokenCount ?? "—"}</div>
                  <div><span className="font-medium">Total tokens:</span> {cacheUsage.totalTokenCount ?? "—"}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Vault ─────────────────────────────────────────────────────────── */}
        <TabsContent value="vault">
          <Card>
            <CardHeader><CardTitle>Saved Gemini Renders</CardTitle></CardHeader>
            <CardContent>
              {!wallet ? (
                <p className="text-sm text-muted-foreground">Connect your wallet to view saved renders.</p>
              ) : vault.isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {["sk-0", "sk-1", "sk-2", "sk-3"].map((k) => <Skeleton key={k} className="aspect-square w-full" />)}
                </div>
              ) : !vault.data?.items?.length ? (
                <p className="text-sm text-muted-foreground">No saved items yet.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {vault.data.items.map((item) => (
                    <div key={item.id} className="rounded-xl overflow-hidden border bg-card">
                      <img src={item.mediaUrl || item.sourceUrl} alt={item.prompt} className="w-full aspect-square object-cover" />
                      <div className="p-2 space-y-1">
                        <Badge variant="secondary" className="text-[10px]">{item.model}</Badge>
                        <p className="text-xs line-clamp-3">{item.prompt}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
