import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  PHOENIX_BUILDER_AUTHORITY,
  PHOENIX_BUILDER_PDA_INDEX,
  PHOENIX_BUILDER_TRADER_ACCOUNT,
  RPC_URL,
  activateInviteCode,
  baseLotsToBase,
  buildCancelAll,
  buildDeposit,
  buildOrder,
  buildRegisterTrader,
  buildWithdraw,
  checkTraderExists,
  fetchOrderHistory,
  fetchPhoenixMarkets,
  fetchTradeHistory,
  fmtBase,
  fmtUsd,
  formatBaseLotSize,
  formatRiskPct,
  formatTickSize,
  ixsToTransaction,
  isPhoenixAuthError,
  sortedActiveMarkets,
  usePhoenixAllMids,
  usePhoenixOrderbook,
  usePhoenixTraderStateWs,
  type OrderHistoryItem,
  type PhoenixMarket,
  type TradeHistoryItem,
  type TraderPosition,
} from "@/lib/phoenix";
import { HeliusService } from "@/lib/heliusService";

type OrderSide = "long" | "short";
type OrderType = "market" | "limit";
type OrderStatus = "idle" | "building" | "signing" | "sending" | "done" | "error";
type PanelTab = "trade" | "positions" | "history" | "collateral";
type HistorySubTab = "orders" | "trades";
type PhoenixOrderPrefill = {
  side?: OrderSide;
  orderType?: OrderType;
  size?: string;
  limitPrice?: string;
};

function readInitialPhoenixParams(): { symbol: string; tab: PanelTab; order: PhoenixOrderPrefill } {
  const fallback = { symbol: "SOL", tab: "trade" as PanelTab, order: {} };
  if (typeof window === "undefined") return fallback;

  const params = new URLSearchParams(window.location.search);
  const symbol = (params.get("symbol") || params.get("market") || fallback.symbol)
    .replace(/-PERP$/i, "")
    .toUpperCase();
  const sideRaw = (params.get("side") || "").toLowerCase();
  const orderTypeRaw = (params.get("orderType") || "").toLowerCase();
  const tabRaw = (params.get("tab") || "").toLowerCase();

  return {
    symbol,
    tab: tabRaw === "positions" || tabRaw === "history" ? tabRaw : fallback.tab,
    order: {
      side: sideRaw === "short" ? "short" : sideRaw === "long" ? "long" : undefined,
      orderType: orderTypeRaw === "limit" ? "limit" : orderTypeRaw === "market" ? "market" : undefined,
      size: params.get("size") || params.get("amount") || undefined,
      limitPrice: params.get("limitPrice") || params.get("price") || undefined,
    },
  };
}

// ─── MarketParams ─────────────────────────────────────────────────────────────

