import { useState, useEffect, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Zap, Flame, DollarSign, ChevronRight, Lock, Wallet, AlertTriangle } from "lucide-react";

const TREASURY_WALLET = "HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ";
const FEE_SOL = 0.00069420;

type PriceData = {
  solUsd: number;
  clawdUsd: number;
  feeSol: number;
  feeUsd: string;
  clawdToBurn: number;
};

type PaymentGateProps = {
  feature: string;
  featureLabel: string;
  onAccess: () => void;
  children?: React.ReactNode;
  compact?: boolean;
};

export function PaymentGate({ feature, featureLabel, onAccess, children, compact = false }: PaymentGateProps) {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);

  const { data: prices, isLoading: pricesLoading } = useQuery<PriceData>({
    queryKey: ["/api/treasury/prices"],
    refetchInterval: 30_000,
  });

  const handlePay = useCallback(async () => {
    if (!publicKey || !connected) {
      toast({ title: "Connect your wallet first", variant: "destructive" });
      return;
    }
    setPaying(true);
    try {
      const lamports = Math.round(FEE_SOL * LAMPORTS_PER_SOL);
      const ix = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(TREASURY_WALLET),
        lamports,
      });
      const { blockhash } = await connection.getLatestBlockhash();
      const tx = new Transaction();
      tx.add(ix);
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

      // Verify on backend and trigger burn
      const r = await fetch("/api/treasury/verify-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txSignature: sig,
          walletAddress: publicKey.toBase58(),
          feature,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      setPaid(true);
      toast({
        title: `✓ Access granted — ${featureLabel}`,
        description: `${data.clawdBurned?.toLocaleString() ?? "?"} CLAWD burned from treasury`,
      });
      onAccess();
    } catch (e: any) {
      if (e.message?.includes("User rejected") || e.message?.includes("canceled")) {
        toast({ title: "Cancelled", description: "Transaction was rejected." });
      } else {
        toast({ title: "Payment failed", description: e.message, variant: "destructive" });
      }
    } finally {
      setPaying(false);
    }
  }, [publicKey, connected, connection, sendTransaction, feature, featureLabel, onAccess, toast]);

  if (compact) {
    return (
      <button
        onClick={handlePay}
        disabled={paying || !connected || pricesLoading}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 font-mono text-xs transition-all disabled:opacity-50"
      >
        {paying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
        {paying ? "Paying…" : `${FEE_SOL} SOL${prices ? ` · $${prices.feeUsd}` : ""}`}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-[#0f0f1e] border border-purple-500/20 rounded-2xl max-w-sm w-full">
      <div className="h-14 w-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
        <Flame className="h-7 w-7 text-orange-400" />
      </div>

      <div className="text-center space-y-1">
        <h3 className="font-mono font-bold text-white">CLAWD Treasury Access</h3>
        <p className="text-xs text-gray-500 font-mono">{featureLabel}</p>
      </div>

      {/* Price breakdown */}
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-purple-500/20 flex items-center justify-center">
              <span className="text-[10px] font-mono text-purple-300">◎</span>
            </div>
            <div>
              <p className="text-[11px] font-mono text-gray-400">Fee (SOL)</p>
              <p className="font-mono font-bold text-white text-sm">{FEE_SOL} SOL</p>
            </div>
          </div>
          {pricesLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-600" />
          ) : (
            <div className="text-right">
              <p className="text-[10px] font-mono text-gray-500">≈ USD</p>
              <p className="font-mono text-green-400 text-sm font-bold">${prices?.feeUsd ?? "—"}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-orange-500/20 flex items-center justify-center">
              <Flame className="h-3 w-3 text-orange-400" />
            </div>
            <div>
              <p className="text-[11px] font-mono text-gray-400">CLAWD burned</p>
              <p className="font-mono font-bold text-orange-300 text-sm">
                {pricesLoading ? "…" : (prices?.clawdToBurn ?? "?").toLocaleString()}
              </p>
            </div>
          </div>
          <Badge className="text-[10px] font-mono bg-orange-500/15 text-orange-400 border-orange-500/30">
            DEFLATIONARY
          </Badge>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-black/20 rounded-xl">
          <DollarSign className="h-3 w-3 text-gray-600 shrink-0" />
          <p className="text-[10px] font-mono text-gray-500">
            SOL goes to treasury · Equal USD value of CLAWD is burned
          </p>
        </div>
      </div>

      {!connected ? (
        <div className="flex items-center gap-2 text-[11px] font-mono text-yellow-400">
          <AlertTriangle className="h-3.5 w-3.5" />
          Connect wallet to continue
        </div>
      ) : (
        <Button
          onClick={handlePay}
          disabled={paying || pricesLoading}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold gap-2 h-10"
        >
          {paying ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</>
          ) : (
            <><Zap className="h-4 w-4" /> Pay {FEE_SOL} SOL & Access</>
          )}
        </Button>
      )}

      {children}
    </div>
  );
}

// ─── Inline gate wrapper — shows PaymentGate or children ─────────────────────
export function WithPaymentGate({
  feature,
  featureLabel,
  children,
}: {
  feature: string;
  featureLabel: string;
  children: React.ReactNode;
}) {
  const [access, setAccess] = useState(false);
  if (access) return <>{children}</>;
  return (
    <div className="flex justify-center py-8">
      <PaymentGate
        feature={feature}
        featureLabel={featureLabel}
        onAccess={() => setAccess(true)}
      />
    </div>
  );
}
