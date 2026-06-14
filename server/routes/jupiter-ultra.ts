import { Router } from "express";
import type { Request, Response } from "express";
import { sendOptimizedTransaction } from "../lib/helius/transactionOptimization";

// Jupiter Swap V2 API — agent-callable route/order building + signed execution.
// The local route name stays /api/jupiter-ultra for backwards compatibility.
const SWAP_V2_BASE = (process.env.JUPITER_SWAP_V2_BASE_URL || "https://api.jup.ag/swap/v2").replace(/\/$/, "");
const ULTRA_BASE = "https://api.jup.ag/ultra/v1";
const TRIGGER_BASE = "https://api.jup.ag/trigger/v2";
const TOKENS_BASE = "https://api.jup.ag/tokens/v2";

const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// Referral fees can reduce router eligibility, so they are opt-in by default.
const REFERRAL_ACCOUNT = process.env.JUPITER_REFERRAL_ACCOUNT || "2mE1EbETC8e8XyJomMkvQ3jXzoGBZAqRRSRFJv9AHRD9";

function jupHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.JUPITER_API_KEY) headers["x-api-key"] = process.env.JUPITER_API_KEY;
  return headers;
}

async function jupFetch(base: string, path: string, opts: RequestInit = {}) {
  const r = await fetch(`${base}${path}`, {
    ...opts,
    headers: { ...jupHeaders(), ...(opts.headers as Record<string, string> || {}) },
  });
  const text = await r.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: r.ok, status: r.status, data };
}

function handleErr(res: Response, e: unknown) {
  console.error("[jupiter-ultra]", e);
  res.status(502).json({ error: String(e) });
}

const router = Router();

// ─── Jupiter Swap V2 Meta-Aggregator ─────────────────────────────────────────

/**
 * GET /api/jupiter-ultra/order
 * Get a swap order/quote from Jupiter Swap V2.
 * Query: inputMint, outputMint, amount (lamports/base units), taker (optional wallet pubkey)
 * Defaults: inputMint=SOL, outputMint=CLAWD
 */
router.get("/order", async (req: Request, res: Response) => {
  try {
    const {
      inputMint = SOL_MINT,
      outputMint = CLAWD_MINT,
      amount,
      taker,
      slippageBps,
      receiver,
      referralAccount,
      referralFee,
    } = req.query as Record<string, string>;

    if (!amount) return res.status(400).json({ error: "amount required" });

    const params = new URLSearchParams({ inputMint, outputMint, amount });
    if (taker) params.set("taker", taker);
    if (slippageBps) params.set("slippageBps", slippageBps);
    if (receiver) params.set("receiver", receiver);
    if (referralAccount) params.set("referralAccount", referralAccount);
    if (referralFee) params.set("referralFee", referralFee);
    if (!referralAccount && process.env.JUPITER_ENABLE_REFERRAL_DEFAULT === "true" && REFERRAL_ACCOUNT) {
      params.set("referralAccount", REFERRAL_ACCOUNT);
    }

    const { ok, status, data } = await jupFetch(SWAP_V2_BASE, `/order?${params}`);
    res.status(ok ? 200 : status).json(data);
  } catch (e) { handleErr(res, e); }
});

/**
 * POST /api/jupiter-ultra/execute
 * Execute a signed Jupiter Swap V2 transaction.
 * Body: { signedTransaction: string (base64), requestId: string, landingMode?: "jupiter" | "helius-rpc" | "helius-sender" }
 */
