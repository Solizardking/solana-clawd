import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { TrendingDown, TrendingUp, Zap, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePhoenixAllMids } from "@/lib/phoenix";

const CLAWD_MINT = "8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump";

type BirdeyePrice = {
  value: number;
  priceChange24h: number;
};

function useBirdeyePrice(mint: string, intervalMs = 30_000) {
  const [data, setData] = useState<BirdeyePrice | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const load = () =>
      fetch(`/api/birdeye/price/${mint}`)
        .then((r) => r.json())
        .then((json) => {
          if (mounted.current && json?.data) {
            setData({
              value: json.data.value,
              priceChange24h: json.data.priceChange24h ?? 0,
            });
          }
        })
        .catch(() => {});
    load();
    const id = setInterval(load, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [mint, intervalMs]);

  return data;
}

function fmt(n: number | undefined | null, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: decimals })}`;
  if (n >= 1) return `$${n.toFixed(decimals)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toPrecision(4)}`;
}

function fmtPct(n: number | undefined | null) {
  if (n == null || !Number.isFinite(n)) return null;
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}

type TickerItemProps = {
  label: string;
  price: number | null | undefined;
  change24h?: number | null;
  glowColor: string;
  decimals?: number;
};

function TickerItem({ label, price, change24h, glowColor, decimals = 2 }: TickerItemProps) {
  const isUp = (change24h ?? 0) >= 0;
  const pct = fmtPct(change24h);

  return (
    <div
      className="flex flex-col gap-1 rounded-xl border bg-black/60 px-4 py-3 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5"
      style={{ borderColor: `${glowColor}33`, boxShadow: `0 0 18px ${glowColor}18` }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-mono font-semibold tracking-widest uppercase" style={{ color: glowColor }}>
          {label}
        </span>
        {pct && (
          <span
            className={`flex items-center gap-0.5 text-[10px] font-mono font-medium ${isUp ? "text-green-400" : "text-red-400"}`}
          >
            {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {pct}
          </span>
        )}
      </div>
      <span className="text-lg font-black tabular-nums text-white">
        {price != null ? fmt(price, decimals) : <span className="text-white/30 text-sm animate-pulse">loading…</span>}
      </span>
    </div>
  );
}

export function PhoenixPerpsPromo() {
  const mids = usePhoenixAllMids();
  const clawd = useBirdeyePrice(CLAWD_MINT);

  // Phoenix allMids keys may be "SOL", "BTC", "ETH"
  const solMid = mids["SOL"] ?? null;
  const btcMid = mids["BTC"] ?? null;
  const ethMid = mids["ETH"] ?? null;

  return (
    <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-black/60 to-cyan-950/30 p-5 backdrop-blur-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-bold text-purple-200">Phoenix Perpetuals</span>
            <span className="inline-flex h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] font-mono text-green-400/70">LIVE</span>
          </div>
          <p className="mt-0.5 text-[11px] text-zinc-500 font-mono">
            SOL · BTC · ETH on-chain perpetuals · Flight builder routing
          </p>
        </div>
        <Link href="/perps">
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-purple-600 hover:bg-purple-500 text-xs font-semibold"
          >
            Trade Now
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {/* Price grid */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TickerItem label="SOL-PERP" price={solMid} glowColor="#7c3aed" />
        <TickerItem label="BTC-PERP" price={btcMid} glowColor="#f59e0b" decimals={0} />
        <TickerItem label="ETH-PERP" price={ethMid} glowColor="#3b82f6" />
        <TickerItem
          label="$CLAWD"
          price={clawd?.value ?? null}
          change24h={clawd?.priceChange24h ?? null}
          glowColor="#22d3ee"
          decimals={6}
        />
      </div>

      {/* Footer note */}
      <p className="mt-3 text-center text-[10px] text-zinc-600 font-mono">
        Perp mark prices via Phoenix WS · CLAWD spot via Birdeye · Connect wallet to trade
      </p>
    </div>
  );
}
