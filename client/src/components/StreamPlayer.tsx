import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Minus, Maximize2, Minimize2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STREAM_URL =
  'https://customer-oh7hxjdpro3mt496.cloudflarestream.com/5c8b99baa82a276adb69d5b4af205836/iframe';

export function StreamPlayer() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [pos, setPos] = useState({ x: 16, y: 16 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (fullscreen) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  }, [pos, fullscreen]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setPos({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full
          bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-900/40
          border border-red-400/30 transition-all duration-200 hover:scale-105 group"
        title="Open Live Stream"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
        </span>
        <Radio className="h-3.5 w-3.5" />
        LIVE
      </button>
    );
  }

  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-[200] bg-black flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 bg-black/80 border-b border-red-500/20">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-red-400 text-xs font-bold tracking-wider">LIVE STREAM</span>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60 hover:text-white"
              onClick={() => setFullscreen(false)}>
              <Minimize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-white/60 hover:text-red-400"
              onClick={() => { setFullscreen(false); setOpen(false); }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 relative">
          <iframe
            src={STREAM_URL}
            className="absolute inset-0 w-full h-full"
            style={{ border: 'none' }}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  const style: React.CSSProperties = minimized
    ? { right: 16, bottom: 80, left: 'auto', top: 'auto' }
    : { left: pos.x, top: pos.y };

  return (
    <div
      ref={containerRef}
      className="fixed z-[100] rounded-xl overflow-hidden border border-red-500/30 shadow-2xl shadow-black/60"
      style={{
        ...style,
        width: minimized ? 200 : 380,
        userSelect: 'none',
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-black border-b border-red-500/20 cursor-move select-none"
        onMouseDown={onMouseDown}
      >
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <Radio className="h-3 w-3 text-red-400" />
          <span className="text-red-400 text-[11px] font-bold tracking-wider">LIVE</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon"
            className="h-5 w-5 text-white/40 hover:text-white hover:bg-white/10"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setMinimized(v => !v)}
            title={minimized ? 'Expand' : 'Minimize'}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon"
            className="h-5 w-5 text-white/40 hover:text-white hover:bg-white/10"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => { setMinimized(false); setFullscreen(true); }}
            title="Fullscreen"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon"
            className="h-5 w-5 text-white/40 hover:text-red-400 hover:bg-red-900/20"
            onMouseDown={e => e.stopPropagation()}
            onClick={() => setOpen(false)}
            title="Close"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Video */}
      {!minimized && (
        <div className="relative bg-black" style={{ paddingTop: '56.25%' }}>
          <iframe
            src={STREAM_URL}
            style={{ border: 'none', position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
            allowFullScreen
          />
        </div>
      )}

      {minimized && (
        <div className="bg-black px-3 py-2 text-[10px] text-red-400/70">
          Stream paused — click expand to watch
        </div>
      )}
    </div>
  );
}
