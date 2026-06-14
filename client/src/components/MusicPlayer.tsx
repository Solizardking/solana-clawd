import { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Music2, ChevronDown, ChevronUp } from 'lucide-react';

const SONG_URL = 'https://pub-fd3c06f5fe864363a179a41dc47843bf.r2.dev/Solana%2BClawd%20(2).mp3';
const SONG_TITLE = 'Solana Clawd';
const SONG_ARTIST = 'CLAWD Terminal';
const BAR_COUNT = 28;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [muted, setMuted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bars, setBars] = useState(() => Array.from({ length: BAR_COUNT }, () => 0.15));
  const [hidden, setHidden] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = localStorage.getItem('clawd-music-hidden');
    return v === null ? true : v === '1';
  });
  useEffect(() => {
    try { localStorage.setItem('clawd-music-hidden', hidden ? '1' : '0'); } catch {}
  }, [hidden]);
  const animRef = useRef<number>();
  const barPhaseRef = useRef<number[]>(
    Array.from({ length: BAR_COUNT }, () => Math.random() * Math.PI * 2)
  );

  // Animate equalizer bars
  useEffect(() => {
    let t = 0;
    const animate = () => {
      t += 0.05;
      setBars(prev => prev.map((_, i) => {
        if (!playing) {
          return Math.max(0.05, prev[i] * 0.85 + 0.05 * 0.15);
        }
        const phase = barPhaseRef.current[i];
        const freq = 0.8 + (i / BAR_COUNT) * 1.8;
        const base = 0.18 + 0.12 * Math.sin(t * freq + phase);
        const spike = i % 5 === 0 ? 0.15 * Math.abs(Math.sin(t * 2.3 + phase)) : 0;
        return Math.min(1, base + spike + Math.random() * 0.08);
      }));
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [playing]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime);
    const onLoad = () => setDuration(audio.duration);
    const onEnd  = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onLoad);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onLoad);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      try {
        await audio.play();
        setPlaying(true);
      } catch {}
    }
  }, [playing]);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrent(ratio * duration);
  }, [duration]);

  const progress = duration ? current / duration : 0;

  // Color gradient per bar
  const barColor = (i: number, h: number) => {
    const t = i / BAR_COUNT;
    if (h > 0.75) return `hsl(${280 + t * 60},100%,65%)`;
    if (h > 0.45) return `hsl(${220 + t * 80},90%,60%)`;
    return `hsl(${190 + t * 60},70%,55%)`;
  };

  return (
    <>
      <audio ref={audioRef} src={SONG_URL} preload="metadata" />

      {/* Mini launcher pill — visible when player is hidden */}
      {hidden && (
        <button
          onClick={() => setHidden(false)}
          aria-label="Show music player"
          className="fixed bottom-3 right-3 z-[90] flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-purple-500/30 text-purple-300 hover:text-white hover:border-purple-400/60 transition-all shadow-lg"
          style={{ boxShadow: playing ? '0 0 12px #a855f750' : 'none' }}
        >
          <Music2 className={`w-3.5 h-3.5 ${playing ? 'animate-pulse' : ''}`} />
          <ChevronUp className="w-3 h-3" />
        </button>
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-[90] select-none transition-transform duration-300 ${hidden ? 'translate-y-full pointer-events-none' : 'translate-y-0'}`}
        style={{ height: 72 }}
      >
        {/* Blurred backdrop */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl border-t border-purple-500/20" />

        {/* Subtle glow line */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #a855f7 30%, #6366f1 60%, transparent)' }}
        />

        <div className="relative flex items-center h-full px-4 gap-4">

          {/* Song info */}
          <div className="flex items-center gap-2.5 min-w-0 w-44 shrink-0">
            <div className={`flex items-center justify-center w-9 h-9 rounded-lg bg-purple-900/50 border border-purple-500/30 shrink-0 ${playing ? 'animate-pulse' : ''}`}>
              <Music2 className="w-4 h-4 text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-bold truncate leading-tight">{SONG_TITLE}</p>
              <p className="text-purple-400/70 text-[10px] truncate leading-tight">{SONG_ARTIST}</p>
            </div>
          </div>

          {/* Equalizer bars */}
          <div className="flex items-end gap-[2px] h-9 shrink-0">
            {bars.map((h, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: `${Math.max(8, h * 36)}px`,
                  background: barColor(i, h),
                  borderRadius: 2,
                  transition: playing ? 'height 80ms ease' : 'height 200ms ease',
                  opacity: playing ? 0.9 + h * 0.1 : 0.3,
                  boxShadow: playing && h > 0.6 ? `0 0 4px ${barColor(i, h)}88` : 'none',
                }}
              />
            ))}
          </div>

          {/* Controls + progress — center */}
          <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
            {/* Play / Pause */}
            <div className="flex items-center justify-center">
              <button
                onClick={togglePlay}
                className="flex items-center justify-center w-9 h-9 rounded-full border border-purple-500/40 bg-purple-600/20 hover:bg-purple-600/40 hover:border-purple-400/60 transition-all duration-150 hover:scale-110 active:scale-95 text-white"
                style={{ boxShadow: playing ? '0 0 12px #a855f750' : 'none' }}
              >
                {playing
                  ? <Pause className="w-4 h-4 fill-white" />
                  : <Play  className="w-4 h-4 fill-white ml-0.5" />
                }
              </button>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2 w-full">
              <span className="text-[9px] text-white/40 w-6 text-right shrink-0">{fmt(current)}</span>
              <div
                ref={progressRef}
                onClick={seek}
                className="flex-1 h-1 rounded-full bg-white/10 cursor-pointer relative overflow-hidden group"
              >
                <div
                  className="absolute left-0 top-0 h-full rounded-full transition-all duration-100"
                  style={{
                    width: `${progress * 100}%`,
                    background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                    boxShadow: '0 0 8px #a855f760',
                  }}
                />
                {/* Scrubber dot */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress * 100}% - 5px)` }}
                />
              </div>
              <span className="text-[9px] text-white/40 w-6 shrink-0">{fmt(duration)}</span>
            </div>
          </div>

          {/* Volume */}
          <div className="flex items-center gap-2 shrink-0 w-32">
            <button
              onClick={() => setMuted(v => !v)}
              className="text-white/50 hover:text-white transition-colors"
            >
              {muted || volume === 0
                ? <VolumeX className="w-4 h-4" />
                : <Volume2 className="w-4 h-4" />
              }
            </button>
            {/* Volume slider */}
            <div className="relative flex-1 h-1 rounded-full bg-white/10 cursor-pointer group"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const v = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                setVolume(v);
                setMuted(false);
              }}
            >
              <div
                className="absolute left-0 top-0 h-full rounded-full"
                style={{
                  width: `${(muted ? 0 : volume) * 100}%`,
                  background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${(muted ? 0 : volume) * 100}% - 5px)` }}
              />
            </div>
            {/* Volume knob display */}
            <VolumeKnob value={muted ? 0 : volume} onChange={(v) => { setVolume(v); setMuted(false); }} />
          </div>

          {/* Hide button */}
          <button
            onClick={() => setHidden(true)}
            aria-label="Hide music player"
            className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            title="Hide player"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Spacer so content doesn't hide behind player (only when visible) */}
      {!hidden && <div style={{ height: 72 }} />}
    </>
  );
}

// ── Rotary volume knob ────────────────────────────────────────────────────────

function VolumeKnob({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const delta = (startY.current - e.clientY) / 100;
      onChange(Math.max(0, Math.min(1, startVal.current + delta)));
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onChange]);

  const angle = -135 + value * 270; // -135° to +135°

  return (
    <div
      onMouseDown={onMouseDown}
      className="cursor-ns-resize shrink-0"
      title="Drag to adjust volume"
      style={{ width: 28, height: 28, position: 'relative' }}
    >
      {/* Outer ring */}
      <svg width="28" height="28" viewBox="0 0 28 28">
        {/* Track arc */}
        <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
        {/* Fill arc — approximate with stroke-dasharray */}
        <circle
          cx="14" cy="14" r="11"
          fill="none"
          stroke="url(#knobGrad)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${value * 56} 100`}
          transform="rotate(-225 14 14)"
        />
        <defs>
          <linearGradient id="knobGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
      </svg>
      {/* Indicator dot */}
      <div
        className="absolute rounded-full bg-white"
        style={{
          width: 3, height: 3,
          top: '50%', left: '50%',
          transformOrigin: '0 0',
          transform: `rotate(${angle}deg) translate(8px, -1.5px)`,
          boxShadow: '0 0 4px #a855f7',
        }}
      />
    </div>
  );
}
