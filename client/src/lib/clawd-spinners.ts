/**
 * CLAWD Web Spinners — browser-safe animation frames.
 * Ported from the clawd-frames + web-spinners source files.
 * No Node.js deps, no process.stdout — pure data for React renderers.
 */

export interface WebSpinner {
  readonly frames: readonly string[];
  readonly interval: number;
  readonly label?: string;
  readonly color?: string;
}

// ── Solana chain-pulse ─────────────────────────────────────────────────────────
// Heartbeat-style braille pulse evoking the Solana TPS counter.
export const solanaPulse: WebSpinner = {
  frames: [
    '⠀⠀⠀⣀⠀⠀⠀',
    '⠀⠀⣠⣿⣄⠀⠀',
    '⠀⣴⣿⣿⣿⣦⠀',
    '⣾⣿⣿⣿⣿⣿⣷',
    '⠻⣿⣿⣿⣿⣿⠟',
    '⠀⠙⣿⣿⣿⠋⠀',
    '⠀⠀⠙⣿⠋⠀⠀',
    '⠀⠀⠀⠁⠀⠀⠀',
  ],
  interval: 100,
  label: 'solanaPulse',
  color: '#9945FF',
};

// ── CLAWD logo spin ────────────────────────────────────────────────────────────
// Braille-encoded "C" that rotates / morphs.
export const clawdSpin: WebSpinner = {
  frames: [
    '⣰⣿⣿⡆',
    '⣿⡏⠀⠀',
    '⣿⡇⠀⠀',
    '⣿⡏⠀⠀',
    '⠹⣿⣿⠃',
    '⠀⠈⠉⠀',
    '⠹⣿⣿⠃',
    '⣿⡏⠀⠀',
    '⣿⡇⠀⠀',
    '⣿⡏⠀⠀',
    '⣰⣿⣿⡆',
    '⠀⠉⠉⠀',
  ],
  interval: 90,
  label: 'clawdSpin',
  color: '#EC4899',
};

// ── Wallet heartbeat ───────────────────────────────────────────────────────────
// ECG-style trace — used during buddy birth / wallet generation.
export const walletHeartbeat: WebSpinner = {
  frames: [
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⠞⠁⠀⠀⠀⠀⠀',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⡴⠞⠁⠀⠀⠀⠀⠀⠀⠀',
    '⠤⠤⠤⠤⠤⠤⣤⠴⠚⠁⠀⠀⠀⠀⠹⠤⠤⠤⠤⠤',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀',
    '⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤⠤',
    '⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣀⠀⠀⠀⠀⠀',
    '⠤⠤⠤⠤⠤⠤⣤⠴⠚⠁⠀⠀⠀⠀⠹⠤⠤⠤⠤⠤',
  ],
  interval: 120,
  label: 'walletHeartbeat',
  color: '#06B6D4',
};

// ── Token orbit ────────────────────────────────────────────────────────────────
// Dots orbiting like tokens swirling in a bonding curve.
export const tokenOrbit: WebSpinner = {
  frames: [
    '◆ ·  · ·',
    '· ◆  · ·',
    '· ·  ◆ ·',
    '· ·  · ◆',
    '· ·  ◆ ·',
    '· ◆  · ·',
  ],
  interval: 110,
  label: 'tokenOrbit',
  color: '#A78BFA',
};

// ── Pump loader ────────────────────────────────────────────────────────────────
// Bonding curve filling up — used for launch animations.
export const pumpLoader: WebSpinner = {
  frames: [
    '▱▱▱▱▱▱▱▱',
    '▰▱▱▱▱▱▱▱',
    '▰▰▱▱▱▱▱▱',
    '▰▰▰▱▱▱▱▱',
    '▰▰▰▰▱▱▱▱',
    '▰▰▰▰▰▱▱▱',
    '▰▰▰▰▰▰▱▱',
    '▰▰▰▰▰▰▰▱',
    '▰▰▰▰▰▰▰▰',
    '▰▰▰▰▰▰▰▰',
    '▱▰▰▰▰▰▰▰',
    '▱▱▰▰▰▰▰▰',
    '▱▱▱▰▰▰▰▰',
    '▱▱▱▱▰▰▰▰',
    '▱▱▱▱▱▰▰▰',
    '▱▱▱▱▱▱▰▰',
    '▱▱▱▱▱▱▱▰',
    '▱▱▱▱▱▱▱▱',
  ],
  interval: 60,
  label: 'pumpLoader',
  color: '#22C55E',
};

// ── MEV shark scan ─────────────────────────────────────────────────────────────
// Braille scan-line for the sniper / shark species.
export const mevScan: WebSpinner = {
  frames: [
    '⠁⠀⠀⠀⠀⠀⠀⠀',
    '⠂⠁⠀⠀⠀⠀⠀⠀',
    '⠄⠂⠁⠀⠀⠀⠀⠀',
    '⡀⠄⠂⠁⠀⠀⠀⠀',
    '⠀⡀⠄⠂⠁⠀⠀⠀',
    '⠀⠀⡀⠄⠂⠁⠀⠀',
    '⠀⠀⠀⡀⠄⠂⠁⠀',
    '⠀⠀⠀⠀⡀⠄⠂⠁',
    '⠀⠀⠀⠀⠀⡀⠄⠂',
    '⠀⠀⠀⠀⠀⠀⡀⠄',
    '⠀⠀⠀⠀⠀⠀⠀⡀',
    '⠀⠀⠀⠀⠀⠀⠀⠀',
  ],
  interval: 70,
  label: 'mevScan',
  color: '#F59E0B',
};

// ── Degen dice ─────────────────────────────────────────────────────────────────
export const degenDice: WebSpinner = {
  frames: ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅', '⚄', '⚃', '⚁'],
  interval: 100,
  label: 'degenDice',
  color: '#EC4899',
};

// ── Block finality ─────────────────────────────────────────────────────────────
// Blocks stacking / confirming — validator species.
export const blockFinality: WebSpinner = {
  frames: [
    '░░░░',
    '▒░░░',
    '▓▒░░',
    '█▓▒░',
    '██▓▒',
    '███▓',
    '████',
    '████',
    '███▓',
    '██▓▒',
    '█▓▒░',
    '▓▒░░',
    '▒░░░',
    '░░░░',
  ],
  interval: 80,
  label: 'blockFinality',
  color: '#7C3AED',
};

// ── Rug detector ───────────────────────────────────────────────────────────────
export const rugDetector: WebSpinner = {
  frames: [
    '🛡️  scanning',
    '🛡️  scanning.',
    '🛡️  scanning..',
    '🛡️  scanning...',
    '🛡️  CLEAR ✓',
    '🛡️  CLEAR ✓',
  ],
  interval: 200,
  label: 'rugDetector',
  color: '#22C55E',
};

// ── Lobster claw (ASCII) ───────────────────────────────────────────────────────
export const lobsterClaw: WebSpinner = {
  frames: [
    '   _\n  ( v ) c\n   ^^^^',
    '   _\n  ( ^ ) C\n   ^^^^',
    '   _\n  ( v ) c\n   ^^^^',
    '   _\n  ( o ) c\n   ^^^^',
  ],
  interval: 220,
  label: 'lobsterClaw',
  color: '#EC4899',
};

// ── Registry ────────────────────────────────────────────────────────────────────
export const CLAWD_SPINNERS = {
  solanaPulse,
  clawdSpin,
  walletHeartbeat,
  tokenOrbit,
  pumpLoader,
  mevScan,
  degenDice,
  blockFinality,
  rugDetector,
  lobsterClaw,
} as const;

export type ClawdSpinnerName = keyof typeof CLAWD_SPINNERS;
