import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
  Eye,
  Info,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Target,
  Zap,
} from "lucide-react";
import {
  KNOWN_TOKENS,
  createSwapTransaction,
  evaluateOODACondition,
  fromBaseUnits,
  getSwapQuote,
  type DFlowQuoteResponse,
  type OODACondition,
  type OODAConditionType,
} from "@/lib/dflow";
import { HeliusService } from "@/lib/heliusService";
import { useToast } from "@/hooks/use-toast";

const RPC_URL = import.meta.env.VITE_HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com";

type OODAPhase = "idle" | "observe" | "orient" | "decide" | "act" | "waiting" | "done" | "error";
type LogLine = { id: number; type: "info" | "success" | "error" | "warn"; text: string };

const INTERVAL_OPTIONS = [
  { label: "30s", ms: 30_000 },
  { label: "1m",  ms: 60_000 },
  { label: "5m",  ms: 300_000 },
  { label: "15m", ms: 900_000 },
  { label: "1h",  ms: 3_600_000 },
] as const;

function tokenByMint(mint: string) {
  return KNOWN_TOKENS.find((t) => t.mint === mint);
}

function tokenBySymbol(symbol: string) {
  const normalized = symbol.replace(/^\$/, "").toUpperCase();
  return KNOWN_TOKENS.find((t) => t.symbol === normalized);
}

function resolveTokenParam(value: string | null, fallbackMint: string) {
  if (!value) return fallbackMint;
  const byMint = tokenByMint(value);
  if (byMint) return byMint.mint;
  const bySymbol = tokenBySymbol(value);
  return bySymbol?.mint ?? fallbackMint;
}

