export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface RarityConfig {
  label: string;
  chance: number;
  color: string;
  bg: string;
  border: string;
  glow: string;
  payoutMin: number;
  payoutMax: number;
}

export interface AgentCardTemplate {
  id: string;
  name: string;
  role: string;
  rarity: Rarity;
  power: number;
  description: string;
  abilities: string[];
  icon: string;
}

export const GACHA_CLAWD_MINT =
  "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

export const GACHA_PULL_COUNTS = [1, 10] as const;
export type GachaPullCount = (typeof GACHA_PULL_COUNTS)[number];
export type GachaAccessMode = "holder-free" | "public-paid";

export const GACHA_SESSION_TTL_MS = 5 * 60 * 1000;
export const GACHA_LAMPORTS_PER_SOL = 1_000_000_000;
export const GACHA_PUBLIC_SPIN_PRICE_SOL = 0.06942;

export function getGachaPublicPriceSol(pullCount: GachaPullCount): number {
  return Number((GACHA_PUBLIC_SPIN_PRICE_SOL * pullCount).toFixed(6));
}

export function getGachaPublicPriceLamports(pullCount: GachaPullCount): number {
  return Math.round(getGachaPublicPriceSol(pullCount) * GACHA_LAMPORTS_PER_SOL);
}

export const RARITY_CONFIG: Record<Rarity, RarityConfig> = {
  common: {
    label: "Common",
    chance: 60,
    color: "text-slate-200",
    bg: "bg-slate-900/60",
    border: "border-slate-500/40",
    glow: "",
    payoutMin: 25,
    payoutMax: 90,
  },
  rare: {
    label: "Rare",
    chance: 25,
    color: "text-cyan-300",
    bg: "bg-cyan-950/40",
    border: "border-cyan-400/50",
    glow: "shadow-cyan-500/20 shadow-md",
    payoutMin: 180,
    payoutMax: 640,
  },
  epic: {
    label: "Epic",
    chance: 12,
    color: "text-fuchsia-300",
    bg: "bg-fuchsia-950/35",
    border: "border-fuchsia-400/55",
    glow: "shadow-fuchsia-500/25 shadow-lg",
    payoutMin: 1200,
    payoutMax: 3600,
  },
  legendary: {
    label: "Legendary",
    chance: 3,
    color: "text-amber-300",
    bg: "bg-amber-950/30",
    border: "border-amber-400/65",
    glow: "shadow-amber-400/30 shadow-xl",
    payoutMin: 8500,
    payoutMax: 18000,
  },
};

export const GACHA_MAX_SINGLE_PRIZE_CLAWD =
  RARITY_CONFIG.legendary.payoutMax;
export const GACHA_RECOMMENDED_VAULT_BUFFER_CLAWD =
  GACHA_MAX_SINGLE_PRIZE_CLAWD * 25;


