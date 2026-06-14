import { Router } from "express";
import { z } from "zod";
import { sendOptimizedTransaction } from "../lib/helius/transactionOptimization";

const router = Router();

const HELIUS_RPC = () =>
  process.env.HELIUS_RPC_URL ||
  (process.env.HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}` : "");

const JUPITER_QUOTE_API = "https://api.jup.ag/swap/v1";
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function requireHelius(res: any) {
  const url = HELIUS_RPC();
  if (!url) {
    res.status(503).json({ error: "Live Helius RPC is not configured." });
    return null;
  }
  return url;
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as any)?.error || (data as any)?.message || `Upstream request failed (${response.status})`);
  }
  return data;
}

// Known token mints for resolution
const KNOWN_TOKENS: Record<string, string> = {
  SOL:   "So11111111111111111111111111111111111111112",
  USDC:  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  USDT:  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  BONK:  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  WIF:   "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
  CLAWD: "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump",
  JUP:   "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  RAY:   "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
};

// ─── GET /api/wallet-ops/token-search ─────────────────────────────────────────
// Resolve token name/mint → mint address
router.get("/token-search", async (req, res) => {
  const query = (req.query.q as string || "").trim();
  const upper = query.toUpperCase();
  if (!query) return res.status(400).json({ error: "q param required" });

  // 1. Check known tokens by symbol
  if (KNOWN_TOKENS[upper]) {
    return res.json({ mint: KNOWN_TOKENS[upper], symbol: upper, found: true });
  }

  // 2. If it looks like a base58 mint address, resolve via Helius DAS
  if (SOLANA_ADDRESS_RE.test(query)) {
    try {
      const rpcUrl = requireHelius(res);
      if (!rpcUrl) return;
      const data = await fetchJson(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "get-asset", method: "getAsset", params: { id: query } }),
      });
      const meta = data.result?.content?.metadata;
      if (meta) {
        return res.json({ mint: query, symbol: meta.symbol || query.slice(0, 6), name: meta.name, found: true });
      }
    } catch (error: any) {
      return res.status(502).json({ error: error.message || "Unable to verify token mint." });
    }
    return res.status(404).json({ found: false, query, error: "Mint was not found by Helius." });
  }

  // 3. Try Jupiter token search API
  try {
    const r = await fetch(`https://api.jup.ag/tokens/v1/search?query=${encodeURIComponent(query)}&limit=1`);
    if (r.ok) {
      const tokens = await r.json() as any[];
      if (Array.isArray(tokens) && tokens.length > 0) {
        const t = tokens[0];
        return res.json({ mint: t.address, symbol: t.symbol, name: t.name, found: true });
      }
    }
  } catch {}

  return res.json({ found: false, query });
});

// ─── GET /api/wallet-ops/resolve-token ────────────────────────────────────────
// Faster resolution — check known tokens only
router.get("/resolve-token", (req, res) => {
  const sym = (req.query.symbol as string || "").toUpperCase().trim();
  const mint = KNOWN_TOKENS[sym];
  if (mint) return res.json({ mint, symbol: sym, found: true });
  return res.json({ found: false, symbol: sym, knownTokens: Object.keys(KNOWN_TOKENS) });
});

