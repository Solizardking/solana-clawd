import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VersionedTransaction } from "@solana/web3.js";
import {
  AlertTriangle,
  ArrowDownUp,
  Bot,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Scissors,
  Send,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getDFlowOrder, type DFlowOrderResponse } from "@/lib/dflow";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const BASE_TOKENS = {
  SOL: { symbol: "SOL", mint: SOL_MINT, decimals: 9 },
  USDC: { symbol: "USDC", mint: USDC_MINT, decimals: 6 },
} as const;

type BaseTokenKey = keyof typeof BASE_TOKENS;
type TradeSide = "buy" | "sell";

type TokenSnapshotSummary = {
  address: string;
  symbol?: string;
  name?: string;
  decimals?: number | null;
  logoURI?: string | null;
  price?: number | null;
  priceChange24hPercent?: number | null;
  volume24hUSD?: number | null;
  liquidity?: number | null;
  marketCap?: number | null;
  top10HolderPercent?: number | null;
  creatorPercentage?: number | null;
  isMintable?: boolean | null;
  isFreezable?: boolean | null;
};

type TokenAnalysisResponse = {
  success: boolean;
  generatedAt?: string;
  model?: string;
  analysis?: string;
  snapshot?: {
    summary?: TokenSnapshotSummary;
    sources?: Array<{ label: string; available: boolean; error?: string }>;
  };
  error?: string;
};

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type ClawdTokenActionProps = {
  mintAddress: string;
  symbol?: string;
  name?: string;
  logoURI?: string;
  decimals?: number | null;
  price?: number | null;
  variant?: "icon" | "inline" | "badge";
  className?: string;
};

function stopEvent(event: React.MouseEvent) {
  event.stopPropagation();
}

