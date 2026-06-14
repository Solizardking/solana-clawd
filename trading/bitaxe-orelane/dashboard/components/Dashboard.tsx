'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface BitaxeData {
  boardVersion: string;
  version: string;
  hashRate: number;
  hashRate_1m: number;
  hashRate_10m: number;
  hashRate_1h: number;
  expectedHashrate: number;
  power: number;
  temp: number;
  vrTemp: number;
  cpuUsage: number;
  freeHeap: number;
  wifiRSSI: number;
  wifiStatus: string;
  miningPaused: boolean;
  sharesAccepted: number;
  sharesRejected: number;
  uptimeSeconds: number;
  stratumURL: string;
  poolDifficulty: number;
  voltage: number;
  current: number;
  overheat_mode: number;
}

interface OreData {
  roundId: string;
  miningOpen: boolean;
  miningSecondsRemaining: number;
  claimHoursRemaining: number;
  totalDeployedSol: number;
  topSquares: number[];
  emptySquares: number[];
  currentSlot: string;
  endSlot: string;
}

interface TickerData {
  mark_price?: number;
  mid_price?: number;
  oracle_price?: number;
  prev_day_price?: number;
  change_24h_pct?: number;
  open_interest_usd?: number;
  volume_24h_usd?: number;
  funding_rate?: number;
}

interface ApiResult<T> { ok: boolean; data?: T; error?: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number, dec = 2) { return n.toFixed(dec); }
function fmtK(n: number) { return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n); }

function tempColor(t: number) {
  if (t < 60) return '#22c55e';
  if (t < 70) return '#eab308';
  return '#ef4444';
}

function rssiColor(r: number) {
  if (r > -60) return '#22c55e';
  if (r > -75) return '#eab308';
  return '#ef4444';
}

