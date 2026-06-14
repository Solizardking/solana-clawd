import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Eye, FileVideo, Link as LinkIcon, Loader2, MonitorUp, Radio, RefreshCw, Settings2, Share2, UploadCloud, Video, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { CloudflareVideoPlayer } from "@/components/CloudflareVideoPlayer";

const CUSTOMER_SUBDOMAIN = "customer-oh7hxjdpro3mt496.cloudflarestream.com";
const DEFAULT_VIDEO_UID = "5c8b99baa82a276adb69d5b4af205836";
const STREAM_UID_RE = /^[a-zA-Z0-9_-]{16,128}$/;

type StreamStatus = {
  accountId: string;
  customerSubdomain: string;
  configured: boolean;
  liveInputsEnabled?: boolean;
  tokenSource?: string | null;
  publicLiveInputLimit?: number;
  liveInputWindowSeconds?: number;
};

type CloudflareEnvelope<T> = {
  success: boolean;
  result?: T;
  errors?: Array<{ message?: string }>;
};

type ViewerCount = {
  liveViewers: number;
  error?: string;
};

type PlaybackProbe = {
  ok: boolean;
  liveReady: boolean;
  checkedAt: string;
  checks?: Record<string, ProbeCheck>;
  error?: string;
};

type ProbeCheck = {
    ok: boolean;
    status: number;
    latencyMs: number;
    contentType?: string | null;
    bytes?: number;
    error?: string;
};

type StreamVideo = {
  uid: string;
  thumbnail?: string;
  status?: { state?: string };
  meta?: { name?: string };
  created?: string;
  playback?: { iframe: string; hls: string; dash: string; thumbnail: string };
};

type LiveInput = {
  uid?: string;
  rtmps?: { url?: string; streamKey?: string };
  srt?: { url?: string; streamId?: string; passphrase?: string };
  webRTC?: { url?: string };
  recording?: { mode?: string };
  playback?: { iframe: string; hls: string; dash: string; thumbnail: string } | null;
};

type PlaybackTarget = {
  uid: string;
  playback: { iframe: string; hls: string; dash: string; thumbnail: string };
};

function getErrorMessage(body: CloudflareEnvelope<unknown>, fallback: string) {
  return body.errors?.map((error) => error.message).filter(Boolean).join(" ") || fallback;
}

function getUrlStreamId() {
  if (typeof window === "undefined") return "";
  const value = new URLSearchParams(window.location.search).get("v") || "";
  return STREAM_UID_RE.test(value) ? value : "";
}