export const GACHA_AGENT_POOL: AgentCardTemplate[] = [
  {
    id: "c1",
    name: "Rug Scout",
    role: "Analyst",
    rarity: "common",
    power: 12,
    icon: "🔍",
    description: "Scans new launches for rug signals before you ape in.",
    abilities: ["LP Check", "Dev Wallet Scan", "Honeypot Detect"],
  },
  {
    id: "c2",
    name: "Floor Sweeper",
    role: "Trader",
    rarity: "common",
    power: 15,
    icon: "🧹",
    description: "Automates buy orders at support levels.",
    abilities: ["Floor Buy", "Limit Orders", "Gas Optimizer"],
  },
  {
    id: "c3",
    name: "Meme Poster",
    role: "Marketing",
    rarity: "common",
    power: 10,
    icon: "📣",
    description: "Auto-posts meme content across social channels.",
    abilities: ["Telegram Blast", "Meme Gen", "Campaign Bot"],
  },
  {
    id: "c4",
    name: "Gas Watcher",
    role: "Utility",
    rarity: "common",
    power: 8,
    icon: "⛽",
    description: "Monitors gas and alerts when it is cheap to transact.",
    abilities: ["Gas Alert", "Fee Estimator", "Timing Bot"],
  },
  {
    id: "r1",
    name: "Whale Tracker",
    role: "Spy",
    rarity: "rare",
    power: 38,
    icon: "🐋",
    description: "Follows whale wallets and mirrors their moves.",
    abilities: ["Wallet Mirror", "On-chain Intel", "Copy Trade"],
  },
  {
    id: "r2",
    name: "Degen Oracle",
    role: "Prophet",
    rarity: "rare",
    power: 42,
    icon: "🔮",
    description: "Predicts short-term price action using sentiment data.",
    abilities: ["Sentiment Scan", "TA Bot", "Alert System"],
  },
  {
    id: "r3",
    name: "Liquidity Bot",
    role: "DeFi",
    rarity: "rare",
    power: 35,
    icon: "💧",
    description: "Manages LP positions and harvests yield automatically.",
    abilities: ["LP Manager", "Yield Farm", "Rebalance"],
  },
  {
    id: "e1",
    name: "Alpha Clawd",
    role: "Commander",
    rarity: "epic",
    power: 68,
    icon: "🐾",
    description: "Commands a squad of sub-agents in coordinated strategies.",
    abilities: ["Squad Leader", "Multi-Agent Ops", "Alpha Signals"],
  },
  {
    id: "e2",
    name: "Codex Scribe",
    role: "Developer",
    rarity: "epic",
    power: 72,
    icon: "📜",
    description: "Auto-generates and audits smart contract code on-chain.",
    abilities: ["Code Gen", "Contract Audit", "Deploy Bot"],
  },
  {
    id: "e3",
    name: "Phantom Sniper",
    role: "Sniper",
    rarity: "epic",
    power: 65,
    icon: "🎯",
    description: "Snipes new token launches at block zero.",
    abilities: ["Launch Sniper", "Anti-Bot Shield", "Fast Tx"],
  },
  {
    id: "l1",
    name: "CLAWD Supreme",
    role: "Apex Agent",
    rarity: "legendary",
    power: 99,
    icon: "👑",
    description: "The apex Clawd agent. Autonomous, unstoppable, omniscient.",
    abilities: ["Full Autonomy", "Cross-Chain Op", "Market Maker", "God Mode"],
  },
  {
    id: "l2",
    name: "Codex Prime",
    role: "Architect",
    rarity: "legendary",
    power: 95,
    icon: "🧬",
    description: "Designs entire token ecosystems with one prompt.",
    abilities: ["Ecosystem Architect", "Tokenomics Gen", "DAO Deploy", "Auto-Audit"],
  },
];

export function getCardsByRarity(rarity: Rarity): AgentCardTemplate[] {
  return GACHA_AGENT_POOL.filter((card) => card.rarity === rarity);
}

export function isGuaranteedRareSlot(
  pullCount: GachaPullCount,
  index: number,
): boolean {
  return pullCount === 10 && index === pullCount - 1;
}

export function hashSliceToInt(hash: string, start: number, length = 8): number {
  return parseInt(hash.slice(start, start + length), 16) >>> 0;
}

export function deriveRarityFromHash(
  hash: string,
  guaranteedRarePlus: boolean,
): Rarity {
  const pct = (hashSliceToInt(hash, 0) / 0xffffffff) * 100;

  if (guaranteedRarePlus) {
    if (pct < 5) return "legendary";
    if (pct < 30) return "epic";
    return "rare";
  }

  if (pct < 3) return "legendary";
  if (pct < 15) return "epic";
  if (pct < 40) return "rare";
  return "common";
}

export function derivePrizeAmountFromHash(
  hash: string,
  rarity: Rarity,
  guaranteedRarePlus: boolean,
): number {
  const config = RARITY_CONFIG[rarity];
  const span = config.payoutMax - config.payoutMin;
  const base = config.payoutMin + (hashSliceToInt(hash, 16) % (span + 1));
  return guaranteedRarePlus ? base + Math.max(25, Math.floor(base * 0.08)) : base;
}

export function selectCardFromHash(
  hash: string,
  rarity: Rarity,
): AgentCardTemplate {
  const pool = getCardsByRarity(rarity);
  return pool[hashSliceToInt(hash, 8) % pool.length];
}
