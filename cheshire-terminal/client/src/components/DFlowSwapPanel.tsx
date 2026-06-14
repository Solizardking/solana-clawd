import { useState, useCallback, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction, Transaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowDownUp, Loader2, Zap, CheckCircle2, AlertTriangle,
  ExternalLink, RefreshCw, Info,
} from "lucide-react";
import { getDFlowIntent, submitDFlowIntent, type DFlowIntentQuote } from "@/lib/dflow";
import { useToast } from "@/hooks/use-toast";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BONK_MINT = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263";
const JUP_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

const COMMON_TOKENS = [
  { symbol: "SOL", mint: SOL_MINT, decimals: 9 },
  { symbol: "USDC", mint: USDC_MINT, decimals: 6 },
  { symbol: "BONK", mint: BONK_MINT, decimals: 5 },
  { symbol: "JUP", mint: JUP_MINT, decimals: 6 },
  { symbol: "CLAWD", mint: CLAWD_MINT, decimals: 6 },
];

function tokenByMint(mint: string) {
  return COMMON_TOKENS.find((t) => t.mint === mint);
}

function tokenBySymbol(symbol: string) {
  const normalized = symbol.replace(/^\$/, "").toUpperCase();
  return COMMON_TOKENS.find((t) => t.symbol === normalized);
}

function resolveTokenParam(value: string | null, fallbackMint: string) {
  if (!value) return fallbackMint;
  const byMint = tokenByMint(value);
  if (byMint) return byMint.mint;
  const bySymbol = tokenBySymbol(value);
  return bySymbol?.mint ?? fallbackMint;
}

