import { CLAWD_MINT } from "./clawd-balance";

const DEFAULT_TREASURY_WALLET = "HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ";
const SOL_INCINERATOR = "1nc1nerator11111111111111111111111111111111";
const INITIAL_SUPPLY_FALLBACK = 1_000_000_000;
const CACHE_TTL_MS = 15_000;

export type ClawdSupplyStats = {
  mint: string;
  decimals: number;
  initial: number;
  current: number;
  floating: number;
  locked: number;
  burned: number;
  burnedPct: number;
  effectiveBurned: number;
  effectiveBurnedPct: number;
  incineratorBalance: number;
  lockedBreakdown: { owner: string; amount: number; label: string }[];
  updatedAt: string;
};

let cache: { at: number; data: ClawdSupplyStats } | null = null;

function heliusRpcUrl() {
  return (
    process.env.HELIUS_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : null)
  );
}

async function rpc<T = any>(method: string, params: any): Promise<T | null> {
  const url = heliusRpcUrl();
  if (!url) return null;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
    });
    const json: any = await response.json();
    if (json?.error) {
      console.warn(`[clawd-supply] rpc ${method} error:`, json.error?.message);
      return null;
    }
    return json?.result ?? null;
  } catch (error: any) {
    console.warn(`[clawd-supply] rpc ${method} fetch error:`, error?.message);
    return null;
  }
}

function lockedWallets() {
  const treasuryWallet =
    process.env.TREASURY_WALLET ||
    process.env.ADMIN_WALLET ||
    process.env.ADMINWALLET ||
    DEFAULT_TREASURY_WALLET;
  const configured = (process.env.CLAWD_LOCKED_WALLETS || "")
    .split(",")
    .map((wallet) => wallet.trim())
    .filter(Boolean);
  return Array.from(new Set([treasuryWallet, ...configured]));
}

async function ownerTokenBalance(owner: string) {
  const response = await rpc<any>("getTokenAccountsByOwner", [
    owner,
    { mint: CLAWD_MINT },
    { encoding: "jsonParsed" },
  ]);
  return (response?.value || []).reduce((sum: number, account: any) => {
    return sum + Number(account?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
  }, 0);
}

export async function getClawdSupplyStats(): Promise<ClawdSupplyStats> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  const [asset, supplyResult] = await Promise.all([
    rpc<any>("getAsset", { id: CLAWD_MINT }),
    rpc<any>("getTokenSupply", [CLAWD_MINT]),
  ]);

  const decimals: number =
    asset?.token_info?.decimals ??
    supplyResult?.value?.decimals ??
    Number(process.env.CLAWD_DECIMALS ?? "6");
  const currentSupplyRaw = Number(asset?.token_info?.supply ?? supplyResult?.value?.amount ?? 0);
  const current = currentSupplyRaw / Math.pow(10, decimals);
  const initial = Number(process.env.CLAWD_INITIAL_SUPPLY ?? INITIAL_SUPPLY_FALLBACK);
  const burned = Math.max(0, initial - current);

  let locked = 0;
  const treasuryWallet =
    process.env.TREASURY_WALLET ||
    process.env.ADMIN_WALLET ||
    process.env.ADMINWALLET ||
    DEFAULT_TREASURY_WALLET;
  const lockedBreakdown: ClawdSupplyStats["lockedBreakdown"] = [];
  for (const owner of lockedWallets()) {
    const amount = await ownerTokenBalance(owner);
    if (amount <= 0) continue;
    locked += amount;
    lockedBreakdown.push({
      owner,
      amount,
      label: owner === treasuryWallet ? "Treasury" : "Locked",
    });
  }

  const incineratorBalance = await ownerTokenBalance(SOL_INCINERATOR);
  const effectiveBurned = burned + incineratorBalance;
  const data: ClawdSupplyStats = {
    mint: CLAWD_MINT,
    decimals,
    initial,
    current,
    floating: Math.max(0, current - locked),
    locked,
    burned,
    burnedPct: initial > 0 ? (burned / initial) * 100 : 0,
    effectiveBurned,
    effectiveBurnedPct: initial > 0 ? (effectiveBurned / initial) * 100 : 0,
    incineratorBalance,
    lockedBreakdown,
    updatedAt: new Date().toISOString(),
  };

  cache = { at: Date.now(), data };
  return data;
}
