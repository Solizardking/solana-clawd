/**
 * Imagine Studio — full xAI-powered creative studio
 *
 * - Clawd-as-Grok prompt enhancement (grok-4.3)
 * - Image generation via grok-imagine-image (T2I / I2I / multi-edit)
 * - Video generation via grok-imagine-video (T2V / I2V / Ref / Edit / Extend)
 * - Voice prompts via grok STT (/api/imagine/stt)
 * - Wallet-scoped persistent vault: floppy-disk save → Replit DB
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles, Wand2, Loader2, Image as ImageIcon, Film, Layers,
  FastForward, Download, Trash2, Library, Mic, Cpu,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FloppyDiskSave } from "@/components/FloppyDiskSave";
import { MintAsNftButton } from "@/components/MintAsNftButton";
import { VoiceToPrompt } from "@/components/VoiceToPrompt";
import { RealtimeArtFeed } from "@/components/RealtimeArtFeed";

type GenMode = "t2i" | "i2i" | "multi" | "t2v" | "i2v" | "ref" | "edit" | "extend";

interface ImageOut {
  url?: string;
  b64?: string;
  revisedPrompt?: string;
}

interface VideoJob {
  requestId: string;
  status: "idle" | "pending" | "done" | "failed";
  videoUrl?: string;
}

interface SavedRow {
  id: number;
  walletAddress: string;
  kind: "image" | "video" | "music";
  prompt: string;
  enhancedPrompt?: string;
  mode: string;
  model: string;
  sourceUrl?: string;
  mediaUrl?: string;
  thumbnail?: string;
  galleryId?: string;
  saved: boolean;
  createdAt: string;
}

const SEED_PROMPTS = [
  "$CLAWD lobster surfing a parabolic candle on Solana, neon Cheshire grin in the sky",
  "Cheshire cat hacker terminal, holographic charts, cyberpunk noir, 8K",
  "Meme rocket trail of $CLAWD claws launching above a glowing blockchain skyline",
  "Wonderland tea party with crypto whales, psychedelic mushrooms, vivid neon",
];

export default function ImagineStudioPage() {
  const { publicKey } = useWallet();
  const wallet = publicKey?.toBase58();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [mode, setMode] = useState<GenMode>("t2i");
  const [prompt, setPrompt] = useState("");
  const [enhancedPrompt, setEnhancedPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [refImages, setRefImages] = useState("");
  const [videoSourceUrl, setVideoSourceUrl] = useState("");
  const [aspect, setAspect] = useState("1:1");
  const [resolution, setResolution] = useState<"1k" | "2k">("2k");
  const [vidAspect, setVidAspect] = useState("16:9");
  const [vidRes, setVidRes] = useState<"480p" | "720p">("720p");
  const [duration, setDuration] = useState("8");
  const [n, setN] = useState(2);
  const [results, setResults] = useState<ImageOut[]>([]);
  const [videoJob, setVideoJob] = useState<VideoJob | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  const isVideoMode = mode === "t2v" || mode === "i2v" || mode === "ref" || mode === "edit" || mode === "extend";

  // ── Enhance prompt ────────────────────────────────────────────────────────
  const enhanceMutation = useMutation({
    mutationFn: async () => {
      if (!prompt.trim()) throw new Error("Type a prompt first");
      return apiRequest<{ enhanced: string }>("POST", "/api/imagine/expand-prompt", {
        prompt, mode: isVideoMode ? "video" : "image",
      });
    },
    onSuccess: (d) => {
      setEnhancedPrompt(d.enhanced);
      toast({ title: "Enhanced by Clawd-Grok", description: "Click Generate to use it." });
    },
    onError: (e: any) => toast({ title: "Enhance failed", description: e?.message, variant: "destructive" }),
  });

  // ── Image generation ──────────────────────────────────────────────────────
  const imageMutation = useMutation({
    mutationFn: async () => {
      const finalPrompt = enhancedPrompt || prompt;
      if (!finalPrompt.trim()) throw new Error("Prompt required");
      const body: any = { prompt: finalPrompt, n, aspect_ratio: aspect, resolution };
      if (mode === "i2i" && imageUrl) body.image_url = imageUrl;
      if (mode === "multi" && refImages) {
        body.image_urls = refImages.split(",").map(s => s.trim()).filter(Boolean);
      }
      return apiRequest<{ images?: Array<{ url?: string; b64_json?: string; revisedPrompt?: string }>; error?: string }>("POST", "/api/xai/image-gen", body);
    },
    onSuccess: (d) => {
      const out: ImageOut[] = (d.images || []).map((i: any) => ({
        url: i.url, b64: i.b64_json, revisedPrompt: i.revisedPrompt,
      }));
      setResults(out);
      toast({ title: `Generated ${out.length} image${out.length > 1 ? "s" : ""}` });
    },
    onError: (e: any) => toast({ title: "Generation failed", description: e?.message, variant: "destructive" }),
  });

  // ── Video generation ──────────────────────────────────────────────────────
  const pollVideo = (requestId: string) => {
    pollRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/xai/video-status/${requestId}`);
        const d = await r.json();
        if (d.status === "done") {
          setVideoJob({ requestId, status: "done", videoUrl: d.videoUrl });
          toast({ title: "Video ready" });
          return;
        }
        if (d.status === "failed") {
          setVideoJob({ requestId, status: "failed" });
          toast({ title: "Video failed", variant: "destructive" });
          return;
        }
        pollVideo(requestId);
      } catch {
        pollVideo(requestId);
      }
    }, 5000);
  };

  const videoMutation = useMutation({
    mutationFn: async () => {
      const finalPrompt = enhancedPrompt || prompt;
      if (!finalPrompt.trim() && mode !== "extend") throw new Error("Prompt required");
      const body: any = {
        prompt: finalPrompt,
        duration: Number(duration),
        aspect_ratio: vidAspect,
        resolution: vidRes,
        mode,
      };
      if (mode === "i2v" && imageUrl) body.image_url = imageUrl;
      if (mode === "ref" && refImages) {
        body.reference_image_urls = refImages.split(",").map(s => s.trim()).filter(Boolean);
      }
      if (mode === "edit" && videoSourceUrl) body.video_url = videoSourceUrl;
      if (mode === "extend" && videoSourceUrl) body.video_url = videoSourceUrl;

      return apiRequest<{ requestId: string; error?: string }>("POST", "/api/xai/video-gen", body);
    },
    onSuccess: (d) => {
      setVideoJob({ requestId: d.requestId, status: "pending" });
      pollVideo(d.requestId);
      toast({ title: "Video queued", description: "Polling status…" });
    },
    onError: (e: any) => toast({ title: "Video error", description: e?.message, variant: "destructive" }),
  });

  // ── Library ───────────────────────────────────────────────────────────────
  const library = useQuery<{ items: SavedRow[] }>({
    queryKey: ["/api/imagine/library", wallet],
    queryFn: async () => {
      if (!wallet) return { items: [] };
      const r = await fetch(`/api/imagine/library?wallet=${wallet}&savedOnly=true`);
      return r.json();
    },
    enabled: !!wallet,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!wallet) throw new Error("wallet required");
      return apiRequest<{ ok?: boolean }>("DELETE", `/api/imagine/save/${id}?wallet=${wallet}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/imagine/library", wallet] }),
  });

  const handleVoice = (text: string) => {
    setPrompt((p) => p ? `${p} ${text}` : text);
  };

  const renderImageInputs = () => (
    <>
      {(mode === "i2i" || mode === "i2v") && (
        <div>
          <Label>Source image URL</Label>
          <Input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
            placeholder="https://…/image.png" data-testid="input-image-url" />
        </div>
      )}
      {(mode === "multi" || mode === "ref") && (
        <div>
          <Label>Reference image URLs (comma-separated, up to 4)</Label>
          <Input value={refImages} onChange={e => setRefImages(e.target.value)}
            placeholder="url1, url2, url3" data-testid="input-ref-images" />
        </div>
      )}
      {(mode === "edit" || mode === "extend") && (
        <div>
          <Label>Source video URL</Label>
          <Input value={videoSourceUrl} onChange={e => setVideoSourceUrl(e.target.value)}
            placeholder="https://…/video.mp4" data-testid="input-video-url" />
        </div>
      )}
    </>
  );

  return (
    <div className="container mx-auto py-6 px-4 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="h-7 w-7 text-primary" />
            Imagine Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            xAI Grok 4.3 prompts · grok-imagine-image · grok-imagine-video · voice in ·
            wallet-scoped vault
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge variant="outline" className="gap-1"><Cpu className="h-3 w-3" /> xAI default</Badge>
          {wallet ? (
            <Badge variant="secondary">Vault: {wallet.slice(0, 4)}…{wallet.slice(-4)}</Badge>
          ) : (
            <Badge variant="destructive">Connect wallet to save</Badge>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── LEFT: composer + results ─────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compose</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={mode} onValueChange={(v) => setMode(v as GenMode)}>
                <TabsList className="grid grid-cols-4 lg:grid-cols-8">
                  <TabsTrigger value="t2i"><ImageIcon className="h-3 w-3 mr-1" />T2I</TabsTrigger>
                  <TabsTrigger value="i2i">I2I</TabsTrigger>
                  <TabsTrigger value="multi"><Layers className="h-3 w-3 mr-1" />Multi</TabsTrigger>
                  <TabsTrigger value="t2v"><Film className="h-3 w-3 mr-1" />T2V</TabsTrigger>
                  <TabsTrigger value="i2v">I2V</TabsTrigger>
                  <TabsTrigger value="ref">Ref</TabsTrigger>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="extend"><FastForward className="h-3 w-3 mr-1" />Extend</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-wrap items-center gap-2">
                <VoiceToPrompt onTranscript={handleVoice} />
                <Button
                  size="sm" variant="outline"
                  onClick={() => enhanceMutation.mutate()}
                  disabled={enhanceMutation.isPending || !prompt.trim()}
                  data-testid="button-enhance-prompt"
                >
                  {enhanceMutation.isPending
                    ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    : <Wand2 className="h-4 w-4 mr-1" />}
                  Enhance with Clawd-Grok
                </Button>
                <Select onValueChange={(v) => setPrompt(v)}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Quick seed prompt" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEED_PROMPTS.map((p, i) => (
                      <SelectItem key={i} value={p}>{p.slice(0, 50)}…</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Prompt</Label>
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="What do you want Clawd to imagine?"
                  rows={3}
                  data-testid="input-prompt"
                />
              </div>

              {enhancedPrompt && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <div className="text-xs uppercase font-semibold text-primary mb-1 flex items-center gap-1">
                    <Wand2 className="h-3 w-3" /> Clawd-enhanced prompt
                  </div>
                  <p className="text-sm">{enhancedPrompt}</p>
                  <Button size="sm" variant="ghost" className="mt-2 h-7 text-xs"
                    onClick={() => setEnhancedPrompt("")}>Clear</Button>
                </div>
              )}

              {renderImageInputs()}

              {!isVideoMode ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label>Aspect</Label>
                    <Select value={aspect} onValueChange={setAspect}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1:1">1:1</SelectItem>
                        <SelectItem value="16:9">16:9</SelectItem>
                        <SelectItem value="9:16">9:16</SelectItem>
                        <SelectItem value="4:3">4:3</SelectItem>
                        <SelectItem value="3:4">3:4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Resolution</Label>
                    <Select value={resolution} onValueChange={(v) => setResolution(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1k">1K</SelectItem>
                        <SelectItem value="2k">2K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Count</Label>
                    <Select value={String(n)} onValueChange={(v) => setN(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[1,2,3,4].map(i => <SelectItem key={i} value={String(i)}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      onClick={() => imageMutation.mutate()}
                      disabled={imageMutation.isPending}
                      data-testid="button-generate-image"
                    >
                      {imageMutation.isPending
                        ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generating</>
                        : <><Sparkles className="h-4 w-4 mr-1" /> Generate</>}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <Label>Aspect</Label>
                    <Select value={vidAspect} onValueChange={setVidAspect}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="16:9">16:9</SelectItem>
                        <SelectItem value="9:16">9:16</SelectItem>
                        <SelectItem value="1:1">1:1</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Resolution</Label>
                    <Select value={vidRes} onValueChange={(v) => setVidRes(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="480p">480p</SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Duration (s)</Label>
                    <Input type="number" min="3" max="20" value={duration}
                      onChange={(e) => setDuration(e.target.value)} />
                  </div>
                  <div className="flex items-end">
                    <Button
                      className="w-full"
                      onClick={() => videoMutation.mutate()}
                      disabled={videoMutation.isPending || videoJob?.status === "pending"}
                      data-testid="button-generate-video"
                    >
                      {videoMutation.isPending || videoJob?.status === "pending"
                        ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Rendering</>
                        : <><Film className="h-4 w-4 mr-1" /> Generate Video</>}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Image results ─────────────────────────────────────────── */}
          {!isVideoMode && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Results</CardTitle>
              </CardHeader>
              <CardContent>
                {imageMutation.isPending ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: n }).map((_, i) => (
                      <Skeleton key={i} className="aspect-square w-full" />
                    ))}
                  </div>
                ) : results.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No images yet — compose above.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {results.map((img, i) => {
                      const src = img.url || (img.b64 ? `data:image/png;base64,${img.b64}` : "");
                      return (
                        <div key={i} className="group relative rounded-lg overflow-hidden border">
                          <img src={src} className="w-full h-auto block" alt={`gen-${i}`} />
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <FloppyDiskSave payload={{
                              kind: "image",
                              prompt,
                              enhancedPrompt: enhancedPrompt || undefined,
                              mode,
                              model: "grok-imagine-image",
                              sourceUrl: src,
                              metadata: { aspect, resolution, revisedPrompt: img.revisedPrompt },
                            }} />
                            <MintAsNftButton payload={{
                              name: (prompt || "Imagine").slice(0, 28),
                              description: img.revisedPrompt || prompt,
                              imageUrl: src,
                              attributes: [
                                { trait_type: "model", value: "grok-imagine-image" },
                                { trait_type: "mode", value: mode },
                                { trait_type: "aspect", value: aspect },
                                { trait_type: "resolution", value: resolution },
                              ],
                            }} />
                            <Button size="icon" variant="secondary" asChild>
                              <a href={src} download={`imagine-${i}.png`} target="_blank" rel="noreferrer">
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                          {img.revisedPrompt && (
                            <div className="absolute bottom-0 inset-x-0 p-2 bg-black/70 text-white text-xs opacity-0 group-hover:opacity-100 transition">
                              {img.revisedPrompt}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Video result ─────────────────────────────────────────── */}
          {isVideoMode && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Video</CardTitle>
              </CardHeader>
              <CardContent>
                {!videoJob ? (
                  <p className="text-sm text-muted-foreground">No video yet.</p>
                ) : videoJob.status === "pending" ? (
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rendering with grok-imagine-video… this may take 30–90 s.
                  </div>
                ) : videoJob.status === "failed" ? (
                  <p className="text-sm text-destructive">Video generation failed.</p>
                ) : videoJob.videoUrl ? (
                  <div className="relative group rounded-lg overflow-hidden border">
                    <video src={videoJob.videoUrl} controls autoPlay loop className="w-full" />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <FloppyDiskSave payload={{
                        kind: "video",
                        prompt,
                        enhancedPrompt: enhancedPrompt || undefined,
                        mode,
                        model: "grok-imagine-video",
                        sourceUrl: videoJob.videoUrl,
                        mediaUrl: videoJob.videoUrl,
                        metadata: { duration, vidAspect, vidRes, requestId: videoJob.requestId },
                      }} />
                      <MintAsNftButton payload={{
                        name: (prompt || "Imagine Video").slice(0, 28),
                        description: prompt,
                        imageUrl: videoJob.videoUrl,
                        attributes: [
                          { trait_type: "model", value: "grok-imagine-video" },
                          { trait_type: "kind", value: "video" },
                          { trait_type: "duration", value: String(duration) },
                          { trait_type: "aspect", value: vidAspect },
                          { trait_type: "resolution", value: vidRes },
                        ],
                      }} />
                      <Button size="icon" variant="secondary" asChild>
                        <a href={videoJob.videoUrl} download="imagine.mp4" target="_blank" rel="noreferrer">
                          <Download className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}

          {/* ── Vault ─────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Library className="h-4 w-4" /> My Vault
                <Badge variant="outline">{library.data?.items?.length || 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!wallet ? (
                <p className="text-sm text-muted-foreground">Connect your wallet to load saved generations.</p>
              ) : library.isLoading ? (
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
                </div>
              ) : !library.data?.items?.length ? (
                <p className="text-sm text-muted-foreground">No saved items yet — hit the floppy disk above.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {library.data.items.map((row) => (
                    <div key={row.id} className="group relative rounded-lg overflow-hidden border bg-card">
                      {row.kind === "video" ? (
                        <video src={row.mediaUrl || row.sourceUrl} muted loop
                          onMouseEnter={(e) => (e.target as HTMLVideoElement).play()}
                          onMouseLeave={(e) => (e.target as HTMLVideoElement).pause()}
                          className="w-full aspect-square object-cover" />
                      ) : (
                        <img src={row.mediaUrl || row.sourceUrl} alt=""
                          className="w-full aspect-square object-cover" />
                      )}
                      <Badge className="absolute top-1 left-1 text-[10px]" variant="secondary">
                        {row.kind} · {row.mode}
                      </Badge>
                      <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100">
                        <MintAsNftButton
                          size="icon"
                          payload={{
                            name: (row.prompt || row.kind).slice(0, 28),
                            description: row.prompt,
                            imageUrl: row.mediaUrl || row.sourceUrl || "",
                            attributes: [
                              { trait_type: "model", value: row.model || "grok-imagine" },
                              { trait_type: "kind", value: row.kind },
                              { trait_type: "mode", value: row.mode || "" },
                            ],
                          }}
                        />
                        <Button
                          size="icon" variant="destructive" className="h-7 w-7"
                          onClick={() => deleteMutation.mutate(row.id)}
                          data-testid={`button-delete-${row.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 p-1.5 bg-black/70 text-white text-[10px] truncate">
                        {row.prompt}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── RIGHT: live realtime feed ─────────────────────────────── */}
        <aside className="space-y-4">
          <RealtimeArtFeed variant="compact" />
        </aside>
      </div>
    </div>
  );
}
