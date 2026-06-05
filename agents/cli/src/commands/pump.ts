import { printInfo, printOk, printSection, printWarn } from "../banner.js";

const CLAWDROUTER_URL = "https://clawdrouter.fly.dev";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const PUMP_FUN_URL = `https://pump.fun/coin/${CLAWD_MINT}`;
const DEXSCREENER_URL = `https://dexscreener.com/solana/${CLAWD_MINT}`;

interface RouterStatus {
  clawd?: {
    holderTier?: string;
    balance?: number;
    premiumModelsUnlocked?: boolean;
    maxRequestsPerHour?: number;
    x402Required?: boolean;
    thresholds?: { whale: number; diamond: number; holder: number };
  };
  openRouter?: { enabled: boolean; configured: boolean };
}

interface AccessStatus {
  clawd?: {
    tier?: string;
    balance?: number;
    premiumModelsUnlocked?: boolean;
    maxRequestsPerHour?: number;
    x402Required?: boolean;
    allowedModelTiers?: string[];
  };
}

async function fetchRouterStatus(): Promise<RouterStatus | null> {
  try {
    const res = await fetch(`${CLAWDROUTER_URL}/v1/clawd/status`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as RouterStatus;
  } catch {
    return null;
  }
}

async function fetchWalletAccess(wallet: string): Promise<AccessStatus | null> {
  try {
    const res = await fetch(`${CLAWDROUTER_URL}/v1/clawd/access`, {
      headers: { "X-Clawd-Wallet": wallet },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as AccessStatus;
  } catch {
    return null;
  }
}

function tierEmoji(tier: string): string {
  switch (tier) {
    case "WHALE":   return "🐋";
    case "DIAMOND": return "💎";
    case "HOLDER":  return "🎫";
    default:        return "🆓";
  }
}

export async function runPump(sub?: string, opts: { wallet?: string; json?: boolean } = {}): Promise<void> {
  printSection("$CLAWD Token — ClawdRouter Access Gate");

  console.error(`\n  Token:     $CLAWD`);
  console.error(`  Mint:      ${CLAWD_MINT}`);
  console.error(`  Buy:       ${PUMP_FUN_URL}`);
  console.error(`  Chart:     ${DEXSCREENER_URL}`);

  // ── Tier thresholds ──────────────────────────────────────────────
  console.error(`\n  Access Tiers (ClawdRouter):`);
  console.error(`    🐋 WHALE    1,000,000+ $CLAWD → All models · no x402 · unlimited req/hr`);
  console.error(`    💎 DIAMOND    100,000+ $CLAWD → Premium models · no x402 · 500 req/hr`);
  console.error(`    🎫 HOLDER       1,000+ $CLAWD → Mid-tier models · standard x402 · 100 req/hr`);
  console.error(`    🆓 FREE              0 $CLAWD → Budget models · 20 req/hr (free via ClawdRouter)`);

  // ── Router $CLAWD status ─────────────────────────────────────────
  printSection("ClawdRouter Status");
  const status = await fetchRouterStatus();
  if (status?.clawd) {
    const { holderTier = "FREE", balance = 0, premiumModelsUnlocked, maxRequestsPerHour, x402Required } = status.clawd;
    const emoji = tierEmoji(holderTier);
    printOk(`Router tier:   ${emoji} ${holderTier}`);
    printOk(`Router balance: ${balance.toLocaleString()} $CLAWD`);
    printInfo(`Premium models: ${premiumModelsUnlocked ? "unlocked" : "locked"}`);
    printInfo(`Rate limit:     ${maxRequestsPerHour === undefined ? "20" : maxRequestsPerHour}/hr`);
    printInfo(`x402 required:  ${x402Required ? "yes" : "no"}`);
  } else {
    printWarn("Router unreachable — check https://clawdrouter.fly.dev/health");
  }

  if (status?.openRouter) {
    printOk(`OpenRouter:     ${status.openRouter.enabled ? "enabled" : "disabled"} · key ${status.openRouter.configured ? "configured" : "missing"}`);
  }

  // ── Wallet check ─────────────────────────────────────────────────
  const wallet = opts.wallet ?? sub;
  if (wallet && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    printSection(`Wallet: ${wallet.slice(0, 8)}...${wallet.slice(-4)}`);
    const access = await fetchWalletAccess(wallet);
    if (access?.clawd) {
      const { tier = "FREE", balance = 0, premiumModelsUnlocked, maxRequestsPerHour, allowedModelTiers } = access.clawd;
      const emoji = tierEmoji(tier);
      printOk(`Tier:      ${emoji} ${tier}`);
      printOk(`Balance:   ${balance.toLocaleString()} $CLAWD`);
      printInfo(`Premium:   ${premiumModelsUnlocked ? "unlocked" : "locked"}`);
      printInfo(`Rate:      ${maxRequestsPerHour}/hr`);
      printInfo(`Models:    ${(allowedModelTiers ?? []).join(", ")}`);

      if (opts.json) {
        console.log(JSON.stringify(access, null, 2));
      }
    } else {
      printWarn(`Could not check wallet — ensure it's a valid Solana base58 address`);
    }
  } else if (sub && sub !== "status") {
    printWarn(`Usage: clawd-agents pump [wallet-address]`);
  }

  // ── Upgrade CTA ──────────────────────────────────────────────────
  console.error(`\n  Upgrade access:`);
  console.error(`    Buy $CLAWD:   ${PUMP_FUN_URL}`);
  console.error(`    API keys:     https://x402.wtf/profile/api`);
  console.error(`    Free tier:    clawd-agents setup  (auto-provisions OPENROUTER_BASE_URL)`);
}
