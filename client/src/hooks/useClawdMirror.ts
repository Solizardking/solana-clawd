import { useCallback, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { useAuth } from "@/contexts/AuthContext";

export type MirrorHolding = {
  mint: string;
  symbol: string;
  net: number;
  bought: number;
  sold: number;
  boughtNotionalUsd: number;
  soldNotionalUsd: number;
  avgBuyPrice: number;
  costBasisRemainingUsd: number;
  realizedPnlUsd: number;
  netNotionalUsd: number;
};

export type MirrorBookStats = {
  realizedPnlUsd: number;
  totalSpentUsd: number;
};

export function useClawdMirror() {
  const { isAuthenticated, signIn, user } = useAuth();
  const { signTransaction } = useWallet();
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<MirrorHolding[]>([]);
  const [stats, setStats] = useState<MirrorBookStats>({ realizedPnlUsd: 0, totalSpentUsd: 0 });

  const refreshHoldings = useCallback(async () => {
    if (!user?.walletAddress) {
      setHoldings([]);
      setStats({ realizedPnlUsd: 0, totalSpentUsd: 0 });
      return;
    }
    try {
      const r = await fetch(`/api/clawd/mirror/holdings/${user.walletAddress}`, { credentials: "include" });
      if (!r.ok) return;
      const j = await r.json();
      setHoldings(j.holdings ?? []);
      setStats({
        realizedPnlUsd: Number(j.realizedPnlUsd ?? 0),
        totalSpentUsd: Number(j.totalSpentUsd ?? 0),
      });
    } catch {}
  }, [user?.walletAddress]);

  useEffect(() => {
    refreshHoldings();
    const t = window.setInterval(refreshHoldings, 20_000);
    return () => window.clearInterval(t);
  }, [refreshHoldings]);

  const mirror = async (fillId: number, opts?: { notionalUsd?: number; amount?: number }) => {
    setError(null);
    setBusy(fillId);
    try {
      if (!isAuthenticated) await signIn();
      if (!signTransaction) throw new Error("Wallet does not support signTransaction");

      const params = new URLSearchParams({ fillId: String(fillId) });
      if (opts?.notionalUsd) params.set("notionalUsd", String(opts.notionalUsd));
      if (opts?.amount) params.set("amount", String(opts.amount));

      const r = await fetch(`/api/clawd/mirror/quote?${params}`, { credentials: "include" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error ?? `quote ${r.status}`);
      }
      const quote = await r.json();
      const txB64: string | undefined = quote.order?.transaction ?? quote.order?.swapTransaction;
      const requestId: string | undefined = quote.order?.requestId;
      if (!txB64 || !requestId) throw new Error("quote missing transaction");

      const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(txB64), (c) => c.charCodeAt(0)));
      const signed = await signTransaction(tx);
      const signedB64 = btoa(String.fromCharCode(...new Uint8Array(signed.serialize())));

      const exec = await fetch("/api/wallet-ops/jupiter-execute", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          signedTransaction: signedB64,
          requestId,
          lastValidBlockHeight: quote.order?.lastValidBlockHeight,
        }),
      });
      const execJson = await exec.json();
      if (!exec.ok) throw new Error(execJson?.error ?? `execute ${exec.status}`);
      const txSignature: string | undefined = execJson.signature ?? execJson.transactionSignature;
      if (!txSignature) throw new Error(execJson?.error ?? "execute returned no signature");

      const side: "buy" | "sell" = quote.side ?? "buy";
      const outDec = quote.order?.outputDecimals ?? (side === "buy" ? 6 : 9);
      const amountOut = quote.order?.outAmount
        ? Number(quote.order.outAmount) / 10 ** outDec
        : null;
      const recordedNotionalUsd =
        side === "buy"
          ? quote.notionalUsd
          : amountOut != null && quote.solUsd
          ? amountOut * quote.solUsd
          : null;

      const rec = await fetch("/api/clawd/mirror/record", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceFillId: quote.sourceFillId,
          txSignature,
          mint: quote.mint ?? quote.outputMint ?? quote.inputMint,
          symbol: quote.symbol,
          side,
          amountInRaw: quote.amountRaw ?? quote.amountLamports,
          amountOut,
          notionalUsd: recordedNotionalUsd,
        }),
      });
      if (!rec.ok) {
        const j = await rec.json().catch(() => ({}));
        throw new Error(j?.error ?? `record ${rec.status}`);
      }

      refreshHoldings();
      return { txSignature, side };
    } catch (e: any) {
      const msg = e?.message ?? "mirror failed";
      setError(msg);
      throw e;
    } finally {
      setBusy(null);
    }
  };

  return { mirror, busy, error, isAuthenticated, holdings, stats, refreshHoldings };
}
