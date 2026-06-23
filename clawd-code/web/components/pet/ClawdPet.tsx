"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  ChevronUp,
  Code2,
  Hand,
  Moon,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { cn } from "@/lib/utils";

const PET_ROOT = "/clawd-pet";
const FRAME_SIZE = 48;
const DISPLAY_SCALE = 2;
const SHEET_WIDTH = 1536;
const SHEET_HEIGHT = 1872;
const STATS_KEY = "clawd-pet-stats-v1";

type AnimationName =
  | "idle"
  | "walk"
  | "run"
  | "think"
  | "idea"
  | "sleep"
  | "code"
  | "bounce"
  | "celebrate";

interface AnimationConfig {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
  description?: string;
}

interface PetStats {
  hunger: number;
  energy: number;
  happiness: number;
  focus: number;
  onchain_rep: number;
}

interface PetInteraction {
  label: string;
  effect: Partial<PetStats>;
  triggerAnimation: AnimationName;
  dialogue?: string[];
}

interface PetMetadata {
  displayName: string;
  tagline: string;
  token: string;
  tokenAddress: string;
  sprite: {
    frameWidth: number;
    frameHeight: number;
    scale: number;
    animations: Record<AnimationName, AnimationConfig>;
  };
  stats: Record<string, { label: string; max: number }>;
  interactions: Record<string, PetInteraction>;
}

interface PetAction {
  id: "pet" | "code_review" | "trade" | "rest";
  label: string;
  icon: LucideIcon;
  variant: "default" | "secondary" | "outline";
}

const fallbackAnimations: Record<AnimationName, AnimationConfig> = {
  idle: { row: 0, frames: 8, fps: 6, loop: true },
  walk: { row: 1, frames: 8, fps: 8, loop: true },
  run: { row: 2, frames: 8, fps: 14, loop: true },
  think: { row: 3, frames: 4, fps: 3, loop: true },
  idea: { row: 4, frames: 5, fps: 8, loop: false },
  sleep: { row: 5, frames: 8, fps: 4, loop: true },
  code: { row: 6, frames: 7, fps: 10, loop: true },
  bounce: { row: 7, frames: 6, fps: 10, loop: true },
  celebrate: { row: 8, frames: 5, fps: 12, loop: false },
};

const fallbackMetadata: PetMetadata = {
  displayName: "Clawd",
  tagline: "Kindred in Spirit. Boundless in Thought.",
  token: "$CLAWD",
  tokenAddress: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
  sprite: {
    frameWidth: FRAME_SIZE,
    frameHeight: FRAME_SIZE,
    scale: DISPLAY_SCALE,
    animations: fallbackAnimations,
  },
  stats: {
    hunger: { label: "Hunger", max: 100 },
    energy: { label: "Energy", max: 100 },
    happiness: { label: "Happiness", max: 100 },
    focus: { label: "Focus", max: 100 },
    onchain_rep: { label: "On-Chain Rep", max: 1000 },
  },
  interactions: {
    pet: {
      label: "Pet",
      effect: { happiness: 8, focus: -5 },
      triggerAnimation: "bounce",
      dialogue: ["claws up", "do not interrupt the loop", "ok fine"],
    },
    code_review: {
      label: "Code",
      effect: { energy: -15, focus: -20, happiness: 5, onchain_rep: 3 },
      triggerAnimation: "code",
      dialogue: ["reading the diff", "checking the why", "small fix, large effect"],
    },
    trade: {
      label: "Paper",
      effect: { energy: -10, focus: -15, onchain_rep: 2 },
      triggerAnimation: "think",
      dialogue: ["observe, orient, decide", "holding while signal is weak"],
    },
    rest: {
      label: "Rest",
      effect: { energy: 40, focus: 20 },
      triggerAnimation: "sleep",
      dialogue: ["drift mode", "beaching, back soon"],
    },
  },
};

const initialStats: PetStats = {
  hunger: 72,
  energy: 68,
  happiness: 78,
  focus: 84,
  onchain_rep: 12,
};

