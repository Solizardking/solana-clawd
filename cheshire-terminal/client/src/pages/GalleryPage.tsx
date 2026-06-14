import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Image, Video, Bot, RefreshCw, ExternalLink, Wifi, WifiOff, MessageCircle } from 'lucide-react';
import { getWsUrl } from '@/lib/websocket';

interface GalleryItem {
  id: string;
  type: 'image' | 'video' | 'agent';
  title: string;
  prompt?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  bucketKey?: string;
  thumbnail?: string;
  creator?: string;
  model?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function mergeGalleryItems(...groups: GalleryItem[][]) {
  const itemsById = new Map<string, GalleryItem>();
  for (const group of groups) {
    for (const item of group) {
      itemsById.set(item.id, item);
    }
  }
  return Array.from(itemsById.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function isTelegramItem(item: GalleryItem) {
  return item.metadata?.source === 'telegram' || item.creator?.startsWith('telegram:');
}

function MediaCard({ item, isNew }: { item: GalleryItem; isNew: boolean }) {
  const [imgError, setImgError] = useState(false);
  const url = item.mediaUrl || item.sourceUrl || item.thumbnail || '';
  const fromTelegram = isTelegramItem(item);

  return (
    <div
      className={`rounded-xl overflow-hidden border border-purple-500/20 bg-black/40 backdrop-blur-sm
        transition-all duration-700 hover:border-purple-400/50 hover:shadow-lg hover:shadow-purple-900/20 group
        ${isNew ? 'animate-in fade-in slide-in-from-bottom-4 duration-700' : ''}
        ${fromTelegram ? 'ring-1 ring-sky-400/25' : ''}`}
    >
      {item.type === 'video' ? (
        <div className="relative aspect-video bg-black/60">
          <video
            src={url}
            className="w-full h-full object-cover"
            controls
            preload="metadata"
            poster={item.thumbnail}
          />
          <div className="absolute top-2 left-2">
            <Badge className="bg-blue-900/80 text-blue-300 border-blue-700/50 text-[10px]">
              <Video className="h-3 w-3 mr-1" /> VIDEO
            </Badge>
          </div>
        </div>
      ) : item.type === 'agent' ? (
        <div className="aspect-square bg-gradient-to-br from-purple-900/40 to-blue-900/40 flex flex-col items-center justify-center p-6 relative">
          <Bot className="h-16 w-16 text-purple-400 mb-3" />
          <p className="text-purple-200 font-bold text-center text-sm">{item.title}</p>
          {item.metadata?.type && (
            <Badge className="mt-2 bg-purple-800/60 text-purple-200 border-purple-600/40 text-[10px]">
              {item.metadata.type}
            </Badge>
          )}
          <div className="absolute top-2 left-2">
            <Badge className="bg-purple-900/80 text-purple-300 border-purple-700/50 text-[10px]">
              <Bot className="h-3 w-3 mr-1" /> AGENT
            </Badge>
          </div>
        </div>
      ) : imgError ? (
        <div className="aspect-square bg-black/60 flex items-center justify-center">
          <Image className="h-10 w-10 text-purple-500/40" />
        </div>
      ) : (
        <div className="relative aspect-square bg-black/60 overflow-hidden">
          <img
            src={url}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
            loading="lazy"
          />
          <div className="absolute top-2 left-2">
            <Badge className="bg-green-900/80 text-green-300 border-green-700/50 text-[10px]">
              <Image className="h-3 w-3 mr-1" /> IMAGE
            </Badge>
          </div>
          {fromTelegram && (
            <div className="absolute top-2 right-2">
              <Badge className="bg-sky-950/85 text-sky-200 border-sky-500/40 text-[10px]">
                <MessageCircle className="h-3 w-3 mr-1" /> TELEGRAM
              </Badge>
            </div>
          )}
        </div>
      )}

      <div className="p-3 space-y-1">
        <p className="text-white/90 text-sm font-medium leading-tight line-clamp-2">{item.title}</p>
        {item.prompt && item.prompt !== item.title && (
          <p className="text-purple-300/60 text-xs line-clamp-1">{item.prompt}</p>
        )}
        <div className="flex items-center justify-between pt-1">
          <span className="text-purple-400/50 text-[10px]">{timeAgo(item.createdAt)}</span>
          <div className="flex items-center gap-1">
            {item.model && (
              <span className="text-purple-400/40 text-[10px] truncate max-w-[80px]">{item.model}</span>
            )}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3 text-purple-400/40 hover:text-purple-300 transition-colors" />
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const [filter, setFilter] = useState<'all' | 'image' | 'video' | 'agent'>('all');
  const [liveItems, setLiveItems] = useState<GalleryItem[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const { data, isLoading, refetch } = useQuery<{ items: GalleryItem[] }>({
    queryKey: ['/api/gallery'],
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data?.items) {
      setLiveItems(prev => mergeGalleryItems(prev, data.items));
    }
  }, [data]);

  const connectWS = useCallback(() => {
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return wsRef.current;
    }

    const ws = new WebSocket(getWsUrl('/ws'));
    wsRef.current = ws;

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => {
      setWsConnected(false);
      if (!mountedRef.current) return;
      reconnectTimerRef.current = setTimeout(connectWS, 3000);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'gallery_item_added' && msg.item) {
          const item: GalleryItem = msg.item;
          setLiveItems(prev => mergeGalleryItems(prev, [item]));
          setNewIds(prev => new Set([...prev, item.id]));
          setTimeout(() => setNewIds(prev => {
            const n = new Set(prev);
            n.delete(item.id);
            return n;
          }), 2000);
        }
      } catch {}
    };

    return ws;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const ws = connectWS();
    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current = null;
      ws?.close();
    };
  }, [connectWS]);

