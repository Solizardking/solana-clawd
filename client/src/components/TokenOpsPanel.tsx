import { useState, useRef, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction, Transaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Flame, ArrowRightLeft, Send, Lock, Wallet, HelpCircle, Loader2,
  CheckCircle2, XCircle, ExternalLink, ChevronRight, RefreshCw, Mic, MicOff,
} from "lucide-react";
import { parseCommandWithAI, HELP_TEXT, type ParsedIntent } from "@/lib/nlpParser";
import {
  getWalletBalances,
  resolveToken,
  burnTokens,
  transferSOL,
  transferSPLToken,
  getSwapPreview,
  executeJupiterSwap,
  createStreamLock,
  solscanLink,
  SOL_MINT,
} from "@/lib/walletOps";
import { useToast } from "@/hooks/use-toast";
import { voiceCommandManager } from "@/lib/voice/VoiceCommands";
import { ClawdTokenAction } from "@/components/ClawdTokenAction";

type LogEntry = {
  id: string;
  type: "input" | "output" | "success" | "error" | "info" | "pending";
  message: string;
  timestamp: Date;
  signature?: string;
};

type BalanceEntry = {
  symbol: string;
  mint: string;
  amount: number;
  tokenAccount?: string;
  decimals?: number;
};

type PendingOp = {
  parsed: ParsedIntent;
  resolvedFromMint?: string;
  resolvedFromSymbol?: string;
  resolvedToMint?: string;
  resolvedToSymbol?: string;
  resolvedAmount?: number;
  resolvedDecimals?: number;
  swapPreviewLabel?: string;
  swapRouterLabel?: string;
};

const INTENT_ICONS: Record<string, any> = {
  BURN: Flame,
  TRANSFER: Send,
  SWAP: ArrowRightLeft,
  LOCK: Lock,
  BALANCE: Wallet,
  HELP: HelpCircle,
  LAUNCH: ChevronRight,
};

function uid() {
  return Math.random().toString(36).slice(2);
}

