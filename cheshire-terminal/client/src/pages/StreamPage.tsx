import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, Bot, CheckCircle2, Copy, ExternalLink, Eye, FileVideo, Link as LinkIcon, Loader2, MonitorUp, PhoneOff, Radio, RefreshCw, Settings2, Share2, Trash2, UploadCloud, Video, Wand2 } from "lucide-react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/useLocalStorage";
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

type LiveKitStatus = {
  configured: boolean;
  url: string;
  agentName?: string;
  livestreamRoom?: string;
};

type LiveKitSession = {
  token: string;
  url: string;
  roomName: string;
  participantName: string;
  role: "viewer" | "host" | "agent";
};

type LiveKitIngress = {
  protocol: "rtmp" | "whip";
  roomName: string;
  agentName: string;
  ingressId?: string;
  url?: string;
  streamKey?: string;
  status?: string;
};

type LiveKitIngressSummary = {
  ingressId?: string;
  name?: string;
  roomName?: string;
  participantIdentity?: string;
  participantName?: string;
  inputType?: string | number;
  url?: string;
  status?: string | number;
  startedAt?: string | number;
  endedAt?: string | number;
  tracks?: number;
};

type LiveKitEgressSummary = {
  egressId?: string;
  roomName?: string;
  status?: string | number;
  layout?: string;
  startedAt?: string | number;
  endedAt?: string | number;
  updatedAt?: string | number;
  error?: string;
  streamResults?: Array<{
    status?: string | number;
    startedAt?: string | number;
    endedAt?: string | number;
    duration?: string | number;
    error?: string;
  }>;
};

type LiveKitRoomHealth = {
  roomName: string;
  exists: boolean;
  sid?: string;
  creationTime?: string | number;
  numParticipants: number;
  numPublishers: number;
  numTracks: number;
  participants: Array<{
    sid?: string;
    identity?: string;
    name?: string;
    kind?: string | number;
    state?: string | number;
    joinedAt?: string | number;
    trackCount: number;
    publishedTracks?: Array<{
      sid?: string;
      type?: string | number;
      name?: string;
      source?: string | number;
      muted?: boolean;
    }>;
  }>;
  error?: string;
};

type LiveKitSmokeResult = {
  checkedAt: string;
  roomName: string;
  ok: boolean;
  checks: Array<{ role: "viewer" | "host" | "agent"; ok: boolean; participantName?: string; error?: string }>;
};

type LiveKitSmokeHistoryItem = {
  checkedAt: string;
  roomName: string;
  ok: boolean;
  passed: number;
  total: number;
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
  hls?: HlsAnalysis;
  checks?: Record<string, ProbeCheck>;
  error?: string;
};

