import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Flame, Loader2, Zap, AlertTriangle, X, DollarSign, Sparkles } from "lucide-react";

const TREASURY_WALLET = "HKBX8CwMGwnwtFjTH99xKa82whjowqxzsBQGWT3kBhDJ";
const FEE_SOL = 0.00069420;

type PriceData = {
  solUsd: number; clawdUsd: number; feeSol: number;
  feeUsd: string; clawdToBurn: number;
};

type GateCtx = {
  /** Open payment modal for a feature; resolves true when paid, false when cancelled */
  requirePayment: (feature: string, label?: string) => Promise<boolean>;
  /** Sessions already unlocked this browser session */
  isUnlocked: (feature: string) => boolean;
};

const TreasuryGateContext = createContext<GateCtx | null>(null);
export const useTreasuryGate = () => {
  const ctx = useContext(TreasuryGateContext);
  if (!ctx) throw new Error("useTreasuryGate must be used inside TreasuryGateProvider");
  return ctx;
};

export function TreasuryGateProvider({ children }: { children: React.ReactNode }) {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [feature, setFeature] = useState("general");
  const [label, setLabel] = useState("Feature access");
  const resolverRef = useRef<((v: boolean) => void) | null>(null);
  const unlockedRef = useRef<Set<string>>(new Set());

  const { data: prices } = useQuery<PriceData>({
    queryKey: ["/api/treasury/prices"],
    enabled: open,
    refetchInterval: 15_000,
  });

  const requirePayment = useCallback((f: string, lbl?: string) => {
    return new Promise<boolean>((resolve) => {
      setFeature(f);
      setLabel(lbl || f);
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const isUnlocked = useCallback((f: string) => unlockedRef.current.has(f), []);

  const close = (success: boolean) => {
    setOpen(false);
    resolverRef.current?.(success);
    resolverRef.current = null;
  };

  const handlePay = async () => {
    if (!publicKey || !connected) {
      toast({ title: "Connect your wallet first", variant: "destructive" });
      return;
    }
    setPaying(true);
    try {
      const lamports = Math.round(FEE_SOL * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(TREASURY_WALLET),
          lamports,
        })
      );
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");

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

      toast({
        title: `🔥 ${(data.clawdBurned ?? 0).toLocaleString()} CLAWD burned`,
        description: `Access granted to ${label}`,
      });
      close(true);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg.includes("rejected") || msg.includes("User rejected") || msg.includes("canceled")) {
        toast({ title: "Cancelled" });
      } else {
        toast({ title: "Payment failed", description: msg, variant: "destructive" });
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <TreasuryGateContext.Provider value={{ requirePayment, isUnlocked }}>
      {children}
      <Dialog open={open} onOpenChange={(v) => !v && !paying && close(false)}>
        <DialogContent className="bg-[#0a0a14] border border-purple-500/30 text-gray-200 max-w-md">
          <div className="flex flex-col items-center gap-4 p-2">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-500/30 to-orange-500/20 border border-purple-500/30 flex items-center justify-center">
              <Flame className="h-7 w-7 text-orange-400" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-mono font-bold text-white text-base">CLAWD Treasury Access</h3>
              <p className="text-xs text-gray-500 font-mono">{label}</p>
            </div>

            <div className="w-full space-y-2">
              <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-white/5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-400">Pay</span>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-white">{FEE_SOL} SOL</p>
                  <p className="text-[10px] font-mono text-green-400">≈ ${prices?.feeUsd ?? "—"}</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-black/40 rounded-xl border border-orange-500/10">
                <div className="flex items-center gap-2">
                  <Flame className="h-3.5 w-3.5 text-orange-400" />
                  <span className="text-xs font-mono text-gray-400">Burn from pool</span>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-orange-300">
                    {(prices?.clawdToBurn ?? 0).toLocaleString()} CLAWD
                  </p>
                  <Badge className="text-[9px] font-mono bg-orange-500/15 text-orange-400 border-orange-500/30">
                    DEFLATIONARY
                  </Badge>
                </div>
              </div>

              <div className="flex items-start gap-2 px-3 py-2 bg-purple-500/5 rounded-xl border border-purple-500/10">
                <Sparkles className="h-3 w-3 text-purple-400 shrink-0 mt-0.5" />
                <p className="text-[10px] font-mono text-gray-500 leading-relaxed">
                  Live BirdEye prices · SOL goes to treasury · Equal USD value of CLAWD burned forever
                </p>
              </div>
            </div>

            {!connected && (
              <div className="flex items-center gap-2 text-[11px] font-mono text-yellow-400">
                <AlertTriangle className="h-3.5 w-3.5" /> Connect wallet to pay
              </div>
            )}

            <div className="flex gap-2 w-full">
              <Button
                variant="outline"
                onClick={() => !paying && close(false)}
                disabled={paying}
                className="flex-1 border-white/10 text-gray-400 hover:bg-white/5 font-mono"
              >
                Cancel
              </Button>
              <Button
                onClick={handlePay}
                disabled={paying || !connected}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-mono font-bold gap-2"
              >
                {paying ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Paying…</>
                ) : (
                  <><Zap className="h-4 w-4" /> Pay & Burn</>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </TreasuryGateContext.Provider>
  );
}
