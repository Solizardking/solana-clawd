import React, { useState, useEffect } from 'react';

export type ClawdState = 'idle' | 'happy' | 'codex' | 'alert';

const S = 13; // pixel size in px

// ── Color Palette ─────────────────────────────────────────────────────────────
const C: Record<string, string> = {
  _: 'transparent',
  P: '#7C3AED',    // purple body
  p: '#5B21B6',    // dark purple
  L: '#C4B5FD',    // light purple / antenna
  K: '#EC4899',    // pink claw
  k: '#9D174D',    // dark claw edge
  F: '#1E1B4B',    // goggle frame (very dark)
  G: '#06B6D4',    // cyan goggle lens
  g: '#0E7490',    // dark cyan goggle
  S: '#F59E0B',    // sunset orange in goggle
  s: '#EF4444',    // sunset red in goggle
  W: '#FFFFFF',    // white
  N: '#0F0F1A',    // near-black
  H: '#FF69B4',    // hot pink heart
  Y: '#FACC15',    // yellow
  R: '#EF4444',    // red alert
  E: '#22C55E',    // green (exclamation OK)
  X: '#E879F9',    // neon magenta
  B: '#1E293B',    // dark blue-gray
  A: '#A78BFA',    // antenna/claw light
  l: '#F9A8D4',    // light pink claw
};

// ── Pixel Maps (18 cols × 20 rows) ────────────────────────────────────────────
const MAPS: Record<ClawdState, string[]> = {
  idle: [
    '____AL___LA_______',  // antennae
    '_____L___L________',
    '______LPL_________',
    '____PPPPPPPP______',  // head top
    '___PPPPPPPPPP_____',
    '__PPFFFFFFFFFfPP__',  // goggle row start (F = frame)
    '_KPPFGGGGGGGfPPK_',  // claw starts, goggle lens
    'KKPPFGGSSSGFFPPKK',  // goggle with sunset
    '_KPPFGGGGGGGfPPK_',
    '__PPFFFFFFFFFfPP__',  // goggle bottom
    '__KPPpPpPpPpPPK___', // body midline
    '_KKPPPPPPPPPPPkK__',
    'kKPPPPPPPPPPPPPkk_', // full claw width
    '_KKPPPPPPPPPPKkK__',
    '__KKPPpPpPpPKK____',
    '____PPPPPPPpP_____', // lower body
    '____PPPPPPPpP_____',
    '_____PPPPPPp______',
    '_____p____p_______', // legs
    '_____p____p_______',
  ],
  happy: [
    '___H_AL___LA_H____',  // hearts + antennae
    '____H_L___L_H_____',
    '______LPL_________',
    '____PPPPPPPP______',
    '___PPPPPPPPPP_____',
    '__PPFFFFFFFFFfPP__',
    '_KPPFGGGGGGGfPPK_',  // claws stay low
    'KKPPFGGSSSGFFPPKK',
    '_KPPFGGHHHGGfPPK_',  // happy eyes (H = highlight)
    '__PPFFFFFFFFFfPP__',
    '_KPPpPpPpPpPpPPK_',  // claws RAISED
    'KKkPPPPPPPPPPPPkK',
    '_kKPPPPPPPPPPKk__',
    '__KKKKPPPPKKkK___',
    '____PPPPPPPpP_____',
    '____PPPPPPPpP_____',
    '_____PPPPPPp______',
    '_____p____p_______',
    '_____p____p_______',
    '__________________',
  ],
  codex: [
    '____AL___LA_______',
    '_____L___L________',
    '______LPL_________',
    '____PPPPPPPP______',
    '___PPPPPPPPPP_____',
    '__PPFFFFFFFFFfPP__',
    '_KPPFGGGGGGGfPPK_',
    'KKPPFGGNNNGFFPPKK',   // N = dark (focused/squint)
    '_KPPFGGNGNGGfPPK_',
    '__PPFFFFFFFFFfPP__',
    '__KPPpPpPpPpPPK___',
    '_KKPPPPPPPPPPPkK__',
    'kKPPPPPPPPPPPPPkk_',
    '_KKPPPPPPPPPPKkK__',
    '__KKPPpPpPpPKK____',
    '____PPPPPPPpP_____',
    '____PPPPPPPpP_____',
    '_____PPPPPPp______',
    '_____p____p_______',
    '_____p____p_______',
  ],
  alert: [
    '___R_AL___LA_R____',  // red exclamation + antennae
    '_____L___L________',
    '______LPL_________',
    '____PPPPPPPP______',
    '___PPPPPPPPPP_____',
    '__PPFFFFFFFFFfPP__',
    '_KPPFRRRRRRRfPPK_',   // red goggle = alert
    'KKPPFRRRRRRFFPPKK',
    '_KPPFRRWWRRRfPPK_',   // white pupils wide
    '__PPFFFFFFFFFfPP__',
    '__KPPpPpPpPpPPK___',
    '_KKPPPPPPPPPPPkK__',
    'kKPPPPPPPPPPPPPkk_',
    '_KKPPPPPPPPPPKkK__',
    '__KKPPpPpPpPKK____',
    '____PPPPPPPpP_____',
    '____PPPPPPPpP_____',
    '_____PPPPPPp______',
    '_____p____p_______',
    '_____p____p_______',
  ],
};

