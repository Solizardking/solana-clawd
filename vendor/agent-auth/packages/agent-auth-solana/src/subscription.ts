// Subscription tier logic for Clawd Agent Attestation Protocol (CAAP/1.0)
// Mirrors src/lib/agents/subscription.ts but as a standalone package module.

export type SubscriptionTier = "free" | "bronze" | "silver" | "gold" | "diamond";

export interface TierInfo {
  tier: SubscriptionTier;
  clawdRequired: number;
  clawdBalance: number;
  nextTier?: SubscriptionTier;
  clawdToNextTier?: number;
  percentToNext?: number;
}

export const TIER_THRESHOLDS: Record<SubscriptionTier, number> = {
  free: 0,
  bronze: 100_000,
  silver: 500_000,
  gold: 1_000_000,
  diamond: 5_000_000,
};

const TIER_ORDER: SubscriptionTier[] = ["free", "bronze", "silver", "gold", "diamond"];

export function computeTier(clawdBalance: number): TierInfo {
  let tier: SubscriptionTier = "free";
  for (const t of TIER_ORDER) {
    if (clawdBalance >= TIER_THRESHOLDS[t]) tier = t;
  }

  const currentIndex = TIER_ORDER.indexOf(tier);
  const nextTier =
    currentIndex < TIER_ORDER.length - 1 ? TIER_ORDER[currentIndex + 1] : undefined;

  let clawdToNextTier: number | undefined;
  let percentToNext: number | undefined;

  if (nextTier) {
    const nextRequired = TIER_THRESHOLDS[nextTier];
    const currentRequired = TIER_THRESHOLDS[tier];
    clawdToNextTier = Math.max(0, nextRequired - clawdBalance);
    const range = nextRequired - currentRequired;
    const progress = clawdBalance - currentRequired;
    percentToNext = range > 0 ? Math.min(100, Math.round((progress / range) * 100)) : 100;
  }

  return {
    tier,
    clawdRequired: TIER_THRESHOLDS[tier],
    clawdBalance,
    nextTier,
    clawdToNextTier,
    percentToNext,
  };
}

export function detectSell(
  prevBalance: number,
  newBalance: number,
): { sold: boolean; amount: number } {
  const amount = prevBalance - newBalance;
  return { sold: amount > 0, amount: Math.max(0, amount) };
}

export function tierBadgeColor(tier: SubscriptionTier): string {
  switch (tier) {
    case "free":
      return "bg-white/10 text-white/60";
    case "bronze":
      return "bg-amber-500/20 text-amber-400 border-amber-500/40";
    case "silver":
      return "bg-slate-400/20 text-slate-300 border-slate-400/40";
    case "gold":
      return "bg-yellow-400/20 text-yellow-300 border-yellow-400/40";
    case "diamond":
      return "bg-cyan-400/20 text-cyan-300 border-cyan-400/40";
  }
}

export function tierLabel(tier: SubscriptionTier): string {
  switch (tier) {
    case "free":
      return "Free";
    case "bronze":
      return "Bronze";
    case "silver":
      return "Silver";
    case "gold":
      return "Gold";
    case "diamond":
      return "Diamond";
  }
}
