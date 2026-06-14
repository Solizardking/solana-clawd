import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

const CLAWD_MINT =
  process.env.CLAWD_MINT_ADDRESS ||
  process.env.VITE_CLAWD_MINT ||
  "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

const TREASURY_WALLET =
  process.env.TREASURY_WALLET ||
  process.env.ADMIN_WALLET ||
  process.env.ADMINWALLET ||
  "HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ";

// Solana SPL "incinerator" — official burn-by-transfer address.
// Tokens sent here are unrecoverable and treated as burned.
const SOL_INCINERATOR = "1nc1nerator11111111111111111111111111111111";

// pump.fun creates a bonding-curve PDA per token; tokens trapped there before
// graduation are not floating supply either. We treat known dead/lock addresses
// as locked. Add more here as they're identified.
const KNOWN_LOCKED: string[] = [
  TREASURY_WALLET,
];

const INITIAL_SUPPLY_FALLBACK = 1_000_000_000; // pump.fun mints 1B by default

const BIRDEYE_BASE = "https://public-api.birdeye.so";

let cache: { at: number; data: any } | null = null;
const TTL_MS = 30_000;

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
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
    });
    const j: any = await r.json();
    if (j?.error) {
      console.warn(`[clawd-portfolio] rpc ${method} error:`, j.error?.message);
      return null;
    }
    return j?.result ?? null;
  } catch (e: any) {
    console.warn(`[clawd-portfolio] rpc ${method} fetch error:`, e?.message);
    return null;
  }
}

async function birdeyeOverview(): Promise<any | null> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `${BIRDEYE_BASE}/defi/token_overview?address=${CLAWD_MINT}`,
      {
        headers: {
          accept: "application/json",
          "x-chain": "solana",
          "x-api-key": key,
        },
      },
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    return j?.data ?? null;
  } catch {
    return null;
  }
}

async function birdeyePriceHistory(): Promise<
  { time: number; value: number }[]
> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return [];
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 60 * 60 * 24; // 24h
    const r = await fetch(
      `${BIRDEYE_BASE}/defi/history_price?address=${CLAWD_MINT}&address_type=token&type=15m&time_from=${from}&time_to=${now}`,
      {
        headers: {
          accept: "application/json",
          "x-chain": "solana",
          "x-api-key": key,
        },
      },
    );
    if (!r.ok) return [];
    const j: any = await r.json();
    const items = j?.data?.items || [];
    return items.map((i: any) => ({
      time: i.unixTime * 1000,
      value: Number(i.value || 0),
    }));
  } catch {
    return [];
  }
}