router.post("/execute", async (req: Request, res: Response) => {
  try {
    const {
      signedTransaction,
      requestId,
      landingMode = "jupiter",
      skipPreflight,
      maxRetries,
      rebateAddress,
      swqosOnly,
    } = req.body;
    if (!signedTransaction) {
      return res.status(400).json({ error: "signedTransaction required" });
    }
    if (landingMode === "jupiter" && !requestId) {
      return res.status(400).json({ error: "requestId required for Jupiter managed execution" });
    }

    if (landingMode === "helius-rpc" || landingMode === "helius-sender") {
      const result = await sendOptimizedTransaction(signedTransaction, {
        mode: landingMode === "helius-sender" ? "sender" : "rpc",
        encoding: "base64",
        skipPreflight,
        maxRetries,
        rebateAddress,
        swqosOnly,
        requestId: requestId || `jupiter-${landingMode}`,
      });
      return res.json({
        status: "Success",
        signature: result.signature,
        mode: result.mode,
        optimizedBy: result.optimizedBy,
        requestId: requestId || null,
        explorerUrl: `https://solscan.io/tx/${result.signature}`,
        note: result.mode === "sender"
          ? "Helius Sender requires the signed Jupiter transaction to already include a priority fee and Sender tip instruction."
          : "Submitted through Helius RPC with optimized send options.",
      });
    }

    const { ok, status, data } = await jupFetch(SWAP_V2_BASE, "/execute", {
      method: "POST",
      body: JSON.stringify({ signedTransaction, requestId }),
    });
    res.status(ok ? 200 : status).json(data);
  } catch (e) { handleErr(res, e); }
});

/**
 * GET /api/jupiter-ultra/balances/:wallet
 * Get all token balances for a wallet (Ultra endpoint).
 */
router.get("/balances/:wallet", async (req: Request, res: Response) => {
  try {
    const { ok, status, data } = await jupFetch(ULTRA_BASE, `/balances/${req.params.wallet}`);
    res.status(ok ? 200 : status).json(data);
  } catch (e) { handleErr(res, e); }
});

/**
 * GET /api/jupiter-ultra/shield?mints=mint1,mint2
 * Check token safety (freeze authority, mint authority, etc.)
 */
router.get("/shield", async (req: Request, res: Response) => {
  try {
    const { mints = CLAWD_MINT } = req.query as Record<string, string>;
    const params = new URLSearchParams({ mints });
    const { ok, status, data } = await jupFetch(ULTRA_BASE, `/shield?${params}`);
    res.status(ok ? 200 : status).json(data);
  } catch (e) { handleErr(res, e); }
});

// ─── Trigger Orders (Limit / TP / SL) ────────────────────────────────────────

/**
 * GET /api/jupiter-ultra/trigger/create-order
 * Build an unsigned trigger order transaction.
 * Query: inputMint, outputMint, maker (wallet), makingAmount, takingAmount
 *        orderType (Limit|RecurringTime|RecurringPrice)
 *        expiredAt (ISO or unix timestamp, optional)
 */
router.get("/trigger/create-order", async (req: Request, res: Response) => {
  try {
    const {
      inputMint = SOL_MINT,
      outputMint = CLAWD_MINT,
      maker,
      makingAmount,
      takingAmount,
      orderType = "Limit",
      expiredAt,
      slippageBps,
    } = req.query as Record<string, string>;

    if (!maker) return res.status(400).json({ error: "maker (wallet pubkey) required" });
    if (!makingAmount || !takingAmount) return res.status(400).json({ error: "makingAmount and takingAmount required" });

    const params = new URLSearchParams({
      inputMint, outputMint, maker, makingAmount, takingAmount, orderType,
    });
    if (expiredAt) params.set("expiredAt", expiredAt);
    if (slippageBps) params.set("slippageBps", slippageBps);
    if (REFERRAL_ACCOUNT) params.set("referralAccount", REFERRAL_ACCOUNT);

    const { ok, status, data } = await jupFetch(TRIGGER_BASE, `/create_order?${params}`);
    res.status(ok ? 200 : status).json(data);
  } catch (e) { handleErr(res, e); }
});

/**
 * POST /api/jupiter-ultra/trigger/execute-order
 * Submit a signed trigger order.
 * Body: { requestId: string, signedTransaction: string, landingMode?: "jupiter" | "helius-rpc" | "helius-sender" }
 */