type HlsAnalysis = {
  isPlaylist: boolean;
  mediaSegmentCount: number;
  variantPlaylistCount: number;
  targetDuration: number | null;
  mediaSequence: number | null;
  playlistType: string | null;
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

type StreamTestHistoryItem = {
  uid: string;
  checkedAt: string;
  ok: boolean;
  liveReady: boolean;
  liveViewers: number;
  mediaSegmentCount: number;
  hlsStatus?: number;
  iframeStatus?: number;
};

function getErrorMessage(body: CloudflareEnvelope<unknown>, fallback: string) {
  return body.errors?.map((error) => error.message).filter(Boolean).join(" ") || fallback;
}

function getUrlStreamId() {
  if (typeof window === "undefined") return "";
  const value = new URLSearchParams(window.location.search).get("v") || "";
  return STREAM_UID_RE.test(value) ? value : "";
}

function parseStreamId(value: string) {
  const trimmed = value.trim();
  if (STREAM_UID_RE.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const queryValue = url.searchParams.get("v") || "";
    if (STREAM_UID_RE.test(queryValue)) return queryValue;

    const pathValue = url.pathname.split("/").filter(Boolean)[0] || "";
    if (STREAM_UID_RE.test(pathValue)) return pathValue;
  } catch {
    return "";
  }

  return "";
}

export default function StreamPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<StreamStatus | null>(null);
  const [livekitStatus, setLivekitStatus] = useState<LiveKitStatus | null>(null);
  const [livekitSession, setLivekitSession] = useState<LiveKitSession | null>(null);
  const [livekitIngress, setLivekitIngress] = useState<LiveKitIngress | null>(null);
  const [livekitIngresses, setLivekitIngresses] = useState<LiveKitIngressSummary[]>([]);
  const [livekitIngressError, setLivekitIngressError] = useState("");
  const [livekitEgresses, setLivekitEgresses] = useState<LiveKitEgressSummary[]>([]);
  const [livekitEgressError, setLivekitEgressError] = useState("");
  const [livekitRtmpUrl, setLivekitRtmpUrl] = useState("");
  const [livekitEgressLayout, setLivekitEgressLayout] = useState<"grid" | "speaker" | "single-speaker">("grid");
  const [livekitRoomHealth, setLivekitRoomHealth] = useState<LiveKitRoomHealth | null>(null);
  const [livekitRoomHealthError, setLivekitRoomHealthError] = useState("");
  const [livekitSmokeResult, setLivekitSmokeResult] = useState<LiveKitSmokeResult | null>(null);
  const [livekitRoomName, setLivekitRoomName] = useState("cheshire-terminal-live");
  const [livekitName, setLivekitName] = useState("");
  const [livekitAgentName, setLivekitAgentName] = useState("clawd-stream-agent");
  const [videos, setVideos] = useState<StreamVideo[]>([]);
  const [liveInput, setLiveInput] = useState<LiveInput | null>(null);
  const [sharedPlayback, setSharedPlayback] = useState<PlaybackTarget | null>(null);
  const [urlStreamId, setUrlStreamId] = useState(getUrlStreamId);
  const [name, setName] = useState("cheshireterminal");
  const [creator, setCreator] = useState("");
  const [inspectorInput, setInspectorInput] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [directUploadUrl, setDirectUploadUrl] = useState("");
  const [viewerCount, setViewerCount] = useState<ViewerCount>({ liveViewers: 0 });
  const [viewerCountUpdatedAt, setViewerCountUpdatedAt] = useState<number | null>(null);
  const [playbackProbe, setPlaybackProbe] = useState<PlaybackProbe | null>(null);
  const [streamTestHistory, setStreamTestHistory] = useLocalStorage<StreamTestHistoryItem[]>("cheshire:stream-test-history", []);
  const [livekitSmokeHistory, setLivekitSmokeHistory] = useLocalStorage<LiveKitSmokeHistoryItem[]>("cheshire:livekit-smoke-history", []);
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
  const playbackSummary = !playbackProbe
    ? "Run a stream test to verify whether the active Cloudflare playback URLs are responding."
    : playbackProbe.liveReady
      ? `The HLS manifest has ${playbackProbe.hls?.mediaSegmentCount ?? 0} media segment${playbackProbe.hls?.mediaSegmentCount === 1 ? "" : "s"} and is ready for Video.js playback.`
      : playbackProbe.ok
        ? "The Cloudflare player route responds, but the HLS playlist does not contain media segments yet. Start the encoder or wait for Stream to finish processing."
        : "Cloudflare playback is not reachable for this stream id. Check the stream id, account subdomain, or encoder state.";
  const setupItems = [
    { label: "Create channel", done: hasLiveInput },
    { label: "Copy OBS server", done: Boolean(obsServer) },
    { label: "Copy stream key", done: Boolean(obsKey) },
    { label: "Stream reachable", done: Boolean(playbackProbe?.ok) },
  ];
  const readinessItems = [
    {
      label: "Cloudflare API",
      done: Boolean(status?.configured),
      detail: status?.configured ? "ready" : "watch-only",
    },
    {
      label: "Playback",
      done: Boolean(playbackProbe?.ok),
      detail: playbackProbe?.liveReady ? "HLS live" : playbackProbe?.ok ? "fallback" : playbackStateLabel,
    },
    {
      label: "LiveKit keys",
      done: Boolean(livekitStatus?.configured),
      detail: livekitStatus?.configured ? "ready" : "missing",
    },
    {
      label: "LiveKit tokens",
      done: Boolean(livekitSmokeResult?.ok || livekitSmokeHistory[0]?.ok),
      detail: livekitSmokeResult
        ? `${livekitSmokeResult.checks.filter((check) => check.ok).length}/${livekitSmokeResult.checks.length}`
        : livekitSmokeHistory[0]
          ? `${livekitSmokeHistory[0].passed}/${livekitSmokeHistory[0].total}`
          : "untested",
    },
    {
      label: "LiveKit media",
      done: Boolean(livekitRoomHealth?.exists && livekitRoomHealth.numTracks > 0),
      detail: livekitRoomHealth
        ? `${livekitRoomHealth.numPublishers} pub / ${livekitRoomHealth.numTracks} tracks`
        : livekitRoomHealthError
          ? "unreachable"
          : "not checked",
    },
    {
      label: "Agent ingress",
      done: Boolean(livekitIngress || livekitIngresses.length > 0),
      detail: livekitIngress ? "created" : livekitIngresses.length > 0 ? `${livekitIngresses.length} listed` : "none",
    },
    {
      label: "RTMP egress",
      done: livekitEgresses.length > 0,
      detail: livekitEgresses.length > 0 ? `${livekitEgresses.length} listed` : "optional",
    },
  ];
  const readinessScore = readinessItems.filter((item) => item.done).length;
  const readinessTone =
    readinessScore >= 4
      ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
      : readinessScore >= 2
        ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-100"
        : "border-yellow-500/25 bg-yellow-500/10 text-yellow-100";

  async function loadStatus() {
    const [cloudflareResponse, livekitResponse] = await Promise.all([
      fetch("/api/cloudflare-stream/status"),
      fetch("/api/livekit/status"),
    ]);
    const cloudflareBody = await cloudflareResponse.json();
    const livekitBody = await livekitResponse.json();
    setStatus(cloudflareBody);
    setLivekitStatus(livekitBody);
    if (livekitBody.livestreamRoom) setLivekitRoomName(livekitBody.livestreamRoom);
    return { cloudflare: cloudflareBody as StreamStatus, livekit: livekitBody as LiveKitStatus };
  }

  async function joinLiveKit(role: "viewer" | "host" | "agent") {
    setBusy(`livekit-${role}`);
    try {
      const response = await fetch("/api/livekit/livestream-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          roomName: livekitRoomName,
          participantName: role === "agent" ? livekitAgentName || undefined : livekitName || undefined,
          dispatchAgent: role === "agent",
        }),
      });
      const body: LiveKitSession & { error?: string } = await response.json();
      if (!response.ok || !body.token) throw new Error(body.error || "Unable to join LiveKit livestream.");
      setLivekitSession(body);
      setLivekitRoomName(body.roomName);
      if (role === "agent") setLivekitAgentName(body.participantName);
      else setLivekitName(body.participantName);
    } catch (error: any) {
      toast({ title: "LiveKit error", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function createLiveKitIngress(protocol: "rtmp" | "whip") {
    setBusy(`livekit-ingress-${protocol}`);
    try {
      const response = await fetch("/api/livekit/livestream-ingress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          protocol,
          roomName: livekitRoomName,
          agentName: livekitAgentName || undefined,
        }),
      });
      const body: LiveKitIngress & { error?: string } = await response.json();
      if (!response.ok || !body.url) throw new Error(body.error || "Unable to create LiveKit ingress.");
      setLivekitIngress(body);
      setLivekitRoomName(body.roomName);
      setLivekitAgentName(body.agentName);
      void loadLiveKitIngresses(body.roomName);
      toast({ title: "Agent ingress ready", description: `${body.agentName} can publish to ${body.roomName}.` });
    } catch (error: any) {
      toast({ title: "LiveKit ingress error", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function loadLiveKitIngresses(room = livekitRoomName) {
    setBusy((current) => current || "livekit-ingresses");
    setLivekitIngressError("");
    try {
      const response = await fetch(`/api/livekit/livestream-ingresses?roomName=${encodeURIComponent(room)}`);
      const body: { items?: LiveKitIngressSummary[]; error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to list LiveKit ingresses.");
      setLivekitIngresses(Array.isArray(body.items) ? body.items : []);
    } catch (error: any) {
      setLivekitIngressError(error.message || "Unable to list LiveKit ingresses.");
      setLivekitIngresses([]);
    } finally {
      setBusy((current) => (current === "livekit-ingresses" ? null : current));
    }
  }

  async function deleteLiveKitIngress(ingressId?: string) {
    if (!ingressId) return;
    setBusy(`livekit-delete-${ingressId}`);
    try {
      const response = await fetch(`/api/livekit/livestream-ingresses/${encodeURIComponent(ingressId)}`, {
        method: "DELETE",
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to delete LiveKit ingress.");
      setLivekitIngresses((current) => current.filter((ingress) => ingress.ingressId !== ingressId));
      toast({ title: "Ingress deleted", description: "The stale LiveKit endpoint was removed." });
      void loadLiveKitIngresses();
    } catch (error: any) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function loadLiveKitRoomHealth(room = livekitRoomName) {
    setBusy((current) => current || "livekit-room-health");
    setLivekitRoomHealthError("");
    try {
      const response = await fetch(`/api/livekit/livestream-room?roomName=${encodeURIComponent(room)}`);
      const body: LiveKitRoomHealth = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to inspect LiveKit room.");
      setLivekitRoomHealth(body);
    } catch (error: any) {
      setLivekitRoomHealthError(error.message || "Unable to inspect LiveKit room.");
      setLivekitRoomHealth(null);
    } finally {
      setBusy((current) => (current === "livekit-room-health" ? null : current));
    }
  }

  async function startLiveKitEgress() {
    setBusy("livekit-egress-start");
    try {
      const response = await fetch("/api/livekit/livestream-egress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: livekitRoomName,
          rtmpUrl: livekitRtmpUrl,
          layout: livekitEgressLayout,
        }),
      });
      const body: { egress?: LiveKitEgressSummary; destinationHost?: string; error?: string } = await response.json();
      if (!response.ok || !body.egress?.egressId) throw new Error(body.error || "Unable to start LiveKit egress.");
      setLivekitRtmpUrl("");
      setLivekitEgresses((current) => [body.egress as LiveKitEgressSummary, ...current.filter((item) => item.egressId !== body.egress?.egressId)]);
      void loadLiveKitEgresses();
      toast({ title: "RTMP egress started", description: `Exporting ${livekitRoomName} to ${body.destinationHost || "RTMP"}.` });
    } catch (error: any) {
      toast({ title: "LiveKit egress error", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function loadLiveKitEgresses(room = livekitRoomName) {
    setBusy((current) => current || "livekit-egresses");
    setLivekitEgressError("");
    try {
      const response = await fetch(`/api/livekit/livestream-egresses?roomName=${encodeURIComponent(room)}`);
      const body: { items?: LiveKitEgressSummary[]; error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to list LiveKit egresses.");
      setLivekitEgresses(Array.isArray(body.items) ? body.items : []);
    } catch (error: any) {
      setLivekitEgressError(error.message || "Unable to list LiveKit egresses.");
      setLivekitEgresses([]);
    } finally {
      setBusy((current) => (current === "livekit-egresses" ? null : current));
    }
  }

  async function stopLiveKitEgress(egressId?: string) {
    if (!egressId) return;
    setBusy(`livekit-stop-${egressId}`);
    try {
      const response = await fetch(`/api/livekit/livestream-egresses/${encodeURIComponent(egressId)}/stop`, {
        method: "POST",
      });
      const body: { error?: string } = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to stop LiveKit egress.");
      toast({ title: "Egress stopped", description: "LiveKit stopped exporting this room." });
      void loadLiveKitEgresses();
    } catch (error: any) {
      toast({ title: "Stop failed", description: error.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  async function runLiveKitSmoke(options: { silent?: boolean } = {}) {
    if (!options.silent) setBusy("livekit-smoke");
    const roles: Array<"viewer" | "host" | "agent"> = ["viewer", "host", "agent"];
    const checks: LiveKitSmokeResult["checks"] = [];

    try {
      for (const role of roles) {
        try {
          const participantName = `browser-smoke-${role}`;
          const response = await fetch("/api/livekit/livestream-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              role,
              roomName: livekitRoomName,
              participantName,
              dispatchAgent: false,
            }),
          });
          const body: Partial<LiveKitSession> & { error?: string } = await response.json();
          const ok =
            response.ok &&
            typeof body.token === "string" &&
            body.token.length > 20 &&
            body.roomName === livekitRoomName &&
            body.role === role;

          checks.push({
            role,
            ok,
            participantName: body.participantName,
            error: ok ? undefined : body.error || `HTTP ${response.status}`,
          });
        } catch (error: any) {
          checks.push({ role, ok: false, error: error.message || "request failed" });
        }
      }

      const result = {
        checkedAt: new Date().toISOString(),
        roomName: livekitRoomName,
        ok: checks.every((check) => check.ok),
        checks,
      };
      setLivekitSmokeResult(result);
      setLivekitSmokeHistory((current) => [
        {
          checkedAt: result.checkedAt,
          roomName: result.roomName,
          ok: result.ok,
          passed: checks.filter((check) => check.ok).length,
          total: checks.length,
        },
        ...current.filter((item) => item.checkedAt !== result.checkedAt),
      ].slice(0, 8));
      if (!options.silent) {
        toast({
          title: result.ok ? "LiveKit token check passed" : "LiveKit token check failed",
          description: `${checks.filter((check) => check.ok).length}/${checks.length} roles minted successfully.`,
          variant: result.ok ? "default" : "destructive",
        });
      }
    } finally {
      if (!options.silent) setBusy(null);
    }
  }

  async function refreshReadiness() {
    setBusy("readiness");
    try {
      const statusPromise = loadStatus().catch(() => null);
      await Promise.all([
        statusPromise,
        loadViewerCount(activeInputId).catch(() => null),
        loadPlaybackHealth(activeInputId).catch(() => null),
        loadLiveKitRoomHealth().catch(() => null),
        loadLiveKitIngresses().catch(() => null),
        loadLiveKitEgresses().catch(() => null),
      ]);

      const latestStatus = await statusPromise;
      if (latestStatus?.livekit.configured || livekitStatus?.configured) {
        await runLiveKitSmoke({ silent: true });
      }
    } finally {
      setBusy((current) => current === "readiness" ? null : current);
    }
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
      setStreamTestHistory((current) => [
        {
          uid: inputId,
          checkedAt: body.checkedAt,
          ok: body.ok,
          liveReady: body.liveReady,
          liveViewers: viewerCount.liveViewers,
          mediaSegmentCount: body.hls?.mediaSegmentCount ?? 0,
          hlsStatus: body.checks?.hls?.status,
          iframeStatus: body.checks?.iframe?.status,
        },
        ...current.filter((item) => item.uid !== inputId),
      ].slice(0, 6));
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

  async function selectStream(inputId: string, playback?: PlaybackTarget["playback"]) {
    if (!STREAM_UID_RE.test(inputId)) return;
    setLiveInput(null);
    setSharedPlayback(playback ? { uid: inputId, playback } : null);
    const nextUrl = `${window.location.pathname}?v=${encodeURIComponent(inputId)}`;
    window.history.replaceState(null, "", nextUrl);
    setUrlStreamId(inputId);
    setInspectorInput(inputId);

    await Promise.all([
      playback ? Promise.resolve() : loadPlaybackTarget(inputId).catch(() => null),
      loadViewerCount(inputId).catch(() => null),
      loadPlaybackHealth(inputId).catch(() => null),
    ]);
  }

  async function inspectStream() {
    const nextStreamId = parseStreamId(inspectorInput);
    if (!nextStreamId) {
      toast({
        title: "Invalid stream id",
        description: "Paste a Cloudflare Stream UID or a /stream?v=... watch URL.",
        variant: "destructive",
      });
      return;
    }

    await selectStream(nextStreamId);
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
        loadPlaybackHealth(body.result.uid).catch(() => null);
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

      <section className={`mt-5 rounded-lg border p-4 ${readinessTone}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-white">Stream readiness</div>
            <div className="mt-1 text-xs opacity-80">{readinessScore}/{readinessItems.length} checks ready for a live stream test.</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-white/20 bg-black/20 text-white hover:bg-white/10"
            onClick={refreshReadiness}
            disabled={busy === "readiness" || busy === "probe" || busy === "livekit-ingresses"}
          >
            {busy === "readiness" || busy === "probe" || busy === "livekit-ingresses" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh readiness
          </Button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {readinessItems.map((item) => (
            <div key={item.label} className="rounded border border-white/10 bg-black/25 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                {item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertCircle className="h-4 w-4 text-yellow-200" />}
                {item.label}
              </div>
              <div className="mt-1 truncate text-xs opacity-75">{item.detail}</div>
            </div>
          ))}
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
            <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input
                value={inspectorInput}
                onChange={(event) => setInspectorInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    inspectStream();
                  }
                }}
                placeholder="Paste Stream UID or watch URL"
                className="border-zinc-800 bg-zinc-950 text-xs text-white"
              />
              <Button type="button" variant="secondary" size="sm" className="h-10" onClick={inspectStream}>
                <Radio className="mr-2 h-4 w-4" />
                Inspect
              </Button>
            </div>
            <div className="mb-3 rounded border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs leading-5 text-zinc-300">
              {playbackSummary}
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
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <ProbeMetric label="Media segments" value={playbackProbe?.hls ? String(playbackProbe.hls.mediaSegmentCount) : "pending"} />
              <ProbeMetric label="Variants" value={playbackProbe?.hls ? String(playbackProbe.hls.variantPlaylistCount) : "pending"} />
              <ProbeMetric
                label="Target duration"
                value={playbackProbe?.hls?.targetDuration ? `${playbackProbe.hls.targetDuration}s` : "unavailable"}
              />
            </div>
            {streamTestHistory.length > 0 && (
              <div className="mt-4 border-t border-zinc-900 pt-4">
                <div className="mb-2 text-xs font-semibold uppercase text-zinc-500">Recent stream tests</div>
                <div className="grid gap-2">
                  {streamTestHistory.map((item) => (
                    <div key={item.uid} className="grid gap-2 rounded border border-zinc-800 bg-zinc-950/80 p-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge variant="outline" className={item.liveReady ? "border-emerald-400/30 text-emerald-200" : item.ok ? "border-cyan-400/30 text-cyan-200" : "border-yellow-500/30 text-yellow-100"}>
                            {item.liveReady ? "live" : item.ok ? "reachable" : "offline"}
                          </Badge>
                          <span className="truncate font-mono text-xs text-zinc-200">{item.uid}</span>
                        </div>
                        <div className="mt-1 text-[11px] text-zinc-500">
                          {new Date(item.checkedAt).toLocaleTimeString()} · {item.liveViewers.toLocaleString()} viewers · {item.mediaSegmentCount} segments · HLS {item.hlsStatus ?? "n/a"}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button variant="secondary" size="sm" className="h-8" onClick={() => selectStream(item.uid)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Watch
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 text-cyan-200" onClick={() => loadPlaybackHealth(item.uid)}>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Retest
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

          <div className="rounded-lg border border-cyan-500/20 bg-zinc-950/90 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Radio className="h-4 w-4 text-cyan-300" />
                  LiveKit Livestream
                </div>
                <div className="mt-1 text-xs text-zinc-500">Low-latency WebRTC room for browser broadcast and viewing.</div>
              </div>
              <Badge variant="outline" className={livekitStatus?.configured ? "border-emerald-400/30 text-emerald-200" : "border-yellow-500/30 text-yellow-100"}>
                {livekitStatus?.configured ? "ready" : "needs keys"}
              </Badge>
            </div>

            {!livekitStatus?.configured && (
              <div className="mb-4 rounded-md border border-yellow-500/25 bg-yellow-500/10 px-3 py-2 text-xs leading-5 text-yellow-100">
                LiveKit livestream needs `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in the server environment.
              </div>
            )}

            <div className="grid gap-3">
              <div>
                <Label htmlFor="livekit-room" className="text-xs uppercase text-zinc-400">Room</Label>
                <Input
                  id="livekit-room"
                  value={livekitRoomName}
                  onChange={(event) => setLivekitRoomName(event.target.value)}
                  className="mt-2 border-zinc-700 bg-black text-white"
                />
              </div>
              <div>
                <Label htmlFor="livekit-name" className="text-xs uppercase text-zinc-400">Display name</Label>
                <Input
                  id="livekit-name"
                  value={livekitName}
                  onChange={(event) => setLivekitName(event.target.value)}
                  placeholder="viewer"
                  className="mt-2 border-zinc-700 bg-black text-white"
                />
              </div>
              <div>
                <Label htmlFor="livekit-agent-name" className="text-xs uppercase text-zinc-400">Agent publisher</Label>
                <Input
                  id="livekit-agent-name"
                  value={livekitAgentName}
                  onChange={(event) => setLivekitAgentName(event.target.value)}
                  placeholder={livekitStatus?.agentName || "clawd-stream-agent"}
                  className="mt-2 border-zinc-700 bg-black text-white"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => joinLiveKit("viewer")} disabled={!livekitStatus?.configured || busy === "livekit-viewer"}>
                {busy === "livekit-viewer" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
                Join viewer
              </Button>
              <Button className="bg-cyan-600 text-white hover:bg-cyan-500" onClick={() => joinLiveKit("host")} disabled={!livekitStatus?.configured || busy === "livekit-host"}>
                {busy === "livekit-host" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Video className="mr-2 h-4 w-4" />}
                Broadcast
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Button variant="outline" onClick={() => joinLiveKit("agent")} disabled={!livekitStatus?.configured || busy === "livekit-agent"}>
                {busy === "livekit-agent" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                Agent room
              </Button>
              <Button variant="outline" onClick={() => createLiveKitIngress("rtmp")} disabled={!livekitStatus?.configured || busy === "livekit-ingress-rtmp"}>
                {busy === "livekit-ingress-rtmp" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radio className="mr-2 h-4 w-4" />}
                RTMP
              </Button>
              <Button variant="outline" onClick={() => createLiveKitIngress("whip")} disabled={!livekitStatus?.configured || busy === "livekit-ingress-whip"}>
                {busy === "livekit-ingress-whip" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MonitorUp className="mr-2 h-4 w-4" />}
                WHIP
              </Button>
            </div>
            <Button
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => runLiveKitSmoke()}
              disabled={!livekitStatus?.configured || busy === "livekit-smoke"}
            >
              {busy === "livekit-smoke" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              Test viewer, host, and agent tokens
            </Button>
            {livekitSmokeResult && (
              <div className={`mt-4 rounded-md border p-3 ${livekitSmokeResult.ok ? "border-emerald-400/20 bg-emerald-500/10" : "border-red-400/20 bg-red-500/10"}`}>
                <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                  <span className={livekitSmokeResult.ok ? "font-bold text-emerald-200" : "font-bold text-red-200"}>
                    {livekitSmokeResult.ok ? "Token check passed" : "Token check failed"}
                  </span>
                  <span className="text-zinc-500">{new Date(livekitSmokeResult.checkedAt).toLocaleTimeString()}</span>
                </div>
                <div className="grid gap-2">
                  {livekitSmokeResult.checks.map((check) => (
                    <div key={check.role} className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-black/45 px-3 py-2 text-xs">
                      <span className="font-semibold text-zinc-200">{check.role}</span>
                      <span className={check.ok ? "text-emerald-300" : "text-red-300"}>
                        {check.ok ? check.participantName || "ok" : check.error || "failed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {livekitSmokeHistory.length > 0 && (
              <div className="mt-3 rounded-md border border-zinc-800 bg-black/35 p-3">
                <div className="mb-2 text-xs font-bold uppercase text-zinc-400">Recent LiveKit checks</div>
                <div className="grid gap-2">
                  {livekitSmokeHistory.slice(0, 4).map((item) => (
                    <div key={item.checkedAt} className="flex items-center justify-between gap-3 text-xs">
                      <div className="min-w-0">
                        <div className="truncate text-zinc-200">{item.roomName}</div>
                        <div className="text-zinc-500">{new Date(item.checkedAt).toLocaleString()}</div>
                      </div>
                      <Badge variant="outline" className={item.ok ? "border-emerald-400/30 text-emerald-200" : "border-red-400/30 text-red-200"}>
                        {item.passed}/{item.total}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-4 rounded-md border border-zinc-800 bg-black/35 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-zinc-400">LiveKit room health</div>
                  <div className="mt-1 text-xs text-zinc-600">Checks whether the room exists and has published media tracks.</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => loadLiveKitRoomHealth()}
                  disabled={!livekitStatus?.configured || busy === "livekit-room-health"}
                >
                  {busy === "livekit-room-health" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Check
                </Button>
              </div>
              {livekitRoomHealthError && (
                <div className="rounded border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
                  {livekitRoomHealthError}
                </div>
              )}
              {!livekitRoomHealthError && !livekitRoomHealth && (
                <div className="rounded border border-zinc-800 bg-black/40 px-3 py-2 text-xs text-zinc-500">
                  No LiveKit room check has run for this room.
                </div>
              )}
              {livekitRoomHealth && (
                <div className="grid gap-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded border border-zinc-800 bg-black/45 px-3 py-2">
                      <div className="text-[10px] uppercase text-zinc-500">Room</div>
                      <div className={livekitRoomHealth.exists ? "text-sm font-bold text-emerald-200" : "text-sm font-bold text-yellow-100"}>
                        {livekitRoomHealth.exists ? "active" : "empty"}
                      </div>
                    </div>
                    <div className="rounded border border-zinc-800 bg-black/45 px-3 py-2">
                      <div className="text-[10px] uppercase text-zinc-500">Publishers</div>
                      <div className="text-sm font-bold text-cyan-100">{livekitRoomHealth.numPublishers}</div>
                    </div>
                    <div className="rounded border border-zinc-800 bg-black/45 px-3 py-2">
                      <div className="text-[10px] uppercase text-zinc-500">Tracks</div>
                      <div className="text-sm font-bold text-cyan-100">{livekitRoomHealth.numTracks}</div>
                    </div>
                  </div>
                  {livekitRoomHealth.participants.length > 0 && (
                    <div className="grid gap-2">
                      {livekitRoomHealth.participants.slice(0, 5).map((participant) => (
                        <div key={participant.sid || participant.identity} className="flex items-center justify-between gap-3 rounded border border-zinc-800 bg-black/45 px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-zinc-200">{participant.name || participant.identity || participant.sid}</div>
                            <div className="truncate text-zinc-500">{String(participant.kind ?? "participant")} · {String(participant.state ?? "state")}</div>
                          </div>
                          <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
                            {participant.trackCount} tracks
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {livekitIngress && (
              <div className="mt-4 space-y-3 rounded-md border border-cyan-500/20 bg-black/60 p-3">
                <div className="flex items-center gap-2 rounded border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                  <Bot className="h-4 w-4" />
                  {livekitIngress.agentName} publishes into {livekitIngress.roomName} over {livekitIngress.protocol.toUpperCase()}.
                </div>
                <CopyRow label={`${livekitIngress.protocol.toUpperCase()} URL`} value={livekitIngress.url} onCopy={copyText} />
                <CopyRow label="Stream Key" value={livekitIngress.streamKey} onCopy={copyText} secret />
                <CopyRow label="Ingress ID" value={livekitIngress.ingressId} onCopy={copyText} />
              </div>
            )}
            <div className="mt-4 rounded-md border border-zinc-800 bg-black/35 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-zinc-400">Agent ingress status</div>
                  <div className="mt-1 text-xs text-zinc-600">Lists LiveKit RTMP/WHIP endpoints for this room without stream keys.</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => loadLiveKitIngresses()}
                  disabled={!livekitStatus?.configured || busy === "livekit-ingresses"}
                >
                  {busy === "livekit-ingresses" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refresh
                </Button>
              </div>
              {livekitIngressError && (
                <div className="rounded border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
                  {livekitIngressError}
                </div>
              )}
              {!livekitIngressError && livekitIngresses.length === 0 && (
                <div className="rounded border border-zinc-800 bg-black/40 px-3 py-2 text-xs text-zinc-500">
                  No ingress endpoints loaded for this room.
                </div>
              )}
              {livekitIngresses.length > 0 && (
                <div className="grid gap-2">
                  {livekitIngresses.map((ingress) => (
                    <div key={ingress.ingressId || `${ingress.participantIdentity}-${ingress.url}`} className="rounded border border-zinc-800 bg-black/45 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-zinc-100">{ingress.name || ingress.participantName || ingress.ingressId}</div>
                          <div className="mt-1 truncate text-xs text-zinc-500">{ingress.participantIdentity || "unknown"} · {String(ingress.inputType ?? "input")}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
                            {String(ingress.status ?? "unknown")}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-zinc-500 hover:text-red-300"
                            onClick={() => deleteLiveKitIngress(ingress.ingressId)}
                            disabled={!ingress.ingressId || busy === `livekit-delete-${ingress.ingressId}`}
                            title="Delete ingress"
                          >
                            {busy === `livekit-delete-${ingress.ingressId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
                        <span className="truncate">{ingress.url || "no url"}</span>
                        <span>{ingress.tracks ?? 0} tracks</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 rounded-md border border-zinc-800 bg-black/35 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-zinc-400">Room egress</div>
                  <div className="mt-1 text-xs text-zinc-600">Export the LiveKit room to an RTMP destination. The destination URL is never listed after start.</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => loadLiveKitEgresses()}
                  disabled={!livekitStatus?.configured || busy === "livekit-egresses"}
                >
                  {busy === "livekit-egresses" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refresh
                </Button>
              </div>
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="livekit-rtmp-url" className="text-xs text-zinc-500">RTMP destination</Label>
                  <Input
                    id="livekit-rtmp-url"
                    value={livekitRtmpUrl}
                    onChange={(event) => setLivekitRtmpUrl(event.target.value)}
                    placeholder="rtmps://live.example.com/app/stream-key"
                    className="mt-2 border-zinc-700 bg-black text-white"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {(["grid", "speaker", "single-speaker"] as const).map((layout) => (
                    <Button
                      key={layout}
                      type="button"
                      variant={livekitEgressLayout === layout ? "secondary" : "outline"}
                      className="h-8 px-2 text-xs"
                      onClick={() => setLivekitEgressLayout(layout)}
                    >
                      {layout}
                    </Button>
                  ))}
                </div>
                <Button
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                  onClick={startLiveKitEgress}
                  disabled={!livekitStatus?.configured || !livekitRtmpUrl.trim() || busy === "livekit-egress-start"}
                >
                  {busy === "livekit-egress-start" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileVideo className="mr-2 h-4 w-4" />}
                  Start RTMP egress
                </Button>
              </div>
              {livekitEgressError && (
                <div className="mt-3 rounded border border-yellow-500/20 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-100">
                  {livekitEgressError}
                </div>
              )}
              {!livekitEgressError && livekitEgresses.length === 0 && (
                <div className="mt-3 rounded border border-zinc-800 bg-black/40 px-3 py-2 text-xs text-zinc-500">
                  No egress jobs loaded for this room.
                </div>
              )}
              {livekitEgresses.length > 0 && (
                <div className="mt-3 grid gap-2">
                  {livekitEgresses.map((egress) => (
                    <div key={egress.egressId || `${egress.roomName}-${egress.startedAt}`} className="rounded border border-zinc-800 bg-black/45 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-bold text-zinc-100">{egress.egressId || "egress"}</div>
                          <div className="mt-1 truncate text-xs text-zinc-500">{egress.roomName || livekitRoomName} · {egress.layout || "layout"}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline" className="border-emerald-400/30 text-emerald-200">
                            {String(egress.status ?? "unknown")}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-zinc-500 hover:text-red-300"
                            onClick={() => stopLiveKitEgress(egress.egressId)}
                            disabled={!egress.egressId || busy === `livekit-stop-${egress.egressId}`}
                            title="Stop egress"
                          >
                            {busy === `livekit-stop-${egress.egressId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PhoneOff className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-zinc-500">
                        {egress.error || (egress.startedAt ? `started ${new Date(Number(egress.startedAt) || egress.startedAt).toLocaleString()}` : "waiting for status")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

      {livekitSession && (
        <section className="mt-6 overflow-hidden rounded-lg border border-cyan-500/20 bg-black">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-500/20 px-4 py-3">
            <div>
              <div className="text-sm font-bold text-cyan-100">LiveKit Room: {livekitSession.roomName}</div>
              <div className="text-xs text-zinc-500">{livekitSession.participantName} · {livekitSession.role}</div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 text-zinc-300" onClick={() => setLivekitSession(null)}>
              <PhoneOff className="mr-2 h-4 w-4" />
              Leave
            </Button>
          </div>
          <LiveKitRoom
            serverUrl={livekitSession.url}
            token={livekitSession.token}
            connect
            audio={livekitSession.role === "host"}
            video={livekitSession.role === "host"}
            onDisconnected={() => setLivekitSession(null)}
            className="min-h-[28rem] bg-black"
          >
            <VideoConference />
          </LiveKitRoom>
        </section>
      )}

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
              <div
                key={video.uid}
                className={`rounded-md border bg-black/50 p-3 ${video.uid === activeInputId ? "border-cyan-400/50" : "border-zinc-800"}`}
              >
                <div className="aspect-video overflow-hidden rounded bg-zinc-900">
                  <img src={video.playback?.thumbnail || video.thumbnail} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-100">{video.meta?.name || video.uid}</div>
                    <div className="mt-1 text-xs text-zinc-500">{video.status?.state || "unknown"}</div>
                  </div>
                  {video.uid === activeInputId && (
                    <Badge variant="outline" className="shrink-0 border-cyan-400/30 text-cyan-200">active</Badge>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8"
                    onClick={() => selectStream(video.uid, video.playback)}
                    disabled={!video.uid}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Watch
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-cyan-200"
                    onClick={() => copyText(video.playback?.hls)}
                    disabled={!video.playback?.hls}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    HLS
                  </Button>
                </div>
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

function ProbeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-zinc-500">{label}</div>
      <div className="mt-1 truncate font-mono text-xs text-zinc-200">{value}</div>
    </div>
  );
}