// GET /api/clawd-portfolio
router.get("/", async (_req: Request, res: Response) => {
  try {
    if (cache && Date.now() - cache.at < TTL_MS) {
      return res.json({ ...cache.data, cached: true });
    }

    // Parallelise all upstream calls
    const [asset, supplyResult, largest, overview, priceSeries] =
      await Promise.all([
        rpc<any>("getAsset", { id: CLAWD_MINT }),
        rpc<any>("getTokenSupply", [CLAWD_MINT]),
        rpc<any>("getTokenLargestAccounts", [CLAWD_MINT]),
        birdeyeOverview(),
        birdeyePriceHistory(),
      ]);

    // ─── Supply / decimals ────────────────────────────────────────────────
    const decimals: number =
      asset?.token_info?.decimals ??
      supplyResult?.value?.decimals ??
      6;

    // On-chain current supply (this DECREASES as $CLAWD is burned → deflationary)
    const currentSupplyRaw = Number(
      asset?.token_info?.supply ?? supplyResult?.value?.amount ?? 0,
    );
    const currentSupply = currentSupplyRaw / Math.pow(10, decimals);

    // Initial mint supply baseline (pump.fun default = 1B)
    const initialSupply = INITIAL_SUPPLY_FALLBACK;
    const totalBurned = Math.max(0, initialSupply - currentSupply);
    const burnPct = initialSupply > 0 ? (totalBurned / initialSupply) * 100 : 0;

    // ─── Locked / treasury balances → floating supply ─────────────────────
    let lockedTotal = 0;
    let incineratorBalance = 0;
    const lockedBreakdown: { owner: string; amount: number; label: string }[] = [];

    // Treasury balance via getTokenAccountsByOwner
    for (const owner of KNOWN_LOCKED) {
      const r = await rpc<any>("getTokenAccountsByOwner", [
        owner,
        { mint: CLAWD_MINT },
        { encoding: "jsonParsed" },
      ]);
      let amt = 0;
      for (const acc of r?.value || []) {
        amt += Number(acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0);
      }
      if (amt > 0) {
        lockedBreakdown.push({
          owner,
          amount: amt,
          label: owner === TREASURY_WALLET ? "Treasury" : "Locked",
        });
        lockedTotal += amt;
      }
    }

    // Incinerator balance (already burned - but show separately)
    const incinR = await rpc<any>("getTokenAccountsByOwner", [
      SOL_INCINERATOR,
      { mint: CLAWD_MINT },
      { encoding: "jsonParsed" },
    ]);
    for (const acc of incinR?.value || []) {
      incineratorBalance += Number(
        acc?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0,
      );
    }

    const effectiveBurned = totalBurned + incineratorBalance;
    const floatingSupply = Math.max(0, currentSupply - lockedTotal);

    // ─── Top holders snapshot from largest accounts ───────────────────────
    const top10 = (largest?.value || []).slice(0, 10).map((a: any) => ({
      address: a.address,
      amount: Number(a.uiAmount || 0),
      pctOfSupply:
        currentSupply > 0
          ? (Number(a.uiAmount || 0) / currentSupply) * 100
          : 0,
    }));

    // ─── Mint authorities ─────────────────────────────────────────────────
    const mintAuthority = asset?.token_info?.mint_authority ?? null;
    const freezeAuthority = asset?.token_info?.freeze_authority ?? null;

    // ─── Birdeye market data ──────────────────────────────────────────────
    const price = Number(overview?.price ?? 0);
    const priceChange24h = Number(overview?.priceChange24hPercent ?? 0);
    const liquidity = Number(overview?.liquidity ?? 0);
    const volume24h = Number(overview?.v24hUSD ?? 0);
    const trades24h = Number(overview?.trade24h ?? 0);
    const marketCap = price > 0 ? price * floatingSupply : 0;
    const fdv = price > 0 ? price * currentSupply : 0;

    const data = {
      success: true,
      mint: CLAWD_MINT,
      symbol: "CLAWD",
      name: asset?.content?.metadata?.name || "Cheshire Terminal · CLAWD",
      image:
        asset?.content?.links?.image ||
        asset?.content?.files?.[0]?.uri ||
        null,
      decimals,
      authorities: {
        mintAuthority,
        freezeAuthority,
        renounced: !mintAuthority && !freezeAuthority,
      },
      supply: {
        initial: initialSupply,
        current: currentSupply,
        floating: floatingSupply,
        locked: lockedTotal,
        burned: totalBurned,
        burnedPct: burnPct,
        effectiveBurned,
        effectiveBurnedPct: initialSupply > 0 ? (effectiveBurned / initialSupply) * 100 : 0,
        incineratorBalance,
        deflationary: totalBurned > 0,
        lockedBreakdown,
      },
      market: {
        price,
        priceChange24h,
        marketCap,
        fdv,
        liquidity,
        volume24h,
        trades24h,
      },
      topHolders: top10,
      priceHistory24h: priceSeries,
      generatedAt: new Date().toISOString(),
    };

    cache = { at: Date.now(), data };
    return res.json(data);
  } catch (e: any) {
    console.error("[clawd-portfolio] error:", e);
    return res
      .status(500)
      .json({ error: e?.message || "Failed to load CLAWD portfolio" });
  }
});

export default router;
