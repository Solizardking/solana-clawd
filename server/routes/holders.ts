import { Router } from "express";
import type { Request, Response } from "express";
import { heliusService } from "../lib/helius/heliusService";

const router = Router();

const CLAWD_MINT =
  process.env.CLAWD_MINT_ADDRESS ||
  process.env.VITE_CLAWD_MINT ||
  "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

let cache: { at: number; data: any } | null = null;
const TTL_MS = 60_000;

// GET /api/holders/directory?limit=50
// DAS-powered $CLAWD holders list with PFP (first NFT owned).
router.get("/directory", async (req: Request, res: Response) => {
  try {
    if (!CLAWD_MINT) {
      return res.status(500).json({ error: "CLAWD_MINT_ADDRESS not configured" });
    }
    const limit = Math.min(parseInt(String(req.query.limit ?? "30"), 10) || 30, 100);

    if (cache && Date.now() - cache.at < TTL_MS) {
      return res.json({ ...cache.data, cached: true });
    }

    // Use Helius RPC `getTokenAccounts` (DAS-style) to enumerate $CLAWD holders.
    const rpcUrl = process.env.HELIUS_RPC_URL;
    if (!rpcUrl) return res.status(500).json({ error: "HELIUS_RPC_URL missing" });

    const tokenRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "holders",
        method: "getTokenAccounts",
        params: { mint: CLAWD_MINT, limit: 1000 },
      }),
    });
    const tokenJson: any = await tokenRes.json();
    const accounts: any[] = tokenJson?.result?.token_accounts || [];

    // Aggregate by owner
    const byOwner = new Map<string, number>();
    for (const a of accounts) {
      if (!a?.owner) continue;
      const amt = Number(a.amount || 0);
      byOwner.set(a.owner, (byOwner.get(a.owner) || 0) + amt);
    }
    const ranked = [...byOwner.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([owner, amount], i) => ({ rank: i + 1, owner, amount }));

    // Enrich top holders with their first NFT image (PFP) via DAS getAssetsByOwner
    const enriched = await Promise.all(
      ranked.map(async (h) => {
        try {
          const assets = await heliusService.getAssetsByOwner(h.owner, 5, 1);
          const firstWithImage = assets.find(
            (a: any) => a?.content?.links?.image || a?.content?.files?.[0]?.uri
          );
          const image: string | null =
            (firstWithImage as any)?.content?.links?.image ||
            (firstWithImage as any)?.content?.files?.[0]?.uri ||
            null;
          const name: string | null =
            (firstWithImage as any)?.content?.metadata?.name || null;
          return { ...h, pfp: image, pfpName: name, nftCount: assets.length };
        } catch {
          return { ...h, pfp: null, pfpName: null, nftCount: 0 };
        }
      })
    );

    const data = {
      success: true,
      mint: CLAWD_MINT,
      totalHolders: byOwner.size,
      holders: enriched,
      generatedAt: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return res.json(data);
  } catch (e: any) {
    console.error("[holders] directory error:", e);
    return res.status(500).json({ error: e?.message || "Failed to fetch holders" });
  }
});

export default router;