// ─── GET /api/wallet-ops/balances/:address ────────────────────────────────────
// Fetch SOL + SPL token balances via Helius DAS API
router.get("/balances/:address", async (req, res) => {
  const { address } = req.params;
  if (!SOLANA_ADDRESS_RE.test(address)) return res.status(400).json({ success: false, error: "Invalid wallet address." });
  try {
    const rpcUrl = requireHelius(res);
    if (!rpcUrl) return;
    // SOL balance
    const solData = await fetchJson(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "sol-bal",
        method: "getBalance",
        params: [address],
      }),
    });
    const solBalance = (solData.result?.value ?? 0) / 1e9;

    // Token accounts
    const tokenData = await fetchJson(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "token-accounts",
        method: "getTokenAccountsByOwner",
        params: [
          address,
          { programId: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" },
          { encoding: "jsonParsed" },
        ],
      }),
    });
    const tokenAccounts = (tokenData.result?.value || []).map((acc: any) => {
      const info = acc.account?.data?.parsed?.info;
      return {
        tokenAccount: acc.pubkey,
        mint: info?.mint,
        amount: info?.tokenAmount?.uiAmount ?? 0,
        decimals: info?.tokenAmount?.decimals ?? 0,
        rawAmount: info?.tokenAmount?.amount ?? "0",
      };
    }).filter((t: any) => t.amount > 0);

    res.json({ success: true, sol: solBalance, tokens: tokenAccounts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/wallet-ops/jupiter-order ───────────────────────────────────────
// Jupiter v2 Meta-Aggregator: get quote + assembled transaction in one call.
// All routers compete: Metis (iris), JupiterZ RFQ, Dflow, OKX.
// Include `taker` param to get a signable transaction; omit for price-check only.
router.get("/jupiter-order", async (req, res) => {
  const { inputMint, outputMint, amount, taker, slippageBps } = req.query;
  if (!inputMint || !outputMint || !amount) {
    return res.status(400).json({ error: "inputMint, outputMint, amount required" });
  }
  if (!SOLANA_ADDRESS_RE.test(String(inputMint)) || !SOLANA_ADDRESS_RE.test(String(outputMint))) {
    return res.status(400).json({ error: "Invalid input or output mint." });
  }
  if (!/^\d+$/.test(String(amount)) || BigInt(String(amount)) <= 0n) {
    return res.status(400).json({ error: "amount must be a positive raw integer." });
  }
  try {
    const params = new URLSearchParams({
      inputMint: String(inputMint),
      outputMint: String(outputMint),
      amount: String(amount),
    });
    if (taker) params.set("taker", String(taker));
    if (slippageBps) params.set("slippageBps", String(slippageBps));

    const data = await fetchJson(`https://api.jup.ag/swap/v2/order?${params}`, {
      headers: process.env.JUPITER_API_KEY
        ? { "x-api-key": process.env.JUPITER_API_KEY }
        : {},
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/wallet-ops/jupiter-execute ────────────────────────────────────
// Jupiter v2: execute a signed /order transaction with managed landing.
// Jupiter handles priority fees, slippage optimization, and retry logic.
router.post("/jupiter-execute", async (req, res) => {
  const {
    signedTransaction,
    requestId,
    lastValidBlockHeight,
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
  if (typeof signedTransaction !== "string" || signedTransaction.length < 100) {
    return res.status(400).json({ error: "signedTransaction is invalid." });
  }
  try {
    if (landingMode === "helius-rpc" || landingMode === "helius-sender") {
      const result = await sendOptimizedTransaction(signedTransaction, {
        mode: landingMode === "helius-sender" ? "sender" : "rpc",
        encoding: "base64",
        skipPreflight,
        maxRetries,
        rebateAddress,
        swqosOnly,
        requestId: requestId || `wallet-ops-${landingMode}`,
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

    const body: any = { signedTransaction, requestId };
    if (lastValidBlockHeight) body.lastValidBlockHeight = lastValidBlockHeight;

    const data = await fetchJson("https://api.jup.ag/swap/v2/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.JUPITER_API_KEY ? { "x-api-key": process.env.JUPITER_API_KEY } : {}),
      },
      body: JSON.stringify(body),
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/wallet-ops/jupiter-build ───────────────────────────────────────
// Jupiter v2 Router: returns raw swap instructions (Metis only) for advanced
// transaction composition. Use this when you need to inject custom CPI / extra
// instructions (referral skim, post-swap transfer, atomic multi-action) before
// signing. The client is responsible for assembling, simulating, signing, and
// submitting via its own RPC.
router.get("/jupiter-build", async (req, res) => {
  const {
    inputMint, outputMint, amount, taker, slippageBps,
    excludeDexes, referralAccount, referralFee,
  } = req.query;
  if (!inputMint || !outputMint || !amount || !taker) {
    return res.status(400).json({ error: "inputMint, outputMint, amount, taker required" });
  }
  if (![inputMint, outputMint, taker].every((v) => SOLANA_ADDRESS_RE.test(String(v)))) {
    return res.status(400).json({ error: "Invalid mint or taker address." });
  }
  if (!/^\d+$/.test(String(amount)) || BigInt(String(amount)) <= 0n) {
    return res.status(400).json({ error: "amount must be a positive raw integer." });
  }
  try {
    const params = new URLSearchParams({
      inputMint: String(inputMint),
      outputMint: String(outputMint),
      amount: String(amount),
      taker: String(taker),
    });
    if (slippageBps)     params.set("slippageBps", String(slippageBps));
    if (excludeDexes)    params.set("excludeDexes", String(excludeDexes));
    if (referralAccount) params.set("referralAccount", String(referralAccount));
    if (referralFee)     params.set("referralFee", String(referralFee));

    const data = await fetchJson(`https://api.jup.ag/swap/v2/build?${params}`, {
      headers: process.env.JUPITER_API_KEY
        ? { "x-api-key": process.env.JUPITER_API_KEY }
        : {},
    });
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/wallet-ops/jupiter-quote (legacy v1, price-check only) ─────────
router.get("/jupiter-quote", async (req, res) => {
  const { inputMint, outputMint, amount, slippageBps = "50" } = req.query;
  if (!inputMint || !outputMint || !amount) {
    return res.status(400).json({ error: "inputMint, outputMint, amount required" });
  }
  if (!SOLANA_ADDRESS_RE.test(String(inputMint)) || !SOLANA_ADDRESS_RE.test(String(outputMint))) {
    return res.status(400).json({ error: "Invalid input or output mint." });
  }
  if (!/^\d+$/.test(String(amount)) || BigInt(String(amount)) <= 0n) {
    return res.status(400).json({ error: "amount must be a positive raw integer." });
  }
  try {
    const url = `${JUPITER_QUOTE_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
    const data = await fetchJson(url);
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/wallet-ops/token-info/:mint ─────────────────────────────────────
// Get token metadata via Helius DAS
router.get("/token-info/:mint", async (req, res) => {
  const { mint } = req.params;
  if (!SOLANA_ADDRESS_RE.test(mint)) return res.status(400).json({ error: "Invalid mint address." });
  try {
    const rpcUrl = requireHelius(res);
    if (!rpcUrl) return;
    const data = await fetchJson(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "get-asset",
        method: "getAsset",
        params: { id: mint },
      }),
    });
    res.json(data.result ?? { error: "not found" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/wallet-ops/parse-command ───────────────────────────────────────
// NLP command parsing via AI (fallback when regex doesn't match)
router.post("/parse-command", async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: "command required" });
  if (!process.env.DEEPSEEK_API_KEY) {
    return res.status(503).json({ error: "Live command parsing is not configured." });
  }

  const systemPrompt = `You are a Solana wallet command parser. Parse user commands into structured JSON with these possible intents:
- BURN: burn/destroy tokens  
- TRANSFER: send tokens/SOL to an address
- SWAP: swap/buy/sell tokens via Jupiter  
- LOCK: lock/freeze tokens for a period
- BALANCE: check wallet balance
- LAUNCH: create/launch a new token

Respond ONLY with JSON: { "intent": "INTENT", "params": { ... relevant params ... } }
For BURN: params = { token: "SYMBOL or MINT", amount: number | "all" | "percent", percent?: number }
For TRANSFER: params = { token: "SOL or SYMBOL or MINT", amount: number, to: "address" }
For SWAP: params = { fromToken: "SYMBOL", toToken: "SYMBOL", amount: number, fromUnit: "SOL|TOKEN" }
Natural SWAP examples:
- "buy 0.1 SOL of CLAWD" -> { "fromToken": "SOL", "toToken": "CLAWD", "amount": 0.1 }
- "ape into CLAWD with .25 SOL" -> { "fromToken": "SOL", "toToken": "CLAWD", "amount": 0.25 }
- "long CLAWD using 1 SOL" -> { "fromToken": "SOL", "toToken": "CLAWD", "amount": 1 }
- "sell 100 CLAWD" -> { "fromToken": "CLAWD", "toToken": "SOL", "amount": 100 }
- "dump 25 BONK for SOL" -> { "fromToken": "BONK", "toToken": "SOL", "amount": 25 }
For buy commands, amount is the input token spend amount, usually SOL. For sell commands, amount is the token amount being sold.
For LOCK: params = { token: "SYMBOL", amount: number | "all", duration: number, unit: "days|hours|minutes" }
For BALANCE: params = {}
For LAUNCH: params = { concept: "string" }
If unclear, respond: { "intent": "UNKNOWN", "params": {}, "message": "explanation" }`;

  try {
    const data = await fetchJson("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: command },
        ],
        temperature: 0,
        max_tokens: 200,
        response_format: { type: "json_object" },
      }),
    });
    const text = data.choices?.[0]?.message?.content || "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return res.json(JSON.parse(jsonMatch[0]));
    }
    res.json({ intent: "UNKNOWN", params: {}, raw: text });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