function StatusDot({ ok, size = 8 }: { ok: boolean | null; size?: number }) {
  const color = ok === null ? '#64748b' : ok ? '#22c55e' : '#ef4444';
  return (
    <span
      className="pulse-dot inline-block rounded-full"
      style={{ width: size, height: size, background: color, flexShrink: 0 }}
    />
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`badge badge-${color}`}>{label}</span>;
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${Math.min(100, (value / max) * 100)}%`, background: color }} />
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-full min-h-16">
      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#334155', borderTopColor: '#6366f1' }} />
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: '#64748b' }}>
      <span style={{ color: '#ef4444' }}>⚠</span> {msg}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────

function SectionTitle({ icon, title, badge }: { icon: string; title: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span style={{ fontSize: '0.85rem' }}>{icon}</span>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8' }}>
        {title}
      </span>
      {badge}
    </div>
  );
}

// ── Bitaxe Card ───────────────────────────────────────────────────────────

function BitaxeCard({ data, error }: { data: BitaxeData | null; error?: string }) {
  if (error) return (
    <div className="card animate-fade-in">
      <SectionTitle icon="⛏" title="Bitaxe Gamma" />
      <ErrorMsg msg={error} />
    </div>
  );
  if (!data) return <div className="card animate-fade-in"><SectionTitle icon="⛏" title="Bitaxe Gamma" /><Spinner /></div>;

  const eff = data.hashRate > 0 ? data.power / data.hashRate : 0;
  const uptime = `${Math.floor(data.uptimeSeconds / 3600)}h ${Math.floor((data.uptimeSeconds % 3600) / 60)}m`;
  const shareRatio = data.sharesAccepted + data.sharesRejected > 0
    ? (data.sharesAccepted / (data.sharesAccepted + data.sharesRejected)) * 100 : 100;

  return (
    <div className="card animate-fade-in">
      <SectionTitle
        icon="⛏"
        title={`Bitaxe ${data.boardVersion}`}
        badge={
          <div className="flex gap-2 ml-auto">
            <StatusDot ok={!data.miningPaused && data.overheat_mode === 0} size={7} />
            <Badge label={data.miningPaused ? 'paused' : 'mining'} color={data.miningPaused ? 'yellow' : 'green'} />
            {data.overheat_mode > 0 && <Badge label="overheat" color="red" />}
          </div>
        }
      />

      {/* Main stats row */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="stat-value" style={{ color: '#6366f1' }}>{fmt(data.hashRate, 1)}</div>
          <div className="stat-label">GH/s now</div>
        </div>
        <div>
          <div className="stat-value" style={{ color: tempColor(data.temp) }}>{data.temp}°</div>
          <div className="stat-label">chip °C</div>
        </div>
        <div>
          <div className="stat-value" style={{ color: '#f97316' }}>{fmt(data.power, 1)}</div>
          <div className="stat-label">watts</div>
        </div>
      </div>

      {/* Trend bars */}
      <div className="space-y-1 mb-4 text-xs" style={{ color: '#64748b' }}>
        {[['1m', data.hashRate_1m], ['10m', data.hashRate_10m], ['1h', data.hashRate_1h]].map(([label, val]) => (
          <div key={String(label)} className="flex items-center gap-2">
            <span style={{ width: 24, textAlign: 'right' }}>{label}</span>
            <MiniBar value={Number(val)} max={data.expectedHashrate * 1.2} color="#6366f1" />
            <span style={{ width: 64, textAlign: 'right' }}>{fmt(Number(val), 1)} GH/s</span>
          </div>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs" style={{ color: '#94a3b8' }}>
        <div className="flex justify-between">
          <span style={{ color: '#64748b' }}>efficiency</span>
          <span>{eff > 0 ? `${fmt(eff, 3)} W/GH` : '—'}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#64748b' }}>wifi</span>
          <span style={{ color: rssiColor(data.wifiRSSI) }}>{data.wifiRSSI} dBm</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#64748b' }}>cpu</span>
          <span>{data.cpuUsage}%</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#64748b' }}>heap</span>
          <span>{(data.freeHeap / 1000).toFixed(0)}K</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#64748b' }}>shares</span>
          <span style={{ color: shareRatio > 99 ? '#22c55e' : '#eab308' }}>
            {fmtK(data.sharesAccepted)}✓ {data.sharesRejected > 0 ? `${data.sharesRejected}✗` : ''}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: '#64748b' }}>uptime</span>
          <span>{uptime}</span>
        </div>
        <div className="flex justify-between col-span-2">
          <span style={{ color: '#64748b' }}>pool</span>
          <span className="truncate ml-2" style={{ maxWidth: 160 }}>{data.stratumURL}</span>
        </div>
      </div>
    </div>
  );
}

// ── ORE Card ──────────────────────────────────────────────────────────────

function OreCard({ data, error }: { data: OreData | null; error?: string }) {
  if (error) return (
    <div className="card animate-fade-in">
      <SectionTitle icon="💎" title="ORE Board" />
      <ErrorMsg msg={error} />
    </div>
  );
  if (!data) return <div className="card animate-fade-in"><SectionTitle icon="💎" title="ORE Board" /><Spinner /></div>;

  const miningMins = Math.floor(data.miningSecondsRemaining / 60);
  const squares = Array.from({ length: 25 }, (_, i) => {
    const isTop = data.topSquares.includes(i);
    const isEmpty = data.emptySquares.includes(i);
    let bg = '#1e2535';
    let color = '#475569';
    if (isEmpty && isTop) { bg = 'rgba(34,197,94,0.25)'; color = '#22c55e'; }
    else if (isEmpty) { bg = 'rgba(34,197,94,0.1)'; color = '#22c55e'; }
    else if (isTop) { bg = 'rgba(99,102,241,0.25)'; color = '#818cf8'; }
    return { i, bg, color };
  });

  return (
    <div className="card animate-fade-in">
      <SectionTitle
        icon="💎"
        title={`ORE Round ${data.roundId}`}
        badge={
          <div className="flex gap-2 ml-auto">
            <StatusDot ok={data.miningOpen} size={7} />
            <Badge label={data.miningOpen ? 'open' : 'closed'} color={data.miningOpen ? 'green' : 'gray'} />
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="stat-value" style={{ color: '#a855f7' }}>{data.totalDeployedSol.toFixed(3)}</div>
          <div className="stat-label">total deployed SOL</div>
        </div>
        <div>
          <div className="stat-value" style={{ color: data.miningOpen ? '#22c55e' : '#64748b' }}>
            {data.miningOpen ? `${miningMins}m` : '—'}
          </div>
          <div className="stat-label">{data.miningOpen ? 'mining left' : 'window closed'}</div>
        </div>
        <div>
          <div className="stat-value" style={{ color: '#3b82f6' }}>{data.claimHoursRemaining}h</div>
          <div className="stat-label">claim window</div>
        </div>
      </div>

      {/* 5×5 board grid */}
      <div className="mb-3">
        <div className="text-xs mb-2" style={{ color: '#64748b' }}>
          board — <span style={{ color: '#22c55e' }}>■</span> empty &nbsp;
          <span style={{ color: '#818cf8' }}>■</span> top value
        </div>
        <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          {squares.map(({ i, bg, color }) => (
            <div key={i} className="grid-square" style={{ background: bg, color }}>
              {i}
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs space-y-1" style={{ color: '#94a3b8' }}>
        <div className="flex gap-1">
          <span style={{ color: '#64748b' }}>top squares:</span>
          {data.topSquares.map(s => (
            <span key={s} className="badge badge-purple" style={{ padding: '1px 5px', fontSize: '0.6rem' }}>{s}</span>
          ))}
        </div>
        <div className="flex gap-1 flex-wrap">
          <span style={{ color: '#64748b' }}>empty:</span>
          {data.emptySquares.slice(0, 8).map(s => (
            <span key={s} className="badge badge-green" style={{ padding: '1px 5px', fontSize: '0.6rem' }}>{s}</span>
          ))}
          {data.emptySquares.length > 8 && <span style={{ color: '#64748b' }}>+{data.emptySquares.length - 8}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Phoenix Ticker Card ───────────────────────────────────────────────────

function PhoenixCard({ data, error }: { data: { symbol: string; data?: { ok?: boolean; data?: TickerData } } | null; error?: string }) {
  if (error) return (
    <div className="card animate-fade-in">
      <SectionTitle icon="📈" title="Phoenix / Vulcan" />
      <ErrorMsg msg={error} />
    </div>
  );
  if (!data) return <div className="card animate-fade-in"><SectionTitle icon="📈" title="Phoenix / Vulcan" /><Spinner /></div>;

  const ticker = data?.data?.data as TickerData | undefined;
  const change = ticker?.change_24h_pct ?? 0;
  const changeColor = change >= 0 ? '#22c55e' : '#ef4444';

  return (
    <div className="card animate-fade-in">
      <SectionTitle icon="📈" title="Phoenix / Vulcan" badge={<Badge label="SOL-PERP" color="blue" />} />

      {ticker ? (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="stat-value" style={{ color: '#3b82f6' }}>
                ${ticker.mark_price?.toFixed(2) ?? '—'}
              </div>
              <div className="stat-label">mark price</div>
            </div>
            <div>
              <div className="stat-value" style={{ color: changeColor, fontSize: '1.4rem' }}>
                {change >= 0 ? '+' : ''}{change.toFixed(2)}%
              </div>
              <div className="stat-label">24h change</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs" style={{ color: '#94a3b8' }}>
            <div className="flex justify-between">
              <span style={{ color: '#64748b' }}>oracle</span>
              <span>${ticker.oracle_price?.toFixed(2) ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#64748b' }}>mid</span>
              <span>${ticker.mid_price?.toFixed(3) ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#64748b' }}>oi</span>
              <span>{ticker.open_interest_usd ? `$${(ticker.open_interest_usd / 1e6).toFixed(1)}M` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: '#64748b' }}>vol 24h</span>
              <span>{ticker.volume_24h_usd ? `$${(ticker.volume_24h_usd / 1e6).toFixed(1)}M` : '—'}</span>
            </div>
            <div className="flex justify-between col-span-2">
              <span style={{ color: '#64748b' }}>funding</span>
              <span style={{ color: (ticker.funding_rate ?? 0) > 0 ? '#22c55e' : '#ef4444' }}>
                {ticker.funding_rate !== undefined ? `${(ticker.funding_rate * 100).toFixed(4)}%` : '—'}
              </span>
            </div>
          </div>
        </>
      ) : (
        <ErrorMsg msg="Vulcan CLI not responding — run: vulcan setup" />
      )}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────────

function Header({ lastUpdated, refreshing, onRefresh }: {
  lastUpdated: Date | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6 pb-4" style={{ borderBottom: '1px solid #1e2535' }}>
      <div>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#e2e8f0' }}>
          ⛏ BITAXE ORELANE
        </h1>
        <div style={{ fontSize: '0.65rem', color: '#475569', marginTop: 2 }}>
          bitcoin · ore · phoenix perps · helius das
        </div>
      </div>
      <div className="flex items-center gap-4">
        {lastUpdated && (
          <span style={{ fontSize: '0.65rem', color: '#475569' }}>
            updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={onRefresh}
          disabled={refreshing}
          style={{
            fontSize: '0.7rem',
            padding: '5px 12px',
            borderRadius: 6,
            background: '#1e2535',
            border: '1px solid #334155',
            color: refreshing ? '#475569' : '#94a3b8',
            cursor: refreshing ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span className={refreshing ? 'animate-spin inline-block' : ''}>↻</span>
          {refreshing ? 'fetching…' : 'refresh'}
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────

const REFRESH_INTERVAL = 20_000;

export default function Dashboard() {
  const [bitaxe, setBitaxe] = useState<BitaxeData | null>(null);
  const [bitaxeErr, setBitaxeErr] = useState<string | undefined>();
  const [ore, setOre] = useState<OreData | null>(null);
  const [oreErr, setOreErr] = useState<string | undefined>();
  const [ticker, setTicker] = useState<{ symbol: string; data?: { ok?: boolean; data?: TickerData } } | null>(null);
  const [tickerErr, setTickerErr] = useState<string | undefined>();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const fetchAll = useCallback(async () => {
    if (!mountedRef.current) return;
    setRefreshing(true);

    const [b, o, t] = await Promise.allSettled([
      fetch('/api/bitaxe').then(r => r.json() as Promise<ApiResult<BitaxeData>>),
      fetch('/api/ore').then(r => r.json() as Promise<ApiResult<OreData>>),
      fetch('/api/ticker?symbol=SOL').then(r => r.json()),
    ]);

    if (!mountedRef.current) return;

    if (b.status === 'fulfilled' && b.value.ok) {
      setBitaxe(b.value.data ?? null);
      setBitaxeErr(undefined);
    } else {
      setBitaxeErr(b.status === 'rejected' ? String(b.reason) : (b.value as ApiResult<BitaxeData>).error);
    }

    if (o.status === 'fulfilled' && o.value.ok) {
      setOre(o.value.data ?? null);
      setOreErr(undefined);
    } else {
      setOreErr(o.status === 'rejected' ? String(o.reason) : (o.value as ApiResult<OreData>).error);
    }

    if (t.status === 'fulfilled') setTicker(t.value as { symbol: string; data?: { ok?: boolean; data?: TickerData } });
    else setTickerErr(String(t.reason));

    setLastUpdated(new Date());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void fetchAll();
    const id = setInterval(() => { void fetchAll(); }, REFRESH_INTERVAL);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [fetchAll]);

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px' }}>
      <Header lastUpdated={lastUpdated} refreshing={refreshing} onRefresh={fetchAll} />

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))' }}>
        <BitaxeCard data={bitaxe} error={bitaxeErr} />
        <OreCard data={ore} error={oreErr} />
        <PhoenixCard data={ticker} error={tickerErr} />
      </div>

      <div style={{ marginTop: 12, fontSize: '0.6rem', color: '#1e2535', textAlign: 'center' }}>
        auto-refresh every {REFRESH_INTERVAL / 1000}s · bitaxe AxeOS · ORE Solana RPC · Phoenix Vulcan CLI · Helius DAS
      </div>
    </div>
  );
}
