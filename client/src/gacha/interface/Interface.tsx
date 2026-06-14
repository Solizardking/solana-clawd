import { useCallback, useEffect, useRef, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import AgentLoop from '../components/AgentLoop';
import DephyPanel from '../components/DephyPanel';
import DocsPanel from '../components/DocsPanel';
import GachaPage from '../components/GachaPage';
import MetaplexAgentPanel from '../components/MetaplexAgentPanel';
import PerpsPanel from '../components/PerpsPanel';
import SolanaRewards from '../components/SolanaRewards';
import StreamflowPanel from '../components/StreamflowPanel';
import TokenTicker from '../components/TokenTicker';
import WalletConnect from '../components/WalletConnect';
import { buildHedgeOrder, openPerpPosition } from '../lib/perps';
import { buildPrize } from '../lib/prizes';
import { runGachaPipeline } from '../lib/openrouter';
import { createVestingStream } from '../lib/streamflow';
import { useSolana } from '../stores/solana-store';
import useGame from '../stores/store';
import './dephy-style.css';
import './docs.css';
import './solana-style.css';
import './style.css';

type Tab = 'prizes' | 'vesting' | 'agent' | 'perps' | 'registry' | 'dephy';
type ViewMode = '3d' | 'agents';

const TAB_LABELS: Record<Tab, string> = {
  prizes:   'Prizes',
  vesting:  'Vesting',
  agent:    'Loop',
  perps:    'Perps',
  registry: 'Registry',
  dephy:    'DePHY',
};

export default function Interface() {
  const { wallet } = useWallet();
  const {
    phase,
    fruit0,
    fruit1,
    fruit2,
    spins,
    coins,
    bet,
    start,
  } = useGame();

  const {
    addPendingPrize,
    setOracleResult,
    oracleEnabled,
    openrouterApiKey,
    hedgeConfig,
    clawdPriceUsdc,
    addPerpPosition,
    addVestingStream,
    addLoopLog,
    walletAddress,
    discoveredAgents,
    agentRegistered,
    totalClawdWon,
  } = useSolana();

  const [viewMode, setViewMode]         = useState<ViewMode>('3d');
  const [activeTab, setActiveTab]       = useState<Tab>('prizes');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [showDocs, setShowDocs]         = useState(false);

  const prevSpinsRef          = useRef(spins);
  const oracleEnabledRef      = useRef(oracleEnabled);
  const openrouterApiKeyRef   = useRef(openrouterApiKey);
  const coinsRef              = useRef(coins);
  const hedgeConfigRef        = useRef(hedgeConfig);
  const clawdPriceUsdcRef     = useRef(clawdPriceUsdc);
  const walletAddressRef      = useRef(walletAddress);
  const walletAdapterRef      = useRef(wallet?.adapter);
  const addPendingPrizeRef    = useRef(addPendingPrize);
  const setOracleResultRef    = useRef(setOracleResult);
  const addPerpPositionRef    = useRef(addPerpPosition);
  const addVestingStreamRef   = useRef(addVestingStream);
  const addLoopLogRef         = useRef(addLoopLog);

  useEffect(() => { oracleEnabledRef.current = oracleEnabled; },           [oracleEnabled]);
  useEffect(() => { openrouterApiKeyRef.current = openrouterApiKey; },     [openrouterApiKey]);
  useEffect(() => { coinsRef.current = coins; },                           [coins]);
  useEffect(() => { hedgeConfigRef.current = hedgeConfig; },               [hedgeConfig]);
  useEffect(() => { clawdPriceUsdcRef.current = clawdPriceUsdc; },        [clawdPriceUsdc]);
  useEffect(() => { walletAddressRef.current = walletAddress; },           [walletAddress]);
  useEffect(() => { walletAdapterRef.current = wallet?.adapter; },         [wallet]);
  useEffect(() => { addPendingPrizeRef.current = addPendingPrize; },       [addPendingPrize]);
  useEffect(() => { setOracleResultRef.current = setOracleResult; },       [setOracleResult]);
  useEffect(() => { addPerpPositionRef.current = addPerpPosition; },       [addPerpPosition]);
  useEffect(() => { addVestingStreamRef.current = addVestingStream; },     [addVestingStream]);
  useEffect(() => { addLoopLogRef.current = addLoopLog; },                 [addLoopLog]);

  useEffect(() => {
    if (phase !== 'idle' || spins === prevSpinsRef.current) return;
    prevSpinsRef.current = spins;

    const prize = buildPrize(fruit0, fruit1, fruit2);
    addPendingPrizeRef.current(prize, spins);

    if (oracleEnabledRef.current) {
      setOracleResultRef.current({ narrative: '', rarityInsight: '', nextPullAdvice: '', loading: true });
      const apiKey = openrouterApiKeyRef.current;
      if (apiKey) {
        runGachaPipeline(apiKey, {
          prizeDisplay: prize.displayName,
          tier: prize.tier,
          clawdAmount: prize.clawdAmount,
          pokemonCard: prize.pokemonCard?.name,
          spins,
          coins: coinsRef.current,
        }).then(({ narrative, advice }) => {
          setOracleResultRef.current({ narrative, rarityInsight: '', nextPullAdvice: advice, loading: false });
        }).catch(() => {
          setOracleResultRef.current({ narrative: prize.displayName, rarityInsight: '', nextPullAdvice: '', loading: false });
        });
      } else {
        import('../lib/ai-oracle').then(({ fetchPrizeNarrative }) =>
          fetchPrizeNarrative(prize).then((r) => setOracleResultRef.current(r))
        );
      }
    }

    const hc    = hedgeConfigRef.current;
    const price = clawdPriceUsdcRef.current;
    if (hc.enabled || (hc.autoHedgeOnJackpot && (prize.tier === 'JACKPOT' || prize.tier === 'LEGENDARY'))) {
      const order = buildHedgeOrder(hc, prize, price);
      if (order) {
        openPerpPosition(walletAdapterRef.current, order, price).then((position) => {
          addPerpPositionRef.current(position);
          addLoopLogRef.current(`Perp hedge — ${position.side.toUpperCase()} $${position.sizeUsdc.toFixed(2)}`);
        });
      }
    }

    const addr    = walletAddressRef.current;
    const adapter = walletAdapterRef.current;
    if (prize.vestingDays && addr && adapter) {
      createVestingStream(adapter, {
        recipientAddress: addr,
        clawdAmount: prize.clawdAmount,
        vestingDays: prize.vestingDays,
        cliffDays: prize.tier === 'JACKPOT' ? 30 : 14,
        name: `Lobster Gacha ${prize.tier} Stream`,
      }).then((result) => {
        if (result.txId) {
          addVestingStreamRef.current({
            id: result.txId,
            name: `Lobster Gacha ${prize.tier}`,
            recipient: addr,
            totalAmount: prize.clawdAmount,
            vestedAmount: 0,
            startTs: Math.floor(Date.now() / 1000),
            endTs: Math.floor(Date.now() / 1000) + (prize.vestingDays as number) * 86400,
            tokenMint: '8cHzQHUS2s2h8TzCmfqPKYiM4dSt4roa3n7MyRLApump',
            cliffTs: Math.floor(Date.now() / 1000) + (prize.tier === 'JACKPOT' ? 30 : 14) * 86400,
            withdrawn: 0,
            isPaused: false,
            isCanceled: false,
          });
          addLoopLogRef.current(`Streamflow — ${prize.clawdAmount.toLocaleString()} CLAWD vesting`);
        }
      });
    }
  }, [phase, spins, fruit0, fruit1, fruit2]);

  const handleTriggerSpin = useCallback(() => {
    if (phase === 'idle' && coins >= bet) {
      start(bet);
    }
  }, [phase, coins, bet, start]);

  return (
    <main className="interface" aria-label="Lobster Gacha machine">

      {/* Docs modal */}
      {showDocs && <DocsPanel onClose={() => setShowDocs(false)} />}

      {/* Agent Gacha full overlay */}
      {viewMode === 'agents' && (
        <div className="agent-gacha-overlay">
          <div className="agent-gacha-topbar">
            <button type="button" className="back-to-3d-btn" onClick={() => setViewMode('3d')}>
              ← 3D Machine
            </button>
            <WalletConnect />
          </div>
          <GachaPage />
        </div>
      )}

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <nav className="topbar" aria-label="Primary">
        <div className="brand-mark">
          <span className="brand-glyph">🦞</span>
          <span>Lobster Gacha</span>
        </div>

        <div className="topbar-center">
          <span className="metaplex-pill">Metaplex Core</span>
          <span className="metaplex-pill streamflow-pill">Streamflow</span>
          <span className="metaplex-pill phoenix-pill">Phoenix Perps</span>
          <button
            type="button"
            className="topbar-docs-btn"
            onClick={() => setShowDocs(true)}
          >
            Docs + Provably Fair
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${viewMode === 'agents' ? 'active' : ''}`}
            onClick={() => setViewMode(viewMode === '3d' ? 'agents' : '3d')}
          >
            {viewMode === '3d' ? '🤖 Agent Gacha' : '🎰 3D Machine'}
          </button>
        </div>

        <WalletConnect />
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Solana Onchain Gacha · Provably Fair</p>
          <h1>Lobster<br/>Gacha</h1>

          <div className="hero-rarity-strip">
            {[
              { label: 'Legendary', color: '#facc15', chance: '3%' },
              { label: 'Epic',      color: '#c084fc', chance: '12%' },
              { label: 'Rare',      color: '#60a5fa', chance: '25%' },
              { label: 'Common',    color: '#9ca3af', chance: '60%' },
            ].map((r) => (
              <div key={r.label} className="hero-rarity-chip" style={{ borderColor: r.color }}>
                <span style={{ color: r.color }}>{r.label}</span>
                <span className="hero-rarity-chance">{r.chance}</span>
              </div>
            ))}
          </div>

          <p className="hero-text">
            Pull capsules on-chain. Win CLAWD tokens, Metaplex Core NFTs,
            CLAWD NFTs &amp; Streamflow-vested jackpots.
            Every result provably derived from a Solana blockhash —
            <span className="hero-accent"> no hidden RNG, ever.</span>
          </p>

          <div className="hero-actions">
            <button
              type="button"
              className="hero-pull-btn"
              onClick={handleTriggerSpin}
              disabled={phase !== 'idle' || coins < bet}
            >
              {phase === 'spinning' ? '⟳ Capsule Dropping…' : '🎰 Pull Capsule'}
            </button>
            <button
              type="button"
              className="hero-docs-btn"
              onClick={() => setShowDocs(true)}
            >
              🔐 Provably Fair
            </button>
          </div>

          {/* Live stats */}
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-val">{spins.toLocaleString()}</span>
              <span className="hero-stat-label">Pulls</span>
            </div>
            <div className="hero-stat-divider" />
            <div className="hero-stat">
              <span className="hero-stat-val">{totalClawdWon.toLocaleString()}</span>
              <span className="hero-stat-label">CLAWD Won</span>
            </div>
            {discoveredAgents.length > 0 && (
              <>
                <div className="hero-stat-divider" />
                <div className="hero-stat">
                  <span className="hero-stat-val">{discoveredAgents.length}</span>
                  <span className="hero-stat-label">Agents Online</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <aside
        className={`control-panel solana-panel ${rightPanelOpen ? 'open' : 'collapsed'}`}
        aria-label="Gacha dashboard"
      >
        <div className="panel-toggle-row">
          <div className="tab-bar">
            {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="panel-collapse-btn"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
          >
            {rightPanelOpen ? '→' : '←'}
          </button>
        </div>

        {rightPanelOpen && (
          <div className="tab-content">
            {activeTab === 'prizes'   && <SolanaRewards />}
            {activeTab === 'vesting'  && <StreamflowPanel />}
            {activeTab === 'agent'    && <AgentLoop onTriggerSpin={handleTriggerSpin} />}
            {activeTab === 'perps'    && <PerpsPanel />}
            {activeTab === 'registry' && <MetaplexAgentPanel />}
            {activeTab === 'dephy'    && <DephyPanel />}
          </div>
        )}
      </aside>

      {/* ── Bottom strip — live CLAWD ticker via BirdEye ─────────────────── */}
      <div className="bottom-strip">
        <span>Solana · Metaplex Core · Streamflow · Phoenix</span>
        <TokenTicker />
        <span>
          {spins} pulls
          {discoveredAgents.length > 0 && ` · ${discoveredAgents.length} agents`}
          {agentRegistered && ' · ✓ Agent'}
        </span>
      </div>
    </main>
  );
}
