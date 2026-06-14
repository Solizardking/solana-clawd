/**
 * RealtimeArtFeed — live grid of generated art + video.
 *
 * Backed by Replit Object Storage on the server side. New items arrive
 * via the existing /ws WebSocket as `gallery_item_added` events
 * (broadcast by xAI image/video gen + FAL + NFT studio + Nvidia + agents).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getWsUrl } from "@/lib/websocket";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Image as ImageIcon,
  Video,
  Bot,
  Wifi,
  WifiOff,
  Sparkles,
  ExternalLink,
} from "lucide-react";

export interface FeedItem {
  id: string;
  type: "image" | "video" | "agent";
  title: string;
  prompt?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  thumbnail?: string;
  creator?: string;
  model?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function FeedCard({ item, isNew }: { item: FeedItem; isNew: boolean }) {
  const url = item.mediaUrl || item.sourceUrl || item.thumbnail || "";
  const mode = item.metadata?.mode as string | undefined;

  return (
    <div
      className={`relative rounded-xl overflow-hidden border bg-black/40 backdrop-blur-sm transition-all
        ${isNew ? "border-orange-400/70 shadow-lg shadow-orange-900/30 animate-in fade-in slide-in-from-bottom-3 duration-700" : "border-purple-500/20 hover:border-purple-400/50"}`}
      data-testid={`feed-item-${item.id}`}
    >
      {item.type === "video" ? (
        <video
          src={url}
          className="w-full aspect-video object-cover bg-black"
          controls
          loop
          preload="metadata"
          poster={item.thumbnail}
        />
      ) : item.type === "agent" ? (
        <div className="aspect-square bg-gradient-to-br from-purple-900/50 to-blue-900/40 flex flex-col items-center justify-center p-4">
          <Bot className="h-12 w-12 text-purple-300 mb-2" />
          <p className="text-purple-100 text-sm font-bold text-center line-clamp-2">{item.title}</p>
        </div>
      ) : (
        <img
          src={url}
          alt={item.title}
          loading="lazy"
          className="w-full aspect-square object-cover"
          onError={(e) => ((e.target as HTMLImageElement).style.opacity = "0.2")}
        />
      )}

      {isNew && (
        <Badge className="absolute top-2 right-2 bg-orange-500/90 text-white border-0 animate-pulse">
          <Sparkles className="h-3 w-3 mr-1" /> NEW
        </Badge>
      )}

      <div className="absolute top-2 left-2 flex gap-1">
        <Badge className="text-[10px] bg-black/70 border-purple-400/40 text-purple-200 backdrop-blur-sm">
          {item.type === "video" ? <Video className="h-3 w-3 mr-1" /> : item.type === "agent" ? <Bot className="h-3 w-3 mr-1" /> : <ImageIcon className="h-3 w-3 mr-1" />}
          {item.type.toUpperCase()}
        </Badge>
        {mode && (
          <Badge className="text-[10px] bg-black/70 border-orange-400/40 text-orange-200 backdrop-blur-sm">
            {mode}
          </Badge>
        )}
      </div>

      <div className="p-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
        <p className="text-xs text-purple-100 line-clamp-2 leading-snug">{item.title}</p>
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-purple-400/70">
          <span className="truncate">{item.model || "—"}</span>
          <span>{timeAgo(item.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

interface Props {
  /** "compact" = sidebar strip; "full" = grid page */
  variant?: "full" | "compact";
  limit?: number;
  filter?: "all" | "image" | "video";
}