function readInitialDFlowParams() {
  const fallback = {
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    inputAmount: "",
    slippage: "auto" as "auto" | number,
  };
  if (typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const inputMint = resolveTokenParam(params.get("inputMint") || params.get("from"), fallback.inputMint);
  const outputMint = resolveTokenParam(params.get("outputMint") || params.get("to"), fallback.outputMint);
  const inputAmount = params.get("amount") || "";
  const slippageBps = params.get("slippageBps");
  const slippage = slippageBps && slippageBps !== "auto" && Number.isFinite(Number(slippageBps))
    ? Number(slippageBps)
    : fallback.slippage;

  return { inputMint, outputMint, inputAmount, slippage };
}

function formatAmount(raw: string, decimals: number) {
  const n = Number(raw) / Math.pow(10, decimals);
  return n.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

type SwapStatus = "idle" | "quoting" | "quoted" | "signing" | "submitting" | "done" | "error";

type LogLine = { id: number; type: "info" | "success" | "error"; text: string };

export function DFlowSwapPanel() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { toast } = useToast();
  const initialParams = useRef(readInitialDFlowParams()).current;

  const [inputMint, setInputMint] = useState(initialParams.inputMint);
  const [outputMint, setOutputMint] = useState(initialParams.outputMint);
  const [inputAmount, setInputAmount] = useState(initialParams.inputAmount);
  const [slippage, setSlippage] = useState<"auto" | number>(initialParams.slippage);
  const [quote, setQuote] = useState<DFlowIntentQuote | null>(null);
  const [status, setStatus] = useState<SwapStatus>("idle");
  const [orderAddress, setOrderAddress] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [logId, setLogId] = useState(0);

  const addLog = useCallback((type: LogLine["type"], text: string) => {
    setLogs((prev) => [...prev.slice(-19), { id: logId, type, text }]);
    setLogId((n) => n + 1);
  }, [logId]);

  const inputToken = tokenByMint(inputMint);
  const outputToken = tokenByMint(outputMint);

  const rawAmount = Math.round(
    (parseFloat(inputAmount) || 0) * Math.pow(10, inputToken?.decimals ?? 9)
  );

  const handleGetQuote = async () => {
    if (!rawAmount || rawAmount <= 0) {
      toast({ title: "Enter an amount", variant: "destructive" });
      return;
    }
    setStatus("quoting");
    setQuote(null);
    setOrderAddress(null);
    setTxSig(null);
    addLog("info", `Getting DFlow intent quote: ${inputAmount} ${inputToken?.symbol} → ${outputToken?.symbol}`);
    try {
      const q = await getDFlowIntent({
        inputMint,
        outputMint,
        amount: rawAmount,
        userPublicKey: publicKey?.toBase58(),
        slippageBps: slippage,
      });
      setQuote(q);
      setStatus("quoted");
      addLog("success", `Quote: ${formatAmount(q.outAmount, outputToken?.decimals ?? 6)} ${outputToken?.symbol} (impact ${Number(q.priceImpactPct).toFixed(2)}%)`);
    } catch (err: any) {
      setStatus("error");
      addLog("error", err.message || "Quote failed");
      toast({ title: "Quote failed", description: err.message, variant: "destructive" });
    }
  };

  const handleSwap = async () => {
    if (!quote || !publicKey || !signTransaction) {
      toast({ title: "Wallet not connected", variant: "destructive" });
      return;
    }
    if (!quote.openTransaction) {
      toast({ title: "No transaction in quote — connect wallet before quoting", variant: "destructive" });
      return;
    }

    setStatus("signing");
    addLog("info", "Signing intent open transaction…");
    try {
      const txBytes = Buffer.from(quote.openTransaction, "base64");
      let signed: string;
      try {
        const vtx = VersionedTransaction.deserialize(txBytes);
        const signedVtx = await signTransaction(vtx as any);
        signed = Buffer.from((signedVtx as any).serialize()).toString("base64");
      } catch {
        const tx = Transaction.from(txBytes);
        const signedTx = await signTransaction(tx as any);
        signed = Buffer.from((signedTx as any).serialize()).toString("base64");
      }

      setStatus("submitting");
      addLog("info", "Submitting intent to DFlow…");
      const result = await submitDFlowIntent(quote, signed);
      setOrderAddress(result.orderAddress);
      setTxSig(result.openTransactionSignature);
      setStatus("done");
      addLog("success", `Intent submitted! Order: ${result.orderAddress.slice(0, 8)}… Tx: ${result.openTransactionSignature.slice(0, 8)}…`);
      toast({
        title: "Intent submitted!",
        description: `Order: ${result.orderAddress.slice(0, 12)}… DFlow will fill it at or better than quoted.`,
      });
    } catch (err: any) {
      setStatus("error");
      addLog("error", err.message || "Swap failed");
      toast({ title: "Swap failed", description: err.message, variant: "destructive" });
    }
  };

  const flipTokens = () => {
    setInputMint(outputMint);
    setOutputMint(inputMint);
    setQuote(null);
    setStatus("idle");
  };

  const reset = () => {
    setQuote(null);
    setStatus("idle");
    setOrderAddress(null);
    setTxSig(null);
    setInputAmount("");
  };

  return (
    <div className="h-full flex flex-col gap-3 p-1">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-mono font-semibold text-cyan-300">DFlow Intent Swap</span>
        <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400 ml-auto">
          quote-api.dflow.net
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 flex-1 min-h-0">

        {/* Left: Swap builder */}
        <div className="space-y-3">
          {/* Input token */}
          <Card className="bg-black/40 border-purple-500/20">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs text-zinc-400 font-mono">You Pay</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="0.00"
                  value={inputAmount}
                  onChange={(e) => { setInputAmount(e.target.value); setQuote(null); setStatus("idle"); }}
                  className="flex-1 bg-black/60 border-purple-500/30 text-white font-mono"
                />
                <select
                  value={inputMint}
                  onChange={(e) => { setInputMint(e.target.value); setQuote(null); setStatus("idle"); }}
                  className="bg-black/60 border border-purple-500/30 text-white rounded-md px-2 text-sm font-mono"
                >
                  {COMMON_TOKENS.map((t) => (
                    <option key={t.mint} value={t.mint}>{t.symbol}</option>
                  ))}
                </select>
              </div>
              {rawAmount > 0 && (
                <div className="text-[10px] text-zinc-500 font-mono">
                  = {rawAmount.toLocaleString()} lamports/atoms
                </div>
              )}
            </CardContent>
          </Card>

          {/* Flip */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={flipTokens}
              className="h-7 w-7 p-0 rounded-full border border-purple-500/30 bg-black/40 hover:bg-purple-500/20"
            >
              <ArrowDownUp className="h-3.5 w-3.5 text-purple-400" />
            </Button>
          </div>

          {/* Output token */}
          <Card className="bg-black/40 border-cyan-500/20">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs text-zinc-400 font-mono">You Receive</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 bg-black/60 border border-cyan-500/20 rounded-md px-3 py-2 font-mono text-sm text-cyan-200 min-h-[38px] flex items-center">
                  {quote
                    ? formatAmount(quote.outAmount, outputToken?.decimals ?? 6)
                    : <span className="text-zinc-600">—</span>}
                </div>
                <select
                  value={outputMint}
                  onChange={(e) => { setOutputMint(e.target.value); setQuote(null); setStatus("idle"); }}
                  className="bg-black/60 border border-cyan-500/30 text-white rounded-md px-2 text-sm font-mono"
                >
                  {COMMON_TOKENS.map((t) => (
                    <option key={t.mint} value={t.mint}>{t.symbol}</option>
                  ))}
                </select>
              </div>
              {quote && (
                <div className="text-[10px] text-zinc-500 font-mono">
                  min received: {formatAmount(quote.minOutAmount, outputToken?.decimals ?? 6)} {outputToken?.symbol}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Slippage */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-mono">Slippage:</span>
            {(["auto", 50, 100, 200] as const).map((s) => (
              <button
                key={String(s)}
                onClick={() => setSlippage(s)}
                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${
                  slippage === s
                    ? "border-cyan-500/50 text-cyan-300 bg-cyan-500/10"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                }`}
              >
                {s === "auto" ? "auto" : `${s / 100}%`}
              </button>
            ))}
          </div>

          {/* Actions */}
          {!connected ? (
            <WalletMultiButton className="!w-full !bg-purple-600 !text-xs !h-9 !rounded-md" />
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={handleGetQuote}
                disabled={status === "quoting" || !rawAmount}
                variant="outline"
                className="flex-1 h-9 text-xs font-mono border-cyan-500/30 text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20"
              >
                {status === "quoting" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Get Quote
              </Button>
              {quote && (
                <Button
                  onClick={handleSwap}
                  disabled={status === "signing" || status === "submitting"}
                  className="flex-1 h-9 text-xs font-mono bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500"
                >
                  {status === "signing" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {status === "submitting" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {status === "signing" ? "Signing…" : status === "submitting" ? "Submitting…" : "Swap"}
                </Button>
              )}
              {(status === "done" || status === "error") && (
                <Button onClick={reset} variant="ghost" size="sm" className="h-9 text-xs text-zinc-400">
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Right: Quote details + logs */}
        <div className="space-y-3 flex flex-col min-h-0">
          {/* Quote card */}
          {quote && (
            <Card className="bg-black/40 border-cyan-500/20">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-zinc-400 font-mono flex items-center gap-1">
                  <Info className="h-3 w-3" /> Quote Details
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Price impact</span>
                  <span className={Number(quote.priceImpactPct) > 5 ? "text-orange-300" : "text-emerald-300"}>
                    {Number(quote.priceImpactPct).toFixed(3)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Slippage tolerance</span>
                  <span className="text-zinc-200">{quote.slippageBps} bps</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Fee budget</span>
                  <span className="text-zinc-200">{(quote.feeBudget / 1e9).toFixed(6)} SOL</span>
                </div>
                {quote.expiry && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Expiry</span>
                    <span className="text-zinc-200">{quote.expiry.slotsAfterOpen} slots</span>
                  </div>
                )}
                {quote.platformFee && (
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Platform fee</span>
                    <span className="text-zinc-200">{quote.platformFee.feeBps} bps</span>
                  </div>
                )}
                {!quote.openTransaction && (
                  <div className="mt-2 rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1.5 text-yellow-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    Connect wallet before quoting to get a signable transaction
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Done state */}
          {status === "done" && orderAddress && (
            <Card className="bg-emerald-950/30 border-emerald-500/30">
              <CardContent className="px-3 py-3 space-y-2">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-mono font-semibold">Intent Submitted!</span>
                </div>
                <div className="text-[10px] font-mono text-zinc-400 space-y-1">
                  <div>
                    <span className="text-zinc-500">Order: </span>
                    <span className="text-emerald-200 break-all">{orderAddress}</span>
                  </div>
                  {txSig && (
                    <div>
                      <span className="text-zinc-500">Tx: </span>
                      <a
                        href={`https://solscan.io/tx/${txSig}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-0.5"
                      >
                        {txSig.slice(0, 12)}…
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 font-mono">
                  DFlow fillers will complete this swap at or better than the quoted rate.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Terminal log */}
          <Card className="bg-black/60 border-purple-500/20 flex-1 min-h-0">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Activity</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 overflow-y-auto max-h-48">
              {logs.length === 0 && (
                <div className="text-[10px] text-zinc-700 font-mono">Enter an amount and get a quote…</div>
              )}
              {logs.map((line) => (
                <div
                  key={line.id}
                  className={`text-[10px] font-mono leading-5 ${
                    line.type === "success" ? "text-emerald-400" :
                    line.type === "error" ? "text-red-400" :
                    "text-zinc-400"
                  }`}
                >
                  <span className="text-zinc-700 mr-1">›</span>
                  {line.text}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