router.post("/trigger/execute-order", async (req: Request, res: Response) => {
  try {
    const {
      requestId,
      signedTransaction,
      landingMode = "jupiter",
      skipPreflight,
      maxRetries,
      rebateAddress,
      swqosOnly,
    } = req.body;
    if (!signedTransaction) {
      return res.status(400).json({ error: "signedTransaction required" });
    }
    if (landingMode === "jupiter" && !requestId) {
      return res.status(400).json({ error: "requestId required for Jupiter trigger execution" });
    }

    if (landingMode === "helius-rpc" || landingMode === "helius-sender") {
      const result = await sendOptimizedTransaction(signedTransaction, {
        mode: landingMode === "helius-sender" ? "sender" : "rpc",
        encoding: "base64",
        skipPreflight,
        maxRetries,
        rebateAddress,
        swqosOnly,
        requestId: requestId || `jupiter-trigger-${landingMode}`,
      });
      return res.json({
        status: "Success",
        signature: result.signature,
        mode: result.mode,
        optimizedBy: result.optimizedBy,
        requestId: requestId || null,
        explorerUrl: `https://solscan.io/tx/${result.signature}`,
      });
    }

    const { ok, status, data } = await jupFetch(TRIGGER_BASE, "/execute_order", {
      method: "POST",
      body: JSON.stringify({ requestId, signedTransaction }),
    });
    res.status(ok ? 200 : status).json(data);
  } catch (e) { handleErr(res, e); }
});

/**
 * GET /api/jupiter-ultra/trigger/orders/:wallet
 * List open trigger orders for a wallet.
 * Query: inputMint, outputMint (optional filters)
 */
router.get("/trigger/orders/:wallet", async (req: Request, res: Response) => {
  try {
    const { inputMint, outputMint } = req.query as Record<string, string>;
    const params = new URLSearchParams({ wallet: req.params.wallet });
    if (inputMint) params.set("inputMint", inputMint);
    if (outputMint) params.set("outputMint", outputMint);
    const { ok, status, data } = await jupFetch(TRIGGER_BASE, `/orders?${params}`);
    res.status(ok ? 200 : status).json(data);
  } catch (e) { handleErr(res, e); }
});

/**
 * POST /api/jupiter-ultra/trigger/cancel-order
 * Build cancel transaction for a trigger order.
 * Body: { maker: string, order: string (order pubkey) }
 */
router.post("/trigger/cancel-order", async (req: Request, res: Response) => {
  try {
    const { maker, order } = req.body;
    if (!maker || !order) return res.status(400).json({ error: "maker and order required" });
    const { ok, status, data } = await jupFetch(TRIGGER_BASE, "/cancel_order", {
      method: "POST",
      body: JSON.stringify({ maker, order }),
    });
    res.status(ok ? 200 : status).json(data);
  } catch (e) { handleErr(res, e); }
});

// ─── Token helpers ────────────────────────────────────────────────────────────

/**
 * GET /api/jupiter-ultra/token/:mint
 * Token metadata from Jupiter Tokens V2.
 */
router.get("/token/:mint", async (req: Request, res: Response) => {
  try {
    const { ok, status, data } = await jupFetch(TOKENS_BASE, `/${req.params.mint}`);
    res.status(ok ? 200 : status).json(data);
  } catch (e) { handleErr(res, e); }
});

/**
 * GET /api/jupiter-ultra/clawd
 * Shortcut: CLAWD token metadata and route helper links.
 */
router.get("/clawd", async (_req: Request, res: Response) => {
  try {
    const [tokenRes] = await Promise.all([
      jupFetch(TOKENS_BASE, `/${CLAWD_MINT}`),
    ]);
    res.json({
      mint: CLAWD_MINT,
      solMint: SOL_MINT,
      usdcMint: USDC_MINT,
      referral: REFERRAL_ACCOUNT,
      token: tokenRes.data,
      jupBuyUrl:  `https://jup.ag/?sell=${SOL_MINT}&buy=${CLAWD_MINT}`,
      jupSellUrl: `https://jup.ag/?sell=${CLAWD_MINT}&buy=${SOL_MINT}`,
    });
  } catch (e) { handleErr(res, e); }
});

export default router;