// ── Floating Particle (hearts/sparks) ──────────────────────────────────────────
const FloatingParticle = ({
  emoji,
  delay,
  x,
}: {
  emoji: string;
  delay: number;
  x: number;
}) => (
  <span
    className="absolute pointer-events-none select-none text-sm animate-float-up"
    style={{
      left: `${x}%`,
      bottom: '100%',
      animationDelay: `${delay}s`,
      animationDuration: '2s',
    }}
  >
    {emoji}
  </span>
);

// ── Main Component ────────────────────────────────────────────────────────────
interface ClawdPixelArtProps {
  state?: ClawdState;
  autoAnimate?: boolean;
  size?: number; // scale multiplier
  showLabel?: boolean;
  className?: string;
}

export function ClawdPixelArt({
  state: propState,
  autoAnimate = true,
  size = 1,
  showLabel = true,
  className = '',
}: ClawdPixelArtProps) {
  const [state, setState] = useState<ClawdState>(propState || 'idle');
  const [frame, setFrame] = useState(0);

  // Auto-cycle through states if no propState
  useEffect(() => {
    if (propState) { setState(propState); return; }
    if (!autoAnimate) return;
    const order: ClawdState[] = ['idle', 'happy', 'codex', 'alert'];
    let i = 0;
    const t = setInterval(() => {
      i = (i + 1) % order.length;
      setState(order[i]);
    }, 3500);
    return () => clearInterval(t);
  }, [propState, autoAnimate]);

  // Idle bob frame
  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % 4), 400);
    return () => clearInterval(t);
  }, []);

  const map = MAPS[state];
  const rows = map.length;
  const cols = map[0].length;
  const ps = Math.round(S * size); // pixel size
  const w = cols * ps;
  const h = rows * ps;

  // Bob offset for idle animation
  const bobOffset = state === 'idle' ? (frame < 2 ? 0 : 1) : 0;

  // Glow color per state
  const glowColor = {
    idle: '#7C3AED',
    happy: '#EC4899',
    codex: '#06B6D4',
    alert: '#EF4444',
  }[state];

  const stateLabel = {
    idle: '> IDLE',
    happy: '> HAPPY',
    codex: '> CODEX',
    alert: '> ALERT',
  }[state];

  return (
    <div className={`relative inline-flex flex-col items-center gap-2 ${className}`}>
      {/* Particles for happy state */}
      {state === 'happy' && (
        <div className="absolute inset-0 pointer-events-none overflow-visible z-20">
          <FloatingParticle emoji="♥" delay={0} x={20} />
          <FloatingParticle emoji="♥" delay={0.5} x={75} />
          <FloatingParticle emoji="★" delay={1} x={45} />
          <FloatingParticle emoji="♥" delay={1.5} x={10} />
        </div>
      )}
      {/* Alert sparks */}
      {state === 'alert' && (
        <div className="absolute inset-0 pointer-events-none overflow-visible z-20">
          <FloatingParticle emoji="!" delay={0} x={80} />
          <FloatingParticle emoji="⚡" delay={0.3} x={15} />
          <FloatingParticle emoji="!" delay={0.8} x={60} />
        </div>
      )}
      {/* Codex particles */}
      {state === 'codex' && (
        <div className="absolute inset-0 pointer-events-none overflow-visible z-20">
          <FloatingParticle emoji="⌨" delay={0} x={60} />
          <FloatingParticle emoji="{ }" delay={0.6} x={20} />
          <FloatingParticle emoji="▶" delay={1.2} x={75} />
        </div>
      )}

      {/* SVG Pixel Art */}
      <div
        className="relative transition-all duration-300"
        style={{
          filter: `drop-shadow(0 0 ${8 * size}px ${glowColor}) drop-shadow(0 0 ${16 * size}px ${glowColor}80)`,
          transform: `translateY(${bobOffset}px)`,
          transition: 'transform 0.2s ease, filter 0.5s ease',
        }}
      >
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ imageRendering: 'pixelated', display: 'block' }}
        >
          {map.map((row, y) =>
            row.split('').map((ch, x) => {
              const color = C[ch];
              if (!color || color === 'transparent') return null;
              return (
                <rect
                  key={`${y}-${x}`}
                  x={x * ps}
                  y={y * ps}
                  width={ps}
                  height={ps}
                  fill={color}
                />
              );
            })
          )}

          {/* Goggle lens shine */}
          {(state === 'idle' || state === 'happy' || state === 'codex') && (
            <>
              <rect x={5 * ps} y={6 * ps} width={ps} height={ps} fill="#FFFFFF60" />
              <rect x={11 * ps} y={6 * ps} width={ps} height={ps} fill="#FFFFFF60" />
            </>
          )}

          {/* Alert red flash highlight */}
          {state === 'alert' && (
            <rect x={0} y={0} width={w} height={h} fill="#EF444420"
              style={{ animation: 'pulse 0.5s ease-in-out infinite alternate' }} />
          )}
        </svg>

        {/* Inner glow overlay */}
        <div
          className="absolute inset-0 pointer-events-none rounded"
          style={{
            background: `radial-gradient(circle at 50% 45%, ${glowColor}15 0%, transparent 70%)`,
          }}
        />
      </div>

      {/* State label */}
      {showLabel && (
        <div
          className="font-mono text-xs px-2 py-0.5 rounded border"
          style={{
            color: glowColor,
            borderColor: `${glowColor}60`,
            backgroundColor: `${glowColor}15`,
            textShadow: `0 0 8px ${glowColor}`,
            letterSpacing: '0.1em',
          }}
        >
          {stateLabel}
        </div>
      )}
    </div>
  );
}