export function RealtimeArtFeed({ variant = "full", limit = 24, filter: initFilter = "all" }: Props) {
  const [filter, setFilter] = useState<"all" | "image" | "video">(initFilter);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [wsConnected, setWsConnected] = useState(false);
  const liveItemsRef = useRef<FeedItem[]>([]);
  const [, setBump] = useState(0);

  const { data, isLoading, refetch } = useQuery<{ success: boolean; items: FeedItem[] }>({
    queryKey: ["/api/gallery"],
    staleTime: 30_000,
  });

  // Merge live items pushed via WebSocket on top of REST items
  useEffect(() => {
    if (data?.items) {
      const knownIds = new Set(liveItemsRef.current.map((i) => i.id));
      // dedupe REST items against live (keep live versions which are most recent)
      const merged = [
        ...liveItemsRef.current,
        ...data.items.filter((i) => !knownIds.has(i.id)),
      ];
      liveItemsRef.current = merged;
      setBump((b) => b + 1);
    }
  }, [data]);

  useEffect(() => {
    const ws = new WebSocket(getWsUrl('/ws'));
    let pingTimer: any;

    ws.onopen = () => {
      setWsConnected(true);
      pingTimer = setInterval(() => {
        try { ws.send(JSON.stringify({ type: "ping", timestamp: new Date().toISOString() })); } catch {}
      }, 30000);
    };
    ws.onclose = () => { setWsConnected(false); clearInterval(pingTimer); };
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "gallery_item_added" && msg.item) {
          const item = msg.item as FeedItem;
          // dedupe
          if (liveItemsRef.current.some((i) => i.id === item.id)) return;
          liveItemsRef.current = [item, ...liveItemsRef.current];
          setNewIds((prev) => new Set([...Array.from(prev), item.id]));
          setBump((b) => b + 1);
          // expire NEW badge after 8s
          setTimeout(() => {
            setNewIds((prev) => {
              const n = new Set(prev);
              n.delete(item.id);
              return n;
            });
          }, 8000);
        }
      } catch {}
    };

    return () => {
      clearInterval(pingTimer);
      try { ws.close(); } catch {}
    };
  }, []);

  const items = useMemo(() => {
    return liveItemsRef.current
      .filter((i) => (filter === "all" ? true : i.type === filter))
      .slice(0, limit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, limit, liveItemsRef.current.length, newIds]);

  if (variant === "compact") {
    return (
      <div className="border border-purple-500/20 bg-black/40 backdrop-blur-sm rounded-xl p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-bold text-purple-200">
            <Sparkles className="h-4 w-4 text-orange-400" />
            <span>Realtime Art Feed</span>
          </div>
          <Badge variant="outline" className={`text-[10px] gap-1 ${wsConnected ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"}`}>
            {wsConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {wsConnected ? "LIVE" : "off"}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square bg-purple-900/20" />)
            : items.slice(0, 6).map((it) => <FeedCard key={it.id} item={it} isNew={newIds.has(it.id)} />)}
          {!isLoading && items.length === 0 && (
            <p className="col-span-3 text-xs text-purple-400/60 text-center py-4">
              No art yet. Generate with Grok Imagine to see it appear here live.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card className="border-purple-500/30 bg-black/40 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-purple-200">
          <Sparkles className="h-5 w-5 text-orange-400" />
          Realtime Art & Video Feed
          <Badge variant="outline" className={`text-[10px] gap-1 ml-2 ${wsConnected ? "border-green-500/40 text-green-400" : "border-red-500/40 text-red-400"}`}>
            {wsConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {wsConnected ? "LIVE STREAM" : "RECONNECTING"}
          </Badge>
        </CardTitle>
        <div className="flex gap-1">
          {(["all", "image", "video"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => setFilter(f)}
              data-testid={`button-filter-${f}`}
            >
              {f}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-7 px-2 text-xs">
            <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {isLoading && items.length === 0
            ? Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square bg-purple-900/20 rounded-xl" />)
            : items.map((it) => <FeedCard key={it.id} item={it} isNew={newIds.has(it.id)} />)}
        </div>
        {!isLoading && items.length === 0 && (
          <p className="text-sm text-purple-400/60 text-center py-12">
            No items yet. Generate art on the Grok page or NFT Studio to populate the feed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default RealtimeArtFeed;
