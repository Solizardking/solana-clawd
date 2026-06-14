import { useState, useEffect, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  ArrowDownUp, Loader2, CheckCircle2, AlertTriangle,
  ExternalLink, RefreshCw, Zap, TrendingDown, Wifi,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  meteoraSwap,
  subscribeHeliusPrice,
  type QuoteResponse,
  type LivePrice,
  type PoolDataResponse,
} from "@/lib/meteoraSwap";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

type SwapDir = "sol_to_clawd" | "clawd_to_sol";
type Status = "idle" | "quoting" | "quoted" | "signing" | "submitting" | "done" | "error";
type LpStatus = "idle" | "signing" | "submitting" | "done" | "error";

type LogLine = { id: number; type: "info" | "success" | "error"; text: string };

function readInitialSwapParams(): { dir: SwapDir; amount: string; slippage: number } {
  const fallback = { dir: "sol_to_clawd" as SwapDir, amount: "", slippage: 1 };
  if (typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const from = (params.get("from") || params.get("fromToken") || "").replace(/^\$/, "").toUpperCase();
  const to = (params.get("to") || params.get("toToken") || "").replace(/^\$/, "").toUpperCase();
  const inputMint = params.get("inputMint") || "";
  const outputMint = params.get("outputMint") || "";
  const amount = params.get("amount") || "";
  const slippageParam = Number(params.get("slippage"));
  const slippageBps = Number(params.get("slippageBps"));
  const slippage = Number.isFinite(slippageParam) && slippageParam > 0
    ? slippageParam
    : Number.isFinite(slippageBps) && slippageBps > 0
      ? slippageBps / 100
      : fallback.slippage;

  const solToClawd =
    (from === "SOL" && to === "CLAWD") ||
    (inputMint === SOL_MINT && outputMint === CLAWD_MINT);
  const clawdToSol =
    (from === "CLAWD" && to === "SOL") ||
    (inputMint === CLAWD_MINT && outputMint === SOL_MINT);

  return {
    dir: clawdToSol ? "clawd_to_sol" : solToClawd ? "sol_to_clawd" : fallback.dir,
    amount,
    slippage,
  };
}

export function ClawdSwapWidget() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const hasHolderAccess = isAuthenticated && (user?.role === "admin" || user?.isTokenGated);
  const initialParams = useRef(readInitialSwapParams()).current;

  const [dir, setDir] = useState<SwapDir>(initialParams.dir);
  const [inputAmount, setInputAmount] = useState(initialParams.amount);
  const [slippage, setSlippage] = useState(initialParams.slippage);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [lpStatus, setLpStatus] = useState<LpStatus>("idle");
  const [txSig, setTxSig] = useState<string | null>(null);
  const [liquidityClawdAmount, setLiquidityClawdAmount] = useState("");
  const [liquiditySolAmount, setLiquiditySolAmount] = useState("");
  const [livePrice, setLivePrice] = useState<LivePrice | null>(null);
  const [poolAddress, setPoolAddress] = useState<string | null>(null);
  const [liquidityReady, setLiquidityReady] = useState(false);
  const [poolWarning, setPoolWarning] = useState<string | null>(null);
  const [collectFeeModeName, setCollectFeeModeName] = useState<string | null>(null);
  const [feeCollectionToken, setFeeCollectionToken] = useState<string | null>(null);
  const [poolData, setPoolData] = useState<PoolDataResponse | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const logId = useRef(0);

  const inMint = dir === "sol_to_clawd" ? SOL_MINT : CLAWD_MINT;
  const outMint = dir === "sol_to_clawd" ? CLAWD_MINT : SOL_MINT;
  const inSymbol = dir === "sol_to_clawd" ? "SOL" : "CLAWD";
  const outSymbol = dir === "sol_to_clawd" ? "CLAWD" : "SOL";

  const addLog = useCallback((type: LogLine["type"], text: string) => {
    setLogs((prev) => [...prev.slice(-14), { id: logId.current++, type, text }]);
  }, []);

  // Bootstrap pool info + live price
  useEffect(() => {
    meteoraSwap.status().then((s) => {
      if (s.poolAddress) setPoolAddress(s.poolAddress);
      if (s.livePrice) setLivePrice(s.livePrice);
      setLiquidityReady(!!s.liquidityReady);
      setPoolWarning(s.warning ?? null);
      setCollectFeeModeName(s.collectFeeModeName);
      setFeeCollectionToken(s.feeCollectionToken);
    }).catch(() => {});
    meteoraSwap.poolData().then(setPoolData).catch(() => {});
  }, []);

  // Subscribe to live price via Helius WS (backend-proxied polling)
  useEffect(() => {
    const unsub = subscribeHeliusPrice("", (p) => setLivePrice(p));
    return unsub;
  }, []);

  // Auto-quote on amount change
  useEffect(() => {
    const n = parseFloat(inputAmount);
    if (!hasHolderAccess || !n || n <= 0) { setQuote(null); return; }
    if (!liquidityReady) { setQuote(null); return; }
    const t = setTimeout(() => fetchQuote(n), 600);
    return () => clearTimeout(t);
  }, [inputAmount, dir, slippage, liquidityReady, hasHolderAccess]);

  async function fetchQuote(amount: number) {
    if (!hasHolderAccess) {
      setQuote(null);
      setStatus("idle");
      return;
    }
    setStatus("quoting");
    setQuote(null);
    try {
      const q = await meteoraSwap.quote(inMint, outMint, amount, slippage);
      setQuote(q);
      if (q.comparison.meteoraIsBetter) {
        addLog("success", q.comparison.message);
      } else {
        addLog("info", q.comparison.message);
      }
      setStatus("quoted");
    } catch (e: any) {
      addLog("error", `Quote failed: ${e.message}`);
      setStatus("error");
    }
  }

  async function handleSwap() {
    if (!hasHolderAccess) {
      toast({
        title: "$CLAWD holder access required",
        description: "Browse DEX data freely. Swaps are reserved for live $CLAWD holders.",
        variant: "destructive",
      });
      return;
    }
    if (!connected || !publicKey || !signTransaction) return;
    if (!liquidityReady) {
      toast({
        title: "Pool liquidity pending",
        description: "The CLAWD/SOL Meteora pool exists, but swaps are disabled until treasury liquidity is seeded.",
        variant: "destructive",
      });
      return;
    }
    const amount = parseFloat(inputAmount);
    if (!amount || amount <= 0) return;

    setStatus("signing");
    addLog("info", `Building ${inSymbol} → ${outSymbol} swap…`);

    try {
      // 1. Build transaction
      const { transaction: txB64, lastValidBlockHeight, quote: q } =
        await meteoraSwap.buildSwap({
          inputMint: inMint,
          outputMint: outMint,
          amount,
          userWallet: publicKey.toString(),
          slippage,
        });

      addLog("info", `Signing…`);

      // 2. Deserialize + sign — try VersionedTransaction first (Token-2022 may produce versioned txs)
      const txBuffer = Buffer.from(txB64, "base64");
      let tx: Transaction | VersionedTransaction;
      try {
        tx = VersionedTransaction.deserialize(txBuffer);
      } catch {
        tx = Transaction.from(txBuffer);
      }
      const signed = await signTransaction(tx as any);

      setStatus("submitting");
      addLog("info", "Submitting to Solana…");

      // 3. Submit
      const serialized = Buffer.from(signed.serialize()).toString("base64");
      const { signature, explorerUrl } = await meteoraSwap.submit(serialized);

      setTxSig(signature);
      setStatus("done");
      addLog("success", `Swapped! ${q.outputAmount.toFixed(4)} ${outSymbol} received`);
      toast({
        title: "Swap Confirmed",
        description: `Got ${q.outputAmount.toFixed(4)} ${outSymbol}`,
      });

      // Reset after 3s
      setTimeout(() => {
        setStatus("idle");
        setInputAmount("");
        setQuote(null);
        setTxSig(null);
      }, 3000);
    } catch (e: any) {
      setStatus("error");
      addLog("error", e.message ?? "Swap failed");
      toast({ title: "Swap failed", description: e.message, variant: "destructive" });
    }
  }

  async function handleAddLiquidity() {
    if (!hasHolderAccess) {
      toast({
        title: "$CLAWD holder access required",
        description: "Liquidity actions are reserved for live $CLAWD holders.",
        variant: "destructive",
      });
      return;
    }
    if (!connected || !publicKey || !signTransaction) return;

    const clawdAmount = parseFloat(liquidityClawdAmount);
    const solAmount = parseFloat(liquiditySolAmount);
    if (!clawdAmount || clawdAmount <= 0 || !solAmount || solAmount <= 0) {
      toast({
        title: "Enter both sides",
        description: "Adding DAMM v2 liquidity requires CLAWD and SOL amounts.",
        variant: "destructive",
      });
      return;
    }

    setLpStatus("signing");
    addLog("info", `Building LP position for ${clawdAmount} CLAWD + ${solAmount} SOL…`);

    try {
      const result = await meteoraSwap.buildAddLiquidity({
        clawdAmount,
        solAmount,
        userWallet: publicKey.toString(),
        slippagePct: slippage,
      });

      addLog("info", "Signing LP transaction…");
      const txBuffer = Buffer.from(result.transaction, "base64");
      let tx: Transaction | VersionedTransaction;
      try {
        tx = VersionedTransaction.deserialize(txBuffer);
      } catch {
        tx = Transaction.from(txBuffer);
      }
      const signed = await signTransaction(tx as any);

      setLpStatus("submitting");
      addLog("info", "Submitting LP position…");

      const serialized = Buffer.from(signed.serialize()).toString("base64");
      const { signature } = await meteoraSwap.submit(serialized);

      setTxSig(signature);
      setLpStatus("done");
      addLog("success", `Liquidity added. Position ${result.positionAddress.slice(0, 6)}…${result.positionAddress.slice(-4)}`);
      toast({
        title: "Liquidity Added",
        description: "Your CLAWD/SOL Meteora position was created.",
      });

      meteoraSwap.status().then((s) => {
        if (s.livePrice) setLivePrice(s.livePrice);
        setLiquidityReady(!!s.liquidityReady);
      }).catch(() => {});
      meteoraSwap.poolData().then(setPoolData).catch(() => {});

      setTimeout(() => {
        setLpStatus("idle");
        setLiquidityClawdAmount("");
        setLiquiditySolAmount("");
      }, 3000);
    } catch (e: any) {
      setLpStatus("error");
      addLog("error", e.message ?? "Add liquidity failed");
      toast({ title: "Add liquidity failed", description: e.message, variant: "destructive" });
    }
  }

  function flipDir() {
    setDir((d) => (d === "sol_to_clawd" ? "clawd_to_sol" : "sol_to_clawd"));
    setInputAmount("");
    setQuote(null);
    setStatus("idle");
  }

  const busy = status === "quoting" || status === "signing" || status === "submitting";
  const lpBusy = lpStatus === "signing" || lpStatus === "submitting";
  const savingsPct = quote?.comparison.savingsPct;
  const meteoraIsBetter = quote?.comparison.meteoraIsBetter;
  const indexedSummary = poolData?.indexed.summary;
  const chainPool = poolData?.chain;
  const formatUsd = (value?: number | null) => (
    typeof value === "number" && Number.isFinite(value)
      ? `$${value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 })}`
      : "—"
  );
  const formatNumber = (value?: number | null, digits = 2) => (
    typeof value === "number" && Number.isFinite(value)
      ? value.toLocaleString("en-US", { maximumFractionDigits: digits })
      : "—"
  );

  return (
    <Card className="mx-auto w-full max-w-md border border-zinc-700/60 bg-zinc-900/90 text-zinc-100 shadow-2xl">
      <CardHeader className="pb-2 px-3 pt-3 sm:px-6 sm:pt-6">
        <CardTitle className="flex items-start justify-between gap-3 text-sm font-semibold sm:text-base">
          <span className="flex min-w-0 items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="truncate">CLAWD Swap</span>
          </span>
          {livePrice && (
            <Badge variant="outline" className="text-xs border-green-500/40 text-green-400 flex items-center gap-1">
              <Wifi className="w-3 h-3" />
              Live
            </Badge>
          )}
        </CardTitle>

        {/* Live price ticker */}
        {livePrice && (
          <div className="text-xs text-zinc-400 flex items-center gap-2 pt-1">
            <span>1 SOL = {livePrice.clawdPerSol.toLocaleString("en-US", { maximumFractionDigits: 0 })} CLAWD</span>
            <span className="text-zinc-600">|</span>
            <span>{livePrice.clawdReserve.toLocaleString("en-US", { maximumFractionDigits: 0 })} CLAWD reserve</span>
          </div>
        )}

        {!liquidityReady && (
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-950/30 p-2.5 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <div>
                <div className="font-semibold">Native swap liquidity pending</div>
                <div className="text-amber-200/75">
                  {poolWarning ?? "The pool is configured, but swaps are paused until it is seeded."}
                </div>
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3 px-3 pb-3 sm:px-6 sm:pb-6">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5 text-xs">
          <div>
            <div className="text-zinc-500">TVL</div>
            <div className="font-semibold text-zinc-200">
              {formatUsd(indexedSummary?.tvl)}
            </div>
          </div>
          <div>
            <div className="text-zinc-500">24h Volume</div>
            <div className="font-semibold text-zinc-200">{formatUsd(indexedSummary?.volume24h)}</div>
          </div>
          <div>
            <div className="text-zinc-500">24h Fees</div>
            <div className="font-semibold text-zinc-200">{formatUsd(indexedSummary?.fees24h)}</div>
          </div>
          <div>
            <div className="text-zinc-500">Reserves</div>
            <div className="font-semibold text-zinc-200">
              {chainPool
                ? `${formatNumber(Number(chainPool.tokenAAmount), 0)} CLAWD / ${formatNumber(Number(chainPool.tokenBAmount), 4)} SOL`
                : "—"}
            </div>
          </div>
        </div>

        {/* Input token */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>You pay</span>
            <Badge variant="outline" className="text-xs border-zinc-600">
              {inSymbol}
            </Badge>
          </div>
          <Input
            type="number"
            placeholder={`Amount in ${inSymbol}`}
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
            disabled={busy || !liquidityReady || !hasHolderAccess}
            className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-500 focus-visible:ring-amber-500/50"
          />
        </div>

        {/* Flip button */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={flipDir}
            disabled={busy}
            className="rounded-full w-8 h-8 p-0 text-zinc-400 hover:text-amber-400 hover:bg-zinc-800"
          >
            <ArrowDownUp className="w-4 h-4" />
          </Button>
        </div>

        {/* Output token */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>You receive</span>
            <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">
              {outSymbol}
            </Badge>
          </div>
          <div className="h-10 rounded-md bg-zinc-800 border border-zinc-700 px-3 flex items-center text-sm">
            {status === "quoting" ? (
              <span className="text-zinc-500 flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Getting best price…
              </span>
            ) : quote ? (
              <span className="text-amber-300 font-medium">
                {quote.meteora.outputAmount.toFixed(outSymbol === "SOL" ? 6 : 2)} {outSymbol}
              </span>
            ) : (
              <span className="text-zinc-600">
                {liquidityReady ? "—" : "Paused until pool is seeded"}
              </span>
            )}
          </div>
        </div>

        {/* Price comparison banner */}
        {quote && (
          <div className={`rounded-md p-2.5 text-xs border ${
            meteoraIsBetter
              ? "bg-green-900/20 border-green-700/40 text-green-300"
              : "bg-zinc-800/60 border-zinc-700/40 text-zinc-400"
          }`}>
            <div className="flex items-center gap-1.5 mb-1">
              <TrendingDown className="w-3 h-3" />
              <span className="font-medium">
                {meteoraIsBetter
                  ? `Save ${savingsPct?.toFixed(2)}% vs Jupiter`
                  : quote.comparison.message}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 text-zinc-400">
              <div>
                <div className="font-medium text-zinc-200">Meteora</div>
                <div>{quote.meteora.outputAmount.toFixed(6)} {outSymbol}</div>
                <div className="text-zinc-500">{quote.meteora.feePct} fee</div>
              </div>
              {quote.jupiter && (
                <div>
                  <div className="font-medium text-zinc-400">Jupiter</div>
                  <div>{quote.jupiter.outAmount.toFixed(6)} {outSymbol}</div>
                  <div className="text-zinc-500">
                    {quote.jupiter.priceImpactPct.toFixed(3)}% impact
                  </div>
                </div>
              )}
            </div>
            <div className="mt-1.5 text-zinc-500">
              Price impact: {quote.meteora.priceImpactPct.toFixed(3)}% •
              Min received: {quote.meteora.minOutputAmount.toFixed(6)} {outSymbol}
            </div>
          </div>
        )}

        {/* Slippage selector */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Slippage:</span>
          {[0.5, 1, 2].map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                slippage === s
                  ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                  : "text-zinc-500 hover:text-zinc-300 border border-transparent"
              }`}
            >
              {s}%
            </button>
          ))}
        </div>

        {/* Action button */}
          {!hasHolderAccess ? (
          <Button
            disabled
            className="w-full bg-zinc-800 text-zinc-400 font-semibold h-10 rounded-md disabled:opacity-80"
          >
            Hold $CLAWD to swap
          </Button>
        ) : !connected ? (
          <WalletMultiButton className="w-full !bg-amber-600 hover:!bg-amber-500 !rounded-md !text-sm !font-medium !h-10" />
        ) : (
          <Button
            onClick={handleSwap}
            disabled={busy || !quote || status === "done" || !liquidityReady}
            className="w-full bg-amber-600 hover:bg-amber-500 text-white font-semibold h-10 rounded-md disabled:opacity-50"
          >
            {status === "signing" && <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sign Transaction…</>}
            {status === "submitting" && <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting…</>}
            {status === "done" && <><CheckCircle2 className="w-4 h-4 mr-2 text-green-400" />Done!</>}
            {!liquidityReady && "Liquidity Pending"}
            {liquidityReady && (status === "idle" || status === "quoted" || status === "error" || status === "quoting") && (
              `Swap ${inSymbol} → ${outSymbol}`
            )}
          </Button>
        )}

        {/* Add liquidity */}
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/10 p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-emerald-300">Add CLAWD/SOL liquidity</div>
              <div className="text-xs text-zinc-500">
                Opens a new Meteora DAMM v2 LP position owned by your wallet.
              </div>
            </div>
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
              LP
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-500">CLAWD</div>
              <Input
                type="number"
                placeholder="100000"
                value={liquidityClawdAmount}
                onChange={(e) => setLiquidityClawdAmount(e.target.value)}
                disabled={busy || lpBusy || !hasHolderAccess}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:ring-emerald-500/50"
              />
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-500">SOL</div>
              <Input
                type="number"
                placeholder="0.05"
                value={liquiditySolAmount}
                onChange={(e) => setLiquiditySolAmount(e.target.value)}
                disabled={busy || lpBusy || !hasHolderAccess}
                className="bg-zinc-800 border-zinc-700 text-zinc-100 placeholder-zinc-600 focus-visible:ring-emerald-500/50"
              />
            </div>
          </div>

          <Button
            onClick={handleAddLiquidity}
            disabled={!hasHolderAccess || !connected || busy || lpBusy || lpStatus === "done" || !liquidityClawdAmount || !liquiditySolAmount}
            className="w-full bg-emerald-700 hover:bg-emerald-600 text-white font-semibold h-9 rounded-md disabled:opacity-50"
          >
            {lpStatus === "signing" && <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sign LP Transaction…</>}
            {lpStatus === "submitting" && <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting LP…</>}
            {lpStatus === "done" && <><CheckCircle2 className="w-4 h-4 mr-2 text-green-300" />Liquidity Added</>}
            {!hasHolderAccess && "Hold $CLAWD to add liquidity"}
            {hasHolderAccess && (lpStatus === "idle" || lpStatus === "error") && "Add Liquidity"}
          </Button>

          <div className="text-[11px] text-zinc-600">
            Use both tokens in roughly the current pool ratio. You keep the LP position NFT.
          </div>
        </div>

        {/* Tx confirmation */}
        {txSig && (
          <a
            href={`https://solscan.io/tx/${txSig}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            <ExternalLink className="w-3 h-3" />
            View on Solscan
          </a>
        )}

        {/* Activity log */}
        {logs.length > 0 && (
          <div className="rounded-md bg-zinc-950/60 border border-zinc-800 p-2 space-y-0.5 max-h-28 overflow-y-auto">
            {logs.map((l) => (
              <div
                key={l.id}
                className={`text-xs flex items-start gap-1.5 ${
                  l.type === "success"
                    ? "text-green-400"
                    : l.type === "error"
                    ? "text-red-400"
                    : "text-zinc-400"
                }`}
              >
                {l.type === "success" && <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                {l.type === "error" && <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                {l.type === "info" && <RefreshCw className="w-3 h-3 mt-0.5 flex-shrink-0" />}
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pool info footer */}
        <div className="text-xs text-zinc-600 flex items-center justify-between border-t border-zinc-800 pt-2">
          <span>Meteora DAMM v2 • {collectFeeModeName ?? "Pool"} mode</span>
          {poolAddress && (
            <a
              href={`https://app.meteora.ag/pools/${poolAddress}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-zinc-500 hover:text-zinc-300"
            >
              Pool <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
        <div className="text-xs text-zinc-600 text-center">
          Route volume through the CLAWD/SOL pool
          {feeCollectionToken ? ` • Fees: ${feeCollectionToken}` : ""}
        </div>
      </CardContent>
    </Card>
  );
}
