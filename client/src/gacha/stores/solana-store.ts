import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { updatePositionPnl } from '../lib/perps';
import type { GachaPrize } from '../lib/prizes';
import type { OracleResult } from '../lib/ai-oracle';
import type { PerpPosition, PerpHedgeConfig } from '../lib/perps';
import type { StreamflowStream } from '../lib/streamflow';
import type { EIP8004Doc } from '../lib/helius-das';
import { DEFAULT_HEDGE_CONFIG } from '../lib/perps';

export interface ClaimedPrize {
  id: string;
  prize: GachaPrize;
  claimedAt: number;
  txId?: string;
  nftAddress?: string;
  vestingStreamId?: string;
  pullIndex: number;
}

export interface AgentLoopConfig {
  enabled: boolean;
  intervalMs: number;
  maxPulls: number;
  pullCount: number;
  stopOnJackpot: boolean;
  stopOnLegendary: boolean;
  aiOracleEnabled: boolean;
}

export const DEFAULT_LOOP_CONFIG: AgentLoopConfig = {
  enabled: false,
  intervalMs: 3000,
  maxPulls: 100,
  pullCount: 0,
  stopOnJackpot: true,
  stopOnLegendary: false,
  aiOracleEnabled: true,
};

/** A real on-chain Metaplex agent discovered via DAS or registry */
export interface DiscoveredAgent {
  assetAddress: string;
  name: string;
  assetSignerPda: string;
  registrationUri?: string;
  registrationDoc?: EIP8004Doc;
  solBalance?: number;
  discoveredAt: number;
}

interface SolanaState {
  // Wallet
  walletAddress: string | null;
  clawdBalance: number;
  solBalance: number;
  isWalletConnected: boolean;
  setWallet: (address: string | null, clawdBalance: number, solBalance: number) => void;
  disconnectWallet: () => void;

  // Agent registration (Metaplex Core — registerIdentityV1 flow)
  agentAssetAddress: string | null;
  agentWalletPda: string | null;
  agentIdentityPda: string | null;
  agentRegistered: boolean;
  agentSignerSolBalance: number;
  agentRegistrationDoc: EIP8004Doc | null;
  setAgentRegistration: (assetAddress: string, walletPda: string, identityPda?: string) => void;
  setAgentSignerBalance: (balance: number) => void;
  setAgentRegistrationDoc: (doc: EIP8004Doc | null) => void;

  // Discovered on-chain agents (real-time from Helius DAS)
  discoveredAgents: DiscoveredAgent[];
  agentsLoading: boolean;
  agentsLastFetched: number | null;
  setDiscoveredAgents: (agents: DiscoveredAgent[]) => void;
  addDiscoveredAgent: (agent: DiscoveredAgent) => void;
  setAgentsLoading: (loading: boolean) => void;

  // DePHY machine state
  dephyMachineStatus: 'AVAILABLE' | 'WORKING' | 'ERROR' | 'OFFLINE';
  dephyRelayConnected: boolean;
  dephyDispenseCount: number;
  dephyLastEventId: string;
  setDephyMachineStatus: (status: 'AVAILABLE' | 'WORKING' | 'ERROR' | 'OFFLINE') => void;
  setDephyRelayConnected: (connected: boolean) => void;
  incrementDephyDispenses: (eventId: string) => void;

  // Prizes
  pendingPrizes: GachaPrize[];
  claimedPrizes: ClaimedPrize[];
  totalClawdWon: number;
  totalNftsMinted: number;
  totalPhygitalsWon: number;
  lastPrize: GachaPrize | null;
  addPendingPrize: (prize: GachaPrize, pullIndex: number) => void;
  claimPrize: (prizeId: string, txId?: string, nftAddress?: string, vestingStreamId?: string) => void;
  clearPendingPrizes: () => void;

  // AI Oracle
  oracleResult: OracleResult | null;
  oracleEnabled: boolean;
  anthropicApiKey: string;
  openrouterApiKey: string;
  heliusApiKey: string;
  setOracleResult: (result: OracleResult | null) => void;
  setOracleEnabled: (enabled: boolean) => void;
  setAnthropicApiKey: (key: string) => void;
  setOpenrouterApiKey: (key: string) => void;
  setHeliusApiKey: (key: string) => void;

  // Streamflow vesting streams
  vestingStreams: StreamflowStream[];
  totalVestedClawd: number;
  addVestingStream: (stream: StreamflowStream) => void;
  setVestingStreams: (streams: StreamflowStream[]) => void;

  // Perps hedge
  perpPositions: PerpPosition[];
  hedgeConfig: PerpHedgeConfig;
  totalPerpPnl: number;
  clawdPriceUsdc: number;
  addPerpPosition: (position: PerpPosition) => void;
  closePerpPosition: (id: string) => void;
  updatePerpPrices: (price: number) => void;
  setHedgeConfig: (config: Partial<PerpHedgeConfig>) => void;
  setClawdPrice: (price: number) => void;