function MarketParams({ m }: { m: PhoenixMarket }) {
  const [showTiers, setShowTiers] = useState(false);
  const decimals = m.baseLotsDecimals;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
        <span className="text-zinc-500">Base lot size</span>
        <span className="text-zinc-200">{formatBaseLotSize(decimals)} {m.symbol}</span>
        <span className="text-zinc-500">Tick size</span>
        <span className="text-zinc-200">{formatTickSize(m.tickSize, decimals)}</span>
        <span className="text-zinc-500">OI Cap</span>
        <span className="text-zinc-200">
          {baseLotsToBase(m.openInterestCapBaseLots, decimals).toLocaleString("en-US")} {m.symbol}
        </span>
        <span className="text-zinc-500">Maker fee</span>
        <span className="text-emerald-300">{formatRiskPct(m.makerFee * 100)}</span>
        <span className="text-zinc-500">Taker fee</span>
        <span className="text-orange-300">{formatRiskPct(m.takerFee * 100)}</span>
        <span className="text-zinc-500">Funding period</span>
        <span className="text-zinc-200">{(m.fundingPeriodSeconds / 3600).toFixed(0)}h</span>
        <span className="text-zinc-500">Max funding / interval</span>
        <span className="text-zinc-200">{formatRiskPct(m.maxFundingRatePerIntervalPercentage)}</span>
        <span className="text-zinc-500">Maintenance margin</span>
        <span className="text-zinc-200">{formatRiskPct(m.riskFactors.maintenance)}</span>
        <span className="text-zinc-500">Isolated only</span>
        <span className={m.isolatedOnly ? "text-yellow-300" : "text-zinc-200"}>
          {m.isolatedOnly ? "Yes" : "No"}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setShowTiers((v) => !v)}
        className="flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors mt-1"
      >
        {showTiers ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Leverage tiers ({m.leverageTiers.length})
      </button>

      {showTiers && (
        <div className="rounded border border-white/10 bg-black/40 p-2">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="text-zinc-500">
                <th className="text-left pb-1">Tier</th>
                <th className="text-left pb-1">Max Lev</th>
                <th className="text-left pb-1">Max Size</th>
                <th className="text-left pb-1">Limit Risk</th>
              </tr>
            </thead>
            <tbody>
              {m.leverageTiers.map((tier) => (
                <tr key={tier.maxLeverage} className="border-t border-white/5">
                  <td className="py-0.5 text-zinc-400">{tier.maxLeverage}</td>
                  <td className="py-0.5 text-cyan-300">{tier.maxLeverage}x</td>
                  <td className="py-0.5 text-zinc-200">
                    {baseLotsToBase(tier.maxSizeBaseLots, decimals).toLocaleString("en-US", {
                      maximumFractionDigits: 4,
                    })}{" "}
                    {m.symbol}
                  </td>
                  <td className="py-0.5 text-orange-300">{formatRiskPct(tier.limitOrderRiskFactor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── OrderbookView ────────────────────────────────────────────────────────────

function OrderbookView({ symbol }: { symbol: string }) {
  const ob = usePhoenixOrderbook(`${symbol}-PERP`);
  const topAsks = ob.asks.slice(0, 5).reverse();
  const topBids = ob.bids.slice(0, 5);
  const empty = ob.asks.length === 0 && ob.bids.length === 0;

  return (
    <div className="space-y-0.5 font-mono text-[10px]">
      <div className="flex justify-between text-zinc-500 pb-1 border-b border-white/10">
        <span>Price (USD)</span>
        <span>Size</span>
      </div>
      {empty ? (
        <div className="flex items-center justify-center py-4 text-zinc-600">
          <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
          Connecting…
        </div>
      ) : (
        <>
          {topAsks.map(([price, size]) => (
            <div key={`ask-${price}`} className="flex justify-between">
              <span className="text-red-400">
                ${price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-zinc-400">{fmtBase(size)}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 py-1 border-y border-white/10 my-0.5">
            <span className="text-zinc-500 text-[9px] uppercase">Mid</span>
            <span className={`font-semibold text-xs ${ob.mid !== null ? "text-white" : "text-zinc-500"}`}>
              {ob.mid !== null ? fmtUsd(ob.mid) : "—"}
            </span>
          </div>
          {topBids.map(([price, size]) => (
            <div key={`bid-${price}`} className="flex justify-between">
              <span className="text-emerald-400">
                ${price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-zinc-400">{fmtBase(size)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── OrderPanel ───────────────────────────────────────────────────────────────

function OrderPanel({
  m,
  prefill,
  midPrice,
}: {
  m: PhoenixMarket;
  prefill?: PhoenixOrderPrefill;
  midPrice: number | null;
}) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { toast } = useToast();

  const [side, setSide] = useState<OrderSide>(prefill?.side ?? "long");
  const [orderType, setOrderType] = useState<OrderType>(prefill?.orderType ?? "market");
  const [size, setSize] = useState(prefill?.size ?? "");
  const [limitPrice, setLimitPrice] = useState(prefill?.limitPrice ?? "");
  const [status, setStatus] = useState<OrderStatus>("idle");
  const [txSig, setTxSig] = useState<string | null>(null);
  const [liquidationEst, setLiquidationEst] = useState<number | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  const maxLev = m.leverageTiers[0]?.maxLeverage ?? 10;
  const symbol = `${m.symbol}-PERP`;
  const sizeStep = formatBaseLotSize(m.baseLotsDecimals);
  const limitStep = String(m.tickSize * 10 ** (m.baseLotsDecimals - 6));
  const sizeValue = Number(size);
  const referencePrice =
    orderType === "limit" && limitPrice && Number.isFinite(Number(limitPrice))
      ? Number(limitPrice)
      : midPrice;
  const estimatedNotional =
    Number.isFinite(sizeValue) && sizeValue > 0 && referencePrice !== null
      ? sizeValue * referencePrice
      : null;

  const handlePlace = useCallback(async () => {
    const log = (msg: string) => setLogs((prev) => [...prev.slice(-9), msg]);

    if (!connected || !publicKey || !signTransaction) {
      toast({ title: "Wallet not connected", variant: "destructive" });
      return;
    }
    if (!size || Number.isNaN(Number(size)) || Number(size) <= 0) {
      toast({ title: "Enter a valid size", variant: "destructive" });
      return;
    }
    if (orderType === "limit" && (!limitPrice || Number.isNaN(Number(limitPrice)))) {
      toast({ title: "Enter a limit price", variant: "destructive" });
      return;
    }
    if (!riskAcknowledged) {
      toast({
        title: "Confirm live order risk",
        description: "A checked acknowledgement is required before signing a Phoenix perp order.",
        variant: "destructive",
      });
      return;
    }

    try {
      setStatus("building");
      setTxSig(null);
      setLiquidationEst(null);
      setLogs([]);
      log(`Building ${orderType} ${side} for ${size} ${m.symbol}…`);

      const result = await buildOrder({
        authority: publicKey.toBase58(),
        symbol,
        side: side === "long" ? "bid" : "ask",
        quantity: Number(size),
        price: orderType === "limit" ? Number(limitPrice) : undefined,
        pdaIndex: 0,
      });

      if (result.estimatedLiquidationPriceUsd !== null) {
        setLiquidationEst(result.estimatedLiquidationPriceUsd);
      }

      log("Instruction built — signing…");
      setStatus("signing");

      const connection = new Connection(RPC_URL, "confirmed");
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      const tx = ixsToTransaction(result.instructions, publicKey, blockhash);

      const signed = await signTransaction(tx);
      const signedBytes = Buffer.from(signed.serialize());

      log("Signed — sending to RPC…");
      setStatus("sending");

      const { signature: sig } = await HeliusService.sendSignedTransaction(
        signedBytes.toString("base64"),
        { skipPreflight: false, maxRetries: 3 },
      );
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");

      setTxSig(sig);
      setStatus("done");
      log(`Confirmed: ${sig.slice(0, 12)}…`);
      toast({ title: "Order placed!", description: `${side.toUpperCase()} ${size} ${m.symbol} on Phoenix` });
    } catch (err: unknown) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [...prev.slice(-9), `Error: ${msg}`]);
      toast({ title: "Order failed", description: msg, variant: "destructive" });
    }
  }, [connected, publicKey, signTransaction, side, orderType, size, limitPrice, riskAcknowledged, m, symbol, toast]);

  const reset = () => {
    setStatus("idle");
    setTxSig(null);
    setLiquidationEst(null);
    setLogs([]);
    setSize("");
    setLimitPrice("");
  };

  const busy = status === "building" || status === "signing" || status === "sending";

  return (
    <div className="space-y-3">
      {/* Side */}
      <div className="grid grid-cols-2 gap-1">
        {(["long", "short"] as OrderSide[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSide(s)}
            disabled={busy}
            className={`rounded py-2 text-xs font-semibold font-mono transition-colors capitalize disabled:opacity-50 ${
              side === s
                ? s === "long" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                : "bg-black/40 border border-zinc-700 text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Order type */}
      <div className="flex gap-1">
        {(["market", "limit"] as OrderType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setOrderType(t)}
            disabled={busy}
            className={`text-[10px] font-mono px-2.5 py-1 rounded border transition-colors capitalize disabled:opacity-50 ${
              orderType === t
                ? "border-cyan-500/50 text-cyan-300 bg-cyan-500/10"
                : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Limit price */}
      {orderType === "limit" && (
        <div className="space-y-1">
          <label htmlFor="phoenix-limit-price" className="text-[10px] text-zinc-500 font-mono">
            Limit price (USD)
          </label>
          <Input
            id="phoenix-limit-price"
            type="number"
            step={limitStep}
            placeholder="0.00"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            disabled={busy}
            className="bg-black/60 border-purple-500/30 text-white font-mono h-8 text-xs"
          />
        </div>
      )}

      {/* Size */}
      <div className="space-y-1">
        <label htmlFor="phoenix-size" className="text-[10px] text-zinc-500 font-mono">
          Size ({m.symbol})
        </label>
        <Input
          id="phoenix-size"
          type="number"
          step={sizeStep}
          placeholder="0.00"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          disabled={busy}
          className="bg-black/60 border-purple-500/30 text-white font-mono h-8 text-xs"
        />
        <div className="text-[10px] text-zinc-600 font-mono">
          Min: {formatBaseLotSize(m.baseLotsDecimals)} {m.symbol}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">
          <div className="text-[9px] font-mono text-zinc-500">Reference</div>
          <div className="text-xs font-mono text-zinc-200">
            {referencePrice !== null ? fmtUsd(referencePrice) : "Live mid pending"}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">
          <div className="text-[9px] font-mono text-zinc-500">Est. notional</div>
          <div className="text-xs font-mono text-cyan-300">
            {estimatedNotional !== null ? fmtUsd(estimatedNotional) : "—"}
          </div>
        </div>
        <div className="rounded border border-white/10 bg-black/30 px-2 py-1.5">
          <div className="text-[9px] font-mono text-zinc-500">Top tier max</div>
          <div className="text-xs font-mono text-zinc-200">{maxLev}x</div>
        </div>
      </div>

      <div className="rounded border border-white/5 bg-black/30 px-3 py-2 text-[10px] font-mono text-zinc-500">
        Phoenix does not take a leverage slider on order submission. Effective leverage comes from
        your collateral and resulting position size after the fill.
      </div>

      <label className="flex items-start gap-2 rounded border border-yellow-500/20 bg-yellow-950/20 px-3 py-2 text-[10px] font-mono text-yellow-100">
        <input
          type="checkbox"
          checked={riskAcknowledged}
          onChange={(event) => setRiskAcknowledged(event.target.checked)}
          disabled={busy}
          className="mt-0.5 accent-yellow-400"
        />
        <span>
          I understand this signs and sends a live Phoenix perp order. Market orders can fill through
          available FIFO and spline liquidity; use a limit order when a hard price cap matters.
        </span>
      </label>

      {/* Liquidation estimate */}
      {liquidationEst !== null && (
        <div className="rounded border border-yellow-500/30 bg-yellow-950/20 px-3 py-1.5 text-[10px] font-mono">
          <span className="text-zinc-500">Est. liquidation: </span>
          <span className="text-yellow-300">{fmtUsd(liquidationEst)}</span>
        </div>
      )}

      {/* Action */}
      {!connected ? (
        <WalletMultiButton className="!w-full !bg-purple-600 !text-xs !h-9 !rounded-md" />
      ) : (
        <div className="flex gap-2">
          <Button
            onClick={handlePlace}
            disabled={busy || status === "done" || !riskAcknowledged}
            className={`flex-1 h-9 text-xs font-mono font-semibold ${
              side === "long"
                ? "bg-emerald-600 hover:bg-emerald-500"
                : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
            {status === "building" ? "Building…"
              : status === "signing" ? "Signing…"
              : status === "sending" ? "Sending…"
              : `${side === "long" ? "Place Long" : "Place Short"} Order`}
          </Button>
          {(status === "done" || status === "error") && (
            <Button onClick={reset} variant="ghost" size="sm" className="h-9 text-xs text-zinc-400">
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Reset
            </Button>
          )}
        </div>
      )}

      {/* Confirmed tx */}
      {status === "done" && txSig && (
        <div className="rounded border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
          <a
            href={`https://solscan.io/tx/${txSig}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono text-cyan-300 hover:text-cyan-200 flex items-center gap-1"
          >
            {txSig.slice(0, 20)}… <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </div>
      )}

      {/* Activity log */}
      {logs.length > 0 && (
        <div className="rounded border border-white/5 bg-black/60 px-2 py-1.5 space-y-0.5">
          {logs.map((line) => (
            <div key={line} className="text-[10px] font-mono text-zinc-400">
              <span className="text-zinc-700 mr-1">›</span>{line}
            </div>
          ))}
        </div>
      )}

      <p className="text-[9px] text-zinc-600 font-mono leading-4">
        Phoenix Perps is in private beta. Flight builder:{" "}
        <span className="text-zinc-500">{PHOENIX_BUILDER_AUTHORITY?.slice(0, 12) ?? "not set"}…</span>
      </p>
    </div>
  );
}

// ─── FlightBuilderCard ────────────────────────────────────────────────────────

function FlightBuilderCard() {
  const hasBuilder = Boolean(PHOENIX_BUILDER_AUTHORITY);

  return (
    <Card className="bg-black/40 border-yellow-500/20">
      <CardHeader className="pb-2 pt-3 px-3">
        <CardTitle className="text-xs text-zinc-400 font-mono flex items-center gap-1.5">
          <Zap className="h-3.5 w-3.5 text-yellow-400" />
          Flight Builder
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-3 space-y-1.5 text-[10px] font-mono">
        {hasBuilder ? (
          <>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Builder authority active
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
              <span className="text-zinc-500">Authority</span>
              <span className="text-zinc-300 break-all">{PHOENIX_BUILDER_AUTHORITY}</span>
              <span className="text-zinc-500">Portfolio index</span>
              <span className="text-zinc-300">{PHOENIX_BUILDER_PDA_INDEX}</span>
              <span className="text-zinc-500">Trader acct</span>
              <span className="text-zinc-300 break-all">
                {PHOENIX_BUILDER_TRADER_ACCOUNT?.slice(0, 16)}…
              </span>
            </div>
            <p className="text-zinc-600 leading-4 pt-1">
              Fees accrue on the builder trader account. Withdraw at{" "}
              <a
                href="https://flight.phoenix.trade"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300"
              >
                flight.phoenix.trade
              </a>
            </p>
            <p className="text-zinc-600 leading-4">
              Cross margin is the portfolio&apos;s <code className="text-zinc-400">subaccount_index = 0</code>.
              Additional subaccounts are isolated books.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5 text-yellow-400">
              <AlertTriangle className="h-3 w-3" />
              No builder authority set
            </div>
            <p className="text-zinc-500 leading-4">
              Register at{" "}
              <a
                href="https://flight.phoenix.trade"
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300"
              >
                flight.phoenix.trade
              </a>{" "}
              then set <code className="text-cyan-300">VITE_PHOENIX_BUILDER_AUTHORITY</code>.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── PositionsTab ─────────────────────────────────────────────────────────────

function PositionCells({ pos, mid }: { pos: TraderPosition; mid: number | null }) {
  const size = Number(pos.positionSize);
  const isLong = size > 0;
  const pnl = Number(pos.unrealizedPnl);

  return (
    <>
      <td className="py-1.5 text-zinc-200">{pos.symbol}</td>
      <td className={`py-1.5 font-semibold ${isLong ? "text-emerald-400" : "text-red-400"}`}>
        {isLong ? "LONG" : "SHORT"}
      </td>
      <td className="py-1.5 text-zinc-300">{fmtBase(Math.abs(size))}</td>
      <td className="py-1.5 text-zinc-300">{fmtUsd(pos.entryPrice)}</td>
      <td className="py-1.5 text-zinc-300">{mid !== null ? fmtUsd(mid) : "—"}</td>
      <td className={`py-1.5 font-semibold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {fmtUsd(pos.unrealizedPnl)}
      </td>
      <td className="py-1.5 text-yellow-300">{fmtUsd(pos.liquidationPrice)}</td>
    </>
  );
}

function PositionsTab({
  authority,
  mids,
}: {
  authority: string | null;
  mids: Record<string, number>;
}) {
  const state = usePhoenixTraderStateWs(authority, 0);
  const { signTransaction } = useWallet();
  const { toast } = useToast();
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function handleCancelAll(symbol: string) {
    if (!authority || !signTransaction) return;
    setCancelling(symbol);
    try {
      const { Connection, PublicKey } = await import("@solana/web3.js");
      const conn = new Connection(RPC_URL, "confirmed");
      const ixs = await buildCancelAll(authority, `${symbol}-PERP`);
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      const tx = ixsToTransaction(ixs, new PublicKey(authority), blockhash);
      const signed = await signTransaction(tx);
      const { signature: sig } = await HeliusService.sendSignedTransaction(
        Buffer.from(signed.serialize()).toString("base64"),
        { skipPreflight: false, maxRetries: 3 },
      );
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      toast({ title: `All ${symbol} orders cancelled`, description: `tx: ${sig.slice(0, 16)}…` });
    } catch (err: unknown) {
      toast({ title: "Cancel failed", description: (err as Error).message, variant: "destructive" });
    } finally {
      setCancelling(null);
    }
  }

  if (!authority) {
    return (
      <div className="py-10 flex flex-col items-center gap-3">
        <p className="text-xs text-zinc-500 font-mono">Connect wallet to view positions</p>
        <WalletMultiButton className="!bg-purple-600 !text-xs !h-9 !rounded-md" />
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-zinc-500 text-xs font-mono">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading portfolio…
      </div>
    );
  }

  const pnlNum = Number(state.unrealizedPnl);

  const summary = [
    { label: "Collateral", value: fmtUsd(state.collateral), color: "text-zinc-200" },
    { label: "Portfolio Value", value: fmtUsd(state.portfolioValue), color: "text-zinc-200" },
    {
      label: "Unrealized PnL",
      value: fmtUsd(state.unrealizedPnl),
      color: pnlNum >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: "Risk State",
      value: state.riskState,
      color: state.riskState === "ok" ? "text-emerald-400" : "text-yellow-400",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {summary.map(({ label, value, color }) => (
          <div key={label} className="rounded border border-white/10 bg-black/40 px-3 py-2">
            <div className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">{label}</div>
            <div className={`text-sm font-mono font-semibold mt-0.5 ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      {state.positions.length === 0 ? (
        <div className="py-8 text-center text-xs text-zinc-600 font-mono">No open positions</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
                <th className="text-left pb-2">Market</th>
                <th className="text-left pb-2">Side</th>
                <th className="text-left pb-2">Size</th>
                <th className="text-left pb-2">Entry</th>
                <th className="text-left pb-2">Mark</th>
                <th className="text-left pb-2">Unr. PnL</th>
                <th className="text-left pb-2">Liq. Price</th>
                <th className="text-left pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.positions.map((pos) => (
                <tr key={pos.symbol} className="border-t border-white/5 text-[10px] font-mono">
                  <PositionCells
                    pos={pos}
                    mid={mids[`${pos.symbol}-PERP`] ?? mids[pos.symbol] ?? null}
                  />
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => handleCancelAll(pos.symbol)}
                      disabled={cancelling === pos.symbol}
                      className="text-[9px] font-mono text-red-400 hover:text-red-300 disabled:opacity-50 flex items-center gap-0.5"
                    >
                      {cancelling === pos.symbol ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
                      Cancel All
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

function OrderHistoryTable({
  items,
  isLoading,
}: {
  items: OrderHistoryItem[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-zinc-500 text-xs font-mono">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading orders…
      </div>
    );
  }
  if (!items || items.length === 0) {
    return <div className="py-8 text-center text-xs text-zinc-600 font-mono">No order history</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px]">
        <thead>
          <tr className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
            <th className="text-left pb-2">Market</th>
            <th className="text-left pb-2">Side</th>
            <th className="text-left pb-2">Status</th>
            <th className="text-left pb-2">Price</th>
            <th className="text-left pb-2">Qty</th>
            <th className="text-left pb-2">Filled</th>
            <th className="text-left pb-2">Placed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o) => (
            <tr
              key={`${o.placedAt}-${o.price}-${o.side}`}
              className="border-t border-white/5 text-[10px] font-mono"
            >
              <td className="py-1.5 text-zinc-300">{o.marketSymbol}</td>
              <td className={`py-1.5 font-semibold ${o.side === "bid" ? "text-emerald-400" : "text-red-400"}`}>
                {o.side === "bid" ? "LONG" : "SHORT"}
              </td>
              <td className="py-1.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] ${
                    o.status === "filled"
                      ? "bg-emerald-950/50 text-emerald-400"
                      : o.status === "active"
                        ? "bg-blue-950/50 text-blue-400"
                        : "bg-zinc-800/50 text-zinc-500"
                  }`}
                >
                  {o.status}
                </span>
              </td>
              <td className="py-1.5 text-zinc-300">{fmtUsd(o.price)}</td>
              <td className="py-1.5 text-zinc-300">{fmtBase(o.baseQty)}</td>
              <td className="py-1.5 text-zinc-400">{fmtBase(o.filledBaseQty)}</td>
              <td className="py-1.5 text-zinc-500">{new Date(o.placedAt).toLocaleTimeString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeHistoryTable({
  items,
  isLoading,
}: {
  items: TradeHistoryItem[] | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-zinc-500 text-xs font-mono">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading trades…
      </div>
    );
  }
  if (!items || items.length === 0) {
    return <div className="py-8 text-center text-xs text-zinc-600 font-mono">No trade history</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px]">
        <thead>
          <tr className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider">
            <th className="text-left pb-2">Market</th>
            <th className="text-left pb-2">Side</th>
            <th className="text-left pb-2">Price</th>
            <th className="text-left pb-2">Size</th>
            <th className="text-left pb-2">Realized PnL</th>
            <th className="text-left pb-2">Fees</th>
            <th className="text-left pb-2">Liq.</th>
            <th className="text-left pb-2">Tx</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => {
            const pnl = Number(t.realizedPnl);
            return (
              <tr key={t.signature} className="border-t border-white/5 text-[10px] font-mono">
                <td className="py-1.5 text-zinc-300">{t.marketSymbol}</td>
                <td
                  className={`py-1.5 font-semibold ${
                    t.side === "bid" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {t.side === "bid" ? "BUY" : "SELL"}
                </td>
                <td className="py-1.5 text-zinc-300">{fmtUsd(t.price)}</td>
                <td className="py-1.5 text-zinc-300">{fmtBase(t.baseLotsDelta)}</td>
                <td
                  className={`py-1.5 font-semibold ${
                    pnl >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {fmtUsd(t.realizedPnl)}
                </td>
                <td className="py-1.5 text-orange-300">{fmtUsd(t.fees)}</td>
                <td className="py-1.5 text-zinc-500">{t.liquidity}</td>
                <td className="py-1.5">
                  <a
                    href={`https://solscan.io/tx/${t.signature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5"
                  >
                    {t.signature.slice(0, 8)}…
                    <ExternalLink className="h-2 w-2" />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTab({ authority }: { authority: string | null }) {
  const [subTab, setSubTab] = useState<HistorySubTab>("orders");

  const ordersQ = useQuery({
    queryKey: ["phoenix-order-history", authority],
    queryFn: () => {
      if (!authority) throw new Error("no authority");
      return fetchOrderHistory(authority, { limit: 25 });
    },
    enabled: Boolean(authority),
    staleTime: 10_000,
  });

  const tradesQ = useQuery({
    queryKey: ["phoenix-trade-history", authority],
    queryFn: () => {
      if (!authority) throw new Error("no authority");
      return fetchTradeHistory(authority, { limit: 25 });
    },
    enabled: Boolean(authority),
    staleTime: 10_000,
  });

  if (!authority) {
    return (
      <div className="py-10 flex flex-col items-center gap-3">
        <p className="text-xs text-zinc-500 font-mono">Connect wallet to view history</p>
        <WalletMultiButton className="!bg-purple-600 !text-xs !h-9 !rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(["orders", "trades"] as HistorySubTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSubTab(t)}
            className={`text-[10px] font-mono px-3 py-1 rounded border transition-colors capitalize ${
              subTab === t
                ? "border-purple-500/50 text-purple-300 bg-purple-500/10"
                : "border-zinc-700 text-zinc-500 hover:border-zinc-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {subTab === "orders" && (
        <OrderHistoryTable items={ordersQ.data?.data} isLoading={ordersQ.isLoading} />
      )}
      {subTab === "trades" && (
        <TradeHistoryTable items={tradesQ.data?.data} isLoading={tradesQ.isLoading} />
      )}
    </div>
  );
}

// ─── CollateralTab ────────────────────────────────────────────────────────────

type CollateralAction = "idle" | "busy" | "done" | "error";

function CollateralTab({
  authority,
}: {
  authority: string | null;
}) {
  const { signTransaction } = useWallet();
  const { toast } = useToast();

  const [depositAmt, setDepositAmt] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [depositStatus, setDepositStatus] = useState<CollateralAction>("idle");
  const [withdrawStatus, setWithdrawStatus] = useState<CollateralAction>("idle");
  const [registerStatus, setRegisterStatus] = useState<CollateralAction>("idle");
  const [inviteStatus, setInviteStatus] = useState<CollateralAction>("idle");
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (!authority) return;
    setStatusError(null);
    checkTraderExists(authority)
      .then(setRegistered)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setRegistered(null);
        setStatusError(message);
      });
  }, [authority]);

  async function sendIxs(
    ixBuilder: () => Promise<TransactionInstruction[]>,
    setStatus: (s: CollateralAction) => void,
    successMsg: string,
  ) {
    if (!authority || !signTransaction) return;
    setStatus("busy");
    try {
      const conn = new Connection(RPC_URL, "confirmed");
      const ixs = await ixBuilder();
      const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
      const tx = ixsToTransaction(ixs, new PublicKey(authority), blockhash);
      const signed = await signTransaction(tx);
      const { signature: sig } = await HeliusService.sendSignedTransaction(
        Buffer.from(signed.serialize()).toString("base64"),
        { skipPreflight: false, maxRetries: 3 },
      );
      await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      setStatus("done");
      toast({ title: successMsg, description: `tx: ${sig.slice(0, 16)}…` });
      setTimeout(() => setStatus("idle"), 3000);
    } catch (err: unknown) {
      setStatus("error");
      const msg = isPhoenixAuthError(err)
        ? "Sign in with your CLAWD holder or admin session to manage collateral."
        : err instanceof Error
          ? err.message
          : String(err);
      toast({ title: "Transaction failed", description: msg, variant: "destructive" });
      setTimeout(() => setStatus("idle"), 3000);
    }
  }

  if (!authority) {
    return (
      <div className="py-10 flex flex-col items-center gap-3">
        <p className="text-xs text-zinc-500 font-mono">Connect wallet to manage collateral</p>
        <WalletMultiButton className="!bg-purple-600 !text-xs !h-9 !rounded-md" />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-lg">
      {/* Trader account status */}
      <Card className="bg-black/40 border-purple-500/20">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs text-zinc-400 font-mono flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
            Trader Account
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-3">
          <div className="flex items-center justify-between text-[11px] font-mono">
            <span className="text-zinc-500">Status</span>
            {registered === null ? (
              <span className="text-zinc-600 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> checking…</span>
            ) : registered ? (
              <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Registered</span>
            ) : (
              <span className="text-yellow-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Not registered</span>
            )}
          </div>

          {statusError && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] font-mono text-red-300">
              {statusError}
            </div>
          )}

          {registered === false && (
            <Button
              size="sm"
              className="w-full h-8 text-xs bg-purple-600 hover:bg-purple-500"
              disabled={registerStatus === "busy"}
              onClick={() =>
                sendIxs(
                  () => buildRegisterTrader(authority),
                  setRegisterStatus,
                  "Trader account registered!",
                ).then(() => checkTraderExists(authority).then(setRegistered).catch(() => {}))
              }
            >
              {registerStatus === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {registerStatus === "busy" ? "Registering…" : "Register Trader Account"}
            </Button>
          )}

          {/* Access code activation */}
          <div className="space-y-1.5">
            <label htmlFor="phoenix-invite-code" className="text-[10px] text-zinc-500 font-mono">Access / Invite Code</label>
            <div className="flex gap-2">
              <Input
                id="phoenix-invite-code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Enter access code"
                className="bg-black/60 border-purple-500/30 text-white font-mono h-8 text-xs flex-1"
                disabled={inviteStatus === "busy"}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-purple-500/30 text-purple-300 hover:bg-purple-500/10"
                disabled={!inviteCode.trim() || inviteStatus === "busy"}
                onClick={async () => {
                  setInviteStatus("busy");
                  try {
                    await activateInviteCode(authority, inviteCode.trim());
                    setInviteStatus("done");
                    toast({ title: "Invite code activated!" });
                    setInviteCode("");
                    checkTraderExists(authority).then(setRegistered).catch(() => {});
                    setTimeout(() => setInviteStatus("idle"), 2000);
                  } catch (err: unknown) {
                    setInviteStatus("error");
                    const msg = isPhoenixAuthError(err)
                      ? "Sign in with your CLAWD holder or admin session to activate Phoenix access codes."
                      : err instanceof Error
                        ? err.message
                        : String(err);
                    toast({ title: "Activation failed", description: msg, variant: "destructive" });
                    setTimeout(() => setInviteStatus("idle"), 2000);
                  }
                }}
              >
                {inviteStatus === "busy" ? <Loader2 className="h-3 w-3 animate-spin" /> : inviteStatus === "done" ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> : "Activate"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Deposit */}
      <Card className="bg-black/40 border-emerald-500/20">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs text-zinc-400 font-mono">Deposit USDC</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-2">
          <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
            Converts wallet USDC → Phoenix canonical tokens via Ember and deposits into your cross-margin account.
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="USDC amount"
              value={depositAmt}
              onChange={(e) => setDepositAmt(e.target.value)}
              disabled={depositStatus === "busy"}
              className="bg-black/60 border-emerald-500/30 text-white font-mono h-8 text-xs flex-1"
            />
            <Button
              size="sm"
              className="h-8 text-xs bg-emerald-700 hover:bg-emerald-600"
              disabled={!depositAmt || Number(depositAmt) <= 0 || depositStatus === "busy"}
              onClick={() =>
                sendIxs(() => buildDeposit(authority, Number(depositAmt)), setDepositStatus, `Deposited ${depositAmt} USDC`)
                  .then(() => setDepositAmt(""))
              }
            >
              {depositStatus === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : depositStatus === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : "Deposit"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Withdraw */}
      <Card className="bg-black/40 border-red-500/20">
        <CardHeader className="pb-2 pt-3 px-3">
          <CardTitle className="text-xs text-zinc-400 font-mono">Withdraw USDC</CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3 space-y-2">
          <p className="text-[10px] text-zinc-500 font-mono leading-relaxed">
            Withdraws Phoenix canonical tokens from your trader account and converts back to wallet USDC via Ember.
          </p>
          <div className="flex gap-2">
            <Input
              type="number"
              min="0"
              step="1"
              placeholder="USDC amount"
              value={withdrawAmt}
              onChange={(e) => setWithdrawAmt(e.target.value)}
              disabled={withdrawStatus === "busy"}
              className="bg-black/60 border-red-500/30 text-white font-mono h-8 text-xs flex-1"
            />
            <Button
              size="sm"
              className="h-8 text-xs bg-red-700 hover:bg-red-600"
              disabled={!withdrawAmt || Number(withdrawAmt) <= 0 || withdrawStatus === "busy"}
              onClick={() =>
                sendIxs(() => buildWithdraw(authority, Number(withdrawAmt)), setWithdrawStatus, `Withdrew ${withdrawAmt} USDC`)
                  .then(() => setWithdrawAmt(""))
              }
            >
              {withdrawStatus === "busy" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : withdrawStatus === "done" ? <CheckCircle2 className="h-3.5 w-3.5" /> : "Withdraw"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function PhoenixPerpsPanel({
  selectedSymbol,
  onSelectedSymbolChange,
}: {
  selectedSymbol?: string;
  onSelectedSymbolChange?: (symbol: string) => void;
} = {}) {
  const { publicKey } = useWallet();
  const authority = publicKey?.toBase58() ?? null;
  const initialParams = useRef(readInitialPhoenixParams()).current;

  const { data: allMarkets, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["phoenix-markets"],
    queryFn: fetchPhoenixMarkets,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const markets = allMarkets ? sortedActiveMarkets(allMarkets) : [];
  const [selected, setSelected] = useState<string>(selectedSymbol ?? initialParams.symbol);
  const [tab, setTab] = useState<PanelTab>(initialParams.tab);
  const market = markets.find((m) => m.symbol === selected) ?? markets[0] ?? null;
  const marketsErrorMessage =
    error instanceof Error ? error.message : isError ? "Phoenix market request failed" : null;

  const mids = usePhoenixAllMids();

  useEffect(() => {
    if (selectedSymbol && selectedSymbol !== selected) {
      setSelected(selectedSymbol);
    }
  }, [selectedSymbol, selected]);

  useEffect(() => {
    onSelectedSymbolChange?.(selected);
  }, [onSelectedSymbolChange, selected]);

  return (
    <div className="flex h-full flex-col gap-3 p-0 sm:p-1">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <TrendingUp className="h-4 w-4 text-purple-400" />
        <span className="text-sm font-mono font-semibold text-purple-300">Phoenix Perpetuals</span>
        <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-400 ml-auto">
          perp-api.phoenix.trade
        </Badge>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Refresh markets"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading market configs…
        </div>
      )}

      {marketsErrorMessage && (
        <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-mono text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          Phoenix markets unavailable: {marketsErrorMessage}
        </div>
      )}

      {markets.length > 0 && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          {/* Market selector with live prices */}
          <div className="mobile-scroll flex flex-nowrap gap-1 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
            {markets.map((m) => {
              const mid = mids[`${m.symbol}-PERP`] ?? mids[m.symbol] ?? null;
              return (
                <button
                  key={m.symbol}
                  type="button"
                  onClick={() => setSelected(m.symbol)}
                  className={`min-w-[92px] shrink-0 rounded px-3 py-1.5 text-xs font-mono font-semibold transition-colors flex flex-col items-center ${
                    selected === m.symbol
                      ? "bg-purple-600 text-white"
                      : "bg-black/40 border border-purple-500/20 text-zinc-400 hover:border-purple-500/50 hover:text-zinc-200"
                  }`}
                >
                  <span>{m.symbol}-PERP</span>
                  {mid !== null && (
                    <span
                      className={`text-[9px] ${
                        selected === m.symbol ? "text-purple-200" : "text-zinc-500"
                      }`}
                    >
                      {fmtUsd(mid)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab bar */}
          <div className="mobile-scroll flex gap-0.5 overflow-x-auto border-b border-white/10 pb-px">
            {(["trade", "positions", "history", "collateral"] as PanelTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`text-[11px] font-mono px-3 py-1.5 transition-colors capitalize border-b-2 -mb-px ${
                  tab === t
                    ? "text-white border-purple-500"
                    : "text-zinc-500 border-transparent hover:text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Trade tab */}
          {tab === "trade" && market && (
            <div className="grid flex-1 grid-cols-1 gap-3 overflow-y-visible lg:min-h-0 lg:grid-cols-[1fr_1fr] lg:overflow-y-auto">
              <div className="space-y-3">
                <Card className="bg-black/40 border-purple-500/20">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-xs text-zinc-400 font-mono flex items-center gap-2">
                      <Info className="h-3 w-3" />
                      {market.symbol} Parameters
                      <Badge
                        variant="outline"
                        className="text-[10px] border-emerald-500/40 text-emerald-400 ml-auto"
                      >
                        {market.marketStatus}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <MarketParams m={market} />
                  </CardContent>
                </Card>

                <Card className="bg-black/40 border-zinc-700/40">
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                      Orderbook — {market.symbol}-PERP
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <OrderbookView symbol={market.symbol} />
                  </CardContent>
                </Card>

                <Card className="bg-black/40 border-zinc-700/40">
                  <CardHeader className="pb-1 pt-3 px-3">
                    <CardTitle className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                      On-chain Accounts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3 space-y-1.5 text-[10px] font-mono">
                    <div>
                      <span className="text-zinc-500">Market: </span>
                      <a
                        href={`https://solscan.io/account/${market.marketPubkey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-0.5"
                      >
                        {market.marketPubkey.slice(0, 20)}…
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                    <div>
                      <span className="text-zinc-500">Spline: </span>
                      <span className="text-zinc-400">{market.splinePubkey.slice(0, 20)}…</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3">
                <Card className="bg-black/40 border-purple-500/20">
                  <CardHeader className="pb-2 pt-3 px-3">
                    <CardTitle className="text-xs text-zinc-400 font-mono">
                      Place Order — {market.symbol}-PERP
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-3 pb-3">
                    <OrderPanel
                      key={market.symbol}
                      m={market}
                      prefill={initialParams.order}
                      midPrice={mids[`${market.symbol}-PERP`] ?? mids[market.symbol] ?? null}
                    />
                  </CardContent>
                </Card>
                <FlightBuilderCard />
              </div>
            </div>
          )}

          {/* Positions tab */}
          {tab === "positions" && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <PositionsTab
                authority={authority}
                mids={mids}
              />
            </div>
          )}

          {/* History tab */}
          {tab === "history" && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <HistoryTab authority={authority} />
            </div>
          )}

          {/* Collateral tab */}
          {tab === "collateral" && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <CollateralTab
                authority={authority}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