export function TokenOpsPanel({
  onLaunchToken,
  initialCommand = "",
}: {
  onLaunchToken?: (concept: string) => void;
  initialCommand?: string;
}) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: uid(), type: "info", timestamp: new Date(),
      message: "CLAWD Terminal ready. Type a command or say it aloud.\nType 'help' to see available commands.",
    },
  ]);
  const [balances, setBalances] = useState<BalanceEntry[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [pendingOp, setPendingOp] = useState<PendingOp | null>(null);
  const [executing, setExecuting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialCommandAppliedRef = useRef(false);

  const addLog = useCallback((entry: Omit<LogEntry, "id" | "timestamp">) => {
    setLogs((prev) => [...prev, { ...entry, id: uid(), timestamp: new Date() }]);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const fetchBalances = useCallback(async () => {
    if (!publicKey) return;
    setBalancesLoading(true);
    try {
      const data = await getWalletBalances(publicKey.toBase58());
      const entries: BalanceEntry[] = [
        { symbol: "SOL", mint: SOL_MINT, amount: data.sol ?? 0 },
        ...(data.tokens || []).map((t: any) => ({
          symbol: t.mint?.slice(0, 4) + "…",
          mint: t.mint,
          amount: t.amount,
          tokenAccount: t.tokenAccount,
          decimals: t.decimals,
        })),
      ];
      setBalances(entries);
    } catch (e: any) {
      addLog({ type: "error", message: `Balance fetch failed: ${e.message}` });
    } finally {
      setBalancesLoading(false);
    }
  }, [publicKey, addLog]);

  useEffect(() => {
    if (connected && publicKey) fetchBalances();
  }, [connected, publicKey, fetchBalances]);

  useEffect(() => {
    if (!initialCommand || initialCommandAppliedRef.current) return;
    initialCommandAppliedRef.current = true;
    setInput(initialCommand);
    addLog({
      type: "info",
      message: `Remote command loaded. Review it, then press Enter to parse:\n${initialCommand}`,
    });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [addLog, initialCommand]);

  // ─── Command processor ──────────────────────────────────────────────────────
  const processCommand = useCallback(async (raw: string) => {
    if (!raw.trim()) return;
    addLog({ type: "input", message: `> ${raw}` });

    if (!connected || !publicKey) {
      addLog({ type: "error", message: "Connect your wallet first to execute operations." });
      return;
    }

    addLog({ type: "pending", message: "Parsing command…" });
    const parsed = await parseCommandWithAI(raw);

    setLogs((prev) => prev.filter((l) => l.message !== "Parsing command…"));

    switch (parsed.intent) {
      case "HELP":
        addLog({ type: "info", message: HELP_TEXT });
        break;

      case "BALANCE":
        addLog({ type: "info", message: "Fetching wallet balances…" });
        await fetchBalances();
        addLog({ type: "info", message: "Balances updated in sidebar." });
        break;

      case "BURN": {
        const resolved = await resolveToken(parsed.token);
        if (!resolved.found) {
          addLog({ type: "error", message: `Unknown token: ${parsed.token}` });
          break;
        }
        // Find balance
        const bal = balances.find((b) => b.mint === resolved.mint);
        let amount: number;
        if (parsed.amount === "all") {
          amount = bal?.amount ?? 0;
        } else if ((parsed as any).percent) {
          amount = (bal?.amount ?? 0) * (parsed.amount as number);
        } else {
          amount = parsed.amount as number;
        }
        setPendingOp({
          parsed,
          resolvedFromMint: resolved.mint,
          resolvedFromSymbol: resolved.symbol,
          resolvedAmount: amount,
          resolvedDecimals: bal?.decimals ?? 6,
        });
        break;
      }

      case "TRANSFER": {
        if (!parsed.to || parsed.to.length < 32) {
          addLog({ type: "error", message: "Invalid destination address." });
          break;
        }
        const resolved = await resolveToken(parsed.token);
        if (!resolved.found) {
          addLog({ type: "error", message: `Unknown token: ${parsed.token}` });
          break;
        }
        const bal = balances.find((b) => b.mint === resolved.mint);
        setPendingOp({
          parsed,
          resolvedFromMint: resolved.mint,
          resolvedFromSymbol: resolved.symbol,
          resolvedAmount: parsed.amount,
          resolvedDecimals: bal?.decimals ?? 9,
        });
        break;
      }

      case "SWAP": {
        const fromResolved = await resolveToken(parsed.fromToken);
        const toResolved = await resolveToken(parsed.toToken);
        if (!fromResolved.found) { addLog({ type: "error", message: `Unknown token: ${parsed.fromToken}` }); break; }
        if (!toResolved.found) { addLog({ type: "error", message: `Unknown token: ${parsed.toToken}` }); break; }

        addLog({ type: "pending", message: `Fetching best price across all routers (Metis · JupiterZ · Dflow · OKX)…` });

        const fromBal = balances.find((b) => b.mint === fromResolved.mint);
        const toBal = balances.find((b) => b.mint === toResolved.mint);
        const fromDec = fromBal?.decimals ?? (fromResolved.mint === SOL_MINT ? 9 : 6);
        const toDec = toBal?.decimals ?? (toResolved.mint === SOL_MINT ? 9 : 6);

        try {
          const preview = await getSwapPreview(fromResolved.mint, toResolved.mint, parsed.amount, fromDec, toDec);
          setLogs((prev) => prev.filter((l) => !l.message.startsWith("Fetching best price")));

          if (preview.order.error && !preview.order.outAmount) {
            addLog({ type: "error", message: `Jupiter error: ${preview.order.error}` });
            break;
          }

          const usdStr = preview.order.outUsdValue ? ` (~$${preview.order.outUsdValue.toFixed(2)})` : "";
          const previewLabel = `${parsed.amount} ${fromResolved.symbol} → ~${preview.outUi} ${toResolved.symbol}${usdStr}`;
          addLog({ type: "info", message: `Best route via ${preview.routerLabel}: ${previewLabel} | impact: ${preview.priceImpact}` });

          setPendingOp({
            parsed,
            resolvedFromMint: fromResolved.mint,
            resolvedFromSymbol: fromResolved.symbol,
            resolvedToMint: toResolved.mint,
            resolvedToSymbol: toResolved.symbol,
            resolvedAmount: parsed.amount,
            resolvedDecimals: fromDec,
            swapPreviewLabel: previewLabel,
            swapRouterLabel: preview.routerLabel,
          });
        } catch (e: any) {
          setLogs((prev) => prev.filter((l) => !l.message.startsWith("Fetching best price")));
          addLog({ type: "error", message: `Quote failed: ${e.message}` });
        }
        break;
      }

      case "LOCK": {
        const resolved = await resolveToken(parsed.token);
        if (!resolved.found) { addLog({ type: "error", message: `Unknown token: ${parsed.token}` }); break; }
        const bal = balances.find((b) => b.mint === resolved.mint);
        const amount = parsed.amount === "all" ? (bal?.amount ?? 0) : (parsed.amount as number);
        setPendingOp({
          parsed,
          resolvedFromMint: resolved.mint,
          resolvedFromSymbol: resolved.symbol,
          resolvedAmount: amount,
          resolvedDecimals: bal?.decimals ?? 6,
        });
        break;
      }

      case "LAUNCH":
        addLog({ type: "info", message: `Launching token generation: "${parsed.concept}"` });
        onLaunchToken?.(parsed.concept);
        break;

      default:
        addLog({ type: "error", message: `Couldn't understand: "${raw}"\nTry: burn 100 BONK | send 0.1 SOL to <addr> | swap 1 SOL for CLAWD | help` });
    }
  }, [connected, publicKey, balances, addLog, fetchBalances, onLaunchToken]);

  // ─── Confirm & execute ──────────────────────────────────────────────────────
  const executeOp = useCallback(async () => {
    if (!pendingOp || !publicKey || !signTransaction) return;
    setExecuting(true);
    const { parsed, resolvedFromMint, resolvedFromSymbol, resolvedToMint, resolvedAmount, resolvedDecimals } = pendingOp;

    try {
      let result: { success: boolean; signature?: string; error?: string } = { success: false };

      switch (parsed.intent) {
        case "BURN": {
          if (!resolvedFromMint || resolvedAmount === undefined) break;
          const isSol = resolvedFromMint === SOL_MINT;
          if (isSol) { addLog({ type: "error", message: "Cannot burn native SOL." }); break; }
          addLog({ type: "pending", message: `Burning ${resolvedAmount} ${resolvedFromSymbol}… Please approve in wallet.` });
          result = await burnTokens(
            publicKey,
            signTransaction as (tx: Transaction) => Promise<Transaction>,
            resolvedFromMint,
            resolvedAmount,
            resolvedDecimals ?? 6,
          );
          break;
        }

        case "TRANSFER": {
          if (!resolvedFromMint || resolvedAmount === undefined) break;
          const isSOL = resolvedFromMint === SOL_MINT;
          addLog({ type: "pending", message: `Transferring ${resolvedAmount} ${resolvedFromSymbol}… Please approve in wallet.` });
          if (isSOL) {
            result = await transferSOL(
              publicKey,
              signTransaction as (tx: Transaction) => Promise<Transaction>,
              (parsed as any).to,
              resolvedAmount,
            );
          } else {
            result = await transferSPLToken(
              publicKey,
              signTransaction as (tx: Transaction) => Promise<Transaction>,
              resolvedFromMint,
              (parsed as any).to,
              resolvedAmount,
              resolvedDecimals ?? 6,
            );
          }
          break;
        }

        case "SWAP": {
          if (!resolvedFromMint || !resolvedToMint || resolvedAmount === undefined) break;
          const routerHint = pendingOp.swapRouterLabel ? ` via ${pendingOp.swapRouterLabel}` : "";
          addLog({ type: "pending", message: `Executing swap${routerHint}… Please approve in wallet.` });
          const swapResult = await executeJupiterSwap(
            publicKey,
            signTransaction as (tx: VersionedTransaction) => Promise<VersionedTransaction>,
            resolvedFromMint,
            resolvedToMint,
            resolvedAmount,
            resolvedDecimals ?? 6,
          );
          if (swapResult.success && swapResult.router) {
            const routerLabels: Record<string, string> = {
              iris: "Metis", jupiterz: "JupiterZ RFQ", dflow: "Dflow", okx: "OKX",
            };
            const label = routerLabels[swapResult.router] ?? swapResult.router;
            addLog({ type: "info", message: `Routed through: ${label}` });
          }
          result = swapResult;
          break;
        }

        case "LOCK": {
          if (!resolvedFromMint || resolvedAmount === undefined) break;
          addLog({ type: "pending", message: `Creating StreamFlow lock for ${resolvedAmount} ${resolvedFromSymbol}…` });
          result = await createStreamLock(
            publicKey,
            resolvedFromMint,
            resolvedAmount,
            (parsed as any).durationSeconds,
          );
          break;
        }

        default:
          result = { success: false, error: "Unknown operation" };
      }

      setLogs((prev) => prev.filter((l) => l.type !== "pending"));

      if (result.success) {
        addLog({
          type: "success",
          message: `✓ ${parsed.intent} confirmed!${result.signature ? ` TX: ${result.signature.slice(0, 16)}…` : ""}`,
          signature: result.signature,
        });
        toast({ title: `${parsed.intent} successful`, description: result.signature ? `TX: ${result.signature.slice(0, 20)}…` : "Done" });
        fetchBalances();
      } else {
        addLog({ type: "error", message: `✗ Failed: ${result.error || "Unknown error"}` });
        toast({ title: `${parsed.intent} failed`, description: result.error, variant: "destructive" });
      }
    } finally {
      setExecuting(false);
      setPendingOp(null);
    }
  }, [pendingOp, publicKey, signTransaction, addLog, fetchBalances, toast]);

  // ─── Voice ──────────────────────────────────────────────────────────────────
  const toggleVoice = () => {
    voiceCommandManager.toggleListening();
    setIsListening((v) => !v);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = input.trim();
    if (!val) return;
    setInput("");
    processCommand(val);
  };

  const confirmLabel = () => {
    if (!pendingOp) return "";
    const { parsed, resolvedFromSymbol, resolvedToSymbol, resolvedAmount, swapPreviewLabel, swapRouterLabel } = pendingOp;
    switch (parsed.intent) {
      case "BURN":     return `Burn ${resolvedAmount} ${resolvedFromSymbol} permanently?`;
      case "TRANSFER": return `Send ${resolvedAmount} ${resolvedFromSymbol} to ${(parsed as any).to?.slice(0, 12)}…?`;
      case "SWAP":     return `Confirm swap via ${swapRouterLabel ?? "Jupiter"}: ${swapPreviewLabel}?`;
      case "LOCK":     return `Lock ${resolvedAmount} ${resolvedFromSymbol} for ${(parsed as any).durationLabel}?`;
      default:         return "Confirm operation?";
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full gap-3">
      {/* ── Left: balances panel ─────────────────────────────────────────── */}
      <div className="w-44 flex-shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-purple-400/60 uppercase tracking-widest font-mono">Balances</span>
          <Button
            size="sm" variant="ghost"
            className="h-5 w-5 p-0 text-purple-400/40 hover:text-purple-300"
            onClick={fetchBalances}
            disabled={balancesLoading || !connected}
          >
            <RefreshCw className={`h-3 w-3 ${balancesLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {!connected ? (
          <p className="text-[10px] text-gray-500 font-mono">Connect wallet to view balances</p>
        ) : balances.length === 0 ? (
          <p className="text-[10px] text-gray-500 font-mono">{balancesLoading ? "Loading…" : "No balances"}</p>
        ) : (
          <ScrollArea className="flex-1">
            <div className="flex flex-col gap-1">
              {balances.map((b, i) => (
                <div key={i} className="flex justify-between items-center gap-1 text-[10px] font-mono px-1 py-0.5 rounded bg-purple-900/10 border border-purple-500/10">
                  <span className="text-purple-300 truncate max-w-[60px]">{b.symbol}</span>
                  <span className="text-green-400 tabular-nums">{b.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                  {b.mint && (
                    <ClawdTokenAction
                      mintAddress={b.mint}
                      symbol={b.symbol}
                      decimals={b.decimals}
                    />
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Quick actions */}
        <div className="mt-auto flex flex-col gap-1 pt-2 border-t border-purple-500/10">
          <span className="text-[9px] text-purple-400/40 uppercase tracking-widest font-mono mb-1">Quick</span>
          {[
            { label: "balance", cmd: "balance" },
            { label: "buy CLAWD", cmd: "buy 0.01 SOL of CLAWD" },
            { label: "burn dust", cmd: "help" },
          ].map((q) => (
            <button
              key={q.cmd}
              onClick={() => { setInput(q.cmd); inputRef.current?.focus(); }}
              className="text-left text-[9px] font-mono text-purple-400/60 hover:text-purple-300 px-1 py-0.5 rounded hover:bg-purple-500/10 transition-colors"
            >
              → {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: terminal log + input ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 border border-purple-500/20 rounded-lg bg-black/60 overflow-hidden">
        {/* Log output */}
        <ScrollArea className="flex-1 p-3" ref={scrollRef as any}>
          <div className="flex flex-col gap-0.5 font-mono text-[11px]">
            {logs.map((log) => (
              <div key={log.id} className={`flex flex-col ${log.type === "input" ? "mt-2" : ""}`}>
                <span
                  className={
                    log.type === "input"   ? "text-cyan-400" :
                    log.type === "success" ? "text-green-400" :
                    log.type === "error"   ? "text-red-400" :
                    log.type === "pending" ? "text-yellow-400 animate-pulse" :
                    "text-purple-200/70"
                  }
                >
                  {log.message.split("\n").map((line, i) => (
                    <span key={i} className="block">{line}</span>
                  ))}
                </span>
                {log.signature && (
                  <a
                    href={solscanLink(log.signature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-0.5 text-[10px]"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    View on Solscan
                  </a>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Input bar */}
        <form onSubmit={handleSubmit} className="border-t border-purple-500/20 flex items-center gap-2 px-3 py-2 bg-black/40">
          <span className="text-green-400 font-mono text-xs flex-shrink-0">❯</span>
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={connected ? "burn 100 BONK | swap 0.1 SOL for CLAWD | help" : "Connect wallet first…"}
            disabled={!connected}
            className="flex-1 bg-transparent border-0 focus-visible:ring-0 font-mono text-xs text-purple-100 placeholder:text-purple-500/40 p-0 h-auto"
          />
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={toggleVoice}
              className={`h-6 w-6 p-0 ${isListening ? "text-green-400 hover:text-red-400" : "text-purple-400/50 hover:text-purple-300"}`}
            >
              {isListening ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={!input.trim() || !connected}
              className="h-6 w-6 p-0 text-purple-400 hover:text-white"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </form>
      </div>

      {/* ── Confirmation dialog ───────────────────────────────────────────── */}
      <Dialog open={!!pendingOp} onOpenChange={(open) => { if (!open && !executing) setPendingOp(null); }}>
        <DialogContent className="bg-black/95 border-purple-500/30 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-300">
              {pendingOp && (() => {
                const Icon = INTENT_ICONS[pendingOp.parsed.intent] || ChevronRight;
                return <Icon className="h-4 w-4" />;
              })()}
              Confirm {pendingOp?.parsed.intent}
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Review the operation below before signing with your wallet.
            </DialogDescription>
          </DialogHeader>

          {pendingOp && (
            <div className="bg-purple-900/20 border border-purple-500/20 rounded-lg p-3 font-mono text-sm">
              <div className="text-yellow-300 font-bold mb-2">{confirmLabel()}</div>
              <div className="text-gray-400 text-xs space-y-1">
                {pendingOp.parsed.intent === "BURN" && (
                  <>
                    <div>Token: <span className="text-white">{pendingOp.resolvedFromSymbol}</span></div>
                    <div>Amount: <span className="text-red-400">{pendingOp.resolvedAmount?.toLocaleString()}</span></div>
                    <div className="text-red-400 mt-2">⚠ This action is irreversible.</div>
                  </>
                )}
                {pendingOp.parsed.intent === "TRANSFER" && (
                  <>
                    <div>Token: <span className="text-white">{pendingOp.resolvedFromSymbol}</span></div>
                    <div>Amount: <span className="text-blue-400">{pendingOp.resolvedAmount?.toLocaleString()}</span></div>
                    <div>To: <span className="text-white text-[10px] break-all">{(pendingOp.parsed as any).to}</span></div>
                  </>
                )}
                {pendingOp.parsed.intent === "SWAP" && (
                  <>
                    <div>Route: <span className="text-white">{pendingOp.swapPreviewLabel}</span></div>
                    <div className="text-yellow-400">via {pendingOp.swapRouterLabel ?? "Jupiter"} · Meta-Aggregator v2</div>
                  </>
                )}
                {pendingOp.parsed.intent === "LOCK" && (
                  <>
                    <div>Token: <span className="text-white">{pendingOp.resolvedFromSymbol}</span></div>
                    <div>Amount: <span className="text-blue-400">{pendingOp.resolvedAmount?.toLocaleString()}</span></div>
                    <div>Duration: <span className="text-white">{(pendingOp.parsed as any).durationLabel}</span></div>
                    <div className="text-yellow-400">Powered by StreamFlow</div>
                  </>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
              onClick={() => setPendingOp(null)}
              disabled={executing}
            >
              Cancel
            </Button>
            <Button
              onClick={executeOp}
              disabled={executing}
              className={`${
                pendingOp?.parsed.intent === "BURN"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-purple-600 hover:bg-purple-700"
              } text-white`}
            >
              {executing ? (
                <><Loader2 className="h-3 w-3 mr-2 animate-spin" />Signing…</>
              ) : (
                <>Confirm & Sign</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