  const filtered = liveItems.filter(i => filter === 'all' || i.type === filter);

  const counts = {
    all: liveItems.length,
    image: liveItems.filter(i => i.type === 'image').length,
    video: liveItems.filter(i => i.type === 'video').length,
    agent: liveItems.filter(i => i.type === 'agent').length,
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 text-transparent bg-clip-text">
            Media Gallery
          </h1>
          <p className="text-purple-400/60 text-sm mt-0.5">All generated images, videos & agents — streamed live</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border ${
            wsConnected
              ? 'border-green-500/30 text-green-400 bg-green-900/10'
              : 'border-red-500/30 text-red-400 bg-red-900/10'
          }`}>
            {wsConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {wsConnected ? 'Live' : 'Reconnecting'}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}
            className="border-purple-500/30 text-purple-300 hover:bg-purple-900/20">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
        <TabsList className="bg-black/40 border border-purple-500/20">
          <TabsTrigger value="all" className="data-[state=active]:bg-purple-900/60 data-[state=active]:text-purple-200">
            All <Badge className="ml-1.5 bg-purple-800/40 text-purple-300 text-[10px] px-1.5">{counts.all}</Badge>
          </TabsTrigger>
          <TabsTrigger value="image" className="data-[state=active]:bg-green-900/40 data-[state=active]:text-green-200">
            <Image className="h-3.5 w-3.5 mr-1" />
            Images <Badge className="ml-1.5 bg-green-800/40 text-green-300 text-[10px] px-1.5">{counts.image}</Badge>
          </TabsTrigger>
          <TabsTrigger value="video" className="data-[state=active]:bg-blue-900/40 data-[state=active]:text-blue-200">
            <Video className="h-3.5 w-3.5 mr-1" />
            Videos <Badge className="ml-1.5 bg-blue-800/40 text-blue-300 text-[10px] px-1.5">{counts.video}</Badge>
          </TabsTrigger>
          <TabsTrigger value="agent" className="data-[state=active]:bg-purple-900/40 data-[state=active]:text-purple-200">
            <Bot className="h-3.5 w-3.5 mr-1" />
            Agents <Badge className="ml-1.5 bg-purple-800/40 text-purple-300 text-[10px] px-1.5">{counts.agent}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-purple-500/10">
              <Skeleton className="aspect-square w-full bg-purple-900/10" />
              <div className="p-3 space-y-2">
                <Skeleton className="h-3 w-3/4 bg-purple-900/10" />
                <Skeleton className="h-2 w-1/2 bg-purple-900/10" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-purple-900/20 border border-purple-500/20 flex items-center justify-center mb-4">
            {filter === 'video' ? <Video className="h-7 w-7 text-purple-400/50" />
              : filter === 'agent' ? <Bot className="h-7 w-7 text-purple-400/50" />
              : <Image className="h-7 w-7 text-purple-400/50" />}
          </div>
          <p className="text-purple-300/60 font-medium">No {filter === 'all' ? 'items' : filter + 's'} yet</p>
          <p className="text-purple-400/40 text-sm mt-1">Generate content and it will appear here in real-time</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(item => (
            <MediaCard key={item.id} item={item} isNew={newIds.has(item.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
