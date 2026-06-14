import { useState, useEffect, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useTokenGate, CLAWD_TOKEN } from '@/contexts/TokenGateContext';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Zap,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ExternalLink,
  Wallet,
  Sparkles,
  Download,
  Share2,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClawdTokenAction } from '@/components/ClawdTokenAction';

function formatUSD(val: number | string | null | undefined) {
  if (val == null) return '$0.00';
  const n = Number(val);
  if (isNaN(n)) return '$0.00';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function formatTokenAmount(n: number) {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatWalletShort(wallet?: string | null) {
  if (!wallet) return 'wallet';
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

function MiniNetWorthChart({ points }: { points: { time: number; value: number }[] }) {
  if (!points?.length) return null;
  const w = 420;
  const h = 120;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const polyline = points
    .map((point, index) => {
      const x = points.length === 1 ? w : (index / (points.length - 1)) * w;
      const y = h - ((point.value - min) / range) * (h - 12) - 6;
      return `${x},${y}`;
    })
    .join(' ');
  const up = values[values.length - 1] >= values[0];

  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="wallet-worth-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={up ? '#22c55e' : '#ef4444'} stopOpacity="0.35" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.95" />
          </linearGradient>
        </defs>
        <polyline fill="none" stroke="url(#wallet-worth-line)" strokeWidth="3" points={polyline} />
      </svg>
      <div className="flex items-center justify-between text-[10px] text-gray-500">
        <span>7d estimate</span>
        <span>{up ? 'uptrend' : 'drawdown'}</span>
      </div>
    </div>
  );
}

// Animated particle ring that pulses around the verify button
function PulseRing({ active }: { active: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {active && (
        <>
          <div className="absolute inset-0 rounded-xl border-2 border-red-500/60 animate-ping" style={{ animationDuration: '1.5s' }} />
          <div className="absolute inset-0 rounded-xl border border-orange-500/40 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
        </>
      )}
    </div>
  );
}

export function TokenVerifier() {
  const { connected, publicKey } = useWallet();
  const { isVerified, isVerifying, clawdBalance, netWorth, pnl, walletIntel, netWorthChart, assets, error, verify, refresh } = useTokenGate();
  const [pulsing, setPulsing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showUserCard, setShowUserCard] = useState(false);
  const [generatedCardUrl, setGeneratedCardUrl] = useState<string | null>(null);
  const [generatingCard, setGeneratingCard] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const prevVerified = useRef(false);

  // Trigger success animation when verification succeeds
  useEffect(() => {
    if (isVerified && !prevVerified.current) {
      setShowSuccess(true);
      setShowUserCard(true);
      setTimeout(() => setShowSuccess(false), 3000);
    }
    prevVerified.current = isVerified;
  }, [isVerified]);

  const handleVerify = async () => {
    setPulsing(true);
    await verify();
    setTimeout(() => setPulsing(false), 2000);
  };

  const walletShort = publicKey
    ? `${publicKey.toString().slice(0, 4)}...${publicKey.toString().slice(-4)}`
    : null;
  const walletFull = publicKey?.toString() ?? walletIntel?.wallet ?? '';
  const topAssets = assets.length
    ? assets.slice(0, 4)
    : netWorth?.items.slice(0, 4).map((item) => ({
        id: item.address,
        name: item.name,
        symbol: item.symbol,
        image: item.logo_uri || null,
        balance: item.amount,
        decimals: item.decimals,
        interface: null,
      })) ?? [];
  const netWorthValue = netWorth ? Number(netWorth.total_value) : walletIntel?.netWorth?.totalValue ?? 0;

  const generateAiCard = async () => {
    if (!walletFull) return;
    setGeneratingCard(true);
    setCardError(null);
    try {
      const res = await fetch('/api/xai/image-gen', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: [
            'A polished shareable crypto portfolio card for Cheshire Terminal.',
            `Wallet ${formatWalletShort(walletFull)} holds ${formatTokenAmount(clawdBalance ?? 0)} CLAWD.`,
            `Net worth ${formatUSD(netWorthValue)} and total PnL ${pnl ? formatUSD(pnl.total_usd) : '$0.00'}.`,
            'Style: premium Solana dashboard card, dark glass UI, cyan and emerald accents, readable text areas, no logos copied from brands.',
          ].join(' '),
          n: 1,
          aspect_ratio: '1:1',
          response_format: 'url',
          creator: walletFull,
          save_to_feed: true,
        }),
      });
      const body = await res.json();
      if (!res.ok || body?.success === false) throw new Error(body?.error || 'Image generation failed');
      const url = body?.images?.[0]?.url || (body?.images?.[0]?.b64_json ? `data:image/png;base64,${body.images[0].b64_json}` : null);
      if (!url) throw new Error('Image generation returned no image');
      setGeneratedCardUrl(url);
    } catch (e) {
      setCardError(e instanceof Error ? e.message : 'Image generation failed');
    } finally {
      setGeneratingCard(false);
    }
  };

  const shareText = encodeURIComponent(
    `Verified on Cheshire Terminal with ${formatTokenAmount(clawdBalance ?? 0)} CLAWD and ${formatUSD(netWorthValue)} wallet net worth.`
  );
  const shareUrl = encodeURIComponent(window.location.origin);

  // ── Not connected ───────────────────────────────────────────────────────
  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="relative">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-red-900/60 to-orange-900/40 border border-red-500/30 flex items-center justify-center">
            <Wallet className="w-10 h-10 text-red-400/70" />
          </div>
          <div className="absolute inset-0 rounded-full border border-red-500/20 animate-ping" style={{ animationDuration: '3s' }} />
        </div>
        <div className="text-center">
          <p className="text-gray-400 mb-1 text-sm">Connect your Solana wallet to verify</p>
          <p className="text-xs text-gray-600">Requires CLAWD tokens to unlock full access</p>
        </div>
        <WalletMultiButton className="!bg-gradient-to-r !from-red-800 !to-orange-800 !border !border-red-500/40 !rounded-xl !px-8 !py-3 !text-base !font-bold !shadow-lg !shadow-red-900/30 hover:!from-red-700 hover:!to-orange-700" />
      </div>
    );
  }

  // ── Verified ─────────────────────────────────────────────────────────────
  if (isVerified) {
    return (
      <div className="space-y-4">
        {/* Success header */}
        <div className={`relative p-5 rounded-xl border bg-gradient-to-br from-green-950/80 to-emerald-950/60 border-green-500/30 transition-all duration-500 ${showSuccess ? 'shadow-lg shadow-green-500/20' : ''}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
              {showSuccess && <div className="absolute inset-0 rounded-full bg-green-400/30 animate-ping" />}
            </div>
            <div>
              <p className="font-bold text-green-300 text-lg">Access Granted 🦞</p>
              <p className="text-xs text-green-500/80">{walletShort}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={refresh}
              className="ml-auto text-green-500/60 hover:text-green-400 p-1 h-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowUserCard(true)}
              className="h-7 border-cyan-500/30 bg-cyan-500/10 px-2 text-[11px] text-cyan-200 hover:bg-cyan-500/20"
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Card
            </Button>
          </div>

          {/* CLAWD balance */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-black/40 border border-green-500/10 mb-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center text-xs font-black">C</div>
              <span className="text-sm text-gray-300">CLAWD Balance</span>
            </div>
            <div className="text-right">
              <p className="font-mono font-bold text-green-300 text-sm">
                {clawdBalance !== null ? formatTokenAmount(clawdBalance) : '—'}
              </p>
              <p className="text-xs text-gray-500">tokens</p>
            </div>
          </div>

          <a
            href={`https://jup.ag/swap/SOL-${CLAWD_TOKEN}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> Buy more CLAWD on Jupiter
          </a>
        </div>

        {/* Net Worth */}
        {netWorth && (
          <div className="p-4 rounded-xl border border-purple-500/20 bg-black/40">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Wallet Net Worth</p>
            <p className="text-3xl font-black text-purple-200 mb-3">
              {formatUSD(netWorth.total_value)}
            </p>
            <MiniNetWorthChart points={netWorthChart} />
            {/* Top holdings */}
            <div className="mt-3 space-y-1.5">
              {netWorth.items.slice(0, 4).map((item) => (
                <div key={item.address} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {item.logo_uri ? (
                      <img src={item.logo_uri} alt={item.symbol} className="w-4 h-4 rounded-full" onError={(e) => (e.currentTarget.style.display = 'none')} />
                    ) : (
                      <div className="w-4 h-4 rounded-full bg-gray-700" />
                    )}
                    <span className="text-xs text-gray-400">{item.symbol}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-300">{formatUSD(item.value)}</span>
                    <ClawdTokenAction
                      mintAddress={item.address}
                      symbol={item.symbol}
                      logoURI={item.logo_uri}
                      variant="badge"
                    />
                  </div>
                </div>
              ))}
              {netWorth.items.length > 4 && (
                <p className="text-xs text-gray-600">+{netWorth.items.length - 4} more tokens</p>
              )}
            </div>
          </div>
        )}

        {/* PnL */}
        {pnl && (
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl border border-gray-700/40 bg-black/40">
              <p className="text-xs text-gray-500 mb-1">Total PnL</p>
              <div className="flex items-center gap-1">
                {pnl.total_usd >= 0
                  ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                  : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                <span className={`font-bold text-sm ${pnl.total_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatUSD(Math.abs(pnl.total_usd))}
                </span>
              </div>
            </div>
            <div className="p-3 rounded-xl border border-gray-700/40 bg-black/40">
              <p className="text-xs text-gray-500 mb-1">Win Rate</p>
              <p className="font-bold text-sm text-yellow-400">{(pnl.win_rate * 100).toFixed(0)}%</p>
              <p className="text-xs text-gray-600">{pnl.total_buy}B / {pnl.total_sell}S</p>
            </div>
            <div className="p-3 rounded-xl border border-gray-700/40 bg-black/40">
              <p className="text-xs text-gray-500 mb-1">Realized</p>
              <span className={`font-bold text-sm ${pnl.realized_profit_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatUSD(pnl.realized_profit_usd)}
              </span>
            </div>
            <div className="p-3 rounded-xl border border-gray-700/40 bg-black/40">
              <p className="text-xs text-gray-500 mb-1">Unrealized</p>
              <span className={`font-bold text-sm ${pnl.unrealized_usd >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatUSD(pnl.unrealized_usd)}
              </span>
            </div>
          </div>
        )}

        {showUserCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-400/30 bg-zinc-950 shadow-2xl shadow-cyan-950/40">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-[0.22em] text-cyan-300/70">Verified Holder Card</p>
                  <p className="text-sm text-zinc-400">{formatWalletShort(walletFull)}</p>
                </div>
                <button
                  onClick={() => setShowUserCard(false)}
                  className="rounded-md border border-white/10 p-1.5 text-zinc-500 transition hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="bg-gradient-to-br from-cyan-950/40 via-black to-emerald-950/30 p-5">
                <div className="rounded-xl border border-white/10 bg-black/45 p-4">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-zinc-500">CLAWD Balance</p>
                      <p className="text-3xl font-black text-emerald-300">{formatTokenAmount(clawdBalance ?? 0)}</p>
                    </div>
                    <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                      Access active
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Net worth</p>
                      <p className="text-lg font-bold text-white">{formatUSD(netWorthValue)}</p>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                      <p className="text-[10px] uppercase tracking-wider text-zinc-500">Total PnL</p>
                      <p className={`text-lg font-bold ${(pnl?.total_usd ?? 0) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                        {pnl ? formatUSD(pnl.total_usd) : '$0.00'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3">
                    <MiniNetWorthChart points={netWorthChart} />
                  </div>

                  {topAssets.length > 0 && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {topAssets.map((asset) => (
                        <div key={asset.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
                          {asset.image ? (
                            <img src={asset.image} alt={asset.symbol || asset.name} className="h-5 w-5 rounded-full object-cover" />
                          ) : (
                            <div className="h-5 w-5 rounded-full bg-cyan-500/20" />
                          )}
                          <span className="min-w-0 truncate text-xs text-zinc-300">{asset.symbol || asset.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {generatedCardUrl && (
                  <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    <img src={generatedCardUrl} alt="Generated holder card" className="max-h-80 w-full object-cover" />
                  </div>
                )}

                {cardError && <p className="mt-3 text-xs text-red-300">{cardError}</p>}

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button onClick={generateAiCard} disabled={generatingCard} className="h-9 bg-cyan-600 text-black hover:bg-cyan-500">
                    {generatingCard ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="mr-1.5 h-3.5 w-3.5" />}
                    AI Card
                  </Button>
                  <a
                    href={generatedCardUrl ?? '#'}
                    download="cheshire-holder-card.png"
                    className={`inline-flex h-9 items-center justify-center rounded-md border border-white/10 text-sm font-medium text-zinc-200 transition ${generatedCardUrl ? 'hover:bg-white/10' : 'pointer-events-none opacity-40'}`}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Save
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-md border border-white/10 text-sm font-medium text-zinc-200 transition hover:bg-white/10"
                  >
                    <Share2 className="mr-1.5 h-3.5 w-3.5" />
                    Share
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Not verified (connected but insufficient balance) ────────────────────
  return (
    <div className="space-y-5">
      {/* Balance display */}
      {clawdBalance !== null && (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center text-sm font-black">C</div>
            <div>
              <p className="text-xs text-gray-500">Your CLAWD balance</p>
              <p className="font-mono font-bold text-red-300">{formatTokenAmount(clawdBalance)}</p>
            </div>
          </div>
          <XCircle className="w-5 h-5 text-red-500/60" />
        </div>
      )}

      {/* Net worth even for non-holders */}
      {netWorth && (
        <div className="p-3 rounded-xl border border-gray-700/30 bg-black/30 flex items-center justify-between">
          <p className="text-xs text-gray-500">Wallet Value</p>
          <p className="font-bold text-gray-300">{formatUSD(netWorth.total_value)}</p>
        </div>
      )}

      {/* Verify button */}
      <div className="relative">
        <PulseRing active={pulsing} />
        <button
          onClick={handleVerify}
          disabled={isVerifying}
          className={`
            relative w-full py-4 px-6 rounded-xl font-black text-base tracking-wide transition-all duration-300 overflow-hidden
            ${isVerifying
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-red-700 via-orange-600 to-red-700 text-white cursor-pointer hover:from-red-600 hover:via-orange-500 hover:to-red-600 shadow-lg shadow-red-900/50 hover:shadow-red-800/60 active:scale-[0.98]'
            }
          `}
          style={{ backgroundSize: isVerifying ? '100%' : '200% 100%', animation: isVerifying ? 'none' : 'shimmer 2s infinite' }}
        >
          <div className="flex items-center justify-center gap-2">
            {isVerifying ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Scanning blockchain...</span>
              </>
            ) : (
              <>
                <Zap className="w-5 h-5" />
                <span>VERIFY CLAWD ACCESS</span>
                <Zap className="w-5 h-5" />
              </>
            )}
          </div>
          {!isVerifying && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
          )}
        </button>
      </div>

      {error && (
        <p className="text-center text-xs text-red-400">{error}</p>
      )}

      {/* CTA */}
      <div className="text-center space-y-2">
        <p className="text-xs text-gray-500">
          You need at least <span className="text-red-400 font-bold">1 CLAWD</span> to unlock full platform access
        </p>
        <a
          href={`https://jup.ag/swap/SOL-${CLAWD_TOKEN}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-red-900/40 to-orange-900/40 border border-red-500/20 text-red-300 text-sm font-semibold hover:from-red-800/50 hover:to-orange-800/50 transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Get CLAWD on Jupiter
        </a>
      </div>
    </div>
  );
}

export default TokenVerifier;