const actions: PetAction[] = [
  { id: "pet", label: "Pet", icon: Hand, variant: "secondary" },
  { id: "code_review", label: "Code", icon: Code2, variant: "default" },
  { id: "trade", label: "Paper", icon: TrendingUp, variant: "outline" },
  { id: "rest", label: "Rest", icon: Moon, variant: "outline" },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadSavedStats(): PetStats {
  if (typeof window === "undefined") return initialStats;
  try {
    const raw = window.localStorage.getItem(STATS_KEY);
    if (!raw) return initialStats;
    return { ...initialStats, ...(JSON.parse(raw) as Partial<PetStats>) };
  } catch {
    return initialStats;
  }
}

function pickDialogue(interaction: PetInteraction | undefined, fallback: string): string {
  const lines = interaction?.dialogue?.filter(Boolean);
  if (!lines?.length) return fallback;
  return lines[Math.floor(Math.random() * lines.length)] ?? fallback;
}

function StatBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const percent = clamp((value / max) * 100, 0, 100);
  const tone =
    percent < 25 ? "bg-error" : percent < 50 ? "bg-warning" : "bg-success";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-surface-500">
        <span>{label}</span>
        <span>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-800">
        <div
          className={cn("h-full rounded-full transition-[width]", tone)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function ClawdPet() {
  const reducedMotion = useReducedMotion();
  const [metadata, setMetadata] = useState<PetMetadata>(fallbackMetadata);
  const [open, setOpen] = useState(false);
  const [animation, setAnimation] = useState<AnimationName>("idle");
  const [frame, setFrame] = useState(0);
  const [stats, setStats] = useState<PetStats>(initialStats);
  const [line, setLine] = useState(fallbackMetadata.tagline);

  useEffect(() => {
    setStats(loadSavedStats());
  }, []);

  useEffect(() => {
    let mounted = true;
    fetch(`${PET_ROOT}/pet.json`)
      .then((response) => (response.ok ? response.json() : fallbackMetadata))
      .then((pet: PetMetadata) => {
        if (!mounted) return;
        setMetadata({
          ...fallbackMetadata,
          ...pet,
          sprite: {
            ...fallbackMetadata.sprite,
            ...pet.sprite,
            animations: {
              ...fallbackAnimations,
              ...(pet.sprite?.animations ?? {}),
            },
          },
          interactions: {
            ...fallbackMetadata.interactions,
            ...(pet.interactions ?? {}),
          },
        });
        setLine(pet.tagline || fallbackMetadata.tagline);
      })
      .catch(() => {
        if (mounted) setMetadata(fallbackMetadata);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  const animationConfig = metadata.sprite.animations[animation] ?? fallbackAnimations.idle;

  useEffect(() => {
    setFrame(0);
    if (reducedMotion) return;

    const interval = window.setInterval(() => {
      setFrame((previous) => {
        const next = previous + 1;
        if (next < animationConfig.frames) return next;
        if (!animationConfig.loop) {
          window.setTimeout(() => setAnimation("idle"), 0);
          return animationConfig.frames - 1;
        }
        return 0;
      });
    }, 1000 / animationConfig.fps);

    return () => window.clearInterval(interval);
  }, [animation, animationConfig.fps, animationConfig.frames, animationConfig.loop, reducedMotion]);

  const spriteStyle = useMemo<CSSProperties>(() => {
    const scale = metadata.sprite.scale || DISPLAY_SCALE;
    const frameWidth = metadata.sprite.frameWidth || FRAME_SIZE;
    const frameHeight = metadata.sprite.frameHeight || FRAME_SIZE;

    return {
      width: frameWidth * scale,
      height: frameHeight * scale,
      backgroundImage: `url("${PET_ROOT}/spritesheet.webp")`,
      backgroundSize: `${SHEET_WIDTH * scale}px ${SHEET_HEIGHT * scale}px`,
      backgroundPosition: `${-(reducedMotion ? 0 : frame) * frameWidth * scale}px ${-animationConfig.row * frameHeight * scale}px`,
      imageRendering: "pixelated",
    };
  }, [animationConfig.row, frame, metadata.sprite.frameHeight, metadata.sprite.frameWidth, metadata.sprite.scale, reducedMotion]);

  const mood = useMemo(() => {
    if (animation === "code") return "focused";
    if (animation === "think") return "orienting";
    if (animation === "sleep") return "drifting";
    if (animation === "bounce" || animation === "celebrate") return "elated";
    return "curious";
  }, [animation]);

  function runAction(action: PetAction) {
    const interaction = metadata.interactions[action.id];
    const effect = interaction?.effect ?? {};

    setAnimation(interaction?.triggerAnimation ?? "idle");
    setLine(pickDialogue(interaction, `${metadata.displayName} is listening`));
    setStats((current) => ({
      hunger: clamp(current.hunger + (effect.hunger ?? 0), 0, 100),
      energy: clamp(current.energy + (effect.energy ?? 0), 0, 100),
      happiness: clamp(current.happiness + (effect.happiness ?? 0), 0, 100),
      focus: clamp(current.focus + (effect.focus ?? 0), 0, 100),
      onchain_rep: clamp(current.onchain_rep + (effect.onchain_rep ?? 0), 0, 1000),
    }));
  }

  return (
    <div className="pointer-events-none fixed bottom-24 right-3 z-40 w-[min(92vw,340px)] md:bottom-6 md:right-5">
      <div className="pointer-events-auto">
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto flex items-center gap-3 rounded-lg border border-surface-700 bg-surface-900/95 px-3 py-2 text-left shadow-lg backdrop-blur transition-colors hover:border-brand-500/60 hover:bg-surface-800"
            aria-label="Open Clawd pet"
          >
            <span
              className="block shrink-0"
              style={spriteStyle}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-surface-100">
                {metadata.displayName}
              </span>
              <span className="block max-w-[180px] truncate text-[11px] text-surface-500">
                {line}
              </span>
            </span>
            <ChevronUp className="h-4 w-4 text-surface-500" aria-hidden="true" />
          </button>
        ) : (
          <section
            className="rounded-lg border border-surface-700 bg-surface-900/95 p-3 shadow-2xl backdrop-blur"
            aria-label="Clawd pet companion"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="shrink-0 rounded-md border border-surface-700 bg-surface-950"
                  style={spriteStyle}
                  role="img"
                  aria-label={`${metadata.displayName} ${mood}`}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-surface-100">
                      {metadata.displayName}
                    </h2>
                    <Badge variant="brand" dot>
                      {mood}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-surface-400">
                    {line}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-surface-500 transition-colors hover:bg-surface-800 hover:text-surface-200"
                aria-label="Collapse Clawd pet"
              >
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <StatBar
                label={metadata.stats.energy?.label ?? "Energy"}
                value={stats.energy}
                max={metadata.stats.energy?.max ?? 100}
              />
              <StatBar
                label={metadata.stats.focus?.label ?? "Focus"}
                value={stats.focus}
                max={metadata.stats.focus?.max ?? 100}
              />
              <StatBar
                label={metadata.stats.hunger?.label ?? "Hunger"}
                value={stats.hunger}
                max={metadata.stats.hunger?.max ?? 100}
              />
              <StatBar
                label={metadata.stats.happiness?.label ?? "Happiness"}
                value={stats.happiness}
                max={metadata.stats.happiness?.max ?? 100}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-surface-800 bg-surface-950/80 px-2 py-1.5">
              <div className="flex items-center gap-2 text-xs text-surface-400">
                <Sparkles className="h-3.5 w-3.5 text-brand-300" aria-hidden="true" />
                <span>Rep {Math.round(stats.onchain_rep)}</span>
              </div>
              <span className="truncate text-[10px] text-surface-600">
                {metadata.token} {metadata.tokenAddress.slice(0, 4)}...{metadata.tokenAddress.slice(-4)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1.5">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Button
                    key={action.id}
                    type="button"
                    size="sm"
                    variant={action.variant}
                    onClick={() => runAction(action)}
                    className="h-8 gap-1 px-2 text-[11px]"
                    title={metadata.interactions[action.id]?.label ?? action.label}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">{action.label}</span>
                  </Button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