function formatPrice(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value < 0.000001) return `$${value.toExponential(2)}`;
  if (value < 0.01) return `$${value.toFixed(6)}`;
  if (value < 1) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatCompact(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatAtomicAmount(raw: string | undefined, decimals: number) {
  if (!raw) return "n/a";
  const numeric = Number(raw) / Math.pow(10, decimals);
  if (!Number.isFinite(numeric)) return "n/a";
  return numeric.toLocaleString("en-US", { maximumFractionDigits: decimals > 6 ? 6 : decimals });
}

function uiAmountToAtomic(value: string, decimals: number) {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  const paddedFraction = fraction.slice(0, decimals).padEnd(decimals, "0");
  const base = 10n ** BigInt(decimals);
  const wholeUnits = BigInt(whole || "0") * base;
  const fractionalUnits = BigInt(paddedFraction || "0");
  return (wholeUnits + fractionalUnits).toString();
}

function transactionBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sourceLabel(snapshot?: TokenAnalysisResponse["snapshot"]) {
  const sources = snapshot?.sources ?? [];
  const available = sources.filter((source) => source.available).length;
  if (!sources.length) return "Birdeye snapshot";
  return `${available}/${sources.length} Birdeye feeds`;
}

export function ClawdTokenAction({
  mintAddress,
  symbol,
  name,
  logoURI,
  decimals,
  price,
  variant = "icon",
  className,
}: ClawdTokenActionProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<TokenAnalysisResponse["snapshot"] | null>(null);
  const [question, setQuestion] = useState("");

  const [side, setSide] = useState<TradeSide>("buy");
  const [baseToken, setBaseToken] = useState<BaseTokenKey>("SOL");
  const [amountUi, setAmountUi] = useState("");
  const [slippageBps, setSlippageBps] = useState("auto");
  const [order, setOrder] = useState<DFlowOrderResponse | null>(null);
  const [tradeStatus, setTradeStatus] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const walletAddress = publicKey?.toBase58();

  const summary = snapshot?.summary;
  const tokenSymbol = summary?.symbol || symbol || "TOKEN";
  const tokenName = summary?.name || name || tokenSymbol;
  const tokenLogo = summary?.logoURI || logoURI;
  const tokenDecimals = summary?.decimals ?? decimals ?? 6;
  const livePrice = summary?.price ?? price;
  const selectedBase = BASE_TOKENS[baseToken];

  const inputToken = side === "buy"
    ? selectedBase
    : { symbol: tokenSymbol, mint: mintAddress, decimals: tokenDecimals };
  const outputToken = side === "buy"
    ? { symbol: tokenSymbol, mint: mintAddress, decimals: tokenDecimals }
    : BASE_TOKENS.SOL;

  const canTrade = Boolean(walletAddress && amountUi.trim());
  const solscanUrl = txSignature ? `https://solscan.io/tx/${txSignature}` : null;

  const loadAnalysis = useCallback(async (nextQuestion = "", mode: "replace" | "append" = "replace") => {
    if (!mintAddress) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const response = await fetch("/api/deepseek/token-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: mintAddress,
          symbol,
          name,
          question: nextQuestion || undefined,
          walletAddress,
        }),
      });
      const data: TokenAnalysisResponse = await response.json().catch(() => ({ success: false, error: "Invalid analysis response" }));
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Analysis failed (${response.status})`);
      }
      const content = data.analysis || "No analysis returned.";
      setSnapshot(data.snapshot ?? null);
      setLastUpdated(data.generatedAt ?? new Date().toISOString());
      setMessages((current) => {
        if (mode === "append") {
          return [...current, { id: crypto.randomUUID(), role: "assistant", content }];
        }
        if (current.some((message) => message.role === "user")) return current;
        return [{ id: crypto.randomUUID(), role: "assistant", content }];
      });
    } catch (error: any) {
      setAnalysisError(error?.message || "Unable to run Clawd analysis.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [mintAddress, name, symbol, walletAddress]);

  useEffect(() => {
    if (!open || messages.length) return;
    void loadAnalysis();
  }, [loadAnalysis, messages.length, open]);

  useEffect(() => {
    if (!open) return;
    const interval = window.setInterval(() => {
      void loadAnalysis();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadAnalysis, open]);

  const askFollowUp = useCallback(async () => {
    const next = question.trim();
    if (!next || isAnalyzing) return;
    setQuestion("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: next }]);
    await loadAnalysis(next, "append");
  }, [isAnalyzing, loadAnalysis, question]);

  const resetTradeState = useCallback(() => {
    setOrder(null);
    setTradeError(null);
    setTradeStatus(null);
    setTxSignature(null);
  }, []);

  const quoteOrder = useCallback(async () => {
    resetTradeState();
    if (!walletAddress) {
      setTradeError("Connect a wallet before building a trade transaction.");
      return;
    }
    const amount = uiAmountToAtomic(amountUi, inputToken.decimals);
    if (!amount || amount === "0") {
      setTradeError(`Enter a valid ${inputToken.symbol} amount.`);
      return;
    }
    setIsQuoting(true);
    try {
      const slippage = slippageBps === "auto" ? "auto" : Number(slippageBps);
      const nextOrder = await getDFlowOrder({
        inputMint: inputToken.mint,
        outputMint: outputToken.mint,
        amount,
        userPublicKey: walletAddress,
        slippageBps: Number.isFinite(slippage as number) ? slippage as number : "auto",
        prioritizationFeeLamports: "auto",
        includeAddressLookupTables: true,
      });
      setOrder(nextOrder);
      setTradeStatus(nextOrder.transaction ? "Route ready. Review and sign in your wallet." : "Route returned without a transaction.");
    } catch (error: any) {
      setTradeError(error?.message || "Unable to build a DFlow order.");
    } finally {
      setIsQuoting(false);
    }
  }, [amountUi, inputToken.decimals, inputToken.mint, inputToken.symbol, outputToken.mint, resetTradeState, slippageBps, walletAddress]);

  const executeOrder = useCallback(async () => {
    if (!order?.transaction || !order.lastValidBlockHeight) {
      setTradeError("Build a DFlow order before signing.");
      return;
    }
    setIsExecuting(true);
    setTradeError(null);
    setTradeStatus("Waiting for wallet confirmation...");
    try {
      const tx = VersionedTransaction.deserialize(transactionBytes(order.transaction));
      const signature = await sendTransaction(tx, connection);
      setTradeStatus("Confirming on Solana...");
      await connection.confirmTransaction({
        signature,
        blockhash: tx.message.recentBlockhash,
        lastValidBlockHeight: order.lastValidBlockHeight,
      }, "confirmed");
      setTxSignature(signature);
      setTradeStatus("Trade confirmed.");
    } catch (error: any) {
      setTradeError(error?.message || "Trade was not confirmed.");
      setTradeStatus(null);
    } finally {
      setIsExecuting(false);
    }
  }, [connection, order?.lastValidBlockHeight, order?.transaction, sendTransaction]);

  const trigger = useMemo(() => {
    const baseClass = cn(
      "border-cyan-400/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20 hover:text-white",
      className,
    );
    if (variant === "inline") {
      return (
        <Button size="sm" variant="outline" className={baseClass} onClick={stopEvent}>
          <Scissors className="h-3.5 w-3.5" />
          Clawd
        </Button>
      );
    }
    if (variant === "badge") {
      return (
        <button
          type="button"
          onClick={stopEvent}
          className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2 text-[11px] font-bold", baseClass)}
          aria-label={`Open Clawd analysis for ${tokenSymbol}`}
        >
          <Scissors className="h-3 w-3" />
          Claw
        </button>
      );
    }
    return (
      <Button
        type="button"
        size="icon"
        variant="outline"
        className={cn("h-8 w-8", baseClass)}
        aria-label={`Open Clawd analysis for ${tokenSymbol}`}
        title={`Clawd analyze ${tokenSymbol}`}
        onClick={stopEvent}
      >
        <Scissors className="h-3.5 w-3.5" />
      </Button>
    );
  }, [className, tokenSymbol, variant]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-h-[92vh] w-[min(96vw,980px)] max-w-none overflow-hidden border-cyan-400/20 bg-zinc-950 p-0 text-zinc-100 shadow-[0_24px_120px_rgba(0,0,0,0.6)]"
        onClick={stopEvent}
      >
        <div className="grid max-h-[92vh] overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-w-0 overflow-y-auto p-5">
            <DialogHeader className="space-y-3 pr-8">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-cyan-400/20 bg-black/40">
                  {tokenLogo ? (
                    <img src={tokenLogo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Bot className="h-6 w-6 text-cyan-200" />
                  )}
                </div>
                <div className="min-w-0">
                  <DialogTitle className="truncate text-xl font-black text-white">
                    Clawd token chat
                  </DialogTitle>
                  <DialogDescription className="mt-1 text-xs text-zinc-400">
                    {tokenName} ({tokenSymbol}) · {formatPrice(livePrice)} · {sourceLabel(snapshot ?? undefined)}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-cyan-400/25 bg-cyan-400/10 text-cyan-100">DeepSeek</Badge>
                <Badge className="border-emerald-400/25 bg-emerald-400/10 text-emerald-100">Birdeye live</Badge>
                <Badge className="border-amber-400/25 bg-amber-400/10 text-amber-100">Wallet confirmation required</Badge>
              </div>
            </DialogHeader>

            <div className="mt-5 grid gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-white/8 bg-black/25 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Liquidity</div>
                <div className="mt-1 text-sm font-bold text-white">{formatCompact(summary?.liquidity)}</div>
              </div>
              <div className="rounded-md border border-white/8 bg-black/25 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Volume 24h</div>
                <div className="mt-1 text-sm font-bold text-white">{formatCompact(summary?.volume24hUSD)}</div>
              </div>
              <div className="rounded-md border border-white/8 bg-black/25 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Top 10</div>
                <div className="mt-1 text-sm font-bold text-white">
                  {summary?.top10HolderPercent == null ? "n/a" : `${summary.top10HolderPercent.toFixed(1)}%`}
                </div>
              </div>
              <div className="rounded-md border border-white/8 bg-black/25 p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">Authorities</div>
                <div className="mt-1 text-sm font-bold text-white">
                  {summary?.isMintable ? "Mintable" : summary?.isFreezable ? "Freezable" : "Clear"}
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-white/8 bg-black/30">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">
                  Live analysis
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadAnalysis()}
                  disabled={isAnalyzing}
                  className="h-8 border-white/10 bg-black/20 text-zinc-200 hover:bg-white/5"
                >
                  {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Refresh
                </Button>
              </div>
              <div className="space-y-4 p-4">
                {analysisError ? (
                  <div className="rounded-md border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100">
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    {analysisError}
                  </div>
                ) : null}
                {!messages.length && isAnalyzing ? (
                  <div className="flex items-center gap-3 py-8 text-sm text-zinc-400">
                    <Loader2 className="h-5 w-5 animate-spin text-cyan-200" />
                    Clawd is reading Birdeye feeds and reasoning with DeepSeek...
                  </div>
                ) : null}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "rounded-lg border p-4 text-sm leading-relaxed",
                      message.role === "user"
                        ? "ml-auto max-w-[88%] border-cyan-400/20 bg-cyan-400/10 text-cyan-50"
                        : "border-white/8 bg-zinc-900/70 text-zinc-200",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    ) : (
                      message.content
                    )}
                  </div>
                ))}
                {lastUpdated ? (
                  <div className="text-[11px] text-zinc-600">
                    Updated {new Date(lastUpdated).toLocaleTimeString()}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={`Ask Clawd about ${tokenSymbol} risk, entries, liquidity, or sell pressure`}
                className="min-h-[52px] resize-none border-white/10 bg-black/30 text-sm"
              />
              <Button
                type="button"
                onClick={() => void askFollowUp()}
                disabled={!question.trim() || isAnalyzing}
                className="h-[52px] bg-cyan-500 text-black hover:bg-cyan-400"
              >
                {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </section>

          <aside className="border-t border-white/8 bg-black/35 p-5 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500">DFlow execution</div>
                <div className="mt-1 text-lg font-black text-white">Trade {tokenSymbol}</div>
              </div>
              <ArrowDownUp className="h-5 w-5 text-cyan-200" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={side === "buy" ? "default" : "outline"}
                onClick={() => { setSide("buy"); resetTradeState(); }}
                className={side === "buy" ? "bg-emerald-500 text-black hover:bg-emerald-400" : "border-white/10 bg-black/20 text-zinc-200"}
              >
                Buy
              </Button>
              <Button
                type="button"
                variant={side === "sell" ? "default" : "outline"}
                onClick={() => { setSide("sell"); resetTradeState(); }}
                className={side === "sell" ? "bg-red-500 text-white hover:bg-red-400" : "border-white/10 bg-black/20 text-zinc-200"}
              >
                Sell
              </Button>
            </div>

            {side === "buy" ? (
              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-zinc-400">Pay with</label>
                <Select value={baseToken} onValueChange={(value) => { setBaseToken(value as BaseTokenKey); resetTradeState(); }}>
                  <SelectTrigger className="border-white/10 bg-black/30">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SOL">SOL</SelectItem>
                    <SelectItem value="USDC">USDC</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-zinc-400">Amount in {inputToken.symbol}</label>
              <Input
                value={amountUi}
                onChange={(event) => { setAmountUi(event.target.value); resetTradeState(); }}
                inputMode="decimal"
                placeholder={side === "buy" ? "0.05" : "1000"}
                className="border-white/10 bg-black/30"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium text-zinc-400">Slippage bps</label>
              <Input
                value={slippageBps}
                onChange={(event) => { setSlippageBps(event.target.value || "auto"); resetTradeState(); }}
                placeholder="auto"
                className="border-white/10 bg-black/30"
              />
            </div>

            <div className="mt-4 rounded-md border border-white/8 bg-zinc-950/80 p-3 text-xs text-zinc-400">
              <div className="flex items-center justify-between">
                <span>Route</span>
                <span className="text-zinc-200">{inputToken.symbol} to {outputToken.symbol}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Expected out</span>
                <span className="text-zinc-200">{formatAtomicAmount(order?.outAmount, outputToken.decimals)} {outputToken.symbol}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Min received</span>
                <span className="text-zinc-200">{formatAtomicAmount(order?.minOutAmount ?? order?.otherAmountThreshold, outputToken.decimals)} {outputToken.symbol}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Price impact</span>
                <span className="text-zinc-200">{order?.priceImpactPct ? `${Number(order.priceImpactPct).toFixed(3)}%` : "n/a"}</span>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {walletAddress ? (
                <Button
                  type="button"
                  onClick={() => void quoteOrder()}
                  disabled={!canTrade || isQuoting || isExecuting}
                  className="w-full bg-cyan-500 text-black hover:bg-cyan-400"
                >
                  {isQuoting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Build DFlow Order
                </Button>
              ) : (
                <div className="wallet-adapter-compact">
                  <WalletMultiButton />
                </div>
              )}
              <Button
                type="button"
                onClick={() => void executeOrder()}
                disabled={!order?.transaction || isExecuting}
                className="w-full bg-emerald-500 text-black hover:bg-emerald-400"
              >
                {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Sign and Execute
              </Button>
            </div>

            {tradeStatus ? (
              <div className="mt-4 rounded-md border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                {tradeStatus}
              </div>
            ) : null}
            {tradeError ? (
              <div className="mt-4 rounded-md border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-100">
                <AlertTriangle className="mr-2 inline h-4 w-4" />
                {tradeError}
              </div>
            ) : null}
            {solscanUrl ? (
              <a
                href={solscanUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-cyan-200 hover:text-cyan-100"
              >
                View transaction <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}

            <p className="mt-5 text-xs leading-relaxed text-zinc-500">
              Clawd can analyze and prepare the route, but the connected wallet signs every trade. Analysis is informational.
            </p>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