export default function StreamPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<StreamStatus | null>(null);
  const [videos, setVideos] = useState<StreamVideo[]>([]);
  const [liveInput, setLiveInput] = useState<LiveInput | null>(null);
  const [sharedPlayback, setSharedPlayback] = useState<PlaybackTarget | null>(null);
  const [urlStreamId, setUrlStreamId] = useState(getUrlStreamId);
  const [name, setName] = useState("cheshireterminal");
  const [creator, setCreator] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [directUploadUrl, setDirectUploadUrl] = useState("");
  const [viewerCount, setViewerCount] = useState<ViewerCount>({ liveViewers: 0 });
  const [viewerCountUpdatedAt, setViewerCountUpdatedAt] = useState<number | null>(null);
  const [playbackProbe, setPlaybackProbe] = useState<PlaybackProbe | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const customerSubdomain = status?.customerSubdomain || CUSTOMER_SUBDOMAIN;
  const featuredVideo = videos.find((video) => video.uid) || null;
  const activeInputId = liveInput?.uid || sharedPlayback?.uid || urlStreamId || featuredVideo?.uid || DEFAULT_VIDEO_UID;
  const iframeUrl = useMemo(() => {
    return liveInput?.playback?.iframe || sharedPlayback?.playback.iframe || featuredVideo?.playback?.iframe || `https://${customerSubdomain}/${activeInputId}/iframe`;
  }, [activeInputId, customerSubdomain, featuredVideo, liveInput, sharedPlayback]);
  const hlsUrl = useMemo(() => {
    return liveInput?.playback?.hls || sharedPlayback?.playback.hls || featuredVideo?.playback?.hls || `https://${customerSubdomain}/${activeInputId}/manifest/video.m3u8`;
  }, [activeInputId, customerSubdomain, featuredVideo, liveInput, sharedPlayback]);
  const posterUrl = useMemo(() => {
    return liveInput?.playback?.thumbnail || sharedPlayback?.playback.thumbnail || featuredVideo?.playback?.thumbnail || `https://${customerSubdomain}/${activeInputId}/thumbnails/thumbnail.jpg`;
  }, [activeInputId, customerSubdomain, featuredVideo, liveInput, sharedPlayback]);
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "/stream";
    return `${window.location.origin}/stream?v=${encodeURIComponent(activeInputId)}`;
  }, [activeInputId]);
  const obsServer = useMemo(() => {
    const value = liveInput?.rtmps?.url;
    if (!value) return undefined;
    return value.endsWith("/") ? value.slice(0, -1) : value;
  }, [liveInput]);
  const obsKey = liveInput?.rtmps?.streamKey;
  const hasLiveInput = Boolean(liveInput?.uid);
  const liveCreationReady = Boolean(status?.liveInputsEnabled);
  const playbackStateLabel = !playbackProbe
    ? "not checked"
    : playbackProbe.liveReady
      ? "HLS ready"
      : playbackProbe.ok
        ? "fallback ready"
        : "offline";
  const playbackStateClass = playbackProbe?.liveReady
    ? "border-emerald-400/30 text-emerald-200"
    : playbackProbe?.ok
      ? "border-cyan-400/30 text-cyan-200"
      : "border-yellow-500/30 text-yellow-100";
  const setupItems = [
    { label: "Create channel", done: hasLiveInput },
    { label: "Copy OBS server", done: Boolean(obsServer) },
    { label: "Copy stream key", done: Boolean(obsKey) },
    { label: "Stream reachable", done: Boolean(playbackProbe?.ok) },
  ];

  async function loadStatus() {
    const response = await fetch("/api/cloudflare-stream/status");
    const body = await response.json();
    setStatus(body);
  }

  async function loadViewerCount(inputId = activeInputId) {
    if (!inputId) return;
    try {
      const response = await fetch(`/api/cloudflare-stream/views/${encodeURIComponent(inputId)}`);
      const body: ViewerCount = await response.json();
      setViewerCount({
        liveViewers: Number.isFinite(Number(body.liveViewers)) ? Number(body.liveViewers) : 0,
        error: body.error,
      });
      setViewerCountUpdatedAt(Date.now());
    } catch {
      setViewerCount((current) => ({ ...current, error: "Viewer count unavailable." }));
    }
  }

  async function loadPlaybackHealth(inputId = activeInputId) {
    if (!inputId) return;
    setBusy((current) => current || "probe");
    try {
      const response = await fetch(`/api/cloudflare-stream/health/${encodeURIComponent(inputId)}`);
      const body: PlaybackProbe = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to test stream playback.");
      setPlaybackProbe(body);
    } catch (error: any) {
      setPlaybackProbe({
        ok: false,
        liveReady: false,
        checkedAt: new Date().toISOString(),
        error: error.message || "Playback test failed.",
      });
    } finally {
      setBusy((current) => current === "probe" ? null : current);
    }
  }

  async function loadPlaybackTarget(inputId: string) {
    if (!STREAM_UID_RE.test(inputId)) return;
    try {
      const response = await fetch(`/api/cloudflare-stream/playback/${encodeURIComponent(inputId)}`);
      const body: PlaybackTarget & { error?: string } = await response.json();
      if (!response.ok || !body.playback) throw new Error(body.error || "Unable to load stream playback.");
      setSharedPlayback({ uid: body.uid, playback: body.playback });
    } catch (error: any) {
      toast({ title: "Stream link unavailable", description: error.message, variant: "destructive" });
    }
  }

  async function loadVideos() {
    setBusy("videos");
    try {
      const response = await fetch("/api/cloudflare-stream/videos");
      const body: CloudflareEnvelope<StreamVideo[]> = await response.json();
      if (!response.ok || !body.success) throw new Error(getErrorMessage(body, "Unable to load Stream videos."));
      setVideos(body.result || []);
    } catch (error: any) {
      toast({ title: "Stream videos unavailable", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  useEffect(() => {
    loadStatus().catch(() => null);
  }, []);

  useEffect(() => {
    if (!urlStreamId) return;
    if (liveInput?.uid && liveInput.uid !== urlStreamId) setLiveInput(null);
    loadPlaybackTarget(urlStreamId).catch(() => null);
  }, [liveInput?.uid, urlStreamId]);

  useEffect(() => {
    const onPopState = () => setUrlStreamId(getUrlStreamId());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    loadViewerCount(activeInputId).catch(() => null);
    loadPlaybackHealth(activeInputId).catch(() => null);
    const interval = window.setInterval(() => {
      loadViewerCount(activeInputId).catch(() => null);
      loadPlaybackHealth(activeInputId).catch(() => null);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [activeInputId]);

  async function createLiveInput() {
    if (!liveCreationReady) {
      toast({
        title: "Live creation is not configured",
        description: "Set CLOUDFLARE_STREAM_TOKEN or CLOUDFLARE_API_TOKEN in the server environment.",
        variant: "destructive",
      });
      return;
    }

    setBusy("live");
    try {
      const response = await fetch("/api/cloudflare-stream/live-inputs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, creator }),
      });
      const body: CloudflareEnvelope<LiveInput> = await response.json();
      if (!response.ok || !body.success || !body.result) throw new Error(getErrorMessage(body, "Unable to create live input."));
      setLiveInput(body.result);
      if (body.result.uid) {
        const nextUrl = `${window.location.pathname}?v=${encodeURIComponent(body.result.uid)}`;
        window.history.replaceState(null, "", nextUrl);
        setUrlStreamId(body.result.uid);
        loadViewerCount(body.result.uid).catch(() => null);
      }
      toast({ title: "Live input ready", description: "RTMPS ingest details are available below." });
    } catch (error: any) {
      toast({ title: "Cloudflare Stream error", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function createDirectUpload() {
    setBusy("direct");
    try {
      const response = await fetch("/api/cloudflare-stream/direct-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body: CloudflareEnvelope<{ uploadURL?: string; uid?: string }> = await response.json();
      if (!response.ok || !body.success || !body.result?.uploadURL) {
        throw new Error(getErrorMessage(body, "Unable to create direct upload URL."));
      }
      setDirectUploadUrl(body.result.uploadURL);
      toast({ title: "Upload URL created", description: "Use this one-hour URL for direct creator uploads." });
    } catch (error: any) {
      toast({ title: "Direct upload error", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function uploadLink() {
    if (!linkUrl.trim()) return;
    setBusy("link");
    try {
      const response = await fetch("/api/cloudflare-stream/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: linkUrl, name }),
      });
      const body: CloudflareEnvelope<StreamVideo> = await response.json();
      if (!response.ok || !body.success) throw new Error(getErrorMessage(body, "Unable to copy video link."));
      toast({ title: "Link upload started", description: "Cloudflare Stream is fetching the video." });
      await loadVideos();
    } catch (error: any) {
      toast({ title: "Link upload error", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function uploadBasicFile() {
    if (!file) return;
    setBusy("file");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/cloudflare-stream/upload", { method: "POST", body: form });
      const body: CloudflareEnvelope<StreamVideo> = await response.json();
      if (!response.ok || !body.success) throw new Error(getErrorMessage(body, "Unable to upload file."));
      toast({ title: "Upload complete", description: "Cloudflare Stream is processing the video." });
      setFile(null);
      await loadVideos();
    } catch (error: any) {
      toast({ title: "File upload error", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function copyText(value?: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({ title: "Copied" });
  }

  return (
    <main className="mx-auto w-full max-w-7xl py-4 sm:py-6">
      <section className="max-w-3xl">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge className="border-red-400/30 bg-red-500/10 text-red-100">
              <Radio className="mr-1 h-3 w-3" />
              Stream
            </Badge>
            <Badge className="border-emerald-400/30 bg-emerald-500/10 text-emerald-100">
              <Eye className="mr-1 h-3 w-3" />
              {viewerCount.liveViewers.toLocaleString()} live
            </Badge>
            <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
              {status?.configured ? "Cloudflare API ready" : "watch-only until token is configured"}
            </Badge>
            <Badge variant="outline" className={playbackStateClass}>
              {playbackStateLabel}
            </Badge>
          </div>
          <h1 className="text-3xl font-black tracking-normal text-white sm:text-5xl">Cheshire Terminal Stream</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
            Launch a live channel from the browser, copy encoder settings into OBS, and watch the feed through a Cloudflare Stream HLS player powered by Video.js.
          </p>
        </div>
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="overflow-hidden rounded-lg border border-red-500/20 bg-black shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-red-500/20 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-bold text-red-100">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-300 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
              </span>
              Video.js Live Player
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-zinc-300" onClick={() => window.open(iframeUrl, "_blank")}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open
            </Button>
          </div>
          <div className="relative aspect-video bg-black">
            <CloudflareVideoPlayer src={hlsUrl} poster={posterUrl} live />
          </div>
          <div className="border-t border-zinc-900 bg-black p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase text-zinc-500">Cloudflare iframe fallback</div>
              <Button variant="ghost" size="sm" className="h-8 text-zinc-300" onClick={() => copyText(iframeUrl)}>
                <Copy className="mr-2 h-4 w-4" />
                Copy iframe URL
              </Button>
            </div>
            <div style={{ position: "relative", paddingTop: "56.25%" }}>
              <iframe
                src={iframeUrl}
                style={{ border: "none", position: "absolute", top: 0, left: 0, height: "100%", width: "100%" }}
                allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
              />
            </div>
          </div>
          <div className="grid gap-3 border-t border-zinc-900 bg-zinc-950/90 p-4 sm:grid-cols-2 xl:grid-cols-5">
            <CopyStat
              label="Live Viewers"
              value={`${viewerCount.liveViewers.toLocaleString()}${viewerCountUpdatedAt ? " now" : ""}`}
              onCopy={() => loadViewerCount(activeInputId)}
              icon={<Eye className="h-4 w-4" />}
            />
            <CopyStat label="Stream ID" value={activeInputId} onCopy={copyText} icon={<Radio className="h-4 w-4" />} />
            <CopyStat label="Watch URL" value={shareUrl} onCopy={copyText} icon={<Share2 className="h-4 w-4" />} />
            <CopyStat label="HLS Source" value={hlsUrl} onCopy={copyText} icon={<Video className="h-4 w-4" />} />
            <CopyStat label="Iframe Fallback" value={iframeUrl} onCopy={copyText} icon={<ExternalLink className="h-4 w-4" />} />
          </div>
          {viewerCount.error && (
            <div className="border-t border-yellow-500/20 bg-yellow-500/10 px-4 py-2 text-xs text-yellow-100">
              {viewerCount.error}
            </div>
          )}
          <div className="border-t border-zinc-900 bg-black p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase text-zinc-500">Playback diagnostics</div>
                <div className="mt-1 text-xs text-zinc-400">
                  {playbackProbe?.checkedAt ? `Last checked ${new Date(playbackProbe.checkedAt).toLocaleTimeString()}` : "Testing public playback endpoints."}
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-8" onClick={() => loadPlaybackHealth(activeInputId)} disabled={busy === "probe"}>
                {busy === "probe" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Test stream
              </Button>
            </div>
            {playbackProbe?.error && (
              <div className="mb-3 rounded border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
                {playbackProbe.error}
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              <ProbeRow label="HLS manifest" probe={playbackProbe?.checks?.hls} />
              <ProbeRow label="Iframe player" probe={playbackProbe?.checks?.iframe} />
              <ProbeRow label="Thumbnail" probe={playbackProbe?.checks?.thumbnail} />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-red-500/20 bg-zinc-950/90 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <MonitorUp className="h-4 w-4 text-red-300" />
                  Broadcaster Console
                </div>
                <div className="mt-1 text-xs text-zinc-500">First-party controls for creator streams.</div>
              </div>
              <Badge variant="outline" className={hasLiveInput ? "border-emerald-400/30 text-emerald-200" : "border-zinc-700 text-zinc-400"}>
                {hasLiveInput ? "channel ready" : liveCreationReady ? "setup" : "watch only"}
              </Badge>
            </div>

            {!liveCreationReady && (
              <div className="mb-4 rounded-md border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-yellow-100">
                Live channel creation is disabled until the server has `CLOUDFLARE_STREAM_TOKEN` or `CLOUDFLARE_API_TOKEN`.
              </div>
            )}

            <div className="grid gap-3">
              <div>
                <Label htmlFor="stream-name" className="text-xs uppercase text-zinc-400">Stream name</Label>
                <Input
                  id="stream-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-2 border-zinc-700 bg-black text-white"
                />
              </div>
              <div>
                <Label htmlFor="stream-creator" className="text-xs uppercase text-zinc-400">Creator handle</Label>
                <Input
                  id="stream-creator"
                  value={creator}
                  onChange={(event) => setCreator(event.target.value)}
                  placeholder="@creator"
                  className="mt-2 border-zinc-700 bg-black text-white"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {setupItems.map((item) => (
                <div key={item.label} className="flex items-center gap-2 rounded border border-zinc-800 bg-black/50 px-3 py-2 text-xs text-zinc-300">
                  {item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Settings2 className="h-4 w-4 text-zinc-600" />}
                  {item.label}
                </div>
              ))}
            </div>
          </div>

          <Tabs defaultValue="live" className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <TabsList className="grid w-full grid-cols-3 bg-black">
              <TabsTrigger value="live"><Radio className="mr-1 h-4 w-4" />Live</TabsTrigger>
              <TabsTrigger value="direct"><UploadCloud className="mr-1 h-4 w-4" />Direct</TabsTrigger>
              <TabsTrigger value="link"><LinkIcon className="mr-1 h-4 w-4" />Link</TabsTrigger>
            </TabsList>

            <TabsContent value="live" className="mt-4 space-y-4">
              <Button className="w-full bg-red-600 text-white hover:bg-red-500" onClick={createLiveInput} disabled={busy === "live" || !liveCreationReady}>
                {busy === "live" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radio className="mr-2 h-4 w-4" />}
                {liveCreationReady ? "Create Live Input" : "Live Creation Needs Token"}
              </Button>
              {liveInput && (
                <div className="space-y-3 rounded-md border border-red-500/20 bg-black/60 p-3">
                  <div className="flex items-center gap-2 rounded border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                    <Wand2 className="h-4 w-4" />
                    Your channel is active. Paste these into OBS or any RTMPS encoder.
                  </div>
                  <CopyRow label="OBS Server" value={obsServer} onCopy={copyText} />
                  <CopyRow label="Stream Key" value={obsKey} onCopy={copyText} secret />
                  <CopyRow label="Watch URL" value={shareUrl} onCopy={copyText} />
                  <CopyRow label="HLS Playback" value={liveInput.playback?.hls} onCopy={copyText} />
                  <CopyRow label="WebRTC URL" value={liveInput.webRTC?.url} onCopy={copyText} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="direct" className="mt-4 space-y-4">
              <Button className="w-full" variant="secondary" onClick={createDirectUpload} disabled={busy === "direct" || !liveCreationReady}>
                {busy === "direct" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
                {liveCreationReady ? "Create Creator Upload URL" : "Upload URLs Need Token"}
              </Button>
              {directUploadUrl && <CopyRow label="Upload URL" value={directUploadUrl} onCopy={copyText} />}
            </TabsContent>

            <TabsContent value="link" className="mt-4 space-y-4">
              <Input
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://example.com/video.mp4"
                className="border-zinc-700 bg-black text-white"
              />
              <Button className="w-full" onClick={uploadLink} disabled={busy === "link" || !linkUrl.trim() || !liveCreationReady}>
                {busy === "link" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
                {liveCreationReady ? "Upload With Link" : "Link Uploads Need Token"}
              </Button>
            </TabsContent>
          </Tabs>

          <div className="rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <FileVideo className="h-4 w-4 text-cyan-300" />
              Basic Upload
            </div>
            <Input
              type="file"
              accept="video/*"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="border-zinc-700 bg-black text-white file:text-zinc-200"
            />
            <Button className="mt-3 w-full" onClick={uploadBasicFile} disabled={busy === "file" || !file || !liveCreationReady}>
              {busy === "file" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
              {liveCreationReady ? "Upload Under 200 MB" : "Uploads Need Token"}
            </Button>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950/80 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">Recent Stream Videos</h2>
            <p className="text-xs text-zinc-400">Cloudflare processing state and playback links.</p>
          </div>
          <Button variant="outline" size="sm" onClick={loadVideos} disabled={busy === "videos"}>
            {busy === "videos" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
        {videos.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/10 p-3 text-sm text-yellow-100">
            <AlertCircle className="h-4 w-4" />
            No videos loaded yet, or sign-in is required for the video list.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {videos.map((video) => (
              <div key={video.uid} className="rounded-md border border-zinc-800 bg-black/50 p-3">
                <div className="aspect-video overflow-hidden rounded bg-zinc-900">
                  <img src={video.playback?.thumbnail || video.thumbnail} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="mt-3 truncate text-sm font-semibold text-zinc-100">{video.meta?.name || video.uid}</div>
                <div className="mt-1 text-xs text-zinc-500">{video.status?.state || "unknown"}</div>
                {video.playback?.iframe && (
                  <Button variant="ghost" size="sm" className="mt-2 h-8 px-0 text-cyan-200" onClick={() => copyText(video.playback?.hls)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy HLS URL
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function CopyStat({ label, value, icon, onCopy }: { label: string; value?: string; icon: ReactNode; onCopy: (value?: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onCopy(value)}
      className="min-w-0 rounded-md border border-zinc-800 bg-black/60 p-3 text-left transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/10"
      disabled={!value}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-zinc-500">
        {icon}
        {label}
      </div>
      <div className="truncate font-mono text-xs text-zinc-200">{value || "Unavailable"}</div>
    </button>
  );
}

function CopyRow({ label, value, onCopy, secret = false }: { label: string; value?: string; onCopy: (value?: string) => void; secret?: boolean }) {
  return (
    <div className="grid gap-2">
      <div className="text-[10px] font-semibold uppercase text-zinc-500">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-200">
          {secret && value ? "••••••••••••••••••••••••" : value || "Unavailable"}
        </code>
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-zinc-300" onClick={() => onCopy(value)} disabled={!value}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ProbeRow({ label, probe }: { label: string; probe?: ProbeCheck }) {
  const ok = Boolean(probe?.ok);
  const detail = probe
    ? probe.error || `${probe.status || "no status"} / ${probe.latencyMs}ms`
    : "pending";

  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
        {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertCircle className="h-4 w-4 text-yellow-300" />}
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-[11px] text-zinc-500">{detail}</div>
    </div>
  );
}