  // Agent automation loop
  loopConfig: AgentLoopConfig;
  loopRunning: boolean;
  loopLog: string[];
  setLoopConfig: (config: Partial<AgentLoopConfig>) => void;
  startLoop: () => void;
  stopLoop: () => void;
  incrementLoopPulls: () => void;
  addLoopLog: (entry: string) => void;

  // CLAWD token supply / market cap vesting info
  clawdTotalSupply: number;
  clawdMarketCap: number;
  clawdVestingPct: number;
  setClawdMarketData: (supply: number, marketCap: number, vestingPct: number) => void;
}

export const useSolana = create<SolanaState>()(
  subscribeWithSelector(
    persist(
      (set) => ({
        // Wallet
        walletAddress: null,
        clawdBalance: 0,
        solBalance: 0,
        isWalletConnected: false,
        setWallet: (address, clawdBalance, solBalance) =>
          set({ walletAddress: address, clawdBalance, solBalance, isWalletConnected: !!address }),
        disconnectWallet: () =>
          set({ walletAddress: null, clawdBalance: 0, solBalance: 0, isWalletConnected: false }),

        // Agent registration
        agentAssetAddress: null,
        agentWalletPda: null,
        agentIdentityPda: null,
        agentRegistered: false,
        agentSignerSolBalance: 0,
        agentRegistrationDoc: null,
        setAgentRegistration: (assetAddress, walletPda, identityPda) =>
          set({
            agentAssetAddress: assetAddress,
            agentWalletPda: walletPda,
            agentIdentityPda: identityPda ?? null,
            agentRegistered: true,
          }),
        setAgentSignerBalance: (balance) => set({ agentSignerSolBalance: balance }),
        setAgentRegistrationDoc: (doc) => set({ agentRegistrationDoc: doc }),

        // Discovered agents
        discoveredAgents: [],
        agentsLoading: false,
        agentsLastFetched: null,
        setDiscoveredAgents: (agents) =>
          set({ discoveredAgents: agents, agentsLastFetched: Date.now() }),
        addDiscoveredAgent: (agent) =>
          set((state) => ({
            discoveredAgents: [
              agent,
              ...state.discoveredAgents.filter((a) => a.assetAddress !== agent.assetAddress),
            ].slice(0, 50),
          })),
        setAgentsLoading: (loading) => set({ agentsLoading: loading }),

        // DePHY machine state
        dephyMachineStatus: 'OFFLINE',
        dephyRelayConnected: false,
        dephyDispenseCount: 0,
        dephyLastEventId: '',
        setDephyMachineStatus: (status) => set({ dephyMachineStatus: status }),
        setDephyRelayConnected: (connected) => set({ dephyRelayConnected: connected }),
        incrementDephyDispenses: (eventId) =>
          set((state) => ({
            dephyDispenseCount: state.dephyDispenseCount + 1,
            dephyLastEventId: eventId,
          })),

        // Prizes
        pendingPrizes: [],
        claimedPrizes: [],
        totalClawdWon: 0,
        totalNftsMinted: 0,
        totalPhygitalsWon: 0,
        lastPrize: null,
        addPendingPrize: (prize, pullIndex) =>
          set((state) => ({
            pendingPrizes: [{ ...prize, _id: `${Date.now()}-${pullIndex}`, pullIndex } as unknown as GachaPrize, ...state.pendingPrizes].slice(0, 20),
            lastPrize: prize,
            totalClawdWon: state.totalClawdWon + prize.clawdAmount,
            totalNftsMinted: state.totalNftsMinted + (prize.nftUri ? 1 : 0),
            totalPhygitalsWon: state.totalPhygitalsWon + (prize.pokemonCard ? 1 : 0),
          })),
        claimPrize: (prizeId, txId, nftAddress, vestingStreamId) =>
          set((state) => {
            const prize = state.pendingPrizes.find((p) => (p as unknown as { _id: string })._id === prizeId);
            if (!prize) return {};
            const claimed: ClaimedPrize = {
              id: prizeId,
              prize,
              claimedAt: Date.now(),
              txId,
              nftAddress,
              vestingStreamId,
              pullIndex: (prize as unknown as { pullIndex: number }).pullIndex ?? 0,
            };
            return {
              pendingPrizes: state.pendingPrizes.filter((p) => (p as unknown as { _id: string })._id !== prizeId),
              claimedPrizes: [claimed, ...state.claimedPrizes].slice(0, 50),
            };
          }),
        clearPendingPrizes: () => set({ pendingPrizes: [] }),

        // AI Oracle
        oracleResult: null,
        oracleEnabled: true,
        anthropicApiKey: (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined) ?? '',
        openrouterApiKey: (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) ?? '',
        heliusApiKey: (import.meta.env.VITE_HELIUS_API_KEY as string | undefined) ?? '1771237b-e3a5-49cb-b190-af95b2113788',
        setOracleResult: (result) => set({ oracleResult: result }),
        setOracleEnabled: (enabled) => set({ oracleEnabled: enabled }),
        setAnthropicApiKey: (key) => set({ anthropicApiKey: key }),
        setOpenrouterApiKey: (key) => set({ openrouterApiKey: key }),
        setHeliusApiKey: (key) => set({ heliusApiKey: key }),

        // Vesting
        vestingStreams: [],
        totalVestedClawd: 0,
        addVestingStream: (stream) =>
          set((state) => ({
            vestingStreams: [stream, ...state.vestingStreams].slice(0, 20),
            totalVestedClawd: state.totalVestedClawd + stream.totalAmount,
          })),
        setVestingStreams: (streams) =>
          set({ vestingStreams: streams, totalVestedClawd: streams.reduce((s, v) => s + v.totalAmount, 0) }),

        // Perps
        perpPositions: [],
        hedgeConfig: DEFAULT_HEDGE_CONFIG,
        totalPerpPnl: 0,
        clawdPriceUsdc: 0.001,
        addPerpPosition: (position) =>
          set((state) => ({ perpPositions: [position, ...state.perpPositions].slice(0, 10) })),
        closePerpPosition: (id) =>
          set((state) => {
            const pos = state.perpPositions.find((p) => p.id === id);
            const closedPnl = pos?.pnl ?? 0;
            return {
              perpPositions: state.perpPositions.map((p) => p.id === id ? { ...p, status: 'closed' as const } : p),
              totalPerpPnl: state.totalPerpPnl + closedPnl,
            };
          }),
        updatePerpPrices: (price) =>
          set((state) => ({
            clawdPriceUsdc: price,
            perpPositions: state.perpPositions.map((p) =>
              p.status === 'open' ? updatePositionPnl(p, price) : p,
            ),
          })),
        setHedgeConfig: (config) =>
          set((state) => ({ hedgeConfig: { ...state.hedgeConfig, ...config } })),
        setClawdPrice: (price) => set({ clawdPriceUsdc: price }),

        // Loop
        loopConfig: DEFAULT_LOOP_CONFIG,
        loopRunning: false,
        loopLog: ['Agent loop idle. Configure and start to begin automated pulls.'],
        setLoopConfig: (config) =>
          set((state) => ({ loopConfig: { ...state.loopConfig, ...config } })),
        startLoop: () =>
          set((state) => ({
            loopRunning: true,
            loopConfig: { ...state.loopConfig, enabled: true, pullCount: 0 },
            loopLog: ['Agent loop started.', ...state.loopLog].slice(0, 10),
          })),
        stopLoop: () =>
          set((state) => ({
            loopRunning: false,
            loopConfig: { ...state.loopConfig, enabled: false },
            loopLog: ['Agent loop stopped.', ...state.loopLog].slice(0, 10),
          })),
        incrementLoopPulls: () =>
          set((state) => ({
            loopConfig: { ...state.loopConfig, pullCount: state.loopConfig.pullCount + 1 },
          })),
        addLoopLog: (entry) =>
          set((state) => ({
            loopLog: [entry, ...state.loopLog].slice(0, 10),
          })),

        // CLAWD market
        clawdTotalSupply: 1_000_000_000,
        clawdMarketCap: 0,
        clawdVestingPct: 0,
        setClawdMarketData: (supply, marketCap, vestingPct) =>
          set({ clawdTotalSupply: supply, clawdMarketCap: marketCap, clawdVestingPct: vestingPct }),
      }),
      {
        name: 'lobster-gacha-solana',
        partialize: (state) => ({
          claimedPrizes: state.claimedPrizes,
          totalClawdWon: state.totalClawdWon,
          totalNftsMinted: state.totalNftsMinted,
          totalPhygitalsWon: state.totalPhygitalsWon,
          agentAssetAddress: state.agentAssetAddress,
          agentWalletPda: state.agentWalletPda,
          agentIdentityPda: state.agentIdentityPda,
          agentRegistered: state.agentRegistered,
          agentRegistrationDoc: state.agentRegistrationDoc,
          hedgeConfig: state.hedgeConfig,
          oracleEnabled: state.oracleEnabled,
          anthropicApiKey: state.anthropicApiKey,
          openrouterApiKey: state.openrouterApiKey,
          heliusApiKey: state.heliusApiKey,
          loopConfig: state.loopConfig,
        }),
      },
    ),
  ),
);