function readInitialOodaParams() {
  const fallback = {
    inputMint: KNOWN_TOKENS[0]!.mint,
    outputMint: KNOWN_TOKENS[1]!.mint,
    inputAmount: "",
    slippage: "auto" as number | "auto",
  };
  if (typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const slippageBps = params.get("slippageBps");
  const slippage = slippageBps && slippageBps !== "auto" && Number.isFinite(Number(slippageBps))
    ? Number(slippageBps)
    : fallback.slippage;

  return {
    inputMint: resolveTokenParam(params.get("inputMint") || params.get("from"), fallback.inputMint),
    outputMint: resolveTokenParam(params.get("outputMint") || params.get("to"), fallback.outputMint),
    inputAmount: params.get("amount") || "",
    slippage,
  };
}

function fmtRaw(raw: string, decimals: number, maxDigits = 6) {
  return fromBaseUnits(Number(raw), decimals).toLocaleString("en-US", { maximumFractionDigits: maxDigits });
}

// ─── Condition Builder ────────────────────────────────────────────────────────

function ConditionBuilder({
  condition,
  onChange,
  disabled,
}: {
  condition: OODACondition;
  onChange: (c: OODACondition) => void;
  disabled: boolean;
}) {
  const types: { value: OODAConditionType; label: string }[] = [
    { value: "always",      label: "Always" },
    { value: "price_above", label: "Price ≥" },
    { value: "price_below", label: "Price ≤" },
    { value: "output_min",  label: "Output ≥" },
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {types.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange({ ...condition, type: t.value })}
            disabled={disabled}
            className={`text-[10px] font-mono px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
              condition.type === t.value
                ? "border-amber-500/50 text-amber-300 bg-amber-500/10"
                : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {condition.type !== "always" && (
        <div className="flex items-center gap-2">
          <label htmlFor="ooda-condition-value" className="text-[10px] text-zinc-500 font-mono whitespace-nowrap">
            {condition.type === "output_min" ? "Min output" : "Threshold"}
          </label>
          <Input
            id="ooda-condition-value"
            type="number"
            placeholder="0.00"
            value={condition.value || ""}
            onChange={(e) => onChange({ ...condition, value: Number(e.target.value) || 0 })}
            disabled={disabled}
            className="w-28 bg-black/60 border-amber-500/30 text-white font-mono h-7 text-xs"
          />
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function DFlowOODAPanel() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { toast } = useToast();
  const initialParams = useRef(readInitialOodaParams()).current;

  const [inputMint, setInputMint] = useState(initialParams.inputMint);
  const [outputMint, setOutputMint] = useState(initialParams.outputMint);
  const [inputAmount, setInputAmount] = useState(initialParams.inputAmount);
  const [slippage, setSlippage] = useState<number | "auto">(initialParams.slippage);

  const [phase, setPhase] = useState<OODAPhase>("idle");
  const [quote, setQuote] = useState<DFlowQuoteResponse | null>(null);
  const [condition, setCondition] = useState<OODACondition>({ type: "always", value: 0 });
  const [evalResult, setEvalResult] = useState<{ pass: boolean; reason: string } | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);

  // Loop scheduler state
  const [loopRunning, setLoopRunning] = useState(false);
  const [intervalMs, setIntervalMs] = useState(60_000);
  const [maxIterations, setMaxIterations] = useState(0); // 0 = unlimited
  const [iterations, setIterations] = useState(0);
  const [successes, setSuccesses] = useState(0);
  const [nextRunAt, setNextRunAt] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);

  const logIdRef = useRef(0);
  const loopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopActiveRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addLog = useCallback((type: LogLine["type"], text: string) => {
    const id = logIdRef.current++;
    setLogs((prev) => [...prev.slice(-29), { id, type, text }]);
  }, []);

  const inputToken = tokenByMint(inputMint);
  const outputToken = tokenByMint(outputMint);
  const rawAmount = Math.round((parseFloat(inputAmount) || 0) * 10 ** (inputToken?.decimals ?? 9));

  // Countdown ticker
  useEffect(() => {
    if (!nextRunAt) { setCountdown(0); return; }
    const tick = () => setCountdown(Math.max(0, Math.ceil((nextRunAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [nextRunAt]);

  const flipTokens = () => {
    setInputMint(outputMint);
    setOutputMint(inputMint);
    setQuote(null);
    setEvalResult(null);
    setPhase("idle");
  };

  const reset = () => {
    setQuote(null);
    setEvalResult(null);
    setPhase("idle");
    setTxSig(null);
    setInputAmount("");
  };

  // ── Core OODA cycle ────────────────────────────────────────────────────────

  const runCycle = useCallback(async (iterNum: number): Promise<"executed" | "skipped" | "error"> => {
    if (!publicKey || !signTransaction) return "error";

    const inTok = tokenByMint(inputMint);
    const outTok = tokenByMint(outputMint);
    const amt = Math.round((parseFloat(inputAmount) || 0) * 10 ** (inTok?.decimals ?? 9));
    if (!amt) { addLog("error", "No amount set"); return "error"; }

    // ── Observe ──
    setPhase("observe");
    addLog("info", `[${iterNum}] Observe: ${inputAmount} ${inTok?.symbol} → ${outTok?.symbol}`);
    let q: DFlowQuoteResponse;
    try {
      q = await getSwapQuote({ inputMint, outputMint, amount: amt, slippageBps: slippage });
      setQuote(q);
      addLog("success", `[${iterNum}] Quote: ${fmtRaw(q.outAmount, outTok?.decimals ?? 6)} ${outTok?.symbol} (impact ${Number(q.priceImpactPct).toFixed(3)}%)`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog("error", `[${iterNum}] Quote failed: ${msg}`);
      setPhase("error");
      return "error";
    }

    // ── Orient + Decide ──
    setPhase("orient");
    const result = evaluateOODACondition(condition, q, outTok?.decimals ?? 6);
    setEvalResult(result);
    setPhase("decide");
    addLog(result.pass ? "success" : "warn", `[${iterNum}] Decide: ${result.reason}`);

    if (!result.pass) {
      addLog("warn", `[${iterNum}] Condition not met — skipping execution`);
      setPhase("idle");
      return "skipped";
    }

    // ── Act ──
    setPhase("act");
    addLog("info", `[${iterNum}] Act: building swap tx…`);
    try {
      const swapResult = await createSwapTransaction(q, publicKey.toBase58());
      const txBytes = Buffer.from(swapResult.swapTransaction, "base64");
      const vtx = VersionedTransaction.deserialize(txBytes);

      addLog("info", `[${iterNum}] Sign (CU ${swapResult.computeUnitLimit}, fee ${(swapResult.prioritizationFeeLamports / 1e9).toFixed(6)} SOL)…`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signed = await signTransaction(vtx as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const signedBytes = Buffer.from((signed as any).serialize());

      const connection = new Connection(RPC_URL, "confirmed");
      const { signature: sig } = await HeliusService.sendSignedTransaction(
        signedBytes.toString("base64"),
        { skipPreflight: false, maxRetries: 3 },
      );
      const lb = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature: sig, blockhash: lb.blockhash, lastValidBlockHeight: lb.lastValidBlockHeight }, "confirmed");

      setTxSig(sig);
      setPhase("done");
      addLog("success", `[${iterNum}] Confirmed: ${sig.slice(0, 16)}…`);
      return "executed";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog("error", `[${iterNum}] Swap failed: ${msg}`);
      setPhase("error");
      return "error";
    }
  }, [publicKey, signTransaction, inputMint, outputMint, inputAmount, slippage, condition, addLog]);

  // ── Manual one-shot ──────────────────────────────────────────────────────

  const handleRunOnce = useCallback(async () => {
    if (!rawAmount) { toast({ title: "Enter an amount", variant: "destructive" }); return; }
    if (!connected || !publicKey) { toast({ title: "Connect wallet first", variant: "destructive" }); return; }
    setIterations(0);
    setSuccesses(0);
    const outcome = await runCycle(1);
    setIterations(1);
    if (outcome === "executed") setSuccesses(1);
  }, [rawAmount, connected, publicKey, runCycle, toast]);

  // ── Scheduler ─────────────────────────────────────────────────────────────

  const scheduleNext = useCallback((iterNum: number) => {
    if (!loopActiveRef.current) return;
    const runAt = Date.now() + intervalMs;
    setNextRunAt(runAt);
    addLog("info", `Next run in ${intervalMs / 1000}s (iteration ${iterNum})…`);
    setPhase("waiting");

    loopTimerRef.current = setTimeout(async () => {
      if (!loopActiveRef.current) return;
      setNextRunAt(null);

      const curIter = iterNum;
      const outcome = await runCycle(curIter);
      setIterations(curIter);
      if (outcome === "executed") setSuccesses((s) => s + 1);

      const maxIter = maxIterations;
      if (maxIter > 0 && curIter >= maxIter) {
        addLog("info", `Loop complete — reached max ${maxIter} iterations`);
        loopActiveRef.current = false;
        setLoopRunning(false);
        setPhase("idle");
        return;
      }

      scheduleNext(curIter + 1);
    }, intervalMs);
  }, [intervalMs, maxIterations, runCycle, addLog]);

  const handleStartLoop = useCallback(async () => {
    if (!rawAmount) { toast({ title: "Enter an amount", variant: "destructive" }); return; }
    if (!connected || !publicKey) { toast({ title: "Connect wallet first", variant: "destructive" }); return; }

    loopActiveRef.current = true;
    setLoopRunning(true);
    setIterations(0);
    setSuccesses(0);
    addLog("info", `Loop started — interval ${intervalMs / 1000}s${maxIterations ? `, max ${maxIterations} runs` : ", unlimited"}`);

    // Run first iteration immediately
    const outcome = await runCycle(1);
    setIterations(1);
    if (outcome === "executed") setSuccesses(1);

    if (!loopActiveRef.current) return;

    const maxIter = maxIterations;
    if (maxIter > 0 && 1 >= maxIter) {
      addLog("info", "Loop complete after 1 iteration");
      loopActiveRef.current = false;
      setLoopRunning(false);
      return;
    }

    scheduleNext(2);
  }, [rawAmount, connected, publicKey, intervalMs, maxIterations, runCycle, scheduleNext, addLog, toast]);

  const handleStopLoop = useCallback(() => {
    loopActiveRef.current = false;
    setLoopRunning(false);
    setNextRunAt(null);
    if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    addLog("warn", "Loop stopped by user");
    setPhase("idle");
  }, [addLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      loopActiveRef.current = false;
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const inputTokenLabel = inputToken?.symbol ?? inputMint.slice(0, 6);
  const outputTokenLabel = outputToken?.symbol ?? outputMint.slice(0, 6);
  const busy = phase === "observe" || phase === "orient" || phase === "decide" || phase === "act";

  return (
    <div className="h-full flex flex-col gap-3 p-1">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Target className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-mono font-semibold text-amber-300">DFlow OODA Loop</span>
        {loopRunning && (
          <Badge variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-400 animate-pulse">
            Running
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400 ml-auto">
          Observe · Orient · Decide · Act
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-3 flex-1 min-h-0">

        {/* ── Left: token pair + schedule config ── */}
        <div className="space-y-3">

          {/* Observe — token pair */}
          <Card className="bg-black/40 border-amber-500/20">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                <Eye className="h-3 w-3 text-cyan-400" />
                Observe — Token Pair
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="Amount"
                  value={inputAmount}
                  onChange={(e) => { setInputAmount(e.target.value); setQuote(null); setEvalResult(null); }}
                  disabled={busy || loopRunning}
                  className="flex-1 bg-black/60 border-amber-500/30 text-white font-mono h-8 text-sm"
                />
                <select
                  value={inputMint}
                  onChange={(e) => { setInputMint(e.target.value); setQuote(null); setEvalResult(null); }}
                  disabled={busy || loopRunning}
                  className="bg-black/60 border border-amber-500/30 text-white rounded-md px-2 text-xs font-mono h-8 disabled:opacity-50"
                >
                  {KNOWN_TOKENS.map((t) => (
                    <option key={t.mint} value={t.mint}>{t.symbol}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={flipTokens}
                  disabled={busy || loopRunning}
                  className="h-6 w-6 p-0 rounded-full border border-amber-500/30 bg-black/40 hover:bg-amber-500/20"
                >
                  <ArrowDownUp className="h-3 w-3 text-amber-400" />
                </Button>
              </div>

              <div className="flex gap-2">
                <div className="flex-1 bg-black/60 border border-cyan-500/20 rounded-md px-3 py-1.5 font-mono text-sm text-cyan-200 min-h-[32px] flex items-center">
                  {quote
                    ? fmtRaw(quote.outAmount, outputToken?.decimals ?? 6)
                    : <span className="text-zinc-600">—</span>}
                </div>
                <select
                  value={outputMint}
                  onChange={(e) => { setOutputMint(e.target.value); setQuote(null); setEvalResult(null); }}
                  disabled={busy || loopRunning}
                  className="bg-black/60 border border-cyan-500/30 text-white rounded-md px-2 text-xs font-mono h-8 disabled:opacity-50"
                >
                  {KNOWN_TOKENS.map((t) => (
                    <option key={t.mint} value={t.mint}>{t.symbol}</option>
                  ))}
                </select>
              </div>
              {quote && (
                <div className="text-[10px] text-zinc-500 font-mono">
                  min received: {fmtRaw(quote.minOutAmount, outputToken?.decimals ?? 6)} {outputToken?.symbol}
                  · impact: {Number(quote.priceImpactPct).toFixed(3)}%
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
                type="button"
                onClick={() => setSlippage(s)}
                disabled={busy || loopRunning}
                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors disabled:opacity-50 ${
                  slippage === s
                    ? "border-cyan-500/50 text-cyan-300 bg-cyan-500/10"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                }`}
              >
                {s === "auto" ? "auto" : `${s / 100}%`}
              </button>
            ))}
          </div>

          {/* Orient — Condition */}
          <Card className="bg-black/40 border-amber-500/20">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-amber-400" />
                Orient — Execute Condition
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <ConditionBuilder
                condition={condition}
                onChange={(c) => { setCondition(c); setEvalResult(null); }}
                disabled={busy || loopRunning}
              />
              {evalResult && (
                <div className={`mt-2 rounded px-2.5 py-1.5 text-[10px] font-mono flex items-center gap-1.5 ${
                  evalResult.pass
                    ? "bg-emerald-950/30 border border-emerald-500/30 text-emerald-300"
                    : "bg-orange-950/30 border border-orange-500/30 text-orange-300"
                }`}>
                  {evalResult.pass
                    ? <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                    : <AlertTriangle className="h-3 w-3 flex-shrink-0" />}
                  {evalResult.reason}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedule */}
          <Card className="bg-black/40 border-purple-500/20">
            <CardHeader className="pb-2 pt-3 px-3">
              <CardTitle className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-purple-400" />
                Schedule
                {loopRunning && countdown > 0 && (
                  <span className="ml-auto text-[10px] text-amber-300 font-mono">
                    next in {countdown}s
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              <div className="flex gap-1 flex-wrap">
                {INTERVAL_OPTIONS.map((opt) => (
                  <button
                    key={opt.ms}
                    type="button"
                    onClick={() => setIntervalMs(opt.ms)}
                    disabled={busy || loopRunning}
                    className={`text-[10px] font-mono px-2.5 py-1 rounded border transition-colors disabled:opacity-50 ${
                      intervalMs === opt.ms
                        ? "border-purple-500/50 text-purple-300 bg-purple-500/10"
                        : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="ooda-max-iter" className="text-[10px] text-zinc-500 font-mono whitespace-nowrap">
                  Max runs (0 = ∞):
                </label>
                <Input
                  id="ooda-max-iter"
                  type="number"
                  min={0}
                  placeholder="0"
                  value={maxIterations || ""}
                  onChange={(e) => setMaxIterations(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  disabled={busy || loopRunning}
                  className="w-20 bg-black/60 border-purple-500/30 text-white font-mono h-7 text-xs"
                />
              </div>

              {!connected ? (
                <WalletMultiButton className="!w-full !bg-purple-600 !text-xs !h-9 !rounded-md" />
              ) : (
                <div className="flex gap-2">
                  {!loopRunning ? (
                    <>
                      <Button
                        onClick={handleStartLoop}
                        disabled={busy || !rawAmount}
                        className="flex-1 h-9 text-xs font-mono bg-emerald-600 hover:bg-emerald-500"
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Start Loop
                      </Button>
                      <Button
                        onClick={handleRunOnce}
                        disabled={busy || !rawAmount}
                        variant="outline"
                        className="h-9 text-xs font-mono border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
                      >
                        <Zap className="h-3.5 w-3.5 mr-1" />
                        Once
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={handleStopLoop}
                      className="flex-1 h-9 text-xs font-mono bg-red-600 hover:bg-red-500"
                    >
                      {busy
                        ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        : <Pause className="h-3.5 w-3.5 mr-1" />}
                      Stop Loop
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Confirmed tx */}
          {phase === "done" && txSig && (
            <Card className="bg-emerald-950/30 border-emerald-500/30">
              <CardContent className="px-3 py-3 space-y-1">
                <div className="flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-mono font-semibold">Swap Confirmed</span>
                </div>
                <a
                  href={`https://solscan.io/tx/${txSig}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-0.5"
                >
                  {txSig.slice(0, 20)}… <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </CardContent>
            </Card>
          )}

          {!loopRunning && (phase === "done" || phase === "error") && (
            <Button onClick={reset} variant="ghost" size="sm" className="w-full h-8 text-xs text-zinc-400">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
          )}
        </div>

        {/* ── Right: OODA status + stats + log ── */}
        <div className="space-y-3 flex flex-col min-h-0">

          {/* Quote details */}
          {quote && (
            <Card className="bg-black/40 border-cyan-500/20">
              <CardHeader className="pb-2 pt-3 px-3">
                <CardTitle className="text-xs text-zinc-400 font-mono flex items-center gap-1">
                  <Info className="h-3 w-3" /> Last Quote
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-3 space-y-1 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Route</span>
                  <span className="text-zinc-200">{inputTokenLabel} → {outputTokenLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Out</span>
                  <span className="text-emerald-300">{fmtRaw(quote.outAmount, outputToken?.decimals ?? 6)} {outputTokenLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Price impact</span>
                  <span className={Number(quote.priceImpactPct) > 5 ? "text-orange-300" : "text-emerald-300"}>
                    {Number(quote.priceImpactPct).toFixed(3)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Slippage</span>
                  <span className="text-zinc-200">{quote.slippageBps} bps</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Slot</span>
                  <span className="text-zinc-400">#{quote.contextSlot.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* OODA cycle indicator */}
          <Card className="bg-black/60 border-zinc-700/40">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                OODA Cycle
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 space-y-2">
              <div className="grid grid-cols-4 gap-1">
                {(["observe", "orient", "decide", "act"] as const).map((stage) => {
                  const isActive =
                    (stage === "observe" && phase === "observe") ||
                    (stage === "orient" && phase === "orient") ||
                    (stage === "decide" && phase === "decide") ||
                    (stage === "act" && phase === "act");

                  const isDone =
                    (stage === "observe" && (phase === "orient" || phase === "decide" || phase === "act" || phase === "waiting" || phase === "done")) ||
                    (stage === "orient" && (phase === "decide" || phase === "act" || phase === "waiting" || phase === "done")) ||
                    (stage === "decide" && evalResult?.pass && (phase === "act" || phase === "waiting" || phase === "done")) ||
                    (stage === "act" && phase === "done");

                  return (
                    <div
                      key={stage}
                      className={`text-center py-1.5 rounded text-[9px] font-mono uppercase tracking-wider border ${
                        isDone
                          ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400"
                          : isActive
                            ? "bg-amber-950/30 border-amber-500/40 text-amber-300 animate-pulse"
                            : "bg-zinc-900/50 border-zinc-800 text-zinc-600"
                      }`}
                    >
                      {stage}
                    </div>
                  );
                })}
              </div>
              {phase === "waiting" && countdown > 0 && (
                <div className="text-center text-[10px] text-zinc-500 font-mono">
                  ⏱ next run in <span className="text-amber-300">{countdown}s</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Loop stats */}
          {(loopRunning || iterations > 0) && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Runs", value: iterations },
                { label: "Executed", value: successes },
                { label: "Skipped", value: iterations - successes },
              ].map(({ label, value }) => (
                <div key={label} className="rounded border border-white/10 bg-black/40 px-2 py-1.5 text-center">
                  <div className="text-[9px] text-zinc-500 font-mono uppercase">{label}</div>
                  <div className="text-base font-mono font-semibold text-zinc-200">{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Activity log */}
          <Card className="bg-black/70 border-amber-500/10 flex-1 min-h-0 flex flex-col">
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">
                Activity Log
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3 overflow-y-auto flex-1 max-h-64 space-y-px">
              {logs.length === 0 && (
                <div className="text-[10px] text-zinc-700 font-mono">
                  Configure pair + condition, then start the loop or run once…
                </div>
              )}
              {logs.map((line) => (
                <div
                  key={line.id}
                  className={`text-[10px] font-mono leading-5 ${
                    line.type === "success" ? "text-emerald-400" :
                    line.type === "error"   ? "text-red-400" :
                    line.type === "warn"    ? "text-orange-300" :
                    "text-zinc-400"
                  }`}
                >
                  <span className="text-zinc-700 mr-1">›</span>{line.text}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
