import { useState, useEffect } from "react";
import { Droplets } from "lucide-react";

interface LivePrice {
  clawdPerSol: number;
  solPerClawd: number;
  clawdReserve: number;
  solReserve: number;
  timestamp: number;
}

/**
 * A compact live price ticker bar for the CLAWD/SOL Meteora DAMM V2 pool.
 * Polls GET /api/meteora-swap/live-price every 5 seconds.
 */
export function MeteoraPriceBar() {
  const [price, setPrice] = useState<LivePrice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrice() {
      try {
        const res = await fetch("/api/meteora-swap/live-price");
        if (!cancelled && res.ok) {
          const data = await res.json();
          setPrice(data);
          setLoading(false);
        } else if (!cancelled) {
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPrice();
    const interval = setInterval(fetchPrice, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-xs text-green-600/50 font-mono">
        <Droplets className="w-3 h-3 animate-pulse" />
        <span>Meteora pool loading...</span>
      </div>
    );
  }

  if (!price) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-xs text-green-600/40 font-mono">
        <Droplets className="w-3 h-3" />
        <span>Meteora pool loading...</span>
      </div>
    );
  }

  const clawdPerSol = price.clawdPerSol > 0
    ? price.clawdPerSol.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : "—";
  const solTvl = price.solReserve > 0
    ? price.solReserve.toFixed(2)
    : "0";

  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs text-green-400 font-mono select-none">
      <Droplets className="w-3 h-3 text-green-500 flex-shrink-0" />
      <span className="font-semibold tracking-wide">CLAWD/SOL</span>
      <span className="text-green-500/60">•</span>
      <span>{clawdPerSol} CLAWD per SOL</span>
      <span className="text-green-500/60">•</span>
      <span>{solTvl} SOL TVL</span>
      <span className="text-green-500/60">•</span>
      <span className="text-green-500/70">Meteora DAMM V2</span>
    </div>
  );
}
