export interface ClawdSpinner {
  frames: string[];
  interval: number;
}

export const solanaPulse: ClawdSpinner = {
  frames: ["⣀", "⣄", "⣆", "⣇", "⣧", "⣷", "⣿", "⣷", "⣧", "⣇", "⣆", "⣄"],
  interval: 100,
};

export const clawdSpin: ClawdSpinner = {
  frames: ["🦞", "🦐", "🦞", "🦀", "🦞", "🦐"],
  interval: 220,
};

export const walletHeartbeat: ClawdSpinner = {
  frames: ["·", "•", "●", "◉", "●", "•", "·", " "],
  interval: 110,
};

export const tokenOrbit: ClawdSpinner = {
  frames: ["◐", "◓", "◑", "◒"],
  interval: 120,
};

export const pumpLoader: ClawdSpinner = {
  frames: [
    "▱▱▱▱▱",
    "▰▱▱▱▱",
    "▰▰▱▱▱",
    "▰▰▰▱▱",
    "▰▰▰▰▱",
    "▰▰▰▰▰",
    "▱▰▰▰▰",
    "▱▱▰▰▰",
    "▱▱▱▰▰",
    "▱▱▱▱▰",
  ],
  interval: 90,
};

export const mevScan: ClawdSpinner = {
  frames: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
  interval: 80,
};

export const degenDice: ClawdSpinner = {
  frames: ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"],
  interval: 110,
};

export const blockFinality: ClawdSpinner = {
  frames: ["░", "▒", "▓", "█", "▓", "▒", "░"],
  interval: 95,
};

export const CLAWD_SPINNERS = {
  solanaPulse,
  clawdSpin,
  walletHeartbeat,
  tokenOrbit,
  pumpLoader,
  mevScan,
  degenDice,
  blockFinality,
} as const;

export type ClawdSpinnerName = keyof typeof CLAWD_SPINNERS;

export function spinnerForProvider(provider: string): ClawdSpinner {
  switch (provider) {
    case "ollama":    return blockFinality;
    case "openrouter": return tokenOrbit;
    case "openai":    return pumpLoader;
    case "custom":    return mevScan;
    case "grok":
    default:          return clawdSpin;
  }
}
