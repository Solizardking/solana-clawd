import { useState, type ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createTransferCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CLAWD_TOKEN, useTokenGate } from "@/contexts/TokenGateContext";
import { ArrowLeft, CheckCircle2, ExternalLink, Flame, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { Link } from "wouter";

const MIN_CLAWD = Number(import.meta.env.VITE_CLAWD_MIN_BALANCE ?? "1");
const CLAWD_MINT = new PublicKey("8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump");
const CLAWD_DECIMALS = 6;
const ENTRY_FEE = 69_420;

export function TokenGate({ children }: { children: ReactNode }) {
  const { connected, publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { isVerified, isVerifying, clawdBalance, verify } = useTokenGate();
  const { toast } = useToast();

  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  if (import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_TOKEN_GATE === "true") {
    return <>{children}</>;
  }

  if (isVerified) return <>{children}</>;

  if (connected && (isVerifying || clawdBalance === null)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-purple-300/80">
        <Loader2 className="w-8 h-8 animate-spin" />
        <div className="text-sm tracking-wider">CHECKING $CLAWD BALANCE…</div>
      </div>
    );
  }

  const balanceShown = clawdBalance ?? 0;
  const wallet = publicKey?.toString();

  async function handlePayEntryFee() {
    if (!publicKey || !sendTransaction) return;
    setPaying(true);
    try {
      // Fetch treasury wallet from server
      const entryRes = await fetch("/api/auth/entry", { credentials: "include" });
      const entryData = await entryRes.json();
      const treasury = new PublicKey(entryData.treasuryWallet);

      const senderAta = await getAssociatedTokenAddress(CLAWD_MINT, publicKey);
      const receiverAta = await getAssociatedTokenAddress(CLAWD_MINT, treasury);

      const rawAmount = BigInt(Math.round(ENTRY_FEE * 10 ** CLAWD_DECIMALS));

      const tx = new Transaction().add(
        createTransferCheckedInstruction(
          senderAta,
          CLAWD_MINT,
          receiverAta,
          publicKey,
          rawAmount,
          CLAWD_DECIMALS,
        ),
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setTxSig(sig);
      setPaid(true);

      // Register on server
      setRegistering(true);
      const regRes = await fetch("/api/auth/entry/verify", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: publicKey.toString(), txSignature: sig }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error ?? "Registration failed");

      toast({ title: "Welcome to Cheshire Terminal!", description: "Your 69,420 $CLAWD entry fee was received. Sign in with your wallet to continue." });
      // Re-run auth so the gate opens
      await verify();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Payment failed", description: msg, variant: "destructive" });
      setPaid(false);
      setTxSig(null);
    } finally {
      setPaying(false);
      setRegistering(false);
    }
  }

  // Show success state while registering / re-verifying
  if (paid) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] px-4">
        <div className="relative max-w-lg w-full rounded-2xl border border-green-500/30 bg-black/60 backdrop-blur-xl p-8 text-center shadow-2xl">
          <div className="mx-auto w-14 h-14 rounded-full bg-green-500/15 border border-green-500/40 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-7 h-7 text-green-400" />
          </div>
          <h2 className="text-xl font-black tracking-wider text-white mb-2">ENTRY FEE RECEIVED</h2>
          <p className="text-sm text-green-300/80 mb-4">
            69,420 $CLAWD sent — {registering ? "registering your account…" : "signing you in…"}
          </p>
          {txSig && (
            <a
              href={`https://solscan.io/tx/${txSig}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-purple-300/60 hover:text-purple-300"
            >
              View on Solscan <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {(registering || isVerifying) && <Loader2 className="w-5 h-5 animate-spin mx-auto mt-4 text-green-400" />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[70vh] px-4">
      <div className="relative max-w-lg w-full rounded-2xl border border-purple-500/30 bg-black/60 backdrop-blur-xl p-8 text-center shadow-2xl">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/10 pointer-events-none" />
        <div className="relative">
          <div className="mx-auto w-14 h-14 rounded-full bg-purple-500/15 border border-purple-500/40 flex items-center justify-center mb-4">
            <ShieldAlert className="w-7 h-7 text-purple-300" />
          </div>
          <h2 className="text-xl font-black tracking-wider text-white mb-1">
            $CLAWD HOLDERS ONLY
          </h2>
          <p className="text-sm text-purple-300/70 mb-3">
            Access requires holding $CLAWD or paying a one-time 69,420 $CLAWD entry fee.
          </p>
          <div className="flex items-center justify-center gap-2 mb-6 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <Flame className="w-3.5 h-3.5 text-orange-400 animate-pulse" />
            <p className="text-[11px] font-mono text-orange-300/90 leading-tight">
              Every AI call burns $CLAWD from the treasury. <span className="text-orange-400 font-bold">Deflationary forever.</span>
            </p>
          </div>

          <div className="rounded-lg border border-purple-500/20 bg-black/40 p-3 mb-6 text-xs font-mono text-left">
            <div className="flex justify-between text-purple-300/60">
              <span>WALLET</span>
              <span className="text-purple-200">
                {connected && wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "Not connected"}
              </span>
            </div>
            <div className="flex justify-between text-purple-300/60 mt-1">
              <span>BALANCE</span>
              <span className={balanceShown > 0 ? "text-green-400" : "text-red-400"}>
                {balanceShown.toLocaleString()} $CLAWD
              </span>
            </div>
            <div className="flex justify-between text-purple-300/60 mt-1">
              <span>REQUIRED</span>
              <span className="text-purple-200">≥ {MIN_CLAWD.toLocaleString()} (hold) or 69,420 (entry)</span>
            </div>
          </div>

          {!connected ? (
            <p className="text-xs text-yellow-400/80 mb-4">
              Connect your wallet (top right) to verify your $CLAWD balance.
            </p>
          ) : (
            <div className="space-y-3 mb-4">
              <Button
                onClick={() => verify()}
                disabled={isVerifying}
                variant="outline"
                size="sm"
                className="w-full border-purple-500/40 text-purple-200 hover:bg-purple-500/10"
              >
                {isVerifying ? (
                  <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Re-checking…</>
                ) : (
                  "Re-check balance"
                )}
              </Button>

              {/* Entry fee payment — shown when user has insufficient balance */}
              {balanceShown < MIN_CLAWD && (
                <div className="rounded-lg border border-purple-600/30 bg-purple-950/30 p-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-xs font-bold text-purple-200">ONE-TIME ENTRY FEE</span>
                  </div>
                  <p className="text-[11px] text-purple-300/70 mb-2 leading-relaxed">
                    Pay 69,420 $CLAWD to the treasury once and gain permanent access — no ongoing hold required.
                  </p>
                  <Button
                    onClick={handlePayEntryFee}
                    disabled={paying || !connected}
                    size="sm"
                    className="w-full bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold"
                  >
                    {paying ? (
                      <><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Sending 69,420 $CLAWD…</>
                    ) : (
                      <>Pay 69,420 $CLAWD Entry Fee</>
                    )}
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/free"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 font-bold text-sm hover:bg-emerald-500/25 transition"
            >
              Free Terminal
            </Link>
            <a
              href={`https://jup.ag/swap/SOL-${CLAWD_TOKEN}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-gradient-to-r from-green-500 to-cyan-500 text-black font-bold text-sm hover:opacity-90 transition"
            >
              Buy on Jupiter <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          <a
            href={`https://pump.fun/coin/${CLAWD_TOKEN}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-200 font-bold text-sm hover:bg-purple-500/30 transition"
          >
            pump.fun <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <Link
            href="/"
            className="inline-flex items-center gap-1 mt-5 text-xs text-purple-300/60 hover:text-purple-300"
          >
            <ArrowLeft className="w-3 h-3" /> Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
