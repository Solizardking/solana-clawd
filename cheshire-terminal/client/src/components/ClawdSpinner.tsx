import { useState, useEffect, useRef } from 'react';
import { CLAWD_SPINNERS, type ClawdSpinnerName, type WebSpinner } from '@/lib/clawd-spinners';

interface ClawdSpinnerProps {
  name?: ClawdSpinnerName;
  spinner?: WebSpinner;
  label?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  inline?: boolean;
  className?: string;
}

const SIZE_CLASS: Record<string, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
};

export function ClawdSpinner({
  name = 'solanaPulse',
  spinner,
  label,
  size = 'sm',
  inline = false,
  className = '',
}: ClawdSpinnerProps) {
  const s = spinner ?? CLAWD_SPINNERS[name];
  const [frame, setFrame] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(
      () => setFrame(f => (f + 1) % s.frames.length),
      s.interval,
    );
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [s]);

  const current = s.frames[frame];
  const color = s.color ?? '#A78BFA';

  if (inline) {
    return (
      <span
        className={`font-mono whitespace-pre ${SIZE_CLASS[size]} ${className}`}
        style={{ color, textShadow: `0 0 8px ${color}80` }}
        aria-label={label ?? 'loading'}
      >
        {current}
        {label && <span className="ml-2 opacity-70">{label}</span>}
      </span>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 font-mono ${SIZE_CLASS[size]} ${className}`}
      style={{ color }}
      aria-label={label ?? 'loading'}
    >
      <span
        className="whitespace-pre"
        style={{ textShadow: `0 0 10px ${color}` }}
      >
        {current}
      </span>
      {label && (
        <span className="opacity-70 tracking-wide">{label}</span>
      )}
    </div>
  );
}

// ── Terminal-style spinner row ─────────────────────────────────────────────────
// Renders exactly like a CLI line: "  ⣾⣿⣿⣷  Deploying to Solana..."
interface TerminalSpinnerLineProps {
  name?: ClawdSpinnerName;
  spinner?: WebSpinner;
  label?: string;
  prefix?: string;
  done?: boolean;
  doneText?: string;
  error?: boolean;
  className?: string;
}

export function TerminalSpinnerLine({
  name = 'solanaPulse',
  spinner,
  label = 'Processing...',
  prefix = '  ',
  done = false,
  doneText,
  error = false,
  className = '',
}: TerminalSpinnerLineProps) {
  const s = spinner ?? CLAWD_SPINNERS[name];
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (done) return;
    const t = setInterval(() => setFrame(f => (f + 1) % s.frames.length), s.interval);
    return () => clearInterval(t);
  }, [s, done]);

  const color = s.color ?? '#A78BFA';

  if (done) {
    return (
      <div className={`font-mono text-sm flex items-center gap-2 ${className}`}>
        <span style={{ color: error ? '#EF4444' : '#22C55E' }}>
          {error ? '✗' : '✔'}
        </span>
        <span style={{ color: error ? '#EF4444' : '#22C55E' }}>
          {doneText ?? label}
        </span>
      </div>
    );
  }

  return (
    <div className={`font-mono text-sm flex items-center gap-2 ${className}`}>
      <span className="opacity-50">{prefix}</span>
      <span
        className="whitespace-pre"
        style={{ color, textShadow: `0 0 8px ${color}` }}
      >
        {s.frames[frame]}
      </span>
      <span style={{ color: '#6B7280' }}>{label}</span>
    </div>
  );
}

// ── Birth Ceremony ─────────────────────────────────────────────────────────────
// Multi-phase animated sequence in terminal style (hat-tip to Companion Birth).
export interface CeremonyPhase {
  spinner: ClawdSpinnerName;
  label: string;
  durationMs: number;
}

interface BirthCeremonyProps {
  phases: CeremonyPhase[];
  onComplete?: () => void;
  className?: string;
}

export function BirthCeremony({ phases, onComplete, className = '' }: BirthCeremonyProps) {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [completedPhases, setCompletedPhases] = useState<number[]>([]);

  useEffect(() => {
    if (currentPhase >= phases.length) {
      onComplete?.();
      return;
    }
    const t = setTimeout(() => {
      setCompletedPhases(prev => [...prev, currentPhase]);
      setCurrentPhase(p => p + 1);
    }, phases[currentPhase].durationMs);
    return () => clearTimeout(t);
  }, [currentPhase, phases, onComplete]);

  return (
    <div className={`space-y-1 ${className}`}>
      {phases.map((phase, i) => (
        <TerminalSpinnerLine
          key={i}
          name={phase.spinner}
          label={phase.label}
          done={completedPhases.includes(i)}
          className={i > currentPhase ? 'opacity-30' : ''}
        />
      ))}
    </div>
  );
}

// ── Preset spinner configs for common actions ──────────────────────────────────
export const SPINNER_PRESETS = {
  thinking:  { name: 'solanaPulse' as ClawdSpinnerName, label: 'Clawd is thinking...' },
  launching: { name: 'pumpLoader'  as ClawdSpinnerName, label: 'Launching token...' },
  scanning:  { name: 'mevScan'     as ClawdSpinnerName, label: 'Scanning...' },
  wallet:    { name: 'walletHeartbeat' as ClawdSpinnerName, label: 'Connecting wallet...' },
  deploying: { name: 'blockFinality'   as ClawdSpinnerName, label: 'Deploying...' },
  rolling:   { name: 'degenDice'       as ClawdSpinnerName, label: 'Rolling...' },
  loading:   { name: 'clawdSpin'       as ClawdSpinnerName, label: 'Loading...' },
  orbit:     { name: 'tokenOrbit'      as ClawdSpinnerName, label: 'Fetching tokens...' },
} as const;