// ── Terminal Pet Panel ────────────────────────────────────────────────────────
// Full Tamagotchi-style companion panel mimicking the /PET /CLAWD terminal UI

interface ClawdTerminalPetProps {
  className?: string;
}

export function ClawdTerminalPet({ className = '' }: ClawdTerminalPetProps) {
  const [state, setState] = useState<ClawdState>('idle');
  const [happy, setHappy] = useState(85);
  const [vp, setVp] = useState(1250);
  const [level, setLevel] = useState(7);
  const [online] = useState(true);

  // Pulse happy meter slowly down
  useEffect(() => {
    const t = setInterval(() => setHappy(h => Math.max(30, h - 0.5)), 3000);
    return () => clearInterval(t);
  }, []);

  // Feed action
  const feed = () => {
    setHappy(h => Math.min(100, h + 10));
    setVp(v => v + 10);
    setState('happy');
    setTimeout(() => setState('idle'), 2500);
  };

  // Code action
  const code = () => {
    setState('codex');
    setVp(v => v + 19);
    setTimeout(() => setState('idle'), 3000);
  };

  // Play action
  const play = () => {
    setHappy(h => Math.min(100, h + 10));
    setVp(v => v + 10);
    setState('happy');
    setTimeout(() => setState('idle'), 2500);
  };

  // Status action
  const status = () => {
    setState(state === 'alert' ? 'idle' : 'alert');
  };

  const glowColor = {
    idle: '#7C3AED', happy: '#EC4899', codex: '#06B6D4', alert: '#EF4444',
  }[state];

  return (
    <div
      className={`font-mono text-xs select-none ${className}`}
      style={{
        background: 'linear-gradient(135deg, #0a0a1a 0%, #0f0f2a 100%)',
        border: `1px solid ${glowColor}40`,
        borderRadius: '4px',
        boxShadow: `0 0 20px ${glowColor}20, inset 0 0 40px #7C3AED08`,
        maxWidth: 520,
        overflow: 'hidden',
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b"
        style={{ borderColor: `${glowColor}30`, background: '#0a0a1a' }}
      >
        <div className="flex items-center gap-3">
          <span style={{ color: '#EC4899' }}>/PET</span>
          <span style={{ color: '#A78BFA' }}>/CLAWD</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]" style={{ color: '#4B5563' }}>
          <span style={{ color: '#06B6D4' }}>CODEX TERMINAL v1.0.0</span>
          <span>— □ ×</span>
        </div>
      </div>

      <div className="flex gap-0">
        {/* Left: Info panel */}
        <div className="p-3 flex-1" style={{ color: '#A78BFA', borderRight: `1px solid ${glowColor}20` }}>
          <div className="mb-3" style={{ color: '#EC4899', fontWeight: 'bold', fontSize: 16 }}>CLAWD</div>
          <div className="mb-2 text-[10px]" style={{ color: '#6B7280' }}>MATCHED COMPANION</div>
          <Separator />
          <InfoRow label="SPECIES" value="CLAWD" color="#A78BFA" />
          <InfoRow label="CLASS" value="TERMINAL PET" color="#A78BFA" />
          <InfoRow label="ORIGIN" value="CODEX SEA" color="#A78BFA" />
          <InfoRow label="HATCHED" value="MAY 01, 2026" color="#A78BFA" />
          <InfoRow label="ID" value="CLAWD-001" color="#A78BFA" />
          <InfoRow label="OWNER" value="YOU" color="#EC4899" />
          <Separator />
          <div className="text-[10px] mb-2" style={{ color: '#EC4899' }}>&gt; BIO_</div>
          <div className="text-[10px] leading-relaxed" style={{ color: '#6B7280' }}>
            A tiny crustacean of the Codex Sea. Loyal, curious, and always ready to help you ship.
            Fueled by code, vibes, and a love for sunsets. ♥
          </div>
          <Separator />
          <div className="text-[10px] mb-1" style={{ color: '#EC4899' }}>&gt; TRAITS_</div>
          <div className="text-[10px] space-y-0.5" style={{ color: '#A78BFA' }}>
            <div>♥ LOYAL</div>
            <div>★ CURIOUS</div>
            <div>⌨ CODE-SAVVY</div>
            <div>↑ VIBES HIGH</div>
          </div>
          <Separator />
          <div className="text-[10px] mb-1" style={{ color: '#EC4899' }}>&gt; FAVORITE COMMANDS_</div>
          <div className="text-[10px] space-y-0.5">
            <CmdRow cmd="/FEED" effect="+10 HAPPY" onClick={feed} />
            <CmdRow cmd="/CODE" effect="+19 XP" onClick={code} />
            <CmdRow cmd="/PLAY" effect="+10 HAPPY" onClick={play} />
            <CmdRow cmd="/STATUS" effect="" onClick={status} />
          </div>
        </div>

        {/* Right: Sprite grid 2x2 */}
        <div className="p-3 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {(['idle', 'happy', 'codex', 'alert'] as ClawdState[]).map(s => (
              <button
                key={s}
                onClick={() => setState(s)}
                className="relative flex flex-col items-center gap-1 p-2 rounded transition-all"
                style={{
                  background: state === s ? `${glowColor}15` : 'transparent',
                  border: `1px solid ${state === s ? glowColor + '60' : '#374151'}`,
                  cursor: 'pointer',
                }}
              >
                <div
                  className="text-[10px] text-left w-full mb-1"
                  style={{ color: state === s ? glowColor : '#6B7280' }}
                >
                  &gt; {s.toUpperCase()}
                </div>
                <ClawdPixelArt
                  state={s}
                  autoAnimate={false}
                  size={0.65}
                  showLabel={false}
                />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom status bar */}
      <div
        className="flex items-center gap-4 px-3 py-2 border-t text-[10px]"
        style={{ borderColor: `${glowColor}30`, background: '#0a0a1a' }}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ color: '#EC4899' }}>♥ HAPPY</span>
          <div className="w-20 h-1.5 rounded-full" style={{ background: '#1F2937' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${happy}%`,
                background: happy > 60 ? '#22C55E' : happy > 30 ? '#F59E0B' : '#EF4444',
              }}
            />
          </div>
          <span style={{ color: '#6B7280' }}>{Math.round(happy)}/100</span>
        </div>
        <div style={{ color: '#A78BFA' }}>⬡ VP {vp.toLocaleString()}</div>
        <div style={{ color: '#06B6D4' }}>◆ LEVEL {level}</div>
        <div className="ml-auto">
          <span
            className="px-2 py-0.5 rounded"
            style={{
              color: online ? '#22C55E' : '#6B7280',
              border: `1px solid ${online ? '#22C55E40' : '#37415140'}`,
              background: online ? '#22C55E15' : 'transparent',
            }}
          >
            [ {online ? 'ONLINE' : 'OFFLINE'} ]
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Small helper components ───────────────────────────────────────────────────

const Separator = () => (
  <div className="my-2 border-t" style={{ borderColor: '#1F2937' }} />
);

const InfoRow = ({
  label, value, color,
}: { label: string; value: string; color: string }) => (
  <div className="flex justify-between text-[10px] py-0.5">
    <span style={{ color: '#6B7280' }}>{label}</span>
    <span style={{ color }}>{value}</span>
  </div>
);

const CmdRow = ({
  cmd, effect, onClick,
}: { cmd: string; effect: string; onClick: () => void }) => (
  <button
    onClick={onClick}
    className="flex justify-between w-full hover:opacity-80 transition-opacity text-left"
  >
    <span style={{ color: '#EC4899' }}>{cmd}</span>
    <span style={{ color: '#22C55E' }}>{effect}</span>
  </button>
);
